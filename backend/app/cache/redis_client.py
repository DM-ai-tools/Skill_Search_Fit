"""Async Redis connection pool with graceful degradation."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

_redis: Redis | None = None
_redis_ready = False


def redis_configured() -> bool:
    return bool(settings.redis_url.strip())


def redis_available() -> bool:
    return _redis_ready and _redis is not None


def get_redis() -> Redis | None:
    return _redis if _redis_ready else None


async def init_redis() -> None:
    global _redis, _redis_ready
    if not redis_configured():
        logger.info("REDIS_URL not set — using in-memory fallbacks for cache and rate limits")
        return

    try:
        from redis.asyncio import Redis

        client = Redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=settings.redis_connect_timeout_seconds,
        )
        await client.ping()
        _redis = client
        _redis_ready = True
        logger.info("Redis connected")
    except Exception as exc:
        _redis = None
        _redis_ready = False
        if settings.is_production:
            raise RuntimeError(f"Redis connection failed in production: {exc}") from exc
        logger.warning("Redis unavailable — falling back to in-memory cache/rate limits: %s", exc)


async def close_redis() -> None:
    global _redis, _redis_ready
    if _redis is not None:
        await _redis.aclose()
    _redis = None
    _redis_ready = False


async def ping_redis() -> bool:
    if not redis_available():
        return False
    try:
        assert _redis is not None
        await _redis.ping()
        return True
    except Exception:
        return False
