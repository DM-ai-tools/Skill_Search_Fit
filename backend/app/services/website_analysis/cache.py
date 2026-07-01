"""Database cache layer for website analysis."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg

from app.cache.temp_cache import cache_delete, cache_get, cache_set
from app.config import settings
from app.services.website_analysis.analyzer import analyze_website, cache_expiry
from app.services.website_analysis.url_utils import normalize_website_url, validate_website_url


def _website_analysis_cache_key(normalized: str) -> str:
    return f"website_analysis:{normalized}"


def _website_analysis_ttl_seconds() -> int:
    return max(1, settings.website_analysis_cache_days * 86_400)


async def _get_redis_cached_analysis(normalized: str) -> dict[str, Any] | None:
    return await cache_get(_website_analysis_cache_key(normalized))


async def _set_redis_cached_analysis(normalized: str, payload: dict[str, Any]) -> None:
    await cache_set(_website_analysis_cache_key(normalized), payload, _website_analysis_ttl_seconds())


async def _invalidate_redis_cached_analysis(normalized: str) -> None:
    await cache_delete(_website_analysis_cache_key(normalized))


async def purge_expired_analyses(conn: asyncpg.Connection) -> int:
    result = await conn.execute(
        "DELETE FROM website_analysis WHERE expires_at < NOW()"
    )
    try:
        return int(result.split()[-1])
    except (ValueError, IndexError):
        return 0


async def get_cached_analysis(
    conn: asyncpg.Connection,
    url: str,
) -> dict[str, Any] | None:
    normalized = normalize_website_url(url)
    if not normalized:
        return None

    redis_hit = await _get_redis_cached_analysis(normalized)
    if redis_hit:
        return redis_hit

    row = await conn.fetchrow(
        """
        SELECT id, url, analysis_json, scan_status, error_message,
               created_at, updated_at, expires_at
        FROM website_analysis
        WHERE url_normalized = $1
          AND expires_at > NOW()
          AND scan_status IN ('completed', 'partial')
        """,
        normalized,
    )
    if not row:
        return None

    analysis_json = row["analysis_json"]
    if isinstance(analysis_json, str):
        analysis_json = json.loads(analysis_json)

    payload = {
        "id": str(row["id"]),
        "url": row["url"],
        "scan_status": row["scan_status"],
        "cached": True,
        "error_message": row["error_message"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "expires_at": row["expires_at"].isoformat(),
        **analysis_json,
    }
    await _set_redis_cached_analysis(normalized, payload)
    return payload


async def run_website_analysis(
    conn: asyncpg.Connection,
    url: str,
    user_id: UUID | None = None,
) -> dict[str, Any]:
    normalized = validate_website_url(url)
    await purge_expired_analyses(conn)

    cached = await get_cached_analysis(conn, normalized)
    if cached:
        return cached

    await _invalidate_redis_cached_analysis(normalized)

    await conn.execute(
        """
        INSERT INTO website_analysis (url, url_normalized, analysis_json, scan_status, user_id, expires_at)
        VALUES ($1, $2, '{}'::jsonb, 'scanning', $3, $4)
        ON CONFLICT (url_normalized) DO UPDATE SET
            scan_status = 'scanning',
            updated_at = NOW(),
            user_id = COALESCE(EXCLUDED.user_id, website_analysis.user_id)
        """,
        normalized,
        normalized,
        user_id,
        cache_expiry(),
    )

    try:
        result = await analyze_website(normalized)
        analysis_payload = {
            "analysis": result["analysis"],
            "crawl": result["crawl"],
            "competitors": result.get("competitors", []),
            "competitor_discovery_status": result.get("competitor_discovery_status", "skipped"),
            "analyzed_at": result["analyzed_at"],
        }
        scan_status = result["scan_status"]

        row = await conn.fetchrow(
            """
            UPDATE website_analysis
            SET analysis_json = $2::jsonb,
                scan_status = $3,
                error_message = NULL,
                updated_at = NOW(),
                expires_at = $4
            WHERE url_normalized = $1
            RETURNING id, url, created_at, updated_at, expires_at
            """,
            normalized,
            json.dumps(analysis_payload),
            scan_status,
            cache_expiry(),
        )
    except Exception as exc:
        await conn.execute(
            """
            UPDATE website_analysis
            SET scan_status = 'failed',
                error_message = $2,
                updated_at = NOW()
            WHERE url_normalized = $1
            """,
            normalized,
            str(exc),
        )
        raise

    response = {
        "id": str(row["id"]),
        "url": row["url"],
        "scan_status": scan_status,
        "cached": False,
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "expires_at": row["expires_at"].isoformat(),
        **analysis_payload,
    }
    await _set_redis_cached_analysis(normalized, {**response, "cached": True})
    return response
