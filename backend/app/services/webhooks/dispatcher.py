"""Outbound webhook dispatcher for extension events."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg
import httpx

logger = logging.getLogger(__name__)


def _signature(secret: str, body: str) -> str:
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def emit_event(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    event_name: str,
    payload: dict[str, Any],
) -> None:
    rows = await conn.fetch(
        """
        SELECT target_url, secret
        FROM user_webhooks
        WHERE user_id = $1 AND event_name = $2 AND is_active = TRUE
        """,
        user_id,
        event_name,
    )
    if not rows:
        return

    body = json.dumps(
        {
            "event": event_name,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
    )

    async with httpx.AsyncClient(timeout=8) as client:
        for row in rows:
            headers = {"Content-Type": "application/json"}
            if row["secret"]:
                headers["X-SSF-Signature"] = _signature(str(row["secret"]), body)
            try:
                await client.post(str(row["target_url"]), content=body, headers=headers)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Webhook dispatch failed for event %s: %s", event_name, exc)
