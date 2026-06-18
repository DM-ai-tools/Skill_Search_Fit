"""Merge cached website intelligence into plugin and pipeline inputs."""

from __future__ import annotations

from typing import Any

import asyncpg

from app.services.website_analysis.cache import get_cached_analysis
from app.services.website_analysis.competitor_discovery import format_competitor_urls
from app.services.website_analysis.url_utils import validate_website_url


async def enrich_inputs_from_cache(
    conn: asyncpg.Connection,
    inputs: dict[str, Any],
) -> dict[str, Any]:
    """Fill empty plugin inputs from cached company + competitor intelligence."""
    enriched = dict(inputs)
    site_url = str(
        enriched.get("site_url")
        or enriched.get("website_url")
        or enriched.get("page_url")
        or ""
    ).strip()
    if not site_url:
        return enriched

    try:
        normalized = validate_website_url(site_url)
    except ValueError:
        return enriched

    cached = await get_cached_analysis(conn, normalized)
    if not cached:
        return enriched

    analysis = cached.get("analysis") or {}
    competitors = cached.get("competitors") or []
    competitor_urls = format_competitor_urls(competitors)

    mapping: dict[str, Any] = {
        "site_url": normalized,
        "website_url": normalized,
        "page_url": normalized,
        "brand_name": analysis.get("company_name", ""),
        "business_name": analysis.get("company_name", ""),
        "site_name": analysis.get("company_name", ""),
        "organization_name": analysis.get("company_name", ""),
        "category": analysis.get("industry", ""),
        "business_niche": analysis.get("industry", ""),
        "market_category": analysis.get("industry", ""),
        "business_description": analysis.get("description", ""),
        "value_proposition": analysis.get("value_proposition", ""),
        "target_audience": ", ".join(analysis.get("target_audience", [])[:3]),
        "seed": ", ".join(analysis.get("seo_keywords", [])[:3]),
        "keywords": ", ".join(analysis.get("seo_keywords", [])[:10]),
        "target_keyword": (analysis.get("seo_keywords") or [""])[0],
        "primary_keyword": (analysis.get("seo_keywords") or [""])[0],
        "seed_keywords": ", ".join(analysis.get("seo_keywords", [])[:8]),
        "competitors": competitor_urls,
        "competitor_urls": competitor_urls,
    }

    for key, value in mapping.items():
        if value and not str(enriched.get(key, "") or "").strip():
            enriched[key] = value

    enriched["_website_intelligence"] = cached
    return enriched
