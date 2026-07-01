"""Optional DB integration checks against a real PostgreSQL database."""

from __future__ import annotations

import os

import asyncpg
import pytest

from app.db.schema_checks import validate_database_schema


@pytest.mark.integration
@pytest.mark.asyncio
async def test_required_schema_columns_exist():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL not configured for DB integration tests")

    conn = await asyncpg.connect(dsn=db_url)
    try:
        await validate_database_schema(conn)
        row = await conn.fetchrow("SELECT NOW() AS now")
        assert row is not None
        assert row["now"] is not None
    finally:
        await conn.close()
