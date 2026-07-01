"""JSON temporary cache stored in Redis (with in-memory fallback)."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from app.cache.redis_client import get_redis, redis_available
from app.config import settings

logger = logging.getLogger(__name__)

_KEY_PREFIX = "ssf:cache:"

# In-memory fallback: key -> (expires_at, value_json)
_memory: dict[str, tuple[float, str]] = {}


def _full_key(key: str) -> str:
    return f"{_KEY_PREFIX}{key}"


def _purge_expired_memory() -> None:
    now = time.time()
    expired = [k for k, (exp, _) in _memory.items() if exp <= now]
    for k in expired:
        del _memory[k]


async def cache_get(key: str) -> Any | None:
    """Return cached JSON value or None if missing/expired."""
    full = _full_key(key)

    if redis_available():
        try:
            redis = get_redis()
            assert redis is not None
            raw = await redis.get(full)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as exc:
            logger.warning("Redis cache_get failed for %s: %s", key, exc)

    _purge_expired_memory()
    entry = _memory.get(full)
    if not entry:
        return None
    expires_at, raw = entry
    if expires_at <= time.time():
        del _memory[full]
        return None
    return json.loads(raw)


async def cache_set(key: str, value: Any, ttl_seconds: int | None = None) -> None:
    """Store JSON-serializable value with TTL (seconds)."""
    ttl = ttl_seconds if ttl_seconds is not None else settings.redis_default_ttl_seconds
    ttl = max(1, int(ttl))
    raw = json.dumps(value, default=str)
    full = _full_key(key)

    if redis_available():
        try:
            redis = get_redis()
            assert redis is not None
            await redis.set(full, raw, ex=ttl)
            return
        except Exception as exc:
            logger.warning("Redis cache_set failed for %s: %s", key, exc)

    _memory[full] = (time.time() + ttl, raw)


async def cache_delete(key: str) -> None:
    full = _full_key(key)

    if redis_available():
        try:
            redis = get_redis()
            assert redis is not None
            await redis.delete(full)
        except Exception as exc:
            logger.warning("Redis cache_delete failed for %s: %s", key, exc)

    _memory.pop(full, None)
