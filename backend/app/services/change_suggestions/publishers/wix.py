"""Wix Site Pages API publisher — env settings or per-user credentials."""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.config import settings
from app.schemas.change_suggestions import ChangeResponse, PublishItemResult

logger = logging.getLogger(__name__)

_BASE = "https://www.wixapis.com/site-pages/v1"


def _headers(api_key: str, site_id: str) -> dict[str, str]:
    return {
        "Authorization": api_key,
        "wix-site-id": site_id,
        "Content-Type": "application/json",
    }


async def publish(
    changes: list[ChangeResponse],
    dry_run: bool = True,
    *,
    api_key: Optional[str] = None,
    site_id: Optional[str] = None,
) -> list[PublishItemResult]:
    results: list[PublishItemResult] = []
    resolved_key = api_key or settings.wix_api_key
    resolved_site_id = site_id or settings.wix_site_id

    if dry_run:
        for c in changes:
            results.append(PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=True,
                error="Dry run: would update Wix page",
            ))
        logger.info("Wix dry-run: %d items would be published", len(changes))
        return results

    if not resolved_key or not resolved_site_id:
        return [
            PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=False,
                error="Wix not connected. Add your API key in Integrations.",
            )
            for c in changes
        ]

    async with httpx.AsyncClient(timeout=20, headers=_headers(resolved_key, resolved_site_id)) as client:
        for c in changes:
            try:
                slug = c.page_url.rstrip("/").rsplit("/", 1)[-1] or "home"

                pages_resp = await client.get(f"{_BASE}/pages", params={"paging.limit": 100})
                if pages_resp.status_code == 401:
                    return [
                        PublishItemResult(
                            change_id=str(ch.id),
                            field_label=ch.field_label,
                            page_url=ch.page_url,
                            success=False,
                            error="Wix authentication failed. Reconnect in Integrations.",
                        )
                        for ch in changes
                    ]
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
                change_type = (c.change_type or "").lower()

                page_patch: dict = {}
                if "title" in label or change_type == "title":
                    page_patch = {"page": {"seo": {"title": content}, "title": content}}
                elif "description" in label or "meta" in label:
                    page_patch = {"page": {"seo": {"description": content}}}
                elif any(k in label for k in ("body", "content", "html", "copy", "article", "paragraph")):
                    page_patch = {
                        "page": {
                            "seo": {"description": content[:160]},
                            "description": content,
                        }
                    }
                else:
                    page_patch = {
                        "page": {
                            "seo": {
                                "tags": [
                                    {
                                        "type": "property",
                                        "props": {"name": c.field_label, "content": content},
                                    }
                                ]
                            }
                        }
                    }

                update_resp = await client.patch(
                    f"{_BASE}/pages/{page_id}",
                    json=page_patch,
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
