"""Orchestrate crawl + AI analysis + competitor discovery into structured website profile."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from app.config import settings
from app.services.website_analysis.competitor_discovery import discover_competitors
from app.services.website_analysis.crawler import crawl_website
from app.services.website_analysis.openrouter import openrouter_chat
from app.services.website_analysis.perplexity_audit import (
    compute_quick_score,
    enrich_with_perplexity,
    run_quick_analysis,
)
from app.services.website_analysis.url_utils import normalize_website_url

logger = logging.getLogger(__name__)


ANALYSIS_SYSTEM = """You are a business intelligence analyst for SEO and marketing automation.

Given crawled website data, produce a structured JSON profile for auto-filling SEO plugin forms.

Be specific, use evidence from the crawl, and infer industry/audience from page content.

Always return valid JSON matching the requested schema exactly."""

QUICK_AUDIT_SYSTEM = """You are an SEO and CRO website auditor.
Produce a concise but actionable quick audit report from crawled website evidence.
Do not use placeholders, and do not invent facts that are not grounded in the provided data.
Return valid JSON only."""


ANALYSIS_USER_TEMPLATE = """Analyze this website and return JSON with these keys:

{{

  "company_name": "string",

  "industry": "string",

  "business_type": "string (e.g. B2B SaaS, agency, e-commerce, local trades)",

  "business_model": "string (e.g. service provider, SaaS subscription, marketplace)",

  "description": "string (2-3 sentences)",

  "target_audience": ["array of audience segments"],

  "products_services": ["array of offerings"],

  "brand_tone": "string",

  "brand_positioning": "string (how the brand positions itself in market)",

  "value_proposition": "string",

  "contact_details": {{ "email": "", "phone": "", "address": "" }},

  "locations": ["array of cities/regions/countries"],

  "service_areas": ["array of geographic areas served"],

  "social_links": ["array of URLs if found"],

  "seo_keywords": ["10-20 relevant keywords"],

  "technologies_detected": ["array"],

  "recommended_plugin_inputs": {{}}

}}



Website URL: {url}



Crawl summary:

- Pages crawled: {pages_crawled}

- Title: {title}

- Description: {description}

- H1: {h1}



Page snippets:

{snippets}



Internal links sample:

{links}



Structured data samples:

{structured}

"""

QUICK_AUDIT_USER_TEMPLATE = """Create a quick audit report for this website.
Return JSON with this exact structure:
{{
  "summary": "string",
  "overall_score": 0,
  "strengths": ["array of 3-8 strengths"],
  "issues": [
    {{
      "severity": "high|medium|low",
      "category": "technical_seo|content|on_page|ux|conversion|local_seo|trust",
      "title": "string",
      "evidence": "string",
      "impact": "string",
      "recommendation": "string"
    }}
  ],
  "priority_actions_30_days": ["array of 5-12 actions"],
  "quick_wins": ["array of 3-8 quick wins"],
  "suggested_plugin_inputs": {{
    "keywords": ["array"],
    "target_pages": ["array of URLs"],
    "content_angles": ["array"],
    "cta_improvements": ["array"]
  }}
}}

Website URL: {url}
Pages crawled: {pages_crawled}
Metadata title: {title}
Metadata description: {description}
Top H1: {h1}

Structured profile:
{analysis}

Competitors:
{competitors}

Page snippets:
{snippets}

Internal links sample:
{links}
"""


def _empty_analysis(url: str) -> dict[str, Any]:
    host = urlparse(url).netloc.replace("www.", "")
    name = host.split(".")[0].capitalize() if host else "Company"
    return {
        "company_name": name,
        "industry": "",
        "business_type": "",
        "business_model": "",
        "description": "",
        "target_audience": [],
        "products_services": [],
        "brand_tone": "professional",
        "brand_positioning": "",
        "value_proposition": "",
        "contact_details": {},
        "locations": [],
        "service_areas": [],
        "social_links": [],
        "seo_keywords": [],
        "technologies_detected": [],
        "recommended_plugin_inputs": {},
    }


def _heuristic_analysis(url: str, crawl: dict[str, Any]) -> dict[str, Any]:
    """Fallback when OpenRouter is unavailable."""
    meta = crawl.get("metadata", {})
    base = _empty_analysis(url)
    title = meta.get("title") or meta.get("og:title", "")
    desc = meta.get("description") or meta.get("og:description", "")
    if title:
        base["company_name"] = title.split("|")[0].split("-")[0].strip() or base["company_name"]
    if desc:
        base["description"] = desc
        base["value_proposition"] = desc[:280]
        base["brand_positioning"] = desc[:200]
    if meta.get("h1"):
        base["products_services"] = [meta["h1"]]
    base["seo_keywords"] = [w for w in base["company_name"].lower().split() if len(w) > 3][:5]
    return base


def _heuristic_quick_audit(crawl: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    pages_crawled = int(crawl.get("pages_crawled", 0) or 0)
    meta = crawl.get("metadata", {}) if isinstance(crawl.get("metadata"), dict) else {}
    has_title = bool(meta.get("title"))
    has_description = bool(meta.get("description"))
    has_h1 = bool(meta.get("h1"))

    strengths: list[str] = []
    issues: list[dict[str, str]] = []
    actions: list[str] = []
    quick_wins: list[str] = []

    if pages_crawled >= 20:
        strengths.append("Strong crawl coverage indicates discoverable internal architecture.")
    elif pages_crawled > 0:
        strengths.append("Website is crawlable and key pages are reachable.")

    if has_title:
        strengths.append("Homepage title metadata is present.")
    else:
        issues.append(
            {
                "severity": "high",
                "category": "on_page",
                "title": "Missing homepage title metadata",
                "evidence": "No title detected in crawl metadata.",
                "impact": "Reduces relevance and CTR potential in search results.",
                "recommendation": "Add a keyword-focused title tag aligned with service intent.",
            }
        )
        quick_wins.append("Add optimized title tags for homepage and top service pages.")

    if not has_description:
        issues.append(
            {
                "severity": "medium",
                "category": "on_page",
                "title": "Missing meta description",
                "evidence": "No description detected in crawl metadata.",
                "impact": "Can lower click-through performance from SERPs.",
                "recommendation": "Write compelling meta descriptions with service + location intent.",
            }
        )
        quick_wins.append("Add unique meta descriptions for top landing pages.")

    if not has_h1:
        issues.append(
            {
                "severity": "medium",
                "category": "content",
                "title": "Missing clear H1 on key page",
                "evidence": "Primary H1 not detected in metadata snapshot.",
                "impact": "Weakens topical clarity for users and search engines.",
                "recommendation": "Define one intent-focused H1 per core landing page.",
            }
        )

    actions.extend(
        [
            "Prioritize top-converting service pages for on-page optimization.",
            "Map one primary keyword cluster per important landing page.",
            "Improve internal links between related service and blog pages.",
            "Add stronger call-to-action blocks on high-intent pages.",
            "Track baseline rankings, CTR, and conversion rate before changes.",
        ]
    )

    profile_keywords = analysis.get("seo_keywords", []) if isinstance(analysis.get("seo_keywords"), list) else []
    service_pages = [p.get("url", "") for p in (crawl.get("pages") or []) if isinstance(p, dict)][:8]
    score = 65 + min(20, pages_crawled // 6) - (10 * sum(1 for i in issues if i["severity"] == "high"))
    score = max(30, min(92, score))

    return {
        "summary": "Quick heuristic audit generated from crawl metadata and extracted page content.",
        "overall_score": score,
        "strengths": strengths[:8],
        "issues": issues[:10],
        "priority_actions_30_days": actions[:12],
        "quick_wins": quick_wins[:8],
        "suggested_plugin_inputs": {
            "keywords": profile_keywords[:10],
            "target_pages": [u for u in service_pages if u][:8],
            "content_angles": [],
            "cta_improvements": [],
        },
    }


async def _safe_call(coro: Any, fallback: Any) -> Any:
    """Await a coroutine and return fallback on any exception."""
    try:
        return await coro
    except Exception as exc:
        logger.error("Pipeline stage failed: %s", exc)
        return fallback


async def analyze_website(url: str) -> dict[str, Any]:
    t_total = time.perf_counter()
    normalized = normalize_website_url(url)

    # ── Stage 1: Crawl ────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    crawl = await crawl_website(normalized, timeout_seconds=20)
    logger.info("[TIMING] %s crawl=%.1fs pages=%d", normalized, time.perf_counter() - t0, crawl.get("pages_crawled", 0))

    meta = crawl.get("metadata", {})
    snippets = "\n\n".join(
        f"### {p['url']}\n{p.get('snippet', '')[:800]}" for p in crawl.get("pages", [])[:6]
    )
    links = "\n".join(crawl.get("internal_links", [])[:15])
    structured = "\n".join(crawl.get("structured_data", [])[:3])

    # Heuristic baseline — instant from crawl
    analysis = _heuristic_analysis(normalized, crawl)
    scan_status = "partial" if crawl.get("partial") else "completed"
    competitors: list[dict[str, Any]] = []
    competitor_discovery_status = "skipped"
    quick_audit = _heuristic_quick_audit(crawl, analysis)
    perplexity_enrichment: dict[str, Any] = {}

    if not settings.openrouter_api_key:
        analysis["_analysis_note"] = "OpenRouter not configured; heuristic analysis used"
        if crawl.get("partial"):
            scan_status = "partial"
        analysis["quick_audit"] = quick_audit
        logger.info("[TIMING] %s total=%.1fs (heuristic only)", normalized, time.perf_counter() - t_total)
        return {
            "url": normalized,
            "scan_status": scan_status,
            "crawl": {"pages_crawled": crawl.get("pages_crawled", 0), "partial": crawl.get("partial", False)},
            "analysis": analysis,
            "competitors": [],
            "competitor_discovery_status": "skipped",
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }

    # ── Stage 2: Parallel — AI business profile + Perplexity enrichment ───────
    # TRADEOFF: Perplexity runs concurrently with the AI profile using the
    # heuristic-derived industry (often empty for unknown sites) and crawl
    # keywords rather than the AI-enriched values. This saves ~10-15s compared
    # to running Perplexity after the AI profile. Impact: industry_trends and
    # business context from Perplexity will be slightly less industry-specific.
    # Perplexity's live web-search capability compensates for most sites since
    # it searches by domain name regardless of the industry hint.
    heuristic_keywords = [str(k) for k in analysis.get("seo_keywords", []) if isinstance(k, str)][:5]
    heuristic_industry = analysis.get("industry", "")

    t0 = time.perf_counter()
    ai_result, perplexity_enrichment = await asyncio.gather(
        _safe_call(
            openrouter_chat(
                system=ANALYSIS_SYSTEM,
                user=ANALYSIS_USER_TEMPLATE.format(
                    url=normalized,
                    pages_crawled=crawl.get("pages_crawled", 0),
                    title=meta.get("title", ""),
                    description=meta.get("description", ""),
                    h1=meta.get("h1", ""),
                    snippets=snippets or "(no page text extracted)",
                    links=links or "(none)",
                    structured=structured or "(none)",
                ),
                timeout_seconds=20,
            ),
            {},
        ),
        _safe_call(
            enrich_with_perplexity(
                normalized,
                heuristic_industry,
                heuristic_keywords,
                timeout_seconds=20,
            ),
            {},
        ),
    )
    logger.info("[TIMING] %s ai_profile+perplexity=%.1fs", normalized, time.perf_counter() - t0)

    # Apply AI profile over heuristic baseline
    if ai_result:
        for key in _empty_analysis(normalized):
            if key in ai_result and ai_result[key]:
                analysis[key] = ai_result[key]
        scan_status = "completed"
    else:
        analysis["_analysis_error"] = "AI profile call failed; heuristic used"
        if crawl.get("partial"):
            scan_status = "partial"

    # Apply Perplexity business overview onto the (now AI-enriched) analysis
    if perplexity_enrichment:
        business = perplexity_enrichment.get("business_overview", {})
        if isinstance(business, dict):
            if business.get("businessName"):
                analysis["company_name"] = business["businessName"]
            if business.get("description"):
                analysis["description"] = business["description"]
            rep = business.get("reputation", {})
            if isinstance(rep, dict):
                analysis["reputation_sentiment"] = rep.get("overallSentiment", "unknown")
        analysis["perplexity_enrichment"] = perplexity_enrichment

    quick_score = compute_quick_score(crawl, perplexity_enrichment)

    # ── Stage 3: Parallel — quick consultant + competitor discovery ───────────
    # Both use the AI-enriched analysis and perplexity data from stage 2.
    # competitor_discovery waits for the AI profile (via stage 2 gather) so its
    # input quality is the same as in the original sequential flow.
    t0 = time.perf_counter()
    quick_consultant, discovery_result = await asyncio.gather(
        _safe_call(
            run_quick_analysis(
                crawled_data=crawl,
                industry=analysis.get("industry", ""),
                enrichment=perplexity_enrichment,
                calculated=quick_score,
                timeout_seconds=18,
            ),
            None,
        ),
        _safe_call(
            discover_competitors(
                target_url=normalized,
                website_analysis=analysis,
                timeout_seconds=18,
            ),
            {"competitors": [], "competitor_discovery_status": "failed"},
        ),
    )
    logger.info("[TIMING] %s quick_consultant+competitor_discovery=%.1fs", normalized, time.perf_counter() - t0)

    analysis["quick_score"] = quick_score
    if isinstance(quick_consultant, dict) and quick_consultant:
        analysis["quick_consultant"] = quick_consultant

    if isinstance(discovery_result, dict):
        competitors = discovery_result.get("competitors", [])
        competitor_discovery_status = discovery_result.get("competitor_discovery_status", "failed")
    if competitors and scan_status == "partial":
        scan_status = "completed"

    # ── Stage 4: Quick audit (needs full analysis + competitors) ─────────────
    t0 = time.perf_counter()
    try:
        audit_result = await openrouter_chat(
            system=QUICK_AUDIT_SYSTEM,
            user=QUICK_AUDIT_USER_TEMPLATE.format(
                url=normalized,
                pages_crawled=crawl.get("pages_crawled", 0),
                title=meta.get("title", ""),
                description=meta.get("description", ""),
                h1=meta.get("h1", ""),
                analysis=jsonable_safe_dump(analysis),
                competitors=jsonable_safe_dump(competitors),
                snippets=snippets or "(no page text extracted)",
                links=links or "(none)",
            ),
            timeout_seconds=15,
        )
        if isinstance(audit_result, dict):
            quick_audit = {**quick_audit, **audit_result}
    except Exception as exc:
        logger.warning("Quick audit generation failed for %s: %s", normalized, exc)
    logger.info("[TIMING] %s quick_audit=%.1fs", normalized, time.perf_counter() - t0)

    analysis["quick_audit"] = quick_audit

    logger.info(
        "[TIMING] %s analyze_website_total=%.1fs",
        normalized,
        time.perf_counter() - t_total,
    )
    return {
        "url": normalized,
        "scan_status": scan_status,
        "crawl": {
            "pages_crawled": crawl.get("pages_crawled", 0),
            "partial": crawl.get("partial", False),
        },
        "analysis": analysis,
        "competitors": competitors,
        "competitor_discovery_status": competitor_discovery_status,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


def jsonable_safe_dump(payload: Any) -> str:
    try:
        return json.dumps(payload, ensure_ascii=True, default=str)[:12000]
    except Exception:
        return "{}"


def cache_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.website_analysis_cache_days)
