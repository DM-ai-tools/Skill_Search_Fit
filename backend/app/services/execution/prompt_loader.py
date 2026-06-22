"""Load and render plugin prompts from the database."""
import re
from pathlib import Path
from uuid import UUID

import asyncpg

from app.services.change_suggestions.plugin_specs import (
    get_report_addon,
    resolve_plugin_slug,
)

_IMPLEMENTATION_GUIDANCE_PATH = (
    Path(__file__).resolve().parents[3] / "plugins" / "_implementation_output_guidance.txt"
)
_IMPLEMENTATION_GUIDANCE = (
    _IMPLEMENTATION_GUIDANCE_PATH.read_text(encoding="utf-8")
    if _IMPLEMENTATION_GUIDANCE_PATH.exists()
    else ""
)

PLATFORM_LABELS = {
    "all": "ChatGPT, Claude, Gemini, Perplexity",
    "chatgpt": "ChatGPT",
    "claude": "Claude",
    "gemini": "Gemini",
    "perplexity": "Perplexity",
}


AUDIT_TYPE_LABELS = {
    "live_website": "Live Website Crawl",
    "codebase": "Codebase / Project Scan",
}

CONTENT_GOAL_LABELS = {
    "traffic": "Organic Traffic",
    "leads": "Lead Generation",
    "education": "Education / Thought Leadership",
    "brand_awareness": "Brand Awareness",
}

CONTENT_TYPE_LABELS = {
    "auto": "Recommend based on SERP",
    "how_to": "How-To Guide",
    "listicle": "Listicle",
    "guide": "Comprehensive Guide",
    "comparison": "Comparison / Versus",
    "review": "Review",
}

TONE_LABELS = {
    "professional": "Professional",
    "conversational": "Conversational",
    "technical": "Technical",
    "friendly": "Friendly",
}

PUBLISHING_CADENCE_LABELS = {
    "weekly": "Minimum — 1 article/week",
    "growth": "Growth — 3–5 articles/week",
    "authority": "Authority — daily publishing",
}

PLANNING_HORIZON_LABELS = {
    "4": "4 weeks",
    "8": "8 weeks",
    "12": "12 weeks",
}

ANALYSIS_SOURCE_LABELS = {
    "page_inventory": "Page Inventory (manual list)",
    "sitemap": "Sitemap + Page List",
    "codebase": "Codebase / Route Map",
}

SITE_TYPE_LABELS = {
    "blog": "Blog / Content Site",
    "saas": "SaaS / Product",
    "ecommerce": "E-commerce",
    "corporate": "Corporate / Marketing",
    "mixed": "Mixed",
}

INPUT_METHOD_LABELS = {
    "full_list": "Pasted Keyword List",
    "seed_expand": "Seed Keywords to Expand & Cluster",
    "list_plus_website": "Keyword List + Website Context",
}

FUNNEL_FOCUS_LABELS = {
    "all": "All funnel stages",
    "awareness": "Top of funnel (informational)",
    "consideration": "Middle of funnel (commercial)",
    "decision": "Bottom of funnel (transactional)",
}

SEARCH_INTENT_LABELS = {
    "informational": "Informational",
    "commercial": "Commercial Investigation",
    "transactional": "Transactional",
    "navigational": "Navigational",
}

CLUSTER_INTENT_FILTER_LABELS = {
    "all": "All intents",
    "informational": "Informational only",
    "commercial": "Commercial investigation only",
    "transactional": "Transactional only",
}

PAGE_TYPE_LABELS = {
    "blog_post": "Blog Post",
    "landing_page": "Landing Page",
    "product_page": "Product Page",
    "category_page": "Category Page",
    "homepage": "Homepage",
    "other": "Other",
}

SCHEMA_TYPE_LABELS = {
    "auto": "Auto-detect from content",
    "organization": "Organization",
    "article": "Article / BlogPosting",
    "product": "Product",
    "faq": "FAQPage",
    "howto": "HowTo",
    "breadcrumb": "BreadcrumbList",
    "local_business": "LocalBusiness",
    "software_application": "SoftwareApplication",
    "video": "VideoObject",
    "review": "Review",
}

INTEGRATION_FRAMEWORK_LABELS = {
    "nextjs": "Next.js (Script component / metadata)",
    "html": "HTML (script tag in head/body)",
    "react": "React (dangerouslySetInnerHTML)",
    "raw_json": "Raw JSON-LD only",
}

AUDIT_FOCUS_LABELS = {
    "full": "Full audit (all 8 areas)",
    "technical": "Technical SEO (crawl, index, schema)",
    "on_page": "On-page (meta, headings, content)",
    "performance": "Performance & Core Web Vitals signals",
}

SEO_AUDIT_TYPE_LABELS = {
    "live_website": "Live Website (URL crawl)",
    "codebase": "Codebase / Project Files",
    "hybrid": "Hybrid (URL + codebase files)",
}

TECH_STACK_LABELS = {
    "nextjs": "Next.js / React",
    "react_spa": "React SPA (Vite, CRA)",
    "wordpress": "WordPress",
    "static": "Static Site (HTML, Astro, etc.)",
    "other": "Other / Unknown",
}

SEO_CONTENT_TYPE_LABELS = {
    "blog_post": "Blog Post",
    "how_to": "How-To Guide",
    "listicle": "Listicle",
    "comprehensive_guide": "Comprehensive Guide",
    "comparison": "Comparison Article",
    "faq_page": "FAQ-Focused Page",
}

TOPIC_FUNNEL_STAGE_LABELS = {
    "all": "All funnel stages",
    "tofu": "Top of funnel (TOFU)",
    "mofu": "Middle of funnel (MOFU)",
    "bofu": "Bottom of funnel (BOFU)",
}

LABEL_MAPS = {
    "ai_platforms": PLATFORM_LABELS,
    "content_goal": CONTENT_GOAL_LABELS,
    "tone": TONE_LABELS,
    "publishing_cadence": PUBLISHING_CADENCE_LABELS,
    "planning_horizon": PLANNING_HORIZON_LABELS,
    "analysis_source": ANALYSIS_SOURCE_LABELS,
    "site_type": SITE_TYPE_LABELS,
    "input_method": INPUT_METHOD_LABELS,
    "funnel_focus": FUNNEL_FOCUS_LABELS,
    "funnel_stage": TOPIC_FUNNEL_STAGE_LABELS,
    "search_intent": SEARCH_INTENT_LABELS,
    "intent_filter": CLUSTER_INTENT_FILTER_LABELS,
    "page_type": PAGE_TYPE_LABELS,
    "primary_schema_type": SCHEMA_TYPE_LABELS,
    "integration_framework": INTEGRATION_FRAMEWORK_LABELS,
    "audit_focus": AUDIT_FOCUS_LABELS,
    "audit_type": {**AUDIT_TYPE_LABELS, **SEO_AUDIT_TYPE_LABELS},
    "tech_stack": TECH_STACK_LABELS,
    "content_type": {**CONTENT_TYPE_LABELS, **SEO_CONTENT_TYPE_LABELS},
}


def render_prompt_template(template: str, inputs: dict) -> str:
    """Replace {{variable}} placeholders with input values."""
    rendered = template

    for key, value in inputs.items():
        label_map = LABEL_MAPS.get(key)
        if label_map and str(value) in label_map:
            display = label_map[str(value)]
        elif value is None or value == "":
            display = "(not provided)"
        elif isinstance(value, bool):
            display = "Yes" if value else "No"
        else:
            display = str(value).strip()

        rendered = rendered.replace(f"{{{{{key}}}}}", display)

    # Clear any unreplaced placeholders
    rendered = re.sub(r"\{\{[a-z_]+\}\}", "(not provided)", rendered)
    return rendered


async def load_prompt(conn: asyncpg.Connection, plugin_id: UUID, prompt_type: str) -> str:
    row = await conn.fetchrow(
        "SELECT prompt_content FROM prompts WHERE plugin_id = $1 AND prompt_type = $2::prompt_type",
        plugin_id,
        prompt_type,
    )
    content = row["prompt_content"] if row else ""
    if prompt_type == "system" and content:
        plugin_row = await conn.fetchrow(
            "SELECT plugin_name FROM plugins WHERE id = $1",
            plugin_id,
        )
        slug = resolve_plugin_slug(plugin_name=plugin_row["plugin_name"] if plugin_row else None)
        plugin_addon = get_report_addon(slug)
        if plugin_addon and "PLUGIN-SPECIFIC" not in content and "Implementation Changes" not in content:
            content = content.rstrip() + plugin_addon
        elif _IMPLEMENTATION_GUIDANCE and "Implementation Changes" not in content:
            content = content.rstrip() + _IMPLEMENTATION_GUIDANCE
    return content


async def load_rendered_prompt(
    conn: asyncpg.Connection,
    plugin_id: UUID,
    prompt_type: str,
    inputs: dict,
) -> str:
    template = await load_prompt(conn, plugin_id, prompt_type)
    if not template:
        return ""
    return render_prompt_template(template, inputs)
