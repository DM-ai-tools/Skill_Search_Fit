"""Pre-generate plugin autofill + 3 suggestions per field during background scan."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any
from uuid import UUID

import asyncpg

from app.services.website_analysis.autofill import generate_plugin_autofill

logger = logging.getLogger(__name__)

SUGGESTIONS_PER_FIELD = 3


def _top3_suggestions(value: Any, extras: list[str] | None = None) -> list[str]:
    out: list[str] = []
    if value not in (None, ""):
        out.append(str(value))
    for item in extras or []:
        s = str(item).strip()
        if s and s not in out:
            out.append(s)
        if len(out) >= SUGGESTIONS_PER_FIELD:
            break
    return out[:SUGGESTIONS_PER_FIELD]


def _enrich_field_suggestions(
    input_fields: list[dict[str, Any]],
    fields: dict[str, dict[str, Any]],
    site_url: str,
) -> dict[str, dict[str, Any]]:
    enriched: dict[str, dict[str, Any]] = {}
    for field in input_fields:
        name = str(field.get("name", ""))
        if not name:
            continue
        entry = dict(fields.get(name, {}))
        value = entry.get("value", "")
        existing = entry.get("suggestions")
        if isinstance(existing, list) and len(existing) >= SUGGESTIONS_PER_FIELD:
            enriched[name] = entry
            continue
        extras = existing if isinstance(existing, list) else []
        if _is_url_field(name):
            extras = [site_url, f"{site_url.rstrip('/')}/sitemap.xml"]
        suggestions = _top3_suggestions(value, extras)
        entry["suggestions"] = suggestions
        enriched[name] = entry
    return enriched


def _is_url_field(name: str) -> bool:
    lowered = name.lower()
    return lowered in {"site_url", "website_url", "page_url", "sitemap_url"} or "url" in lowered


async def generate_all_plugin_prefills(
    conn: asyncpg.Connection,
    *,
    site_url: str,
    website_analysis: dict[str, Any],
) -> dict[str, Any]:
    rows = await conn.fetch(
        """
        SELECT id, plugin_name, category, description, input_fields
        FROM plugins
        WHERE status = 'enabled'
        ORDER BY plugin_name
        """
    )

    # Semaphore caps concurrent AI calls to avoid OpenRouter rate-limit bursts
    sem = asyncio.Semaphore(5)

    async def _prefill_one(row) -> tuple[str, Any]:
        plugin_id = str(row["id"])
        fields = row["input_fields"]
        if isinstance(fields, str):
            fields = json.loads(fields)
        if not isinstance(fields, list):
            return plugin_id, {"error": "invalid input_fields", "fields": {}}
        t0 = time.perf_counter()
        async with sem:
            try:
                result = await generate_plugin_autofill(
                    input_fields=fields,
                    website_analysis=website_analysis,
                    plugin_name=row["plugin_name"],
                    plugin_category=row.get("category") or "",
                    plugin_description=row.get("description") or "",
                    site_url=site_url,
                )
                field_map = _enrich_field_suggestions(fields, result.get("fields", {}), site_url)
                values = {k: v.get("value") for k, v in field_map.items()}
                scores = {k: float(v.get("confidence", 0.5)) for k, v in field_map.items()}
                logger.info("[TIMING] prefill plugin=%s %.1fs", row["plugin_name"], time.perf_counter() - t0)
                return plugin_id, {
                    "plugin_name": row["plugin_name"],
                    "recommended_values": values,
                    "confidence_scores": scores,
                    "reasoning": result.get("reasoning", {}),
                    "fields": field_map,
                }
            except Exception as exc:
                logger.warning("[TIMING] prefill FAILED plugin=%s %.1fs: %s", row["plugin_name"], time.perf_counter() - t0, exc)
                return plugin_id, {"error": str(exc), "fields": {}}

    t_total = time.perf_counter()
    pairs = await asyncio.gather(*(_prefill_one(row) for row in rows))
    logger.info(
        "[TIMING] generate_all_plugin_prefills total=%.1fs plugins=%d",
        time.perf_counter() - t_total,
        len(rows),
    )
    return dict(pairs)


async def update_plugin_prefill(
    conn: asyncpg.Connection,
    normalized_url: str,
    plugin_prefill: dict[str, Any],
    prefill_status: str,
) -> None:
    row = await conn.fetchrow(
        "SELECT analysis_json FROM website_analysis WHERE url_normalized = $1",
        normalized_url,
    )
    if not row:
        return
    payload = row["analysis_json"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    payload["plugin_prefill"] = plugin_prefill
    payload["prefill_status"] = prefill_status
    await conn.execute(
        """
        UPDATE website_analysis
        SET analysis_json = $2::jsonb, updated_at = NOW()
        WHERE url_normalized = $1
        """,
        normalized_url,
        json.dumps(payload),
    )


def get_plugin_prefill(website_analysis: dict[str, Any], plugin_id: UUID | str) -> dict[str, Any] | None:
    prefill = website_analysis.get("plugin_prefill")
    if not isinstance(prefill, dict):
        return None
    entry = prefill.get(str(plugin_id))
    return entry if isinstance(entry, dict) else None
