"""Wix REST/Headless API publisher."""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.schemas.change_suggestions import ChangeResponse, PublishItemResult

logger = logging.getLogger(__name__)

_BASE = "https://www.wixapis.com/site-pages/v1"


def _headers() -> dict[str, str]:
    return {
        "Authorization": settings.wix_api_key,
        "wix-site-id": settings.wix_site_id,
        "Content-Type": "application/json",
    }


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
        logger.info("Wix dry-run: %d items would be published", len(changes))
        return results

    async with httpx.AsyncClient(timeout=20, headers=_headers()) as client:
        for c in changes:
            try:
                slug = c.page_url.rstrip("/").rsplit("/", 1)[-1] or "home"

                pages_resp = await client.get(f"{_BASE}/pages", params={"paging.limit": 100})
                pages_resp.raise_for_status()
                pages = pages_resp.json().get("pages", [])
                page = next(
                    (p for p in pages if p.get("url", "").rstrip("/").endswith(slug)), None
                )

                if not page:
                    results.append(PublishItemResult(
                        change_id=str(c.id),
                        field_label=c.field_label,
                        page_url=c.page_url,
                        success=False,
                        error=f"No Wix page found matching slug '{slug}'",
                    ))
                    continue

                page_id = page["id"]
                content = c.effective_content
                label = c.field_label.lower()

                seo_data: dict = {}
                if "title" in label:
                    seo_data["title"] = content
                elif "description" in label:
                    seo_data["description"] = content
                else:
                    seo_data["tags"] = [{"type": "property", "props": {"name": c.field_label, "content": content}}]

                update_resp = await client.patch(
                    f"{_BASE}/pages/{page_id}",
                    json={"page": {"seo": seo_data}},
                )
                update_resp.raise_for_status()

                results.append(PublishItemResult(
                    change_id=str(c.id),
                    field_label=c.field_label,
                    page_url=c.page_url,
                    success=True,
                ))
            except Exception as exc:
                logger.error("Wix publish failed for %s: %s", c.page_url, exc)
                results.append(PublishItemResult(
                    change_id=str(c.id),
                    field_label=c.field_label,
                    page_url=c.page_url,
                    success=False,
                    error=str(exc),
                ))

    return results
