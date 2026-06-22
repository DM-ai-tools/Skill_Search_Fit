"""WordPress REST API publisher (Application Password auth)."""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from app.config import settings
from app.schemas.change_suggestions import ChangeResponse, PublishItemResult
from app.services.change_suggestions.wp_publish_core import (
    build_new_page_payload,
    build_wp_update,
    infer_post_type_from_url,
    is_new_page_creation,
    validate_schema_content,
)

logger = logging.getLogger(__name__)


def _auth_header() -> str:
    token = base64.b64encode(
        f"{settings.wp_username}:{settings.wp_app_password}".encode()
    ).decode()
    return f"Basic {token}"


async def _resolve_post(
    client: httpx.AsyncClient,
    site_url: str,
    headers: dict[str, str],
    slug: str,
) -> dict[str, Any] | None:
    for endpoint in ("pages", "posts"):
        search_resp = await client.get(
            f"{site_url}/wp-json/wp/v2/{endpoint}",
            params={"slug": slug},
            headers=headers,
        )
        search_resp.raise_for_status()
        pages = search_resp.json()
        if pages:
            post = pages[0]
            post["_endpoint"] = endpoint
            return post
    return None


async def _create_draft(
    client: httpx.AsyncClient,
    site_url: str,
    headers: dict[str, str],
    change: ChangeResponse,
) -> PublishItemResult:
    payload = build_new_page_payload(change)
    post_type = payload.pop("_post_type", infer_post_type_from_url(change.page_url))
    create_resp = await client.post(
        f"{site_url}/wp-json/wp/v2/{post_type}",
        json={k: v for k, v in payload.items() if not k.startswith("_")},
        headers=headers,
    )
    create_resp.raise_for_status()
    created = create_resp.json()
    draft_url = created.get("link", change.page_url)
    return PublishItemResult(
        change_id=str(change.id),
        field_label=change.field_label,
        page_url=draft_url,
        success=True,
        error=None,
    )


async def _update_existing(
    client: httpx.AsyncClient,
    site_url: str,
    headers: dict[str, str],
    change: ChangeResponse,
    post: dict[str, Any],
) -> PublishItemResult:
    post_id = post["id"]
    endpoint = post.get("_endpoint", "pages")
    update_payload = build_wp_update(change, post)

    manual = update_payload.pop("_manual", None)
    if manual:
        return PublishItemResult(
            change_id=str(change.id),
            field_label=change.field_label,
            page_url=change.page_url,
            success=True,
            error=f"Manual upload required for {manual['file']} — content ready in proposed change.",
        )

    if change.change_type == "schema":
        ok, err = validate_schema_content(change.effective_content)
        if not ok:
            return PublishItemResult(
                change_id=str(change.id),
                field_label=change.field_label,
                page_url=change.page_url,
                success=False,
                error=f"Invalid schema JSON-LD: {err}",
            )

    update_resp = await client.post(
        f"{site_url}/wp-json/wp/v2/{endpoint}/{post_id}",
        json=update_payload,
        headers=headers,
    )
    update_resp.raise_for_status()
    return PublishItemResult(
        change_id=str(change.id),
        field_label=change.field_label,
        page_url=change.page_url,
        success=True,
    )


async def publish(
    changes: list[ChangeResponse],
    dry_run: bool = True,
) -> list[PublishItemResult]:
    results: list[PublishItemResult] = []

    if dry_run:
        for c in changes:
            action = "create draft" if is_new_page_creation(c) else "update"
            results.append(
                PublishItemResult(
                    change_id=str(c.id),
                    field_label=c.field_label,
                    page_url=c.page_url,
                    success=True,
                    error=f"Dry run: would {action}",
                )
            )
        logger.info("WordPress dry-run: %d items would be published", len(changes))
        return results

    site_url = settings.wp_site_url.rstrip("/")
    headers = {
        "Authorization": _auth_header(),
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20) as client:
        for c in changes:
            try:
                if is_new_page_creation(c):
                    results.append(await _create_draft(client, site_url, headers, c))
                    continue

                slug = c.page_url.rstrip("/").rsplit("/", 1)[-1] or "home"
                post = await _resolve_post(client, site_url, headers, slug)
                if not post:
                    results.append(PublishItemResult(
                        change_id=str(c.id),
                        field_label=c.field_label,
                        page_url=c.page_url,
                        success=False,
                        error=f"No WordPress page/post found with slug '{slug}'",
                    ))
                    continue

                results.append(await _update_existing(client, site_url, headers, c, post))
            except Exception as exc:
                logger.error("WordPress publish failed for %s: %s", c.page_url, exc)
                results.append(PublishItemResult(
                    change_id=str(c.id),
                    field_label=c.field_label,
                    page_url=c.page_url,
                    success=False,
                    error=str(exc),
                ))

    return results
