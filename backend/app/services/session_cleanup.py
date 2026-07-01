"""Purge expired auth sessions from the database."""

from __future__ import annotations

import asyncpg


async def purge_expired_sessions(conn: asyncpg.Connection) -> int:
    """Delete sessions past expires_at. Returns number of rows removed."""
    result = await conn.execute("DELETE FROM sessions WHERE expires_at < NOW()")
    # asyncpg returns e.g. "DELETE 5"
    try:
        return int(result.split()[-1])
    except (ValueError, IndexError):
        return 0
