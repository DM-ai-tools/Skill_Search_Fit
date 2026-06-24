"""Assembles the Full Content Page Pipeline's skill outputs into a publish-ready page."""

from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from typing import Any

# ── Stop words for slug generation ───────────────────────────────────────────
_STOP_WORDS = {
    "the", "a", "an", "and", "or", "for", "to", "in", "of",
    "with", "at", "by", "from", "on", "is", "are", "was",
    "be", "as", "it", "its", "that", "this",
}

# ── Image dimension defaults by position ─────────────────────────────────────
_IMAGE_DIMENSIONS = {
    0: "1200x628",   # hero
    "default": "800x450",
    "small": "400x400",
}


# ── Slug ─────────────────────────────────────────────────────────────────────

def _build_slug(keyword: str) -> str:
    """Build a URL slug from a keyword string.

    Lowercases, strips non-alphanumeric, removes stop words, hyphenates,
    caps at 6 words.
    """
    cleaned = re.sub(r"[^\w\s]", "", keyword.lower())
    words = [w for w in cleaned.split() if w not in _STOP_WORDS][:6]
    slug = "-".join(words) if words else "page"
    return f"/{slug}"


# ── Field extractors (all return "" / [] on no match) ────────────────────────

def _extract_title_tag(markdown: str) -> str:
    """Extract SEO title tag from markdown output."""
    patterns = [
        r"\*{0,2}(?:title\s*tag|seo\s*title|meta\s*title|page\s*title)\*{0,2}[:\s*\|]+([^\n]{20,80})",
        r"<title>([^<]{20,80})</title>",
    ]
    for pat in patterns:
        m = re.search(pat, markdown, re.IGNORECASE)
        if m:
            return m.group(1).strip().strip("*").strip()
    return ""


def _extract_meta_description(markdown: str) -> str:
    """Extract meta description from markdown output."""
    patterns = [
        r"\*{0,2}meta\s*description\*{0,2}[:\s*\|]+([^\n]{50,200})",
        r'<meta\s+name="description"\s+content="([^"]{50,200})"',
    ]
    for pat in patterns:
        m = re.search(pat, markdown, re.IGNORECASE)
        if m:
            return m.group(1).strip().strip("*").strip()
    return ""


def _extract_h1(markdown: str) -> str:
    """Extract first H1 from markdown."""
    m = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    if m:
        return m.group(1).strip()
    return ""


def _extract_primary_keyword(markdown: str) -> str:
    """Extract primary keyword from keyword-clustering or content-brief output."""
    patterns = [
        r"\*{0,2}primary\s*keyword\*{0,2}[:\s*\|]+([^\n]{3,80})",
        r"\*{0,2}target\s*keyword\*{0,2}[:\s*\|]+([^\n]{3,80})",
        r"\*{0,2}focus\s*keyword\*{0,2}[:\s*\|]+([^\n]{3,80})",
    ]
    for pat in patterns:
        m = re.search(pat, markdown, re.IGNORECASE)
        if m:
            return m.group(1).strip().strip("*`").strip()
    return ""


def _fix_json(raw: str) -> str:
    """Attempt to fix common JSON errors: trailing commas, single quotes."""
    # Remove trailing commas before } or ]
    fixed = re.sub(r",\s*([\}\]])", r"\1", raw)
    # Replace single-quoted keys/values (naive — good enough for schema blocks)
    fixed = re.sub(r"'([^']*)'", r'"\1"', fixed)
    try:
        json.loads(fixed)
        return fixed
    except json.JSONDecodeError:
        return ""


def _extract_schema_json(markdown: str) -> tuple[str, bool]:
    """Extract JSON-LD schema blocks from markdown.

    Returns (json_string, is_valid). json_string may contain multiple blocks
    separated by newlines, each wrapped in <script> tags for output.
    If no valid schema found, returns ("", False).
    """
    schema_blocks: list[str] = []

    # Pattern 1: ```json ... ``` fenced blocks
    fenced = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", markdown, re.DOTALL)
    # Pattern 2: <script type="application/ld+json"> ... </script>
    script = re.findall(
        r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>",
        markdown,
        re.DOTALL | re.IGNORECASE,
    )

    candidates = fenced + script
    for raw in candidates:
        raw = raw.strip()
        try:
            parsed = json.loads(raw)
            # Only keep actual schema blocks
            if "@type" in parsed or "@context" in parsed:
                schema_blocks.append(raw)
        except json.JSONDecodeError:
            fixed = _fix_json(raw)
            if fixed:
                try:
                    parsed = json.loads(fixed)
                    if "@type" in parsed or "@context" in parsed:
                        schema_blocks.append(fixed)
                except json.JSONDecodeError:
                    pass

    if not schema_blocks:
        return "", False

    combined = "\n".join(
        f'<script type="application/ld+json">\n{b}\n</script>'
        for b in schema_blocks
    )
    return combined, True


def _extract_image_alts(markdown: str) -> list[str]:
    """Extract image alt texts from markdown.

    Looks for Markdown image syntax ![alt](url), then falls back to
    'Alt text: ...' or 'alt: ...' lines.
    """
    # Markdown image syntax
    alts = re.findall(r"!\[([^\]]{3,120})\]", markdown)
    if not alts:
        alts = re.findall(
            r"\*{0,2}(?:alt(?:\s*text)?|image\s*alt)\*{0,2}[:\s*]+([^\n]{3,120})",
            markdown,
            re.IGNORECASE,
        )
    return [a.strip() for a in alts if a.strip()][:10]


def _extract_inbound_links(markdown: str) -> list[dict[str, str]]:
    """Extract inbound link instructions from internal-linking step output.

    Looks for Markdown tables with ≥4 columns, interpreting them as
    source_page | find_text | anchor_text | placement.
    """
    links: list[dict[str, str]] = []
    table_rows = re.findall(r"\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|([^|\n]*)\|?", markdown)
    for row in table_rows:
        cells = [c.strip() for c in row]
        # Skip header/separator rows
        if not cells[0] or set(cells[0].replace("-", "").replace(" ", "")) == set():
            continue
        if any(h in cells[0].lower() for h in ("source", "page", "---")):
            continue
        links.append(
            {
                "source_page": cells[0],
                "find_text": cells[1] if len(cells) > 1 else "",
                "anchor_text": cells[2] if len(cells) > 2 else "",
                "placement": cells[3] if len(cells) > 3 else "",
            }
        )
    return links


# ── Builders ─────────────────────────────────────────────────────────────────

def _build_image_brief(image_alts: list[str]) -> list[dict[str, str]]:
    """Turn a list of alt texts into structured image brief entries."""
    items = []
    for i, alt in enumerate(image_alts):
        dims = _IMAGE_DIMENSIONS.get(i, _IMAGE_DIMENSIONS["default"])
        slug_name = re.sub(r"[^\w\s-]", "", alt.lower())
        slug_name = re.sub(r"\s+", "-", slug_name.strip())[:40]
        items.append(
            {
                "position": f"Image {i + 1}",
                "alt_text": alt,
                "dimensions": dims,
                "content_description": alt,
                "file_name": f"{slug_name}-{i + 1}.webp",
            }
        )
    return items


def _build_meta_html(
    title_tag: str,
    meta_description: str,
    canonical_url: str,
    schema_jsonld: str,
    og_image_placeholder: str = "",
) -> str:
    """Build the complete HTML <head> block as a string."""
    og_image = og_image_placeholder or "[HERO_IMAGE_URL_1200x628]"
    _title = html.escape(title_tag)
    _desc = html.escape(meta_description)
    _canon = html.escape(canonical_url)
    parts = [
        f"<title>{_title}</title>" if _title else "",
        f'<meta name="description" content="{_desc}">' if _desc else "",
        f'<link rel="canonical" href="{_canon}">' if _canon else "",
        '<meta name="robots" content="index, follow">',
        f'<meta property="og:title" content="{_title}">',
        f'<meta property="og:description" content="{_desc}">',
        f'<meta property="og:url" content="{_canon}">',
        '<meta property="og:type" content="article">',
        f'<meta property="og:image" content="{og_image}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{_title}">',
        f'<meta name="twitter:description" content="{_desc}">',
    ]
    if schema_jsonld:
        parts.append(schema_jsonld)
    return "\n".join(p for p in parts if p)


def _build_publish_checklist(
    title_tag: str,
    canonical_url: str,
    slug: str,
    primary_kw: str,
    word_count: int,
    image_alts: list[str],
) -> str:
    hero_alt = image_alts[0] if image_alts else "[hero image alt text]"
    return f"""## SEO
- [ ] Title tag set (50-60 chars, keyword in first 3 words): {title_tag or '[MISSING]'}
- [ ] Meta description set (150-160 chars, includes keyword + CTA)
- [ ] Canonical URL set to: {canonical_url or '[MISSING]'}
- [ ] URL slug set to: {slug or '[MISSING]'}
- [ ] H1 set — only one H1 on the page
- [ ] Schema markup added to <head>
- [ ] Open Graph tags set

## CONTENT
- [ ] All H2 and H3 sections present and fully written
- [ ] FAQ section with minimum 5 Q&As present
- [ ] Primary keyword "{primary_kw or '[MISSING]'}" appears in: title, H1, intro, ≥2 H2s, conclusion
- [ ] CTA present at mid-article and end of article
- [ ] All internal outbound links inserted with correct anchor text
- [ ] Word count meets or exceeds target (current: {word_count} words)
- [ ] No placeholder text remaining

## IMAGES
- [ ] Hero image added with alt: {hero_alt}
- [ ] All other image slots filled per the image brief
- [ ] All images compressed (WebP format recommended)

## INTERNAL LINKING
- [ ] Inbound links added to all source pages listed in Block 4
- [ ] Pillar page links to this page confirmed

## TECHNICAL
- [ ] Page set to index, follow
- [ ] Page loads under 3 seconds
- [ ] Mobile rendering checked
- [ ] Page saved as draft first — review before publishing"""


def _validate_completeness(fields: dict[str, Any]) -> dict[str, Any]:
    """Check required fields and return validation result."""
    errors: list[str] = []
    warnings: list[str] = []

    if not fields.get("title_tag"):
        errors.append("title_tag missing — On-Page SEO step did not produce a title tag")
    elif len(fields["title_tag"]) > 70:
        warnings.append(f"title_tag is {len(fields['title_tag'])} chars — aim for 50-60")

    if not fields.get("meta_description"):
        errors.append("meta_description missing — On-Page SEO step did not produce a meta description")
    elif len(fields["meta_description"]) > 165:
        warnings.append(f"meta_description is {len(fields['meta_description'])} chars — aim for 150-160")

    if not fields.get("h1"):
        errors.append("h1 missing — no H1 heading found in article body")

    if not fields.get("article_body") or len(fields.get("article_body", "")) < 200:
        errors.append("article_body missing or too short — content creation step may have failed")

    if not fields.get("primary_kw"):
        warnings.append("primary_kw not found — slug and checklist may be generic")

    if not fields.get("schema_jsonld"):
        warnings.append("schema_jsonld not found — schema markup step may not have produced JSON-LD")
    elif not fields.get("schema_valid"):
        errors.append("schema_jsonld found but JSON is invalid — fix before publishing")

    return {
        "is_complete": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def _generate_html_file(
    title_tag: str,
    full_head_html: str,
    h1: str,
    article_body: str,
) -> str:
    """Generate a complete, valid HTML5 file from assembled page data."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  {full_head_html}
</head>
<body>
  <article>
    <h1>{html.escape(h1)}</h1>
    {article_body}
  </article>
</body>
</html>"""


# ── Public API ────────────────────────────────────────────────────────────────

async def assemble_publish_ready_page(
    pipeline_run_id: str,
    steps: list[dict[str, Any]],
    site_url: str = "",
) -> dict[str, Any]:
    """Build a publish-ready page dict from all step outputs.

    All fields gracefully degrade — extraction failures produce empty strings,
    never exceptions. The validation block describes what is missing.
    """
    # Map each step by normalised plugin name
    step_by_plugin: dict[str, str] = {}
    for s in steps:
        raw_name = s.get("plugin_name", "")
        normalised = raw_name.lower().replace(" ", "_").replace("-", "_")
        step_by_plugin[normalised] = s.get("output_markdown", "")

    topic_md = step_by_plugin.get("create_topic", "")
    cluster_md = step_by_plugin.get("keyword_clustering", "")
    brief_md = step_by_plugin.get("content_brief", "")
    content_md = step_by_plugin.get("create_content", "")
    onpage_md = step_by_plugin.get("on_page_seo", "")
    linking_md = step_by_plugin.get("internal_linking", "")

    # Extract fields — prefer on-page-seo (most optimised), fall back to content step
    title_tag = _extract_title_tag(onpage_md) or _extract_title_tag(content_md)
    meta_description = _extract_meta_description(onpage_md) or _extract_meta_description(content_md)
    h1 = _extract_h1(onpage_md) or _extract_h1(content_md) or _extract_h1(linking_md)
    primary_kw = _extract_primary_keyword(cluster_md) or _extract_primary_keyword(brief_md)
    image_alts = _extract_image_alts(onpage_md) or _extract_image_alts(content_md)

    # Body: prefer internal-linking (has links inserted) → on-page-seo → content
    article_body = linking_md or onpage_md or content_md

    # Schema
    schema_jsonld, schema_valid = _extract_schema_json(onpage_md + "\n" + content_md)

    # Inbound link instructions
    inbound_links = _extract_inbound_links(linking_md)

    # Derived values
    word_count = len(article_body.split()) if article_body else 0
    slug = _build_slug(primary_kw) if primary_kw else _build_slug(h1 or "page")
    clean_site = site_url.rstrip("/")
    canonical_url = f"{clean_site}{slug}" if clean_site else slug

    # Build blocks
    full_head_html = _build_meta_html(
        title_tag=title_tag,
        meta_description=meta_description,
        canonical_url=canonical_url,
        schema_jsonld=schema_jsonld,
    )

    publish_checklist = _build_publish_checklist(
        title_tag=title_tag,
        canonical_url=canonical_url,
        slug=slug,
        primary_kw=primary_kw,
        word_count=word_count,
        image_alts=image_alts,
    )

    html_file = _generate_html_file(
        title_tag=title_tag,
        full_head_html=full_head_html,
        h1=h1,
        article_body=article_body,
    )

    validation = _validate_completeness(
        {
            "title_tag": title_tag,
            "meta_description": meta_description,
            "h1": h1,
            "article_body": article_body,
            "primary_kw": primary_kw,
            "schema_jsonld": schema_jsonld,
            "schema_valid": schema_valid,
        }
    )

    return {
        "pipeline_run_id": pipeline_run_id,
        "assembled_at": datetime.now(timezone.utc).isoformat(),
        "domain": site_url,
        "slug": slug,
        "full_url": canonical_url,
        "validation": validation,
        "blocks": {
            "head": {
                "title_tag": title_tag,
                "meta_description": meta_description,
                "canonical_url": canonical_url,
                "schema_jsonld": schema_jsonld,
                "schema_valid": schema_valid,
                "full_head_html": full_head_html,
                "open_graph": {
                    "title": title_tag,
                    "description": meta_description,
                    "url": canonical_url,
                    "type": "article",
                    "image": "[HERO_IMAGE_URL_1200x628]",
                },
                "twitter_card": {
                    "card": "summary_large_image",
                    "title": title_tag,
                    "description": meta_description,
                },
                "robots": "index, follow",
            },
            "url_slug": {
                "slug": slug,
                "full_url": canonical_url,
                "breadcrumb": f"Home > {h1 or 'Page'}",
            },
            "body": {
                "h1": h1,
                "full_body_markdown": article_body,
                "word_count": word_count,
            },
            "internal_linking_instructions": {
                "inbound_links": inbound_links,
                "outbound_links_inserted": bool(linking_md),
                "pillar_link_confirmed": "pillar" in linking_md.lower() if linking_md else False,
                "orphan_status": "linked" if linking_md else "unknown",
            },
            "image_brief": _build_image_brief(image_alts),
            "publish_checklist": publish_checklist,
        },
        "downloads": {
            "html_file": html_file,
        },
    }
