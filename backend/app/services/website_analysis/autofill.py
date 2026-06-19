"""AI autofill and field suggestion engines."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

from app.config import settings
from app.services.website_analysis.competitor_discovery import (
    discover_competitors,
    format_competitor_names,
    format_competitor_urls,
)
from app.services.website_analysis.openrouter import openrouter_chat

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.70

AUTOFILL_SYSTEM = """You are a Plugin Intelligence Engine.
Generate highly specialized recommendations for every field in a selected plugin.
You are not generating generic autofill values. You are acting as a domain expert for this plugin.

Inputs include website analysis, competitor analysis, plugin metadata, and plugin schema.

Rules:
- Every recommendation must be company-specific, plugin-specific, and field-specific.
- Use competitor data to identify keyword/offer/positioning gaps where relevant.
- Do not use placeholders, sample brands, or generic boilerplate.
- For select fields, use exact allowed option values when options are provided.
- Always optimize toward the plugin's desired outcome and success metrics.

Return JSON object only in this shape:
{
  "plugin_strategy": {
    "plugin_goal": "string",
    "desired_outcome": "string",
    "optimization_target": "string",
    "success_metrics": ["string"]
  },
  "field_recommendations": [
    {
      "field_name": "string",
      "recommended_value": "any",
      "suggested_options": ["string"],
      "confidence": 0.95,
      "reasoning": "string",
      "field_purpose": "string",
      "business_impact": "string",
      "recommended_strategy": "string"
    }
  ]
}
"""

SUGGESTIONS_SYSTEM = """You are a Plugin Field Intelligence Engine.
Generate suggestions for ONE field in a plugin using website + competitor intelligence.
Do not generate generic suggestions.
Use plugin goal, plugin purpose, field purpose, industry context, and geographic market.

Return JSON:
{
  "field_name": "string",
  "suggestions": ["5-10 specialized options"],
  "reasoning": "string"
}
"""


def _analysis_profile(website_analysis: dict[str, Any]) -> dict[str, Any]:
    return website_analysis.get("analysis") or website_analysis


def _quick_audit(website_analysis: dict[str, Any]) -> dict[str, Any]:
    profile = _analysis_profile(website_analysis)
    audit = profile.get("quick_audit")
    return audit if isinstance(audit, dict) else {}


def _competitor_list(website_analysis: dict[str, Any]) -> list[dict[str, Any]]:
    competitors = website_analysis.get("competitors")
    if isinstance(competitors, list) and competitors:
        return competitors

    profile = _analysis_profile(website_analysis)
    enrichment = profile.get("perplexity_enrichment") or {}
    if isinstance(enrichment, dict):
        perplexity_block = enrichment.get("competitors") or {}
        if isinstance(perplexity_block, dict):
            items = perplexity_block.get("competitors") or []
            if isinstance(items, list):
                normalized: list[dict[str, Any]] = []
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    name = str(item.get("name", "")).strip()
                    domain = str(item.get("domain", "")).strip()
                    if name or domain:
                        normalized.append({"name": name or domain, "domain": domain})
                if normalized:
                    return normalized
    return []


async def ensure_competitor_data(
    website_analysis: dict[str, Any],
    site_url: str,
) -> dict[str, Any]:
    """Ensure competitor intelligence exists, running discovery on demand if needed."""
    if _competitor_list(website_analysis):
        return website_analysis

    profile = _analysis_profile(website_analysis)
    if not settings.openrouter_api_key:
        return website_analysis

    try:
        result = await discover_competitors(
            target_url=site_url,
            website_analysis=profile,
            timeout_seconds=18,
        )
        discovered = result.get("competitors") or []
        if discovered:
            logger.info(
                "On-demand competitor discovery found %d competitors for %s",
                len(discovered),
                site_url,
            )
            return {
                **website_analysis,
                "competitors": discovered,
                "competitor_discovery_status": result.get(
                    "competitor_discovery_status", "completed"
                ),
            }
    except Exception as exc:
        logger.warning("On-demand competitor discovery failed for %s: %s", site_url, exc)

    return website_analysis


def _competitor_urls_text(website_analysis: dict[str, Any]) -> str:
    return format_competitor_urls(_competitor_list(website_analysis))


def _is_competitor_field(name: str) -> bool:
    lowered = name.lower()
    return "competitor" in lowered


def _is_url_field(name: str) -> bool:
    return name.lower() in {"site_url", "website_url", "page_url", "sitemap_url"} or "url" in name.lower()


def _tokenize(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) >= 3}


def _infer_category(profile: dict[str, Any]) -> str:
    for key in ("industry", "business_type", "business_model"):
        val = str(profile.get(key) or "").strip()
        if val and not _is_placeholder(val):
            return val
    products = profile.get("products_services") or []
    if isinstance(products, list):
        for item in products:
            text = str(item).strip()
            if text and not _is_placeholder(text):
                return text[:120]
    desc = str(profile.get("description") or "").strip()
    if desc and not _is_placeholder(desc):
        sentence = desc.split(".")[0].strip()
        if len(sentence) >= 8:
            return sentence[:120]
    kws = profile.get("seo_keywords") or []
    if isinstance(kws, list):
        cleaned = [str(k).strip() for k in kws if str(k).strip()]
        if cleaned:
            return ", ".join(cleaned[:3])
    return ""


def _infer_competitor_value(field: dict[str, Any], website_analysis: dict[str, Any]) -> str:
    competitors = _competitor_list(website_analysis)
    if not competitors:
        return ""
    ftype = str(field.get("type", "text"))
    name = str(field.get("name", ""))
    names = format_competitor_names(competitors)
    prefer_names = name == "competitors" or (ftype == "textarea" and "url" not in name.lower())
    if prefer_names and names:
        return "\n".join(names[:5])
    if ftype == "textarea" or "url" in name.lower():
        urls = format_competitor_urls(competitors)
        if urls:
            return urls
    if names:
        return "\n".join(names[:5]) if ftype == "textarea" else ", ".join(names[:5])
    return ""


def _context_tokens(profile: dict[str, Any], site_url: str) -> set[str]:
    parts: list[str] = [
        str(profile.get("company_name", "")),
        str(profile.get("industry", "")),
        str(profile.get("business_type", "")),
        str(profile.get("value_proposition", "")),
        str(profile.get("description", "")),
        " ".join(str(x) for x in profile.get("products_services", [])),
        " ".join(str(x) for x in profile.get("seo_keywords", [])),
    ]
    host = urlparse(site_url).netloc.replace("www.", "")
    if host:
        parts.append(host)
    return _tokenize(" ".join(parts))


def _is_placeholder(value: str) -> bool:
    lowered = value.lower()
    blocked = (
        "acme",
        "example.com",
        "your business",
        "your brand",
        "skillsearchfit",
        "lorem ipsum",
    )
    return any(b in lowered for b in blocked)


def _is_valid_ai_value(field_name: str, value: Any, site_url: str, profile: dict[str, Any]) -> bool:
    if value in (None, ""):
        return False
    if not isinstance(value, str):
        return True
    if _is_placeholder(value):
        return False

    name = field_name.lower()
    if _is_competitor_field(name):
        return True

    if _is_url_field(name):
        if not value.startswith("http"):
            return False
        return bool(urlparse(value).netloc)

    if name in {
        "business_name",
        "brand_name",
        "organization_name",
        "site_name",
    }:
        value_tokens = _tokenize(value)
        ctx = _context_tokens(profile, site_url)
        if value_tokens.intersection(ctx):
            return True
        company = str(profile.get("company_name", "")).lower()
        lowered = value.lower()
        if company and (lowered in company or company in lowered):
            return True
        host = urlparse(site_url).netloc.replace("www.", "").split(".")[0]
        if host and len(host) >= 3 and host.lower() in lowered:
            return True
        return not company and len(value.strip()) >= 2

    if name in {"category", "industry", "business_niche", "market_category"}:
        if len(value.strip()) < 3:
            return False
        value_tokens = _tokenize(value)
        ctx = _context_tokens(profile, site_url)
        if value_tokens.intersection(ctx):
            return True
        context_blob = " ".join(
            [
                str(profile.get("industry", "")),
                str(profile.get("business_type", "")),
                str(profile.get("description", "")),
                " ".join(str(x) for x in profile.get("products_services", [])),
            ]
        ).lower()
        if value.lower() in context_blob:
            return True
        if any(token in context_blob for token in value_tokens if len(token) >= 4):
            return True
        return not profile.get("industry")

    if name in {"target_keyword", "primary_keyword", "topic", "target_audience"}:
        value_tokens = _tokenize(value)
        ctx = _context_tokens(profile, site_url)
        if not value_tokens or not ctx:
            return len(value.strip()) >= 3
        return bool(value_tokens.intersection(ctx))

    if name in {"seed", "seed_topic", "topic", "target_keyword", "primary_keyword"}:
        lowered = value.lower()
        blocked_terms = {"contact", "home", "homepage", "about", "services"}
        if lowered.strip() in blocked_terms:
            return False

    return True


def _field_map(input_fields: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(f.get("name", "")): f for f in input_fields if f.get("name")}


SELECT_FIELD_DEFAULTS: dict[str, str] = {
    "ai_platforms": "all",
    "analysis_depth": "standard",
    "funnel_stage": "all",
    "intent_filter": "all",
    "content_goal": "traffic",
    "tone": "professional",
    "search_intent": "informational",
    "audit_type": "live_website",
    "analysis_source": "sitemap",
    "site_type": "mixed",
    "primary_schema_type": "auto",
    "integration_framework": "nextjs",
    "tech_stack": "other",
    "audit_focus": "full",
    "publishing_cadence": "growth",
    "planning_horizon": "8",
    "page_type": "landing_page",
}

NUMBER_FIELD_DEFAULTS: dict[str, int | float] = {
    "topic_count": 5,
    "target_word_count": 1500,
    "desired_word_count": 1500,
    "max_pages": 50,
}


def _crawl_block(website_analysis: dict[str, Any] | None) -> dict[str, Any]:
    if not website_analysis:
        return {}
    crawl = website_analysis.get("crawl")
    return crawl if isinstance(crawl, dict) else {}


def _crawl_pages(website_analysis: dict[str, Any] | None) -> list[dict[str, Any]]:
    pages = _crawl_block(website_analysis).get("pages") or []
    return [p for p in pages if isinstance(p, dict)]


def _crawl_page_urls(website_analysis: dict[str, Any] | None, site_url: str, limit: int = 12) -> list[str]:
    urls = [str(p.get("url", "")).strip() for p in _crawl_pages(website_analysis) if p.get("url")]
    urls = [u for u in urls if u]
    if not urls:
        return [site_url]
    return urls[:limit]


def _pages_list_text(website_analysis: dict[str, Any] | None, site_url: str, limit: int = 12) -> str:
    return "\n".join(_crawl_page_urls(website_analysis, site_url, limit))


def _page_inventory_text(website_analysis: dict[str, Any] | None, site_url: str) -> str:
    lines: list[str] = []
    for page in _crawl_pages(website_analysis)[:25]:
        url = str(page.get("url", "")).strip()
        if not url:
            continue
        title = str(page.get("title") or page.get("h1") or "").strip()
        lines.append(f"{url} — {title}" if title else url)
    return "\n".join(lines) if lines else site_url


def _page_content_text(
    website_analysis: dict[str, Any] | None,
    site_url: str,
    profile: dict[str, Any],
) -> str:
    normalized = site_url.rstrip("/")
    for page in _crawl_pages(website_analysis):
        url = str(page.get("url", "")).strip().rstrip("/")
        if url == normalized or url == normalized.replace("://www.", "://"):
            snippet = str(page.get("snippet", "")).strip()
            if snippet:
                return snippet[:5000]
    pages = _crawl_pages(website_analysis)
    if pages:
        snippet = str(pages[0].get("snippet", "")).strip()
        if snippet:
            return snippet[:5000]
    desc = str(profile.get("description", "")).strip()
    if desc:
        return desc[:5000]
    services = profile.get("products_services") or []
    if isinstance(services, list) and services:
        return f"Services: {', '.join(str(s) for s in services[:8])}"
    return f"Primary landing page content for {site_url}."


def _infer_target_audience(profile: dict[str, Any]) -> str:
    audience = profile.get("target_audience") or []
    if isinstance(audience, list):
        cleaned = [str(a).strip() for a in audience if str(a).strip()]
        if cleaned:
            return ", ".join(cleaned[:4])
    industry = str(profile.get("industry") or profile.get("business_type") or "").strip()
    if industry:
        return f"Businesses and decision-makers seeking {industry.lower()} services"
    return "Business owners and marketing teams seeking measurable growth"


def _keyword_blob(profile: dict[str, Any], website_analysis: dict[str, Any] | None) -> list[str]:
    audit_inputs = _quick_audit(website_analysis or {}).get("suggested_plugin_inputs", {})
    audit_keywords: list[str] = []
    if isinstance(audit_inputs, dict):
        raw = audit_inputs.get("keywords", [])
        if isinstance(raw, list):
            audit_keywords = [str(k).strip() for k in raw if str(k).strip()]
    pool = [*audit_keywords, *(profile.get("seo_keywords") or [])]
    return [k for k in pool if k and k.lower() not in {"contact", "home", "about", "services"}]


def _is_empty_autofill_value(value: Any, field: dict[str, Any]) -> bool:
    if value is None:
        return True
    name = str(field.get("name", ""))
    ftype = str(field.get("type", "text"))
    if ftype == "checkbox":
        return False
    if isinstance(value, str) and not value.strip():
        return True
    if ftype == "number":
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return True
        if name in NUMBER_FIELD_DEFAULTS and numeric <= 0:
            return True
    return False


def _normalize_select_value(value: Any, field: dict[str, Any]) -> Any:
    if field.get("type") != "select":
        return value
    options = field.get("options") or []
    allowed = [o.get("value") for o in options if isinstance(o, dict) and o.get("value") is not None]
    if value in allowed:
        return value
    # If model used label, map back to value
    labels_to_values = {
        str(o.get("label", "")).strip().lower(): o.get("value")
        for o in options
        if isinstance(o, dict) and o.get("value") is not None
    }
    mapped = labels_to_values.get(str(value).strip().lower())
    return mapped if mapped is not None else (allowed[0] if allowed else "")


def _default_field_value(
    field: dict[str, Any],
    site_url: str,
    profile: dict[str, Any],
    website_analysis: dict[str, Any] | None = None,
) -> Any:
    name = str(field.get("name", ""))
    ftype = str(field.get("type", "text"))
    options = field.get("options") or []
    keywords = _keyword_blob(profile, website_analysis)
    primary_keyword = keywords[0] if keywords else _infer_category(profile) or "seo services"

    if _is_url_field(name):
        if name == "sitemap_url":
            return f"{site_url.rstrip('/')}/sitemap.xml"
        if name == "page_url" and name != "site_url":
            pages = _crawl_page_urls(website_analysis, site_url, 1)
            return pages[0] if pages else site_url
        return site_url

    if _is_competitor_field(name):
        if website_analysis:
            return _infer_competitor_value(field, website_analysis)
        return ""

    if ftype == "select":
        preferred = SELECT_FIELD_DEFAULTS.get(name)
        allowed = {o.get("value") for o in options if isinstance(o, dict)} if isinstance(options, list) else set()
        if name == "content_type":
            for candidate in ("auto", "blog_post", "how_to", "guide"):
                if candidate in allowed:
                    return candidate
        if preferred and preferred in allowed:
            return preferred
        if isinstance(options, list) and options:
            first = options[0]
            if isinstance(first, dict):
                return first.get("value", "")
        return ""

    if ftype == "number":
        if name in NUMBER_FIELD_DEFAULTS:
            return NUMBER_FIELD_DEFAULTS[name]
        return 1 if field.get("required") else 0

    if ftype == "checkbox":
        return False

    if name in {"business_name", "brand_name", "organization_name", "site_name", "organization_name"}:
        return profile.get("company_name", "")

    if name in {"category", "industry", "business_niche", "market_category"}:
        return _infer_category(profile)

    if name in {"value_proposition", "unique_value_proposition"}:
        vp = str(profile.get("value_proposition") or "").strip()
        if vp:
            return vp
        desc = str(profile.get("description") or "").strip()
        return desc[:280] if desc else ""

    if name in {"target_audience", "audience"}:
        return _infer_target_audience(profile)

    if name in {"seed", "seed_topic"}:
        return ", ".join(keywords[:3]) if keywords else _infer_category(profile)

    if name in {"keywords", "seed_keywords"}:
        return ", ".join(keywords[:10]) if keywords else primary_keyword

    if name in {"target_keyword", "primary_keyword"}:
        return primary_keyword

    if name in {"topic"}:
        return keywords[0] if keywords else str(profile.get("description", ""))[:120]

    if name in {"business_description"}:
        return str(profile.get("description", "")).strip()

    if name in {"page_content"}:
        return _page_content_text(website_analysis, site_url, profile)

    if name in {"page_inventory"}:
        return _page_inventory_text(website_analysis, site_url)

    if name in {"pages_to_audit"}:
        return _pages_list_text(website_analysis, site_url)

    if name == "target_keywords":
        return ", ".join(keywords[:8]) if keywords else primary_keyword

    return ""


def _ensure_all_fields(
    input_fields: list[dict[str, Any]],
    recommended: dict[str, dict[str, Any]],
    site_url: str,
    profile: dict[str, Any],
    website_analysis: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    completed = dict(recommended)
    for field in input_fields:
        name = str(field.get("name", ""))
        if not name:
            continue
        entry = completed.get(name, {})
        if not _is_empty_autofill_value(entry.get("value"), field):
            continue
        default_value = _default_field_value(field, site_url, profile, website_analysis)
        if field.get("type") == "select":
            default_value = _normalize_select_value(default_value, field)
        confidence = float(entry.get("confidence", 0.5))
        if not _is_empty_autofill_value(default_value, field):
            confidence = max(confidence, 0.72)
        completed[name] = {
            "value": default_value,
            "confidence": confidence,
        }

    for field in input_fields:
        if not field.get("required"):
            continue
        name = str(field.get("name", ""))
        if not name:
            continue
        entry = completed.get(name, {})
        if not _is_empty_autofill_value(entry.get("value"), field):
            continue
        fallback = _default_field_value(field, site_url, profile, website_analysis)
        if field.get("type") == "select":
            fallback = _normalize_select_value(fallback, field)
        completed[name] = {
            "value": fallback,
            "confidence": 0.7,
        }
    return completed


def hydrate_autofill_fields(
    input_fields: list[dict[str, Any]],
    fields: dict[str, dict[str, Any]],
    site_url: str,
    website_analysis: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """Fill gaps in cached/stale prefill using latest website analysis."""
    profile = _analysis_profile(website_analysis)
    recommended = {
        key: dict(entry)
        for key, entry in fields.items()
        if isinstance(entry, dict)
    }
    return _ensure_all_fields(
        input_fields,
        recommended,
        site_url,
        profile,
        website_analysis,
    )


async def hydrate_autofill_fields_async(
    input_fields: list[dict[str, Any]],
    fields: dict[str, dict[str, Any]],
    site_url: str,
    website_analysis: dict[str, Any],
    *,
    plugin_name: str = "",
    plugin_category: str = "",
    plugin_description: str = "",
) -> dict[str, dict[str, Any]]:
    """Hydrate cached autofill and backfill any missing required fields."""
    website_analysis = await ensure_competitor_data(website_analysis, site_url)
    hydrated = hydrate_autofill_fields(input_fields, fields, site_url, website_analysis)
    hydrated = await _backfill_empty_required_fields(
        input_fields=input_fields,
        recommended=hydrated,
        website_analysis=website_analysis,
        plugin_name=plugin_name,
        plugin_category=plugin_category,
        plugin_description=plugin_description,
    )
    profile = _analysis_profile(website_analysis)
    return _ensure_all_fields(
        input_fields,
        hydrated,
        site_url,
        profile,
        website_analysis,
    )


def _heuristic_autofill(
    input_fields: list[dict[str, Any]],
    profile: dict[str, Any],
    site_url: str,
    website_analysis: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """Rule-based mapping without AI — strict, URL-aware fallback."""
    competitor_urls = _competitor_urls_text(website_analysis)
    competitor_names = format_competitor_names(_competitor_list(website_analysis))

    audit_inputs = _quick_audit(website_analysis).get("suggested_plugin_inputs", {})
    audit_keywords = []
    if isinstance(audit_inputs, dict):
        raw_keywords = audit_inputs.get("keywords", [])
        if isinstance(raw_keywords, list):
            audit_keywords = [str(k) for k in raw_keywords if isinstance(k, str) and k.strip()]

    keyword_pool = _keyword_blob(profile, website_analysis)
    primary_seed = ", ".join(keyword_pool[:3]) if keyword_pool else _infer_category(profile)
    primary_keyword = keyword_pool[0] if keyword_pool else "seo services"
    competitor_textarea = (
        "\n".join(competitor_names[:5])
        if competitor_names
        else competitor_urls
    )

    mapping: dict[str, str | list] = {
        "site_url": site_url,
        "website_url": site_url,
        "page_url": _crawl_page_urls(website_analysis, site_url, 1)[0],
        "brand_name": profile.get("company_name", ""),
        "business_name": profile.get("company_name", ""),
        "site_name": profile.get("company_name", ""),
        "organization_name": profile.get("company_name", ""),
        "category": _infer_category(profile),
        "business_niche": _infer_category(profile),
        "business_description": profile.get("description", ""),
        "value_proposition": profile.get("value_proposition") or profile.get("description", "")[:280],
        "target_audience": _infer_target_audience(profile),
        "seed": primary_seed,
        "seed_topic": primary_seed,
        "keywords": ", ".join(keyword_pool[:10]) if keyword_pool else primary_keyword,
        "target_keyword": primary_keyword,
        "primary_keyword": primary_keyword,
        "competitors": competitor_textarea,
        "competitor_urls": competitor_urls,
        "seed_keywords": ", ".join(keyword_pool[:8]) if keyword_pool else primary_keyword,
        "topic": keyword_pool[0] if keyword_pool else profile.get("description", "")[:120],
        "market_category": _infer_category(profile),
        "page_content": _page_content_text(website_analysis, site_url, profile),
        "page_inventory": _page_inventory_text(website_analysis, site_url),
        "pages_to_audit": _pages_list_text(website_analysis, site_url),
        "target_keywords": ", ".join(keyword_pool[:8]) if keyword_pool else primary_keyword,
        "sitemap_url": f"{site_url.rstrip('/')}/sitemap.xml",
    }

    recommended = profile.get("recommended_plugin_inputs") or {}
    result: dict[str, dict[str, Any]] = {}

    for field in input_fields:
        name = field.get("name", "")
        if not name:
            continue
        if name in recommended and isinstance(recommended[name], dict):
            entry = recommended[name]
            conf = float(entry.get("confidence", 0.85))
            value = entry.get("value", "")
            if conf >= CONFIDENCE_THRESHOLD and _is_valid_ai_value(name, value, site_url, profile):
                result[name] = {"value": value, "confidence": conf}
            continue
        if name in recommended and recommended[name]:
            value = recommended[name]
            if _is_valid_ai_value(name, value, site_url, profile):
                result[name] = {"value": value, "confidence": 0.85}
            continue
        if name in mapping and mapping[name]:
            value = mapping[name]
            if _is_valid_ai_value(name, value, site_url, profile):
                conf = 0.88 if _is_competitor_field(name) and competitor_urls else 0.82
                result[name] = {"value": value, "confidence": conf}
        elif _is_competitor_field(name) and competitor_names:
            value = "\n".join(competitor_names[:5])
            if _is_valid_ai_value(name, value, site_url, profile):
                result[name] = {"value": value, "confidence": 0.75}
    return result





async def _backfill_empty_required_fields(
    *,
    input_fields: list[dict[str, Any]],
    recommended: dict[str, dict[str, Any]],
    website_analysis: dict[str, Any],
    plugin_name: str,
    plugin_category: str = "",
    plugin_description: str = "",
) -> dict[str, dict[str, Any]]:
    updated = dict(recommended)
    for field in input_fields:
        if not field.get("required"):
            continue
        name = str(field.get("name", ""))
        if not name:
            continue
        entry = updated.get(name, {})
        if not _is_empty_autofill_value(entry.get("value"), field):
            continue
        suggestions = await generate_field_suggestions(
            field=field,
            website_analysis=website_analysis,
            plugin_name=plugin_name,
            plugin_category=plugin_category,
            plugin_description=plugin_description,
        )
        if not suggestions:
            continue
        ftype = str(field.get("type", "text"))
        if ftype == "number":
            try:
                value: Any = float(suggestions[0])
            except ValueError:
                value = suggestions[0]
        elif ftype == "textarea":
            value = "\n".join(suggestions[:5])
        elif ftype == "select":
            value = _normalize_select_value(suggestions[0], field)
        else:
            value = suggestions[0]
        if _is_empty_autofill_value(value, field):
            continue
        updated[name] = {
            **entry,
            "value": value,
            "confidence": max(float(entry.get("confidence", 0.5)), 0.78),
            "suggestions": suggestions[:3],
        }
    return updated


def validate_autofill_fields(
    input_fields: list[dict[str, Any]],
    field_map: dict[str, dict[str, Any]],
) -> list[dict]:
    from app.services.validation import collect_plugin_input_errors

    values: dict[str, Any] = {}
    for field in input_fields:
        name = str(field.get("name", ""))
        if not name:
            continue
        entry = field_map.get(name, {})
        value = entry.get("value") if isinstance(entry, dict) else entry
        if field.get("type") == "select" and value not in (None, ""):
            value = _normalize_select_value(value, field)
        values[name] = value
    return collect_plugin_input_errors(input_fields, values)


async def generate_plugin_autofill(
    *,
    input_fields: list[dict[str, Any]],
    website_analysis: dict[str, Any],
    plugin_name: str,
    plugin_category: str = "",
    plugin_description: str = "",
    site_url: str,
) -> dict[str, Any]:
    website_analysis = await ensure_competitor_data(website_analysis, site_url)
    profile = _analysis_profile(website_analysis)
    quick_audit = _quick_audit(website_analysis)
    competitors = _competitor_list(website_analysis)
    fields_by_name = _field_map(input_fields)
    fields_payload = {
        "plugin_name": plugin_name,
        "plugin_category": plugin_category,
        "plugin_description": plugin_description,
        "fields": [
            {
                "name": f.get("name"),
                "label": f.get("label"),
                "type": f.get("type"),
                "required": f.get("required", False),
                "options": f.get("options", []),
            }
            for f in input_fields
        ],
    }

    recommended: dict[str, dict[str, Any]] = {}
    reasoning: dict[str, str] = {}

    if settings.openrouter_api_key:
        try:
            ai = await openrouter_chat(
                system=AUTOFILL_SYSTEM,
                user=json.dumps(
                    {
                        "website_analysis": profile,
                        "quick_audit_report": quick_audit,
                        "competitor_analysis": {"competitors": competitors},
                        "plugin": {
                            "plugin_name": plugin_name,
                            "plugin_category": plugin_category,
                            "plugin_description": plugin_description,
                        },
                        "plugin_schema": {"fields": fields_payload["fields"]},
                        "site_url": site_url,
                    },
                    indent=2,
                ),
                timeout_seconds=25,
            )
            # New schema-first shape
            rows = ai.get("field_recommendations")
            if isinstance(rows, list):
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    name = str(row.get("field_name", "")).strip()
                    if not name or name not in fields_by_name:
                        continue
                    conf = float(row.get("confidence", 0))
                    raw_value = row.get("recommended_value")
                    value = _normalize_select_value(raw_value, fields_by_name[name])
                    if conf >= 0.5 and _is_valid_ai_value(name, value, site_url, profile):
                        raw_suggestions = row.get("suggested_options", [])
                        suggestions: list[str] = []
                        if isinstance(raw_suggestions, list):
                            suggestions = [
                                str(s).strip()
                                for s in raw_suggestions
                                if s and not _is_placeholder(str(s))
                            ][:3]
                        if value and str(value) not in suggestions:
                            suggestions = [str(value), *suggestions]
                        recommended[name] = {
                            "value": value,
                            "confidence": conf,
                            "suggestions": suggestions[:3],
                        }
                        why = row.get("reasoning")
                        if isinstance(why, str) and why.strip():
                            reasoning[name] = why.strip()
            else:
                # Backward compatibility: previous dict shape
                fields_block = ai.get("fields") or ai.get("recommended_values") or ai
                if isinstance(fields_block, dict):
                    for name, entry in fields_block.items():
                        if not isinstance(entry, dict) or name not in fields_by_name:
                            continue
                        conf = float(entry.get("confidence", 0))
                        value = _normalize_select_value(entry.get("value"), fields_by_name[name])
                        if conf >= 0.5 and _is_valid_ai_value(name, value, site_url, profile):
                            recommended[name] = {
                                "value": value,
                                "confidence": conf,
                            }
                            if entry.get("reason"):
                                reasoning[name] = entry["reason"]
        except Exception as exc:
            logger.warning("AI autofill failed, using heuristics: %s", exc)

    if not recommended:
        recommended = _heuristic_autofill(input_fields, profile, site_url, website_analysis)
    recommended = _ensure_all_fields(
        input_fields,
        recommended,
        site_url,
        profile,
        website_analysis,
    )

    recommended = await _backfill_empty_required_fields(
        input_fields=input_fields,
        recommended=recommended,
        website_analysis=website_analysis,
        plugin_name=plugin_name,
        plugin_category=plugin_category,
        plugin_description=plugin_description,
    )
    recommended = _ensure_all_fields(
        input_fields,
        recommended,
        site_url,
        profile,
        website_analysis,
    )

    values = {k: v["value"] for k, v in recommended.items()}
    confidence_scores = {k: v["confidence"] for k, v in recommended.items()}

    fields_with_suggestions: dict[str, dict[str, Any]] = {}
    for field in input_fields:
        name = str(field.get("name", ""))
        if not name:
            continue
        entry = dict(recommended.get(name, {"value": "", "confidence": 0.5}))
        extras = entry.get("suggestions") if isinstance(entry.get("suggestions"), list) else []
        value = entry.get("value", "")
        if field.get("type") == "select":
            value = _normalize_select_value(value, field)
        merged: list[str] = []
        if value not in (None, ""):
            merged.append(str(value))
        for s in extras:
            norm = _normalize_select_value(s, field) if field.get("type") == "select" else s
            if norm and str(norm) not in merged:
                merged.append(str(norm))
        entry["value"] = value
        entry["suggestions"] = merged[:3]
        fields_with_suggestions[name] = entry

    return {
        "recommended_values": values,
        "confidence_scores": confidence_scores,
        "reasoning": reasoning,
        "fields": fields_with_suggestions,
    }





async def generate_field_suggestions(
    *,
    field: dict[str, Any],
    website_analysis: dict[str, Any],
    plugin_name: str,
    plugin_category: str = "",
    plugin_description: str = "",
) -> list[str]:
    profile = _analysis_profile(website_analysis)
    quick_audit = _quick_audit(website_analysis)
    competitors = _competitor_list(website_analysis)
    name = field.get("name", "")
    field_type = field.get("type", "text")

    if field_type == "select" and field.get("options"):
        return [o.get("label", o.get("value", "")) for o in field["options"]]

    fast: list[str] = []

    if _is_competitor_field(name):
        if competitors:
            if field_type == "textarea" or "url" in name:
                fast = [format_competitor_urls(competitors)]
            else:
                fast = format_competitor_names(competitors)[:8]
        if fast:
            return [s for s in fast if s]

    if name in ("target_audience", "audience") and profile.get("target_audience"):
        fast = list(profile["target_audience"])[:8]
    elif name in ("category", "business_niche", "industry", "market_category"):
        inferred = [
            profile.get("industry", ""),
            profile.get("business_type", ""),
            profile.get("business_model", ""),
        ]
        fast = [s for s in inferred if s][:6]
    elif "keyword" in name and profile.get("seo_keywords"):
        fast = profile["seo_keywords"][:8]
    elif name == "business_name" and profile.get("company_name"):
        fast = [profile["company_name"]]
    elif name in ("locations", "location", "service_areas") and profile.get("service_areas"):
        fast = list(profile["service_areas"])[:8]
    elif name in ("locations", "location") and profile.get("locations"):
        fast = list(profile["locations"])[:8]
    elif "service" in name and profile.get("products_services"):
        fast = list(profile["products_services"])[:8]

    fast = [s for s in fast if s and not _is_placeholder(str(s))]
    if fast:
        return fast

    if settings.openrouter_api_key:
        try:
            ai = await openrouter_chat(
                system=SUGGESTIONS_SYSTEM,
                user=json.dumps(
                    {
                        "plugin": {
                            "plugin_name": plugin_name,
                            "plugin_category": plugin_category,
                            "plugin_description": plugin_description,
                        },
                        "field": field,
                        "company_analysis": profile,
                        "quick_audit_report": quick_audit,
                        "competitor_intelligence": competitors,
                    }
                ),
                timeout_seconds=8,
            )
            suggestions = ai.get("suggestions", []) if isinstance(ai, dict) else []
            if suggestions:
                cleaned = [
                    str(s)
                    for s in suggestions[:8]
                    if s and not _is_placeholder(str(s))
                ]
                return cleaned
        except Exception as exc:
            logger.debug("Suggestion AI failed for %s: %s", name, exc)

    return []


