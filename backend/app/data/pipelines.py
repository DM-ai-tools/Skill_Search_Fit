"""Multi-plugin workflow definitions from SearchFit combination analysis."""

import re
from typing import Any

PIPELINES: list[dict[str, Any]] = [
    {
        "id": "content-production-pipeline",
        "name": "Competitor-Informed Content Production",
        "description": (
            "Gap-driven articles from competitor analysis through topics, clustering, "
            "briefs, content, and internal linking — end to end."
        ),
        "icon": "workflow",
        "impact": 9,
        "steps": [
            {"plugin_name": "Competitor Analyzer", "label": "Competitor gap analysis"},
            {"plugin_name": "Create Topic", "label": "Topic ideas & cluster map"},
            {"plugin_name": "Keyword Clustering", "label": "Keyword clusters"},
            {"plugin_name": "Content Brief", "label": "Writer-ready brief"},
            {"plugin_name": "Create Content", "label": "Full article"},
            {"plugin_name": "Internal Linking", "label": "Link wiring plan"},
        ],
    },
    {
        "id": "audit-fix-verify",
        "name": "Audit → Fix → Verify Loop",
        "description": (
            "Comprehensive audit, technical and on-page fixes, schema markup, "
            "and per-page verification to prove improvements."
        ),
        "icon": "shield-check",
        "impact": 9,
        "steps": [
            {"plugin_name": "SEO Audit", "label": "Full site audit"},
            {"plugin_name": "Technical SEO", "label": "Technical fixes"},
            {"plugin_name": "Broken Links", "label": "Link remediation"},
            {"plugin_name": "On-Page SEO", "label": "On-page rewrites"},
            {"plugin_name": "Schema Markup", "label": "Structured data"},
            {"plugin_name": "SEO Check", "label": "Verify improvements"},
        ],
    },
    {
        "id": "ai-visibility-flywheel",
        "name": "AI Visibility (GEO) Flywheel",
        "description": (
            "Audit AI mention gaps, analyze competitors, publish comparison content "
            "with schema, then verify visibility assets."
        ),
        "icon": "sparkles",
        "impact": 8,
        "steps": [
            {"plugin_name": "AI Visibility", "label": "AI visibility audit"},
            {"plugin_name": "Competitor Analyzer", "label": "Competitor differentiation"},
            {"plugin_name": "Create Content", "label": "GEO content assets"},
            {"plugin_name": "Schema Markup", "label": "FAQ & Product schema"},
            {"plugin_name": "SEO Check", "label": "Asset verification"},
        ],
    },
    {
        "id": "full-content-page-pipeline",
        "name": "Full Content Page Pipeline",
        "description": (
            "7-step pipeline from seed idea through topic research, keyword clustering, "
            "content strategy, brief, full draft, on-page SEO, and internal linking — "
            "one pipeline, one publish-ready page."
        ),
        "icon": "file-pen",
        "impact": 9,
        "steps": [
            {"plugin_name": "Create Topic", "label": "Topic angle & seed keywords"},
            {"plugin_name": "Keyword Clustering", "label": "Keyword groups & clusters"},
            {"plugin_name": "Content Strategy", "label": "Content pillars & page map"},
            {"plugin_name": "Content Brief", "label": "Writer-ready brief"},
            {"plugin_name": "Create Content", "label": "Full draft article"},
            {"plugin_name": "On-Page SEO", "label": "SEO optimization"},
            {"plugin_name": "Internal Linking", "label": "Link wiring plan"},
        ],
    },
]


def get_pipeline(pipeline_id: str) -> dict[str, Any] | None:
    for pipeline in PIPELINES:
        if pipeline["id"] == pipeline_id:
            return pipeline
    return None


def _resolved_competitors(base: dict[str, Any], prior_markdown: list[str]) -> str:
    """Use manual competitor URLs, cached discovery, or competitor analysis output from step 1."""
    manual = str(base.get("competitors", "") or "").strip()
    if manual:
        return manual
    intelligence = base.get("_website_intelligence") or {}
    competitors = intelligence.get("competitors") or []
    if competitors:
        from app.services.website_analysis.competitor_discovery import format_competitor_urls

        return format_competitor_urls(competitors)
    if prior_markdown:
        return prior_markdown[0][:6000]
    return ""


def _keywords_from_prior_steps(prior_markdown: list[str]) -> str:
    """Pull keyword-like lines from earlier pipeline step outputs."""
    if not prior_markdown:
        return ""

    found: list[str] = []
    seen: set[str] = set()
    skip_fragments = ("step ", "http", "---", "cluster map", "topic research")

    for line in "\n".join(prior_markdown).splitlines():
        cleaned = re.sub(r"^[\s#>*\-\d+.]+", "", line).strip()
        if not cleaned or len(cleaned) > 100 or cleaned.count(" ") > 8:
            continue
        lower = cleaned.lower()
        if any(fragment in lower for fragment in skip_fragments):
            continue
        key = lower
        if key in seen:
            continue
        seen.add(key)
        found.append(cleaned)
        if len(found) >= 8:
            break

    return "\n".join(found)


def build_step_inputs(
    plugin_name: str,
    base: dict[str, Any],
    prior_markdown: list[str],
) -> dict[str, Any]:
    """Map shared pipeline inputs to each plugin's required fields."""
    context = "\n\n---\n\n".join(prior_markdown) if prior_markdown else ""
    site_url = base.get("site_url", "")
    brand = base.get("brand_name") or base.get("business_name", "")
    if not brand and site_url:
        try:
            from urllib.parse import urlparse

            host = urlparse(site_url).netloc.replace("www.", "", 1)
            slug = host.split(".")[0] if host else ""
            brand = slug.capitalize() if slug else "Your site"
        except Exception:
            brand = "Your site"
    competitors = base.get("competitors", "")
    competitor_context = _resolved_competitors(base, prior_markdown)
    audience = base.get("target_audience", "General audience")
    seed = base.get("seed_topic", "")

    if plugin_name == "Competitor Analyzer":
        manual_competitors = str(competitors or "").strip()
        return {
            "site_url": site_url,
            "business_name": brand,
            "competitors": manual_competitors,
            "target_keywords": seed,
            "analysis_depth": base.get("analysis_depth", "standard"),
        }

    if plugin_name == "Create Topic":
        return {
            "seed": seed or f"content gaps for {brand}",
            "topic_count": base.get("topic_count", 10),
            "target_audience": audience,
            "funnel_stage": "all",
            "business_niche": brand,
            "exclude_topics": "",
        }

    if plugin_name == "Keyword Clustering":
        keywords = (
            str(base.get("keywords") or "").strip()
            or _keywords_from_prior_steps(prior_markdown)
            or seed
            or brand
        )
        return {
            "keywords": keywords,
            "intent_filter": "all",
            "business_niche": brand,
            "website_url": site_url,
            "exclude_keywords": "",
        }

    if plugin_name in ("Content Strategy", "content-strategy"):
        seed_keywords = (
            str(base.get("seed_keywords") or "").strip()
            or _keywords_from_prior_steps(prior_markdown)
            or seed
            or brand
        )
        business_description = (
            str(base.get("business_description") or "").strip()
            or str(base.get("value_proposition") or "").strip()
        )
        return {
            "business_name": brand,
            "business_description": business_description,
            "target_audience": audience,
            "seed_keywords": seed_keywords,
            "competitors": competitor_context or competitors,
            "existing_content": context[:6000] if context else "",
            "website_url": site_url,
            "publishing_cadence": base.get("publishing_cadence", "growth"),
            "planning_horizon": base.get("planning_horizon", "8"),
            "business_priorities": base.get("business_priorities", base.get("content_goal", "")),
        }

    if plugin_name in ("Content Brief Generator", "Content Brief"):
        return {
            "target_keyword": seed or brand,
            "secondary_keywords": "",
            "target_audience": audience,
            "content_goal": "traffic",
            "desired_word_count": 1500,
            "content_type": "guide",
            "tone": "professional",
            "competitor_urls": competitor_context,
            "internal_link_targets": site_url,
            "unique_angle": context[:4000] if context else f"Differentiate {brand} using pipeline research",
        }

    if plugin_name in ("Create SEO-Optimized Content", "Create Content"):
        return {
            "topic": seed or f"{brand} guide",
            "primary_keyword": seed or brand,
            "content_type": "comprehensive_guide",
            "target_word_count": 1500,
            "target_audience": audience,
            "tone": "professional",
            "search_intent": "informational",
            "secondary_keywords": "",
            "internal_link_targets": site_url,
            "content_brief": context[:12000] if context else "",
            "cta_goal": f"Learn more about {brand}",
        }

    if plugin_name in ("Internal Linking Strategy", "Internal Linking"):
        return {
            "site_url": site_url,
            "analysis_source": "page_inventory",
            "site_type": "mixed",
            "page_inventory": context[:8000] if context else f"/ — Homepage\n{site_url} — Primary landing",
            "priority_pages": site_url,
            "topic_clusters": seed,
        }

    if plugin_name == "SEO Audit":
        return {
            "audit_type": "live_website",
            "site_url": site_url,
            "site_name": brand,
            "sitemap_url": "",
            "robots_txt_content": "",
            "pages_to_audit": site_url,
            "codebase_content": "",
            "max_pages": 10,
            "target_keywords": seed,
            "audit_focus": "full",
        }

    if plugin_name in ("Technical SEO Audit", "Technical SEO"):
        return {
            "audit_type": "live_website",
            "site_url": site_url,
            "site_name": brand,
            "tech_stack": base.get("tech_stack", "other"),
            "sitemap_url": "",
            "robots_txt_content": "",
            "pages_to_audit": site_url,
            "codebase_content": "",
            "core_web_vitals": "",
            "http_headers_sample": "",
            "known_issues": context[:6000] if context else "",
        }

    if plugin_name in ("Broken Link Checker", "Broken Links"):
        return {
            "audit_type": "live_website",
            "site_url": site_url,
            "sitemap_url": "",
            "max_pages": 20,
            "check_external_links": True,
            "codebase_content": context[:6000] if context else "",
        }

    if plugin_name in ("On-Page SEO Optimization", "On-Page SEO"):
        return {
            "target_keyword": seed or brand,
            "search_intent": "informational",
            "target_audience": audience,
            "page_type": "homepage",
            "page_url": site_url,
            "page_content": context[:10000] if context else f"Site: {site_url}\nBrand: {brand}",
            "secondary_keywords": "",
        }

    if plugin_name in ("Generate Schema Markup", "Schema Markup"):
        return {
            "page_url": site_url,
            "primary_schema_type": "auto",
            "additional_schemas": "organization, faq",
            "page_content": context[:8000] if context else f"Site: {site_url}\nBrand: {brand}",
            "integration_framework": "html",
            "organization_name": brand,
        }

    if plugin_name == "SEO Check":
        return {
            "site_url": site_url,
            "page_url": site_url,
            "page_content": context[:8000] if context else "",
            "target_keyword": seed or brand,
            "previous_score": "",
            "fixes_applied": context[:4000] if context else "",
        }

    if plugin_name in ("AI Visibility & Tracking", "AI Visibility"):
        return {
            "brand_name": brand,
            "category": base.get("market_category", seed or "SEO software"),
            "website_url": site_url,
            "competitors": competitor_context or competitors,
            "value_proposition": base.get("value_proposition", f"Leading solution from {brand}"),
            "target_prompts": base.get("target_prompts", ""),
            "ai_platforms": "all",
        }

    return {"site_url": site_url, "notes": context[:5000] if context else ""}
