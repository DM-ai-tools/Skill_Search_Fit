"""Tests for Redis-backed cache and rate limiting."""

import asyncio

import pytest

from app.cache import temp_cache
from app.cache.rate_limit_store import rate_limit_check


def test_temp_cache_set_and_get(monkeypatch):
    monkeypatch.setattr("app.cache.temp_cache.redis_available", lambda: False)

    async def _run():
        await temp_cache.cache_set("test-key", {"foo": "bar"}, ttl_seconds=60)
        value = await temp_cache.cache_get("test-key")
        assert value == {"foo": "bar"}
        await temp_cache.cache_delete("test-key")
        assert await temp_cache.cache_get("test-key") is None

    asyncio.run(_run())


def test_rate_limit_check_in_memory_fallback(monkeypatch):
    monkeypatch.setattr("app.cache.rate_limit_store.redis_available", lambda: False)

    async def _run():
        first = await rate_limit_check("test-ip", limit=2, window=60)
        second = await rate_limit_check("test-ip", limit=2, window=60)
        third = await rate_limit_check("test-ip", limit=2, window=60)
        assert first is None
        assert second is None
        assert third is not None
        assert third >= 1

    asyncio.run(_run())
