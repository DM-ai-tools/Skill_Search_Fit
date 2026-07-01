"""Verify required migrations have been applied before serving traffic."""

from __future__ import annotations

import asyncpg

REQUIRED_COLUMNS: tuple[tuple[str, str], ...] = (
    ("pipeline_runs", "error_message"),
    ("pipeline_runs", "suggestion_audit_log"),
    ("pipeline_page_generations", "error_message"),
)


async def validate_database_schema(conn: asyncpg.Connection) -> None:
    """Raise RuntimeError when expected columns from recent migrations are missing."""
    missing: list[str] = []
    for table, column in REQUIRED_COLUMNS:
        exists = await conn.fetchval(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2
            """,
            table,
            column,
        )
        if not exists:
            missing.append(f"{table}.{column}")

    if missing:
        raise RuntimeError(
            "Database schema is out of date. Run migrations (scripts/migrate.py). "
            f"Missing: {', '.join(missing)}"
        )
