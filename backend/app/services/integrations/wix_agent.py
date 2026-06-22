"""Wix publish agent using per-user stored credentials."""

from __future__ import annotations

from uuid import UUID

from app.db.integrations import decode_api_credentials, get_access_token
from app.db.pool import get_pool
from app.schemas.change_suggestions import ChangeResponse, PublishItemResult
from app.services.change_suggestions.publishers import wix as wix_publisher


async def publish(
    user_id: UUID,
    changes: list[ChangeResponse],
    dry_run: bool = True,
) -> list[PublishItemResult]:
    pool = get_pool()
    async with pool.acquire() as conn:
        token = await get_access_token(conn, user_id, "Wix")

    if not token:
        return [
            PublishItemResult(
                change_id=str(c.id),
                field_label=c.field_label,
                page_url=c.page_url,
                success=False,
                error="Wix not connected. Connect your site in Integrations.",
            )
            for c in changes
        ]

    creds = decode_api_credentials("Wix", token)
    return await wix_publisher.publish(
        changes,
        dry_run=dry_run,
        api_key=creds.get("api_key"),
        site_id=creds.get("site_id"),
    )
