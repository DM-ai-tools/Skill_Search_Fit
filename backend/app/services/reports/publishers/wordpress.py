"""WordPress REST API publisher (Application Password auth)."""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from app.config import settings
from app.schemas.reports import ChangeResponse, PublishItemResult

logger = logging.getLogger(__name__)


def _auth_header() -> str:
    token = base64.b64encode(
        f"{settings.wp_username}:{settings.wp_app_password}".encode()
    ).decode()
    return f"Basic {token}"


def _build_wp_update(change: ChangeResponse) -> dict[str, Any]:
    content = change.edited_content if change.edited_content is not None else change.proposed_content
    payload: dict[str, Any] = {}
    label = change.field_label.lower()

    if change.change_type == "metadata":
        if "title" in label:
            payload["title"] = content
        elif "description" in label or "excerpt" in label:
            payload["excerpt"] = content
        else:
            payload["meta"] = {change.field_label: content}
    elif change.change_type == "schema":
        payload["meta"] = {"_schema_markup": content}
    else:
        payload["content"] = content

    return payload


async def publish(
    changes: list[ChangeResponse],
    dry_run: bool = True,
) -> list[PublishItemResult]:
    results: list[PublishItemResult] = []

    if dry_run:
        for c in changes:
            results.append(
                PublishItemResult(
                    change_id=str(c.id),
                    field_label=c.field_label,
                    page_url=c.page_url,
                    success=True,
                    error=None,
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
                slug = c.page_url.rstrip("/").rsplit("/", 1)[-1] or "home"
                search_resp = await client.get(
                    f"{site_url}/wp-json/wp/v2/pages",
                    params={"slug": slug},
                    headers=headers,
                )
                search_resp.raise_for_status()
                pages = search_resp.json()

                if not pages:
                    search_resp = await client.get(
                        f"{site_url}/wp-json/wp/v2/posts",
                        params={"slug": slug},
                        headers=headers,
                    )
                    search_resp.raise_for_status()
                    pages = search_resp.json()

                if not pages:
                    results.append(PublishItemResult(
                        change_id=str(c.id),
                        field_label=c.field_label,
                        page_url=c.page_url,
                        success=False,
                        error=f"No WordPress page/post found with slug '{slug}'",
                    ))
                    continue

                post_id = pages[0]["id"]
                post_type = "pages" if pages[0].get("type", "page") == "page" else "posts"
                update_payload = _build_wp_update(c)

                update_resp = await client.post(
                    f"{site_url}/wp-json/wp/v2/{post_type}/{post_id}",
                    json=update_payload,
                    headers=headers,
                )
                update_resp.raise_for_status()
                results.append(PublishItemResult(
                    change_id=str(c.id),
                    field_label=c.field_label,
                    page_url=c.page_url,
                    success=True,
                ))
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
