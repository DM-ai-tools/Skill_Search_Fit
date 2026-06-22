"""Plugin-specific change extraction and report guidance for SearchFit SEO plugins."""

from __future__ import annotations

from typing import Optional

# Maps DB plugin_name → canonical slug used in specs
PLUGIN_SLUG_BY_NAME: dict[str, str] = {
    "SEO Audit": "seo-audit",
    "Technical SEO": "technical-seo",
    "On-Page SEO": "on-page-seo",
    "Schema Markup": "schema-markup",
    "Content Strategy": "content-strategy",
    "Content Brief": "content-brief",
    "Keyword Clustering": "keyword-clustering",
    "Internal Linking": "internal-linking",
    "Broken Links": "broken-links",
    "AI Visibility": "ai-visibility",
    "Content Translation": "content-translation",
}

# Filename stem → slug (for API plugin_id UUID lookups via execution)
PLUGIN_SLUG_BY_FILE: dict[str, str] = {
    "seo_audit": "seo-audit",
    "technical_seo_audit": "technical-seo",
    "on_page_seo_optimization": "on-page-seo",
    "schema_markup_generator": "schema-markup",
    "content_strategy": "content-strategy",
    "content_brief_generator": "content-brief",
    "keyword_clustering": "keyword-clustering",
    "internal_linking_strategy": "internal-linking",
    "broken_link_checker": "broken-links",
    "ai_visibility_tracking": "ai-visibility",
    "content_translation": "content-translation",
}

_COMMON_RULES = """
RULES FOR ALL CHANGES:
- proposedContent = ONLY final publish-ready content (copy-paste ready). No instructions.
- currentState = verbatim existing content or "(none — [element] not found)"
- changeType: metadata | schema | content | technical | capture-form only
- location = human page name; pageUrl = full https URL
- Calibrate priority: max 3 High, 4-5 Medium, rest Low
- impactScore 1-100
"""

_SPECS: dict[str, dict] = {
    "seo-audit": {
        "min": 4,
        "max": 8,
        "extract": """
PLUGIN: SEO Audit — find/fix on-page and technical SEO across the site.
Produce 4-8 changes covering: meta title (metadata, 50-60 char final string),
meta description (metadata, 150-160 chars), OG/Twitter tags (metadata, full HTML
<meta> block), canonical (technical, full <link> tag), H1 (content, final heading
text only), image alt (technical, complete <img> tag), robots/noindex (technical,
full robots.txt or meta robots directive).
""",
    },
    "technical-seo": {
        "min": 4,
        "max": 8,
        "extract": """
PLUGIN: Technical SEO — crawl/index/CWV/mobile/security/URL issues.
Produce 4-8 changes: robots.txt (technical, complete file content), sitemap.xml
(technical, complete or corrected XML), canonical tags, redirect rules (.htaccess
or nginx format), performance fixes (exact HTML with loading="lazy" etc.),
security headers, URL structure fixes with redirect rule.
""",
    },
    "on-page-seo": {
        "min": 4,
        "max": 7,
        "extract": """
PLUGIN: On-Page SEO — optimize one page for target keyword.
Produce 4-7 changes per page: title tag, meta description (final strings),
URL slug + 301 redirect rule, H1, H2 subheadings (one per heading), rewritten
paragraph with keyword (full paragraph), internal link (sentence with <a> HTML),
schema JSON-LD in <script type="application/ld+json"> block.
""",
    },
    "schema-markup": {
        "min": 1,
        "max": 4,
        "extract": """
PLUGIN: Schema Markup — complete JSON-LD blocks only (changeType: schema).
Each change = one complete schema block for one page. Populate ALL required fields
with real business data. Wrap in <script type="application/ld+json">...</script>.
Types: Organization, LocalBusiness, Article, FAQPage, Product, BreadcrumbList, HowTo.
JSON must be valid parseable JSON.
""",
    },
    "content-strategy": {
        "min": 3,
        "max": 8,
        "extract": """
PLUGIN: Content Strategy — NEW pages to create (not edits to existing).
currentState: "(page does not exist — new page to create)"
proposedChange: COMPLETE page content — H1, meta title, meta description, intro,
all H2 sections fully written, FAQ if applicable, conclusion with CTA, internal links.
One change per priority new page. sourceUrl = recommended full URL slug.
""",
    },
    "content-brief": {
        "min": 1,
        "max": 1,
        "extract": """
PLUGIN: Content Brief — ONE complete article ready to publish.
currentState: "(page does not exist — new article to create)"
proposedChange: FULL article — H1, intro, all H2/H3 sections written out, FAQ,
conclusion, internal links as HTML, meta title and description at end as labeled lines.
""",
    },
    "keyword-clustering": {
        "min": 3,
        "max": 6,
        "extract": """
PLUGIN: Keyword Clustering — new page per priority cluster without existing page.
currentState: "(no page targeting this keyword cluster)"
proposedChange: complete page content for cluster — H1, meta, H2 sections, keyword
placement as HTML comments, internal links, CTA.
""",
    },
    "internal-linking": {
        "min": 4,
        "max": 10,
        "extract": """
PLUGIN: Internal Linking — one change per link to add or fix.
ADD LINK: currentState = exact source sentence; proposedChange = same sentence with
<a href="...">anchor</a> embedded. FIX ANCHOR: currentState = bad <a> tag;
proposedChange = corrected <a> tag. ORPHAN FIX: link from recommended source page
to orphan. sourceUrl = source page URL.
""",
    },
    "broken-links": {
        "min": 1,
        "max": 20,
        "extract": """
PLUGIN: Broken Links — one change per broken link.
currentState: exact broken <a href="..."> tag from HTML.
proposedChange: corrected <a> tag with working URL, or plain text if link removed.
Include HTTP status in fieldLabel or sourceExcerpt (404, redirect chain, etc.).
""",
    },
    "ai-visibility": {
        "min": 3,
        "max": 6,
        "extract": """
PLUGIN: AI Visibility / GEO — entity clarity, FAQ for AI citation, schema, E-E-A-T.
Changes: rewritten entity paragraph (content), complete FAQ HTML with H3 Q&A (content),
enhanced Organization JSON-LD with knowsAbout (schema), author bio (content),
statistics section as HTML (content).
""",
    },
    "content-translation": {
        "min": 2,
        "max": 6,
        "extract": """
PLUGIN: Content Translation — localized publish-ready page copy.
proposedChange = complete translated content blocks ready to replace on the page.
currentState = original language content verbatim.
""",
    },
}


def resolve_plugin_slug(
    plugin_slug: Optional[str] = None,
    plugin_name: Optional[str] = None,
) -> Optional[str]:
    if plugin_slug and plugin_slug in _SPECS:
        return plugin_slug
    if plugin_name:
        return PLUGIN_SLUG_BY_NAME.get(plugin_name)
    return None


def get_extraction_addon(plugin_slug: Optional[str]) -> str:
    if not plugin_slug or plugin_slug not in _SPECS:
        return ""
    spec = _SPECS[plugin_slug]
    return f"\n\n## PLUGIN-SPECIFIC EXTRACTION\n{spec['extract']}\n{_COMMON_RULES}\nProduce {spec['min']}-{spec['max']} changes.\n"


def get_report_addon(plugin_slug: Optional[str]) -> str:
    """Plugin-tailored Implementation Changes guidance for report generation."""
    if not plugin_slug or plugin_slug not in _SPECS:
        return ""
    spec = _SPECS[plugin_slug]
    return f"""

## Implementation Changes (required — tailored for {plugin_slug})

After your analysis, include ## Implementation Changes with {spec['min']}-{spec['max']} items.
{spec['extract']}

Each item MUST use the structured format with Page URL, Change Type, Priority,
Impact Score, Current State, Proposed Change (publish-ready only), Destination.
{_COMMON_RULES}
"""


def get_change_count_bounds(plugin_slug: Optional[str]) -> tuple[int, int]:
    if plugin_slug and plugin_slug in _SPECS:
        s = _SPECS[plugin_slug]
        return s["min"], s["max"]
    return 3, 10
