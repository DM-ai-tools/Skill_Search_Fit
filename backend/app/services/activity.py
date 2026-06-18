import json
from uuid import UUID

import asyncpg


async def log_activity(
    conn: asyncpg.Connection,
    *,
    user_id: UUID | None,
    action: str,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO activity_logs (user_id, action, metadata, ip_address)
        VALUES ($1, $2, $3::jsonb, $4::inet)
        """,
        user_id,
        action,
        json.dumps(metadata or {}),
        ip_address,
    )
