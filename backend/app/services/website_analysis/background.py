"""Background website analysis + plugin prefill generation."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from uuid import UUID

from app.db.pool import get_pool
from app.services.website_analysis.analyzer import analyze_website, cache_expiry
from app.services.website_analysis.cache import get_cached_analysis, purge_expired_analyses
from app.services.website_analysis.plugin_prefill import generate_all_plugin_prefills, update_plugin_prefill
from app.services.website_analysis.url_utils import normalize_website_url, validate_website_url

logger = logging.getLogger(__name__)

_background_tasks: set[asyncio.Task] = set()


def _scanning_response(normalized: str, url: str) -> dict:
    return {
        "id": "",
        "url": url,
        "scan_status": "scanning",
        "prefill_status": "pending",
        "cached": False,
        "analysis": None,
        "competitors": [],
        "crawl": None,
    }


async def get_analysis_record(conn, url: str) -> dict | None:
    normalized = normalize_website_url(url)
    if not normalized:
        return None
    row = await conn.fetchrow(
        """
        SELECT id, url, analysis_json, scan_status, error_message,
               created_at, updated_at, expires_at
        FROM website_analysis
        WHERE url_normalized = $1 AND expires_at > NOW()
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
        "cached": row["scan_status"] in ("completed", "partial"),
        "error_message": row["error_message"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "expires_at": row["expires_at"].isoformat(),
        "prefill_status": analysis_json.get("prefill_status", "pending"),
        **analysis_json,
    }


async def start_background_website_analysis(
    conn,
    url: str,
    user_id: UUID | None = None,
    *,
    force: bool = False,
) -> dict:
    normalized = validate_website_url(url)
    await purge_expired_analyses(conn)

    if not force:
        cached = await get_cached_analysis(conn, normalized)
        if cached:
            record = await get_analysis_record(conn, normalized)
            return record or cached

    existing = await get_analysis_record(conn, normalized)
    if existing and existing.get("scan_status") == "scanning" and not force:
        return existing

    await conn.execute(
        """
        INSERT INTO website_analysis (url, url_normalized, analysis_json, scan_status, user_id, expires_at)
        VALUES ($1, $2, '{"prefill_status":"pending"}'::jsonb, 'scanning', $3, $4)
        ON CONFLICT (url_normalized) DO UPDATE SET
            scan_status = 'scanning',
            analysis_json = '{"prefill_status":"pending"}'::jsonb,
            error_message = NULL,
            updated_at = NOW(),
            user_id = COALESCE(EXCLUDED.user_id, website_analysis.user_id),
            expires_at = EXCLUDED.expires_at
        """,
        normalized,
        normalized,
        user_id,
        cache_expiry(),
    )

    task = asyncio.create_task(_run_background_pipeline(normalized, user_id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return _scanning_response(normalized, normalized)


async def _run_background_pipeline(normalized: str, user_id: UUID | None) -> None:
    pool = get_pool()
    t_pipeline = time.perf_counter()
    try:
        # ── Stage: analyze_website (crawl + AI calls) ──────────────────────────
        t0 = time.perf_counter()
        result = await analyze_website(normalized)
        logger.info("[TIMING] %s analyze_website=%.1fs", normalized, time.perf_counter() - t0)

        payload = {
            "analysis": result["analysis"],
            "crawl": result["crawl"],
            "competitors": result.get("competitors", []),
            "competitor_discovery_status": result.get("competitor_discovery_status", "skipped"),
            "analyzed_at": result["analyzed_at"],
            "prefill_status": "generating",
            "plugin_prefill": {},
        }
        scan_status = result["scan_status"]

        # Write core results — user can see analysis from this point forward
        t0 = time.perf_counter()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE website_analysis
                SET analysis_json = $2::jsonb,
                    scan_status = $3,
                    error_message = NULL,
                    updated_at = NOW(),
                    expires_at = $4
                WHERE url_normalized = $1
                """,
                normalized,
                json.dumps(payload),
                scan_status,
                cache_expiry(),
            )
        logger.info("[TIMING] %s db_write_core=%.1fs", normalized, time.perf_counter() - t0)

        # ── Stage: plugin prefills (concurrent; runs after core results visible) ─
        website_record = {**payload, "url": normalized, "analysis": result["analysis"]}
        t0 = time.perf_counter()
        async with pool.acquire() as conn:
            plugin_prefill = await generate_all_plugin_prefills(
                conn,
                site_url=normalized,
                website_analysis=website_record,
            )
            payload["plugin_prefill"] = plugin_prefill
            payload["prefill_status"] = "completed"
            await conn.execute(
                """
                UPDATE website_analysis
                SET analysis_json = $2::jsonb,
                    scan_status = $3,
                    updated_at = NOW()
                WHERE url_normalized = $1
                """,
                normalized,
                json.dumps(payload),
                scan_status,
            )
        logger.info("[TIMING] %s plugin_prefills=%.1fs", normalized, time.perf_counter() - t0)
        logger.info("[TIMING] %s pipeline_total=%.1fs", normalized, time.perf_counter() - t_pipeline)
    except Exception as exc:
        logger.error("Background scan failed for %s: %s", normalized, exc)
        async with pool.acquire() as conn:
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
