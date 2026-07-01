"""Rate-limit counters — Redis sliding window with in-memory fallback."""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from threading import Lock

from app.cache.redis_client import get_redis, redis_available

logger = logging.getLogger(__name__)

_RL_PREFIX = "ssf:rl:"


class _InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str, limit: int, window: int) -> int | None:
        now = time.time()
        with self._lock:
            hits = [t for t in self._hits[key] if now - t < window]
            if len(hits) >= limit:
                return int(window - (now - hits[0])) + 1
            hits.append(now)
            self._hits[key] = hits
            return None


_memory_limiter = _InMemoryRateLimiter()


async def rate_limit_check(key: str, limit: int, window: int) -> int | None:
    """Return retry_after seconds if limited, else None."""
    if not redis_available():
        return _memory_limiter.check(key, limit, window)

    redis_key = f"{_RL_PREFIX}{key}"
    now = time.time()
    window_start = now - window

    try:
        redis = get_redis()
        assert redis is not None
        pipe = redis.pipeline()
        pipe.zremrangebyscore(redis_key, "-inf", window_start)
        pipe.zadd(redis_key, {str(now): now})
        pipe.zcard(redis_key)
        pipe.expire(redis_key, window + 1)
        _, _, count, _ = await pipe.execute()

        if int(count) > limit:
            oldest = await redis.zrange(redis_key, 0, 0, withscores=True)
            if oldest:
                oldest_ts = float(oldest[0][1])
                return max(1, int(window - (now - oldest_ts)) + 1)
            return window
        return None
    except Exception as exc:
        logger.warning("Redis rate_limit_check failed, using in-memory fallback: %s", exc)
        return _memory_limiter.check(key, limit, window)
