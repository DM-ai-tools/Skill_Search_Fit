"""Webflow Data API v2 publisher."""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.schemas.reports import ChangeResponse, PublishItemResult

logger = logging.getLogger(__name__)

_BASE = "https://api.webflow.com/v2"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.webflow_api_token}",
        "Content-Type": "application/json",
        "accept": "application/json",
    }


def _build_field_data(change: ChangeResponse) -> dict[str, str]:
    content = change.edited_content if change.edited_content is not None else change.proposed_content
    label = change.field_label.lower()
    if "title" in label:
        return {"name": content}
    if "description" in label:
        return {"seo-description": content, "meta-description": content}
    return {change.field_label: content}


async def publish(
    changes: list[ChangeResponse],
    dry_run: bool = True,
) -> list[PublishItemResult]:
    results: list[PublishItemResult] = []

    if dry_run:
        for c in changes:
            results.append(PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=True,
            ))
        logger.info("Webflow dry-run: %d items would be published", len(changes))
        return results

    site_id = settings.webflow_site_id

    async with httpx.AsyncClient(timeout=20, headers=_headers()) as client:
        for c in changes:
            try:
                slug = c.page_url.rstrip("/").rsplit("/", 1)[-1] or "home"

                pages_resp = await client.get(f"{_BASE}/sites/{site_id}/pages")
                pages_resp.raise_for_status()
                pages = pages_resp.json().get("pages", [])
                page = next((p for p in pages if p.get("slug") == slug), None)

                if page:
                    page_id = page["id"]
                    field_data = _build_field_data(c)
                    update_resp = await client.patch(
                        f"{_BASE}/pages/{page_id}",
                        json={"fields": field_data},
                    )
                    update_resp.raise_for_status()

                    await client.post(f"{_BASE}/sites/{site_id}/publish", json={"publishToWebflowSubdomain": True})

                    results.append(PublishItemResult(
                        change_id=str(c.id),
                        field_label=c.field_label,
                        page_url=c.page_url,
                        success=True,
                    ))
                else:
                    results.append(PublishItemResult(
                        change_id=str(c.id),
                        field_label=c.field_label,
                        page_url=c.page_url,
                        success=False,
                        error=f"Page with slug '{slug}' not found in Webflow site",
                    ))
            except Exception as exc:
                logger.error("Webflow publish failed for %s: %s", c.page_url, exc)
                results.append(PublishItemResult(
                    change_id=str(c.id),
                    field_label=c.field_label,
                    page_url=c.page_url,
                    success=False,
                    error=str(exc),
                ))

    return results
