"""Security tests for integration publish ownership checks."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.exceptions import AppError
from app.routers.integrations import _fetch_approved_changes, _verify_suggestion_owner


def test_verify_suggestion_owner_raises_when_not_owned():
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=None)

    with pytest.raises(AppError) as exc:
        asyncio.run(_verify_suggestion_owner(conn, uuid4(), uuid4()))

    assert exc.value.status_code == 404


def test_fetch_approved_changes_requires_ownership():
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=None)
    conn.fetch = AsyncMock()

    user_id = uuid4()
    suggestion_id = uuid4()

    with pytest.raises(AppError):
        asyncio.run(_fetch_approved_changes(conn, suggestion_id, user_id, "WordPress"))

    conn.fetch.assert_not_called()


def test_fetch_approved_changes_joins_user_id():
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=1)
    conn.fetch = AsyncMock(return_value=[])

    user_id = uuid4()
    suggestion_id = uuid4()

    asyncio.run(_fetch_approved_changes(conn, suggestion_id, user_id, "WordPress"))

    sql = conn.fetch.call_args[0][0]
    assert "change_suggestions" in sql
    assert "cs.user_id" in sql
    assert conn.fetch.call_args[0][1:] == (suggestion_id, user_id, "WordPress")
