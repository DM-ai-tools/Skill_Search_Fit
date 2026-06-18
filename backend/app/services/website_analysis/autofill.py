"""AI autofill and field suggestion engines."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

from app.config import settings
from app.services.website_analysis.competitor_discovery import (
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
    if isinstance(competitors, list):
        return competitors
    return []


def _competitor_urls_text(website_analysis: dict[str, Any]) -> str:
    return format_competitor_urls(_competitor_list(website_analysis))


def _is_competitor_field(name: str) -> bool:
    lowered = name.lower()
    return "competitor" in lowered


def _is_url_field(name: str) -> bool:
    return name.lower() in {"site_url", "website_url", "page_url", "sitemap_url"} or "url" in name.lower()


def _tokenize(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) >= 3}


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
        "category",
        "industry",
        "business_niche",
        "target_keyword",
        "primary_keyword",
        "topic",
        "target_audience",
    }:
        value_tokens = _tokenize(value)
        ctx = _context_tokens(profile, site_url)
        if not value_tokens or not ctx:
            return False
        return bool(value_tokens.intersection(ctx))

    if name in {"seed", "seed_topic", "topic", "target_keyword", "primary_keyword"}:
        lowered = value.lower()
        blocked_terms = {"contact", "home", "homepage", "about", "services"}
        if lowered.strip() in blocked_terms:
            return False

    return True


def _field_map(input_fields: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(f.get("name", "")): f for f in input_fields if f.get("name")}


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


def _default_field_value(field: dict[str, Any], site_url: str, profile: dict[str, Any]) -> Any:
    name = str(field.get("name", ""))
    ftype = str(field.get("type", "text"))
    options = field.get("options") or []
    if _is_url_field(name):
        return site_url
    if _is_competitor_field(name):
        return ""
    if ftype == "select":
        if isinstance(options, list) and options:
            first = options[0]
            if isinstance(first, dict):
                return first.get("value", "")
        return ""
    if ftype == "number":
        return 0
    if ftype == "checkbox":
        return False
    if name in {"business_name", "brand_name", "organization_name", "site_name"}:
        return profile.get("company_name", "")
    if name in {"category", "industry", "business_niche", "market_category"}:
        return profile.get("industry", "")
    if "keyword" in name:
        kws = profile.get("seo_keywords") or []
        return kws[0] if kws else ""
    if name in {"topic", "business_description"}:
        return profile.get("description", "")
    return ""


def _ensure_all_fields(
    input_fields: list[dict[str, Any]],
    recommended: dict[str, dict[str, Any]],
    site_url: str,
    profile: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    completed = dict(recommended)
    for field in input_fields:
        name = str(field.get("name", ""))
        if not name:
            continue
        if name in completed and completed[name].get("value") not in (None, ""):
            continue
        completed[name] = {
            "value": _default_field_value(field, site_url, profile),
            "confidence": float(completed.get(name, {}).get("confidence", 0.5)),
        }
    return completed





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

    keyword_pool = [*audit_keywords, *profile.get("seo_keywords", [])]
    keyword_pool = [k for k in keyword_pool if k and k.lower() not in {"contact", "home", "about"}]
    primary_seed = ", ".join(keyword_pool[:3]) if keyword_pool else ""

    mapping: dict[str, str | list] = {
        "site_url": site_url,
        "website_url": site_url,
        "page_url": site_url,
        "brand_name": profile.get("company_name", ""),
        "business_name": profile.get("company_name", ""),
        "site_name": profile.get("company_name", ""),
        "organization_name": profile.get("company_name", ""),
        "category": profile.get("industry", ""),
        "business_niche": profile.get("industry", ""),
        "business_description": profile.get("description", ""),
        "value_proposition": profile.get("value_proposition", ""),
        "target_audience": ", ".join(profile.get("target_audience", [])[:3]),
        "seed": primary_seed,
        "seed_topic": primary_seed,
        "keywords": ", ".join(profile.get("seo_keywords", [])[:10]),
        "target_keyword": (keyword_pool or [""])[0],
        "primary_keyword": (keyword_pool or [""])[0],
        "competitors": competitor_urls,
        "competitor_urls": competitor_urls,
        "seed_keywords": ", ".join(profile.get("seo_keywords", [])[:8]),
        "topic": (audit_keywords[0] if audit_keywords else profile.get("description", "")[:120]),
        "market_category": profile.get("industry", ""),
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





async def generate_plugin_autofill(
    *,
    input_fields: list[dict[str, Any]],
    website_analysis: dict[str, Any],
    plugin_name: str,
    plugin_category: str = "",
    plugin_description: str = "",
    site_url: str,
) -> dict[str, Any]:
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
    recommended = _ensure_all_fields(input_fields, recommended, site_url, profile)

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


