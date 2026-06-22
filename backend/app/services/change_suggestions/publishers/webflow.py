"""Webflow Data API v2 publisher — env settings or per-user credentials."""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.config import settings
from app.schemas.change_suggestions import ChangeResponse, PublishItemResult

logger = logging.getLogger(__name__)

_BASE = "https://api.webflow.com/v2"


def _headers(api_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_token}",
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
    *,
    api_token: Optional[str] = None,
    site_id: Optional[str] = None,
) -> list[PublishItemResult]:
    results: list[PublishItemResult] = []
    token = api_token or settings.webflow_api_token
    resolved_site_id = site_id or settings.webflow_site_id

    if dry_run:
        for c in changes:
            results.append(PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=True,
                error="Dry run: would update Webflow page",
            ))
        logger.info("Webflow dry-run: %d items would be published", len(changes))
        return results

    if not token or not resolved_site_id:
        return [
            PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=False,
                error="Webflow not connected. Add your API token in Integrations.",
            )
            for c in changes
        ]

    async with httpx.AsyncClient(timeout=20, headers=_headers(token)) as client:
        for c in changes:
            try:
                slug = c.page_url.rstrip("/").rsplit("/", 1)[-1] or "home"

                pages_resp = await client.get(f"{_BASE}/sites/{resolved_site_id}/pages")
                if pages_resp.status_code == 401:
                    return [
                        PublishItemResult(
                            change_id=str(ch.id),
                            field_label=ch.field_label,
                            page_url=ch.page_url,
                            success=False,
                            error="Webflow authentication failed. Reconnect in Integrations.",
                        )
                        for ch in changes
                    ]
                pages_resp.raise_for_status()
                pages = pages_resp.json().get("pages", [])
                page = next((p for p in pages if p.get("slug") == slug), None)

                if not page:
                    results.append(PublishItemResult(
                        change_id=str(c.id),
                        field_label=c.field_label,
                        page_url=c.page_url,
                        success=False,
                        error=f"Page with slug '{slug}' not found in Webflow site",
                    ))
                    continue

                page_id = page["id"]
                field_data = _build_field_data(c)
                update_resp = await client.patch(
                    f"{_BASE}/pages/{page_id}",
                    json={"fields": field_data},
                )
                update_resp.raise_for_status()

                await client.post(
                    f"{_BASE}/sites/{resolved_site_id}/publish",
                    json={"publishToWebflowSubdomain": True},
                )

                results.append(PublishItemResult(
                    change_id=str(c.id),
                    field_label=c.field_label,
                    page_url=c.page_url,
                    success=True,
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
