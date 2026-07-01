"""Arq queue helpers for durable async jobs."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine, Mapping
from typing import Any, TypeVar

from arq.connections import ArqRedis, RedisSettings, create_pool

from app.config import settings

logger = logging.getLogger(__name__)

_pool: ArqRedis | None = None
_T = TypeVar("_T")


def _log_background_task(task: asyncio.Task[Any]) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Background task failed")


def schedule_background_task(coro: Coroutine[Any, Any, _T]) -> asyncio.Task[_T]:
    """Run async work without blocking the current request."""
    task = asyncio.create_task(coro)
    task.add_done_callback(_log_background_task)
    return task


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


async def get_arq_pool() -> ArqRedis | None:
    global _pool
    if not settings.redis_url.strip():
        return None
    if _pool is not None:
        return _pool
    try:
        _pool = await create_pool(_redis_settings())
        return _pool
    except Exception as exc:  # noqa: BLE001
        logger.warning("Arq pool unavailable: %s", exc)
        _pool = None
        return None


async def close_arq_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
    _pool = None


async def queue_enabled() -> bool:
    pool = await get_arq_pool()
    return pool is not None


async def pipeline_jobs_via_queue() -> bool:
    """Use Arq only when explicitly enabled and Redis is reachable."""
    if not settings.pipeline_use_arq:
        return False
    return await queue_enabled()


async def enqueue_job(
    *,
    job_name: str,
    payload: Mapping[str, Any],
    max_tries: int = 3,
) -> str | None:
    pool = await get_arq_pool()
    if pool is None:
        return None
    job = await pool.enqueue_job(job_name, dict(payload), _max_tries=max_tries)
    return job.job_id if job else None


async def queue_stats() -> dict[str, int]:
    pool = await get_arq_pool()
    if pool is None:
        return {"queued": 0, "dead": 0}
    queued = await pool.llen("arq:queue")
    dead = await pool.llen("arq:failed")
    return {"queued": int(queued or 0), "dead": int(dead or 0)}
