"""WordPress REST API publish agent using per-user stored credentials.

Detects Elementor-managed pages and routes changes through elementor_core;
falls back to standard wp_publish_core for non-Elementor pages.
"""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx

from app.db.integrations import (
    decode_token,
    get_access_token,
    set_integration_status,
    touch_integration,
)
from app.db.pool import get_pool
from app.schemas.change_suggestions import ChangeResponse, PublishItemResult
from app.services.change_suggestions import elementor_core
from app.services.change_suggestions.wp_publish_core import (
    build_new_page_payload,
    build_wp_update,
    infer_post_type_from_url,
    is_new_page_creation,
    validate_schema_content,
)

logger = logging.getLogger(__name__)

WP_TIMEOUT_SECONDS = 20


# ── HTTP helpers ──────────────────────────────────────────────────────────────

async def _resolve_post(
    client: httpx.AsyncClient,
    site_url: str,
    headers: dict[str, str],
    slug: str,
) -> dict[str, Any] | None:
    """Find a page or post by slug. Returns None on 401 (caller handles reauth)."""
    for endpoint in ("pages", "posts"):
        search = await client.get(
            f"{site_url}/wp-json/wp/v2/{endpoint}",
            params={"slug": slug},
            headers=headers,
        )
        if search.status_code == 401:
            return None
        search.raise_for_status()
        pages = search.json()
        if pages:
            post = pages[0]
            post["_endpoint"] = endpoint
            return post
    return None


async def _fetch_post_with_meta(
    client: httpx.AsyncClient,
    site_url: str,
    headers: dict[str, str],
    post_id: int,
    endpoint: str,
) -> dict[str, Any]:
    """Fetch full post including meta fields (requires context=edit)."""
    resp = await client.get(
        f"{site_url}/wp-json/wp/v2/{endpoint}/{post_id}",
        params={"context": "edit"},
        headers=headers,
    )
    resp.raise_for_status()
    return resp.json()


async def _save_elementor_data(
    client: httpx.AsyncClient,
    site_url: str,
    headers: dict[str, str],
    post_id: int,
    endpoint: str,
    elementor_data: list[dict[str, Any]],
    extra_meta: dict[str, Any] | None = None,
) -> tuple[bool, str | None]:
    """PATCH _elementor_data (and optional extra meta like Yoast fields) in one call."""
    meta_payload: dict[str, Any] = {
        "_elementor_data": json.dumps(elementor_data, ensure_ascii=False),
    }
    if extra_meta:
        meta_payload.update(extra_meta)

    try:
        resp = await client.post(
            f"{site_url}/wp-json/wp/v2/{endpoint}/{post_id}",
            json={"meta": meta_payload},
            headers=headers,
        )
        if resp.status_code in (401, 403):
            return False, f"HTTP {resp.status_code}"
        resp.raise_for_status()
        return True, None
    except httpx.TimeoutException:
        return False, "timeout"
    except Exception as exc:
        return False, str(exc)


async def _clear_elementor_cache(
    client: httpx.AsyncClient,
    site_url: str,
    headers: dict[str, str],
    post_id: int,
    endpoint: str,
) -> bool:
    """Attempt Elementor cache clear; fall back to bumping the modified date."""
    # Option A — Elementor Pro cache endpoint
    try:
        resp = await client.post(
            f"{site_url}/wp-json/elementor/v1/clear_cache",
            headers=headers,
        )
        if resp.status_code < 400:
            return True
    except Exception:
        pass

    # Option B — bump modified date to bust Elementor's CSS/JS cache
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        resp = await client.post(
            f"{site_url}/wp-json/wp/v2/{endpoint}/{post_id}",
            json={"modified": now_iso},
            headers=headers,
        )
        return resp.status_code < 400
    except Exception:
        return False


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _auth_header(username: str, app_password: str) -> str:
    token = base64.b64encode(f"{username}:{app_password}".encode()).decode()
    return f"Basic {token}"


def _reauth_result(change: ChangeResponse) -> PublishItemResult:
    return PublishItemResult(
        change_id=str(change.id),
        field_label=change.field_label,
        page_url=change.page_url,
        success=False,
        error="WordPress authentication failed. Please reconnect your site in Integrations.",
    )


# ── Main publish entry point ──────────────────────────────────────────────────

async def publish(
    user_id: UUID,
    changes: list[ChangeResponse],
    dry_run: bool = True,
) -> tuple[list[PublishItemResult], bool | None]:
    """Publish approved changes to the user's connected WordPress site.

    Detects Elementor per page (via _elementor_edit_mode meta field) and routes
    changes through elementor_core when active; falls back to wp_publish_core
    for standard WordPress pages.
    """
    pool = get_pool()

    async with pool.acquire() as conn:
        token = await get_access_token(conn, user_id, "WordPress")

    if not token:
        return [
            PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=False,
                error="WordPress not connected. Connect your site in Integrations.",
            )
            for c in changes
        ], None

    username, app_password = decode_token(token)
    auth = _auth_header(username, app_password)
    # credentials decoded — variable names kept short to avoid accidental logging

    if dry_run:
        logger.info("WordPress (integration) dry-run: %d items", len(changes))
        return [
            PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=True,
                error="Dry run: no changes written",
            )
            for c in changes
        ], None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT site_url FROM user_integrations WHERE user_id = $1 AND platform = 'WordPress'",
            user_id,
        )

    if not row:
        return [
            PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=False,
                error="WordPress integration not found.",
            )
            for c in changes
        ], None

    site_url = row["site_url"].rstrip("/")
    headers = {"Authorization": auth, "Content-Type": "application/json"}
    results: list[PublishItemResult] = []
    cache_cleared: bool | None = None

    # ── Group changes by page_url for Elementor batch-save efficiency ──────────
    by_page: dict[str, list[ChangeResponse]] = {}
    for c in changes:
        by_page.setdefault(c.page_url, []).append(c)

    async with httpx.AsyncClient(timeout=WP_TIMEOUT_SECONDS) as client:

        for page_url, page_changes in by_page.items():

            # ── Handle new-page creation changes (bypass Elementor) ────────────
            new_page_changes = [c for c in page_changes if is_new_page_creation(c)]
            regular_changes = [c for c in page_changes if not is_new_page_creation(c)]

            for c in new_page_changes:
                try:
                    payload = build_new_page_payload(c)
                    post_type = payload.pop("_post_type", infer_post_type_from_url(c.page_url))
                    create = await client.post(
                        f"{site_url}/wp-json/wp/v2/{post_type}",
                        json={k: v for k, v in payload.items() if not k.startswith("_")},
                        headers=headers,
                    )
                    if create.status_code == 401:
                        async with pool.acquire() as conn:
                            await set_integration_status(conn, user_id, "WordPress", "reauth")
                        results.append(_reauth_result(c))
                        continue
                    create.raise_for_status()
                    created = create.json()
                    results.append(PublishItemResult(
                        change_id=str(c.id),
                        field_label=c.field_label,
                        page_url=created.get("link", c.page_url),
                        success=True,
                    ))
                except httpx.TimeoutException:
                    results.append(PublishItemResult(
                        change_id=str(c.id), field_label=c.field_label,
                        page_url=c.page_url, success=False,
                        error="WordPress request timed out. Check your site is reachable.",
                    ))
                except Exception as exc:
                    logger.error("WP new-page create failed for %s: %s", c.page_url, exc)
                    results.append(PublishItemResult(
                        change_id=str(c.id), field_label=c.field_label,
                        page_url=c.page_url, success=False,
                        error="Failed to create page. Try again.",
                    ))

            if not regular_changes:
                continue

            # ── Resolve the post by slug ───────────────────────────────────────
            try:
                slug = page_url.rstrip("/").rsplit("/", 1)[-1] or "home"
                post = await _resolve_post(client, site_url, headers, slug)

                if post is None:
                    # 401 returned from resolve
                    async with pool.acquire() as conn:
                        await set_integration_status(conn, user_id, "WordPress", "reauth")
                    for c in regular_changes:
                        results.append(_reauth_result(c))
                    continue

                if not post:
                    for c in regular_changes:
                        results.append(PublishItemResult(
                            change_id=str(c.id), field_label=c.field_label,
                            page_url=c.page_url, success=False,
                            error=f"No WordPress page or post found with slug '{slug}'.",
                        ))
                    continue

                post_id = post["id"]
                endpoint = post.get("_endpoint", "pages")

                # ── Fetch with context=edit to check for Elementor ────────────
                try:
                    full_post = await _fetch_post_with_meta(client, site_url, headers, post_id, endpoint)
                except Exception:
                    full_post = post  # graceful fallback — won't have meta

                meta = full_post.get("meta") or {}
                is_elementor = meta.get("_elementor_edit_mode") == "builder"
                elementor_data_raw = meta.get("_elementor_data")

            except httpx.TimeoutException:
                for c in regular_changes:
                    results.append(PublishItemResult(
                        change_id=str(c.id), field_label=c.field_label,
                        page_url=c.page_url, success=False,
                        error="WordPress request timed out. Check your site is reachable.",
                    ))
                continue
            except Exception as exc:
                logger.error("WP resolve failed for %s: %s", page_url, exc)
                for c in regular_changes:
                    results.append(PublishItemResult(
                        change_id=str(c.id), field_label=c.field_label,
                        page_url=c.page_url, success=False,
                        error="Publish failed. Try again or check your WordPress site.",
                    ))
                continue

            # ── ELEMENTOR PATH ─────────────────────────────────────────────────
            if is_elementor and elementor_data_raw:
                try:
                    elementor_data: list[dict[str, Any]] = json.loads(elementor_data_raw)
                except (json.JSONDecodeError, ValueError):
                    elementor_data = []

                meta_only_payload: dict[str, Any] = {}
                has_elementor_changes = False
                page_results: list[PublishItemResult] = []

                for c in regular_changes:
                    # Validate schema before applying (catches bad JSON-LD early)
                    if c.change_type == "schema":
                        ok, err = validate_schema_content(c.effective_content)
                        if not ok:
                            page_results.append(PublishItemResult(
                                change_id=str(c.id), field_label=c.field_label,
                                page_url=c.page_url, success=False,
                                error=f"Invalid schema JSON-LD: {err}",
                            ))
                            continue

                    apply_result = elementor_core.apply_change(elementor_data, c)

                    if apply_result.method == "meta_fields" and apply_result.meta_payload:
                        meta_only_payload.update(apply_result.meta_payload)
                        page_results.append(PublishItemResult(
                            change_id=str(c.id), field_label=c.field_label,
                            page_url=c.page_url, success=True,
                        ))
                    elif apply_result.success:
                        has_elementor_changes = True
                        page_results.append(PublishItemResult(
                            change_id=str(c.id), field_label=c.field_label,
                            page_url=c.page_url, success=True,
                            widget_id=apply_result.widget_id,
                            widget_type=apply_result.widget_type,
                        ))
                    else:
                        page_results.append(PublishItemResult(
                            change_id=str(c.id), field_label=c.field_label,
                            page_url=c.page_url, success=False,
                            error=apply_result.reason or "Could not apply change.",
                        ))

                # Save modified Elementor data (and any meta-only fields) once per page
                if has_elementor_changes or meta_only_payload:
                    save_ok, save_err = await _save_elementor_data(
                        client, site_url, headers, post_id, endpoint,
                        elementor_data if has_elementor_changes else [],
                        extra_meta=meta_only_payload or None,
                    )
                    if not save_ok:
                        if save_err and ("401" in save_err or "403" in save_err):
                            if "401" in save_err:
                                async with pool.acquire() as conn:
                                    await set_integration_status(conn, user_id, "WordPress", "reauth")
                            # Mark all successful Elementor changes as failed
                            page_results = [
                                PublishItemResult(
                                    change_id=r.change_id, field_label=r.field_label,
                                    page_url=r.page_url, success=False,
                                    error=(
                                        "WordPress authentication failed. Please reconnect."
                                        if "401" in save_err
                                        else "Permission denied when saving to WordPress."
                                    ),
                                ) if r.success and r.widget_type else r
                                for r in page_results
                            ]
                        else:
                            logger.error("Elementor save failed for %s: %s", page_url, save_err)
                    else:
                        cache_cleared = await _clear_elementor_cache(client, site_url, headers, post_id, endpoint)

                results.extend(page_results)

            # ── ELEMENTOR PAGE BUT META NOT ACCESSIBLE ─────────────────────────
            elif is_elementor and not elementor_data_raw:
                for c in regular_changes:
                    results.append(PublishItemResult(
                        change_id=str(c.id), field_label=c.field_label,
                        page_url=c.page_url, success=False,
                        error=(
                            "Elementor data is not accessible via the WordPress REST API. "
                            "Install the elementor-rest-meta.php mu-plugin shown in Integrations "
                            "→ WordPress → Setup, then try again."
                        ),
                    ))

            # ── STANDARD WORDPRESS PATH (non-Elementor) ────────────────────────
            else:
                for c in regular_changes:
                    try:
                        if c.change_type == "schema":
                            ok, err = validate_schema_content(c.effective_content)
                            if not ok:
                                results.append(PublishItemResult(
                                    change_id=str(c.id), field_label=c.field_label,
                                    page_url=c.page_url, success=False,
                                    error=f"Invalid schema JSON-LD: {err}",
                                ))
                                continue

                        update_payload = build_wp_update(c, full_post)

                        manual = update_payload.pop("_manual", None)
                        if manual:
                            results.append(PublishItemResult(
                                change_id=str(c.id), field_label=c.field_label,
                                page_url=c.page_url, success=True,
                                error=f"Manual upload required for {manual['file']} — exact content is in the change.",
                            ))
                            continue

                        update = await client.post(
                            f"{site_url}/wp-json/wp/v2/{endpoint}/{post_id}",
                            json=update_payload,
                            headers=headers,
                        )

                        if update.status_code == 401:
                            async with pool.acquire() as conn:
                                await set_integration_status(conn, user_id, "WordPress", "reauth")
                            results.append(_reauth_result(c))
                            continue

                        if update.status_code == 403:
                            results.append(PublishItemResult(
                                change_id=str(c.id), field_label=c.field_label,
                                page_url=c.page_url, success=False,
                                error="Your WordPress account does not have permission to edit this page.",
                            ))
                            continue

                        update.raise_for_status()
                        results.append(PublishItemResult(
                            change_id=str(c.id), field_label=c.field_label,
                            page_url=c.page_url, success=True,
                        ))

                    except httpx.TimeoutException:
                        results.append(PublishItemResult(
                            change_id=str(c.id), field_label=c.field_label,
                            page_url=c.page_url, success=False,
                            error="WordPress request timed out. Check your site is reachable.",
                        ))
                    except Exception as exc:
                        logger.error("WP publish failed for %s: %s", c.page_url, exc)
                        results.append(PublishItemResult(
                            change_id=str(c.id), field_label=c.field_label,
                            page_url=c.page_url, success=False,
                            error="Publish failed. Try again or check your WordPress site.",
                        ))

    if any(r.success for r in results):
        async with pool.acquire() as conn:
            await touch_integration(conn, user_id, "WordPress")

    return results, cache_cleared
