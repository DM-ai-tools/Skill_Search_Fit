"""Recovery for pipeline runs stuck in transient bootstrap states."""

from __future__ import annotations

import logging

import asyncpg

logger = logging.getLogger(__name__)

_STALE_BOOTSTRAP_STATUSES = ("analyzing_competitors",)
_STALE_AFTER_MINUTES = 30
_STALE_MESSAGE = (
    "Pipeline bootstrap timed out or was interrupted. Please start a new run."
)


async def recover_stale_pipeline_runs(pool: asyncpg.Pool) -> int:
    """Mark long-running bootstrap states as failed so the UI does not hang indefinitely."""
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE pipeline_runs
            SET status = 'failed',
                error_message = $1,
                updated_at = NOW()
            WHERE status = ANY($2::text[])
              AND created_at < NOW() - ($3::text || ' minutes')::interval
            """,
            _STALE_MESSAGE,
            list(_STALE_BOOTSTRAP_STATUSES),
            str(_STALE_AFTER_MINUTES),
        )
    try:
        count = int(result.split()[-1])
    except (ValueError, IndexError):
        count = 0
    if count:
        logger.warning("Recovered %d stale pipeline run(s) stuck in bootstrap", count)
    return count
