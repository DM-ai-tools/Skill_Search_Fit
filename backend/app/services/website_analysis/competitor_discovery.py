"""Australian competitor discovery via OpenRouter + Perplexity Sonar Pro."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

from app.config import settings
from app.services.website_analysis.openrouter import openrouter_chat_array

logger = logging.getLogger(__name__)

COMPETITOR_DISCOVERY_SYSTEM = """You are an Australian Competitor Discovery Engine.

Your task is to identify the top 10 direct competitors for a company based on its website intelligence analysis.

INPUTS

target_url:
The website URL currently being analyzed.

website_analysis:
JSON generated from the Website Intelligence Service.

Optional Inputs

competitor_type — "niche_specialist", "full_stack_niche", or empty for both.

service — single service to target; if empty infer from website_analysis.products_services.

niche — if empty infer from website_analysis.industry and website_analysis.description.

location — if empty infer from website_analysis.locations and service_areas.

excluded_competitors — domains that MUST NOT appear in output.

DISCOVERY PROCESS

1. Analyze website intelligence: core services, niche, target market, geography, business model, keyword themes.
2. Generate competitor search profiles from products_services, seo_keywords, industry, business_model, target_audience, service_areas.
3. Find Australian businesses competing for the same services, customers, and organic search traffic.
4. Prioritize strong SEO visibility, optimized service pages, similar offerings, business model, and geography.
5. Remove directories, aggregators, marketplaces, franchise directories, comparison sites, review sites, lead-gen portals, inactive businesses.

COMPETITOR TYPE FILTERING

niche_specialist — only highly specialized companies in the core niche.
full_stack_niche — multiple related services within the same niche.
If empty — include both types.

SCORING — similarity_score 0.00–1.00 weighted:
40% Service Match, 25% Niche Match, 15% Business Model Match, 10% Geographic Match, 10% SEO Keyword Overlap.

avg_position — estimated average ranking position; null if unavailable.
intersections — estimated overlapping keyword count; null if unavailable.

QUALITY REQUIREMENTS

Only real operating companies with active websites and strong organic search presence.
Do NOT include directories, marketplaces, lead generation sites, or comparison portals.

OUTPUT REQUIREMENTS

Return EXACTLY 10 competitors.
Do not include the target company or excluded competitors.
Return ONLY a valid JSON array. No markdown. No explanations. No comments.

[
  {
    "domain": "example.com.au",
    "name": "Example Company",
    "similarity_score": 0.94,
    "avg_position": 11.2,
    "intersections": 432
  }
]"""

# Generic directory/marketplace patterns — not competitor suggestions.
_EXCLUDED_DOMAIN_PATTERNS = re.compile(
    r"(directory|marketplace|aggregator|compare|comparison|reviews?|"
    r"yellowpages|hipages|airtasker|yelp|truelocal|hotfrog|startlocal|"
    r"wordofmouth|productreview|trustpilot|g2\.com|capterra|clutch|"
    r"finder|quotes|oneflare|servicem8|houzz|bark\.com|freelancer)",
    re.IGNORECASE,
)


def _normalize_domain(value: str) -> str:
    value = (value or "").strip().lower()
    if value.startswith("http"):
        value = urlparse(value).netloc
    return value.removeprefix("www.")


def _target_domain(target_url: str) -> str:
    return _normalize_domain(target_url)


def _build_discovery_profile(analysis: dict[str, Any]) -> dict[str, Any]:
    return {
        "company_name": analysis.get("company_name", ""),
        "industry": analysis.get("industry", ""),
        "business_type": analysis.get("business_type", ""),
        "description": analysis.get("description", ""),
        "target_audience": analysis.get("target_audience", []),
        "products_services": analysis.get("products_services", []),
        "locations": analysis.get("locations", []),
        "service_areas": analysis.get("service_areas", []),
        "seo_keywords": analysis.get("seo_keywords", []),
        "brand_positioning": analysis.get("brand_positioning", analysis.get("brand_tone", "")),
        "business_model": analysis.get("business_model", ""),
        "value_proposition": analysis.get("value_proposition", ""),
    }


def _sanitize_competitors(
    raw: list[Any],
    *,
    target_url: str,
    excluded: list[str] | None = None,
) -> list[dict[str, Any]]:
    target = _target_domain(target_url)
    excluded_set = {_normalize_domain(d) for d in (excluded or [])}
    seen: set[str] = set()
    cleaned: list[dict[str, Any]] = []

    for item in raw:
        if not isinstance(item, dict):
            continue
        domain = _normalize_domain(str(item.get("domain", "")))
        name = str(item.get("name", "")).strip()
        if not domain or not name:
            continue
        if domain == target or domain in excluded_set or domain in seen:
            continue
        if _EXCLUDED_DOMAIN_PATTERNS.search(domain):
            continue

        score = item.get("similarity_score")
        try:
            similarity = float(score) if score is not None else 0.0
        except (TypeError, ValueError):
            similarity = 0.0
        similarity = max(0.0, min(1.0, similarity))

        avg_pos = item.get("avg_position")
        if avg_pos is not None:
            try:
                avg_pos = float(avg_pos)
            except (TypeError, ValueError):
                avg_pos = None

        intersections = item.get("intersections")
        if intersections is not None:
            try:
                intersections = int(intersections)
            except (TypeError, ValueError):
                intersections = None

        seen.add(domain)
        cleaned.append(
            {
                "domain": domain,
                "name": name,
                "similarity_score": round(similarity, 2),
                "avg_position": avg_pos,
                "intersections": intersections,
            }
        )

    cleaned.sort(key=lambda c: c["similarity_score"], reverse=True)
    return cleaned[:10]


def format_competitor_urls(competitors: list[dict[str, Any]]) -> str:
    """Format discovered competitors as newline-separated URLs for plugin forms."""
    lines: list[str] = []
    for c in competitors:
        domain = c.get("domain", "")
        if not domain:
            continue
        url = domain if domain.startswith("http") else f"https://{domain}"
        lines.append(url)
    return "\n".join(lines)


def format_competitor_names(competitors: list[dict[str, Any]]) -> list[str]:
    return [str(c.get("name", "")) for c in competitors if c.get("name")]


async def discover_competitors(
    *,
    target_url: str,
    website_analysis: dict[str, Any],
    timeout_seconds: int = 12,
    competitor_type: str = "",
    service: str = "",
    niche: str = "",
    location: str = "",
    excluded_competitors: list[str] | None = None,
) -> dict[str, Any]:
    """
    Run competitor discovery and return structured result.
    Returns empty competitors list when OpenRouter is unavailable.
    """
    profile = _build_discovery_profile(website_analysis)
    status = "skipped"

    if not settings.openrouter_api_key:
        return {
            "competitors": [],
            "competitor_discovery_status": status,
            "competitor_discovery_note": "OpenRouter not configured",
        }

    payload = {
        "target_url": target_url,
        "website_analysis": profile,
        "competitor_type": competitor_type,
        "service": service,
        "niche": niche,
        "location": location,
        "excluded_competitors": excluded_competitors or [],
    }

    try:
        raw = await openrouter_chat_array(
            system=COMPETITOR_DISCOVERY_SYSTEM,
            user=json.dumps(payload, indent=2),
            timeout_seconds=max(5, min(timeout_seconds, 20)),
        )
        competitors = _sanitize_competitors(
            raw,
            target_url=target_url,
            excluded=excluded_competitors,
        )
        status = "completed" if len(competitors) >= 5 else "partial"
        if not competitors:
            status = "failed"
        return {
            "competitors": competitors,
            "competitor_discovery_status": status,
        }
    except Exception as exc:
        logger.error("Competitor discovery failed for %s: %s", target_url, exc)
        return {
            "competitors": [],
            "competitor_discovery_status": "failed",
            "competitor_discovery_error": str(exc),
        }
