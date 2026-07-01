"""Tests for session cleanup."""

import asyncio
from unittest.mock import AsyncMock

from app.services.session_cleanup import purge_expired_sessions


def test_purge_expired_sessions_returns_deleted_count():
    conn = AsyncMock()
    conn.execute = AsyncMock(return_value="DELETE 3")

    deleted = asyncio.run(purge_expired_sessions(conn))

    assert deleted == 3
    conn.execute.assert_awaited_once()
    assert "sessions" in conn.execute.call_args[0][0]
