"""Database cache layer for website analysis."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg

from app.services.website_analysis.analyzer import analyze_website, cache_expiry
from app.services.website_analysis.url_utils import normalize_website_url, validate_website_url


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

    return {
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
        payload = {
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
            json.dumps(payload),
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

    return {
        "id": str(row["id"]),
        "url": row["url"],
        "scan_status": scan_status,
        "cached": False,
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "expires_at": row["expires_at"].isoformat(),
        **payload,
    }
