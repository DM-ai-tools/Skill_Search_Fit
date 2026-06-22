"""Business integrations router — per-user platform connections."""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.db import integrations as db
from app.db.integrations import decode_token, get_access_token
from app.db.pool import get_pool
from app.exceptions import AppError, not_found
from app.middleware.session import require_user
from app.schemas.change_suggestions import ChangeResponse, PublishItemResult
from app.services.change_suggestions import elementor_core
from app.services.integrations import webflow_agent, wix_agent, wordpress_agent
from app.services.integrations.wordpress_agent import (
    _fetch_post_with_meta,
    _resolve_post,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])

WP_TIMEOUT_SECONDS = 15
API_TIMEOUT_SECONDS = 15

IntegrationPlatform = Literal["WordPress", "Shopify", "Webflow", "Wix", "Squarespace"]
IntegrationStatusValue = Literal["connected", "reauth", "disconnected", "coming_soon"]


# ── Schemas ───────────────────────────────────────────────────────────────────

class IntegrationStatusResponse(BaseModel):
    platform: IntegrationPlatform
    status: IntegrationStatusValue
    site_url: Optional[str] = None
    last_used_at: Optional[datetime] = None
    connected_at: Optional[datetime] = None


class IntegrationsListResponse(BaseModel):
    integrations: list[IntegrationStatusResponse]


class WordPressConnectRequest(BaseModel):
    site_url: str = Field(..., min_length=1)
    username: str = Field(..., min_length=1)
    app_password: str = Field(..., min_length=1)


class WordPressTestRequest(BaseModel):
    site_url: str = Field(..., min_length=1)
    username: str = Field(..., min_length=1)
    app_password: str = Field(..., min_length=1)


class WordPressTestResponse(BaseModel):
    success: bool
    site_name: Optional[str] = None
    error: Optional[str] = None


class WebflowConnectRequest(BaseModel):
    site_url: str = Field(..., min_length=1)
    site_id: str = Field(..., min_length=1)
    api_token: str = Field(..., min_length=1)


class WebflowTestRequest(BaseModel):
    site_id: str = Field(..., min_length=1)
    api_token: str = Field(..., min_length=1)


class WixConnectRequest(BaseModel):
    site_url: str = Field(..., min_length=1)
    site_id: str = Field(..., min_length=1)
    api_key: str = Field(..., min_length=1)


class WixTestRequest(BaseModel):
    site_id: str = Field(..., min_length=1)
    api_key: str = Field(..., min_length=1)


class PlatformTestResponse(BaseModel):
    success: bool
    site_name: Optional[str] = None
    error: Optional[str] = None


class PublishRequest(BaseModel):
    suggestion_id: UUID
    dry_run: bool = True


class PublishResponse(BaseModel):
    dry_run: bool
    results: list[PublishItemResult]
    cache_cleared: Optional[bool] = None


class ElementorCheckRequest(BaseModel):
    suggestion_id: UUID


class ElementorCheckResponse(BaseModel):
    is_elementor_page: bool
    elementor_data_accessible: bool
    widget_count: Optional[int] = None
    page_id: Optional[int] = None
    page_url: Optional[str] = None
    setup_required: bool = False
    setup_instructions: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalise_site_url(raw: str) -> str:
    url = raw.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def _integration_status(row: Optional[dict], platform: str) -> IntegrationStatusResponse:
    if not row:
        return IntegrationStatusResponse(platform=platform, status="disconnected")  # type: ignore[arg-type]
    return IntegrationStatusResponse(
        platform=platform,  # type: ignore[arg-type]
        status=row["status"],
        site_url=row["site_url"],
        last_used_at=row["last_used_at"],
        connected_at=row["created_at"],
    )


async def _test_wp_connection(site_url: str, username: str, app_password: str) -> WordPressTestResponse:
    import base64
    token = base64.b64encode(f"{username}:{app_password}".encode()).decode()
    headers = {"Authorization": f"Basic {token}"}
    url = site_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=WP_TIMEOUT_SECONDS) as client:
            resp = await client.get(f"{url}/wp-json/wp/v2/users/me", headers=headers)
            if resp.status_code == 401:
                return WordPressTestResponse(success=False, error="Invalid username or application password.")
            if resp.status_code == 403:
                return WordPressTestResponse(success=False, error="Your WordPress account lacks the required permissions.")
            if resp.status_code == 404:
                return WordPressTestResponse(success=False, error="WordPress REST API not found. Check the site URL.")
            resp.raise_for_status()
            site_resp = await client.get(f"{url}/wp-json/")
            site_name = site_resp.json().get("name") if site_resp.status_code == 200 else None
            return WordPressTestResponse(success=True, site_name=site_name)
    except httpx.TimeoutException:
        return WordPressTestResponse(
            success=False,
            error="Connection timed out (15s). Check the site URL and try again.",
        )
    except Exception as exc:
        logger.warning("WordPress test connection failed: %s", exc)
        return WordPressTestResponse(success=False, error="Could not reach the WordPress site.")


async def _test_webflow_connection(site_id: str, api_token: str) -> PlatformTestResponse:
    headers = {"Authorization": f"Bearer {api_token}", "accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT_SECONDS) as client:
            resp = await client.get(f"https://api.webflow.com/v2/sites/{site_id}", headers=headers)
            if resp.status_code == 401:
                return PlatformTestResponse(success=False, error="Invalid Webflow API token.")
            if resp.status_code == 404:
                return PlatformTestResponse(success=False, error="Site ID not found. Check your Webflow site ID.")
            resp.raise_for_status()
            data = resp.json()
            return PlatformTestResponse(success=True, site_name=data.get("displayName") or data.get("shortName"))
    except httpx.TimeoutException:
        return PlatformTestResponse(success=False, error="Connection timed out. Try again.")
    except Exception as exc:
        logger.warning("Webflow test connection failed: %s", exc)
        return PlatformTestResponse(success=False, error="Could not reach the Webflow API.")


async def _test_wix_connection(site_id: str, api_key: str) -> PlatformTestResponse:
    headers = {"Authorization": api_key, "wix-site-id": site_id}
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                "https://www.wixapis.com/site-properties/v4/properties",
                headers=headers,
            )
            if resp.status_code == 401:
                return PlatformTestResponse(success=False, error="Invalid Wix API key or site ID.")
            if resp.status_code == 403:
                return PlatformTestResponse(success=False, error="API key lacks permission for this site.")
            resp.raise_for_status()
            return PlatformTestResponse(success=True, site_name="Wix site")
    except httpx.TimeoutException:
        return PlatformTestResponse(success=False, error="Connection timed out. Try again.")
    except Exception as exc:
        logger.warning("Wix test connection failed: %s", exc)
        return PlatformTestResponse(success=False, error="Could not reach the Wix API.")


async def _fetch_approved_changes(conn, suggestion_id: UUID, destination: str) -> list[ChangeResponse]:
    rows = await conn.fetch(
        """
        SELECT rc.id, rc.suggestion_id, rc.page_url, rc.change_type, rc.priority,
               rc.impact_score, rc.destination, rc.field_label, rc.current_state,
               rc.proposed_content, rc.edited_content, rc.source_excerpt,
               rc.approval_status, rc.created_at, rc.updated_at
        FROM suggestion_changes rc
        WHERE rc.suggestion_id = $1
          AND rc.approval_status = 'approved'
          AND rc.destination = $2
        """,
        suggestion_id,
        destination,
    )
    return [ChangeResponse(**dict(r)) for r in rows]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=IntegrationsListResponse)
async def list_integrations(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await db.get_all_integrations(conn, user.id)

    by_platform: dict[str, Any] = {r["platform"]: r for r in rows}
    result: list[IntegrationStatusResponse] = []

    for platform in ("WordPress", "Webflow", "Wix"):
        result.append(_integration_status(by_platform.get(platform), platform))

    for platform in ("Shopify", "Squarespace"):
        result.append(IntegrationStatusResponse(platform=platform, status="coming_soon"))

    return IntegrationsListResponse(integrations=result)


# ── WordPress ─────────────────────────────────────────────────────────────────

@router.post("/wordpress/test", response_model=WordPressTestResponse)
async def test_wordpress_connection(request: Request, body: WordPressTestRequest):
    require_user(request)
    site_url = _normalise_site_url(body.site_url)
    return await _test_wp_connection(site_url, body.username, body.app_password)


@router.post("", response_model=IntegrationStatusResponse, status_code=201)
async def connect_wordpress(request: Request, body: WordPressConnectRequest):
    user = require_user(request)
    site_url = _normalise_site_url(body.site_url)

    test = await _test_wp_connection(site_url, body.username, body.app_password)
    if not test.success:
        raise AppError("WP_CONNECTION_FAILED", test.error or "WordPress connection failed.", 400)

    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await db.get_integration(conn, user.id, "WordPress")
        status_before = existing["status"] if existing else None
        row = await db.upsert_wordpress_integration(
            conn, user.id, "WordPress", site_url, body.username, body.app_password
        )
        await db.add_audit_log(
            conn, user.id, "WordPress", "connect",
            status_before, "connected",
            {"site_url": site_url},
        )

    return _integration_status(row, "WordPress")


@router.get("/wordpress/status", response_model=IntegrationStatusResponse)
async def get_wordpress_status(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await db.get_integration(conn, user.id, "WordPress")
    return _integration_status(row, "WordPress")


@router.delete("/wordpress", status_code=204)
async def disconnect_wordpress(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await db.get_integration(conn, user.id, "WordPress")
        if not existing:
            raise not_found("WordPress integration not found.")
        await db.delete_integration(conn, user.id, "WordPress")
        await db.add_audit_log(
            conn, user.id, "WordPress", "disconnect",
            existing["status"], None,
            {"site_url": existing["site_url"]},
        )


@router.post("/wordpress/elementor-check", response_model=ElementorCheckResponse)
async def check_elementor(request: Request, body: ElementorCheckRequest):
    """Check whether the first approved WordPress page uses Elementor, and whether
    _elementor_data is accessible via the REST API (requires the mu-plugin)."""
    user = require_user(request)
    pool = get_pool()

    async with pool.acquire() as conn:
        integration = await db.get_integration(conn, user.id, "WordPress")
        if not integration or integration["status"] != "connected":
            raise AppError("WP_NOT_CONNECTED", "WordPress is not connected.", 400)

        changes = await _fetch_approved_changes(conn, body.suggestion_id, "WordPress")

    if not changes:
        return ElementorCheckResponse(
            is_elementor_page=False,
            elementor_data_accessible=False,
        )

    page_url = changes[0].page_url
    site_url = integration["site_url"].rstrip("/")

    async with pool.acquire() as conn:
        token = await get_access_token(conn, user.id, "WordPress")

    if not token:
        raise AppError("WP_NOT_CONNECTED", "WordPress credentials not found.", 400)

    username, app_password = decode_token(token)
    encoded = base64.b64encode(f"{username}:{app_password}".encode()).decode()
    headers = {"Authorization": f"Basic {encoded}", "Content-Type": "application/json"}

    slug = page_url.rstrip("/").rsplit("/", 1)[-1] or "home"

    try:
        async with httpx.AsyncClient(timeout=WP_TIMEOUT_SECONDS) as client:
            post = await _resolve_post(client, site_url, headers, slug)

            if post is None:
                raise AppError("WP_REAUTH_REQUIRED", "WordPress authentication failed. Please reconnect.", 401)

            if not post:
                return ElementorCheckResponse(
                    is_elementor_page=False,
                    elementor_data_accessible=False,
                    page_url=page_url,
                )

            post_id = post["id"]
            endpoint = post.get("_endpoint", "pages")

            full_post = await _fetch_post_with_meta(client, site_url, headers, post_id, endpoint)

        meta = full_post.get("meta") or {}
        is_elementor = meta.get("_elementor_edit_mode") == "builder"
        elementor_data_raw = meta.get("_elementor_data")

        if not is_elementor:
            return ElementorCheckResponse(
                is_elementor_page=False,
                elementor_data_accessible=False,
                page_id=post_id,
                page_url=page_url,
            )

        if not elementor_data_raw:
            return ElementorCheckResponse(
                is_elementor_page=True,
                elementor_data_accessible=False,
                page_id=post_id,
                page_url=page_url,
                setup_required=True,
                setup_instructions=elementor_core.MU_PLUGIN_PHP,
            )

        try:
            elementor_data = json.loads(elementor_data_raw)
            widget_count = elementor_core.count_widgets(elementor_data)
        except (json.JSONDecodeError, ValueError):
            widget_count = None

        return ElementorCheckResponse(
            is_elementor_page=True,
            elementor_data_accessible=True,
            widget_count=widget_count,
            page_id=post_id,
            page_url=page_url,
            setup_required=False,
        )

    except AppError:
        raise
    except httpx.TimeoutException:
        raise AppError("WP_TIMEOUT", "WordPress request timed out (15s). Check your site is reachable.", 504)
    except Exception as exc:
        logger.warning("Elementor check failed: %s", exc)
        raise AppError("WP_CHECK_FAILED", "Could not check Elementor status. Try again.", 502)


@router.post("/wordpress/publish", response_model=PublishResponse)
async def publish_wordpress(request: Request, body: PublishRequest):
    user = require_user(request)
    pool = get_pool()

    async with pool.acquire() as conn:
        integration = await db.get_integration(conn, user.id, "WordPress")
        if not integration:
            raise AppError("WP_NOT_CONNECTED", "WordPress is not connected. Connect your site in Integrations.", 400)
        if integration["status"] == "reauth":
            raise AppError("WP_REAUTH_REQUIRED", "WordPress authentication expired. Please reconnect your site.", 400)
        changes = await _fetch_approved_changes(conn, body.suggestion_id, "WordPress")

    if not changes:
        return PublishResponse(dry_run=body.dry_run, results=[])

    results, cache_cleared = await wordpress_agent.publish(user.id, changes, dry_run=body.dry_run)

    async with pool.acquire() as conn:
        await db.add_audit_log(
            conn, user.id, "WordPress",
            "publish_dry_run" if body.dry_run else "publish",
            integration["status"], integration["status"],
            {
                "suggestion_id": str(body.suggestion_id),
                "items": len(results),
                "succeeded": sum(1 for r in results if r.success),
            },
        )

    return PublishResponse(dry_run=body.dry_run, results=results, cache_cleared=cache_cleared)


# ── Webflow ───────────────────────────────────────────────────────────────────

@router.post("/webflow/test", response_model=PlatformTestResponse)
async def test_webflow_connection(request: Request, body: WebflowTestRequest):
    require_user(request)
    return await _test_webflow_connection(body.site_id.strip(), body.api_token.strip())


@router.post("/webflow", response_model=IntegrationStatusResponse, status_code=201)
async def connect_webflow(request: Request, body: WebflowConnectRequest):
    user = require_user(request)
    site_url = _normalise_site_url(body.site_url)
    site_id = body.site_id.strip()
    api_token = body.api_token.strip()

    test = await _test_webflow_connection(site_id, api_token)
    if not test.success:
        raise AppError("WEBFLOW_CONNECTION_FAILED", test.error or "Webflow connection failed.", 400)

    token = db.encode_credentials("Webflow", site_id=site_id, api_token=api_token)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await db.get_integration(conn, user.id, "Webflow")
        status_before = existing["status"] if existing else None
        row = await db.upsert_integration(conn, user.id, "Webflow", site_url, token)
        await db.add_audit_log(
            conn, user.id, "Webflow", "connect",
            status_before, "connected",
            {"site_url": site_url, "site_id": site_id},
        )

    return _integration_status(row, "Webflow")


@router.delete("/webflow", status_code=204)
async def disconnect_webflow(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await db.get_integration(conn, user.id, "Webflow")
        if not existing:
            raise not_found("Webflow integration not found.")
        await db.delete_integration(conn, user.id, "Webflow")
        await db.add_audit_log(
            conn, user.id, "Webflow", "disconnect",
            existing["status"], None,
            {"site_url": existing["site_url"]},
        )


@router.post("/webflow/publish", response_model=PublishResponse)
async def publish_webflow(request: Request, body: PublishRequest):
    user = require_user(request)
    pool = get_pool()

    async with pool.acquire() as conn:
        integration = await db.get_integration(conn, user.id, "Webflow")
        if not integration:
            raise AppError("WEBFLOW_NOT_CONNECTED", "Webflow is not connected. Connect in Integrations.", 400)
        changes = await _fetch_approved_changes(conn, body.suggestion_id, "Webflow")

    if not changes:
        return PublishResponse(dry_run=body.dry_run, results=[])

    results = await webflow_agent.publish(user.id, changes, dry_run=body.dry_run)
    return PublishResponse(dry_run=body.dry_run, results=results)


# ── Wix ───────────────────────────────────────────────────────────────────────

@router.post("/wix/test", response_model=PlatformTestResponse)
async def test_wix_connection(request: Request, body: WixTestRequest):
    require_user(request)
    return await _test_wix_connection(body.site_id.strip(), body.api_key.strip())


@router.post("/wix", response_model=IntegrationStatusResponse, status_code=201)
async def connect_wix(request: Request, body: WixConnectRequest):
    user = require_user(request)
    site_url = _normalise_site_url(body.site_url)
    site_id = body.site_id.strip()
    api_key = body.api_key.strip()

    test = await _test_wix_connection(site_id, api_key)
    if not test.success:
        raise AppError("WIX_CONNECTION_FAILED", test.error or "Wix connection failed.", 400)

    token = db.encode_credentials("Wix", site_id=site_id, api_key=api_key)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await db.get_integration(conn, user.id, "Wix")
        status_before = existing["status"] if existing else None
        row = await db.upsert_integration(conn, user.id, "Wix", site_url, token)
        await db.add_audit_log(
            conn, user.id, "Wix", "connect",
            status_before, "connected",
            {"site_url": site_url, "site_id": site_id},
        )

    return _integration_status(row, "Wix")


@router.delete("/wix", status_code=204)
async def disconnect_wix(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await db.get_integration(conn, user.id, "Wix")
        if not existing:
            raise not_found("Wix integration not found.")
        await db.delete_integration(conn, user.id, "Wix")
        await db.add_audit_log(
            conn, user.id, "Wix", "disconnect",
            existing["status"], None,
            {"site_url": existing["site_url"]},
        )


@router.post("/wix/publish", response_model=PublishResponse)
async def publish_wix(request: Request, body: PublishRequest):
    user = require_user(request)
    pool = get_pool()

    async with pool.acquire() as conn:
        integration = await db.get_integration(conn, user.id, "Wix")
        if not integration:
            raise AppError("WIX_NOT_CONNECTED", "Wix is not connected. Connect in Integrations.", 400)
        changes = await _fetch_approved_changes(conn, body.suggestion_id, "Wix")

    if not changes:
        return PublishResponse(dry_run=body.dry_run, results=[])

    results = await wix_agent.publish(user.id, changes, dry_run=body.dry_run)
    return PublishResponse(dry_run=body.dry_run, results=results)
