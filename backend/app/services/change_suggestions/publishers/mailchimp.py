"""Mailchimp Marketing API publisher."""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.schemas.change_suggestions import ChangeResponse, PublishItemResult
from app.services.change_suggestions.generators import generate_mailchimp_payload

logger = logging.getLogger(__name__)


def _base_url() -> str:
    return f"https://{settings.mailchimp_server_prefix}.api.mailchimp.com/3.0"


def _auth() -> tuple[str, str]:
    return ("anystring", settings.mailchimp_api_key)


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
        logger.info("Mailchimp dry-run: %d items would be published", len(changes))
        return results

    payload = generate_mailchimp_payload(changes)

    try:
        async with httpx.AsyncClient(timeout=20, auth=_auth()) as client:
            campaign_resp = await client.post(
                f"{_base_url()}/campaigns",
                json={
                    "type": "regular",
                    "settings": {
                        "subject_line": payload["subject_line"],
                        "preview_text": payload["preview_text"],
                        "from_name": "Content Team",
                        "reply_to": "",
                    },
                },
            )
            campaign_resp.raise_for_status()
            campaign_id = campaign_resp.json()["id"]

            content_resp = await client.put(
                f"{_base_url()}/campaigns/{campaign_id}/content",
                json={"html": payload["html"]},
            )
            content_resp.raise_for_status()

        for c in changes:
            results.append(PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=True,
            ))
    except Exception as exc:
        logger.error("Mailchimp campaign creation failed: %s", exc)
        for c in changes:
            results.append(PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=False,
                error=str(exc),
            ))

    return results
