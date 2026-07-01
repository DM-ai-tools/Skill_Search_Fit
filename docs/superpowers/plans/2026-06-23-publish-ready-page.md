# Publish-Ready Page Assembler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Full Content Page Pipeline's output from a stacked skill report into a single publish-ready web page document — with all meta tags, complete article body, schema JSON, internal links, image brief, and a publish checklist — displayed in a dedicated 7-tab UI and downloadable as a complete HTML file.

**Architecture:** A new Python backend service (`content_page_assembler.py`) parses each skill's markdown output via regex to extract semantic fields (title tag, meta description, H1, body, schema JSON, inbound link instructions), assembles them into a structured `PublishReadyPage` dict, and exposes it via a new `GET /pipelines/{id}/assembled-page` endpoint. The frontend fetches this when `pipelineId === "full-content-page-pipeline"` and renders a new `PublishReadyPageView` component above the existing unified report — with 7 tabs: Full Preview, SEO & Meta, Body Content, Schema, Linking Instructions, Image Brief, and Publish Checklist.

**Tech Stack:** Python 3.12+ / FastAPI / regex / json stdlib (backend); Next.js 15 App Router / TypeScript / shadcn/ui Tabs + Card + Button / Tailwind (frontend). No new npm packages. No new pip packages.

## Global Constraints

- Never modify `frontend/src/app/(app)/reports/view/page.tsx` — single-skill runs are untouched.
- Never modify `backend/app/services/execution/` — pipeline execution logic is untouched.
- All new backend types use snake_case to match FastAPI JSON serialisation.
- All frontend types mirror backend snake_case exactly.
- The assembler must never crash on missing fields — every extraction function returns `""` or `[]` on failure, and the validation object describes what is missing.
- The `full-content-page-pipeline` check is done on the **frontend** only — the assembled-page endpoint works for any pipeline ID.
- WordPress draft creation (Phase 5 of the spec) is **out of scope for this plan** — the existing `wordpress_agent.py` will be wired in a separate follow-up plan.
- All backend tests are synchronous (no pytest-asyncio). Run with `PYTHONPATH=backend backend/.venv/Scripts/pytest`.
- TypeScript must compile with `cd frontend && npx tsc --noEmit` after every frontend task.
- Use existing design tokens only: `glass-panel`, `glass-panel-strong`, `bento-tile`, `bento-wide`, `bento-grid-4`.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| CREATE | `backend/app/services/reports/content_page_assembler.py` | All extraction, slug building, schema validation, assembly, HTML generation |
| CREATE | `backend/tests/test_content_page_assembler.py` | Unit tests for every sync helper |
| MODIFY | `backend/app/schemas/pipelines.py` | Add `PublishReadyPageResponse` Pydantic model |
| MODIFY | `backend/app/routers/pipelines.py` | Add `GET /{pipeline_id}/assembled-page` endpoint |
| MODIFY | `frontend/src/lib/types.ts` | Add `PublishReadyPage` and related TS interfaces |
| CREATE | `frontend/src/components/reports/publish-ready-page.tsx` | 7-tab publish-ready page component |
| MODIFY | `frontend/src/app/(app)/reports/pipeline-view/page.tsx` | Fetch assembled page, show `PublishReadyPageView` for full-content pipeline |

---

### Task 1: Backend Content Page Assembler Service

**Files:**
- Create: `backend/app/services/reports/content_page_assembler.py`

**Interfaces:**
- Produces: `async def assemble_publish_ready_page(pipeline_run_id, steps, site_url) -> dict` — consumed by Task 4's route handler.
- Exposes (for tests): `_build_slug`, `_extract_title_tag`, `_extract_meta_description`, `_extract_h1`, `_extract_primary_keyword`, `_extract_schema_json`, `_extract_image_alts`, `_extract_inbound_links`, `_validate_completeness`, `_generate_html_file`, `_build_meta_html`.

- [ ] **Step 1: Create the assembler service**

Create `backend/app/services/reports/content_page_assembler.py`:

```python
"""Assembles the Full Content Page Pipeline's skill outputs into a publish-ready page."""

from __future__ import annotations

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
    parts = [
        f"<title>{title_tag}</title>" if title_tag else "",
        f'<meta name="description" content="{meta_description}">' if meta_description else "",
        f'<link rel="canonical" href="{canonical_url}">' if canonical_url else "",
        '<meta name="robots" content="index, follow">',
        f'<meta property="og:title" content="{title_tag}">',
        f'<meta property="og:description" content="{meta_description}">',
        f'<meta property="og:url" content="{canonical_url}">',
        '<meta property="og:type" content="article">',
        f'<meta property="og:image" content="{og_image}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{title_tag}">',
        f'<meta name="twitter:description" content="{meta_description}">',
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
    <h1>{h1}</h1>
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
```

- [ ] **Step 2: Verify the module imports cleanly**

```
cd backend && PYTHONPATH=. .venv/Scripts/python -c "from app.services.reports.content_page_assembler import assemble_publish_ready_page; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/reports/content_page_assembler.py
git commit -m "feat: add content page assembler service"
```

---

### Task 2: Backend Assembler Tests

**Files:**
- Create: `backend/tests/test_content_page_assembler.py`

**Interfaces:**
- Consumes: all sync helpers from Task 1.

- [ ] **Step 1: Create the test file**

Create `backend/tests/test_content_page_assembler.py`:

```python
"""Unit tests for content_page_assembler — all sync, no I/O."""

import asyncio
import json

from app.services.reports.content_page_assembler import (
    _build_image_brief,
    _build_publish_checklist,
    _build_slug,
    _extract_h1,
    _extract_image_alts,
    _extract_inbound_links,
    _extract_meta_description,
    _extract_primary_keyword,
    _extract_schema_json,
    _extract_title_tag,
    _generate_html_file,
    _validate_completeness,
    assemble_publish_ready_page,
)


# ── _build_slug ───────────────────────────────────────────────────────────────

def test_build_slug_lowercases_and_hyphenates():
    assert _build_slug("Best AI Tools") == "/best-ai-tools"


def test_build_slug_strips_stop_words():
    result = _build_slug("best AI tools for the small business")
    assert "the" not in result
    assert "for" not in result
    assert result == "/best-ai-tools-small-business"


def test_build_slug_caps_at_six_words():
    result = _build_slug("one two three four five six seven eight")
    parts = result.lstrip("/").split("-")
    assert len(parts) <= 6


def test_build_slug_starts_with_slash():
    assert _build_slug("anything").startswith("/")


def test_build_slug_empty_input_returns_page():
    assert _build_slug("") == "/page"


# ── _extract_title_tag ────────────────────────────────────────────────────────

def test_extract_title_tag_bold_label():
    md = "**Title Tag:** Best AI Tools for Small Business 2026 | Brand"
    assert "Best AI Tools" in _extract_title_tag(md)


def test_extract_title_tag_plain_label():
    md = "Title tag: Best AI Tools for Small Business 2026"
    assert "Best AI Tools" in _extract_title_tag(md)


def test_extract_title_tag_html():
    md = "<title>Best AI Tools for Small Business 2026</title>"
    assert "Best AI Tools" in _extract_title_tag(md)


def test_extract_title_tag_returns_empty_on_no_match():
    assert _extract_title_tag("No title here") == ""


def test_extract_title_tag_strips_asterisks():
    md = "**Title Tag:** **Bold Title Here That Is Long Enough**"
    result = _extract_title_tag(md)
    assert not result.startswith("*")


# ── _extract_meta_description ─────────────────────────────────────────────────

def test_extract_meta_description_bold_label():
    md = "**Meta Description:** Discover the best AI tools to help your small business grow faster in 2026."
    assert "Discover the best AI tools" in _extract_meta_description(md)


def test_extract_meta_description_html():
    md = '<meta name="description" content="Discover the best AI tools to help your small business grow faster.">'
    assert "Discover" in _extract_meta_description(md)


def test_extract_meta_description_returns_empty_on_no_match():
    assert _extract_meta_description("No description here") == ""


# ── _extract_h1 ───────────────────────────────────────────────────────────────

def test_extract_h1_from_markdown_heading():
    md = "# Best AI Tools for Small Business\n\nIntroduction..."
    assert _extract_h1(md) == "Best AI Tools for Small Business"


def test_extract_h1_returns_first_h1_only():
    md = "# First H1\n\n## Section\n\n# Second H1 (should not be returned)"
    assert _extract_h1(md) == "First H1"


def test_extract_h1_returns_empty_on_no_match():
    assert _extract_h1("No headings here") == ""


# ── _extract_primary_keyword ──────────────────────────────────────────────────

def test_extract_primary_keyword_bold_label():
    md = "**Primary Keyword:** best AI tools for small business"
    assert "best AI tools" in _extract_primary_keyword(md)


def test_extract_primary_keyword_target_label():
    md = "Target keyword: best productivity apps"
    assert "best productivity apps" in _extract_primary_keyword(md)


def test_extract_primary_keyword_returns_empty_on_no_match():
    assert _extract_primary_keyword("No keywords mentioned") == ""


# ── _extract_schema_json ──────────────────────────────────────────────────────

def test_extract_schema_json_fenced_block():
    md = '```json\n{"@context": "https://schema.org", "@type": "Article", "name": "Test"}\n```'
    schema, valid = _extract_schema_json(md)
    assert valid
    assert "@type" in schema


def test_extract_schema_json_script_tag():
    md = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>'
    schema, valid = _extract_schema_json(md)
    assert valid
    assert "Article" in schema


def test_extract_schema_json_invalid_returns_false():
    md = "```json\n{invalid json here}\n```"
    schema, valid = _extract_schema_json(md)
    assert not valid
    assert schema == ""


def test_extract_schema_json_no_schema_returns_empty():
    schema, valid = _extract_schema_json("No JSON here at all")
    assert schema == ""
    assert not valid


def test_extract_schema_json_ignores_non_schema_json():
    md = '```json\n{"key": "value", "no_type": true}\n```'
    schema, valid = _extract_schema_json(md)
    assert schema == ""
    assert not valid


# ── _extract_image_alts ───────────────────────────────────────────────────────

def test_extract_image_alts_markdown_syntax():
    md = "![Hero image showing AI dashboard on laptop screen](image.webp)"
    alts = _extract_image_alts(md)
    assert len(alts) == 1
    assert "Hero image" in alts[0]


def test_extract_image_alts_multiple():
    md = "![Image one](a.webp)\n\n![Image two](b.webp)"
    alts = _extract_image_alts(md)
    assert len(alts) == 2


def test_extract_image_alts_returns_empty_list_on_no_match():
    assert _extract_image_alts("No images here") == []


# ── _extract_inbound_links ────────────────────────────────────────────────────

def test_extract_inbound_links_from_table():
    md = (
        "| Source Page | Find This Text | Anchor Text | Placement |\n"
        "| --- | --- | --- | --- |\n"
        "| /about | we help businesses grow | AI tools guide | intro |\n"
        "| /blog | related reading | best AI tools | body |\n"
    )
    links = _extract_inbound_links(md)
    assert len(links) >= 2
    assert links[0]["source_page"] == "/about"
    assert links[0]["anchor_text"] == "AI tools guide"


def test_extract_inbound_links_returns_empty_on_no_table():
    assert _extract_inbound_links("No table here") == []


# ── _validate_completeness ────────────────────────────────────────────────────

def test_validate_completeness_all_present():
    result = _validate_completeness(
        {
            "title_tag": "Best AI Tools for Small Business 2026",
            "meta_description": "Discover the best AI tools for small business owners in 2026. Save time and grow faster with these tools.",
            "h1": "Best AI Tools for Small Business",
            "article_body": "x " * 300,
            "primary_kw": "best AI tools for small business",
            "schema_jsonld": '{"@type":"Article"}',
            "schema_valid": True,
        }
    )
    assert result["is_complete"] is True
    assert result["errors"] == []


def test_validate_completeness_missing_title_adds_error():
    result = _validate_completeness(
        {
            "title_tag": "",
            "meta_description": "A long enough meta description for testing purposes here.",
            "h1": "Some H1",
            "article_body": "x " * 300,
            "primary_kw": "keyword",
            "schema_jsonld": "",
            "schema_valid": False,
        }
    )
    assert result["is_complete"] is False
    assert any("title_tag" in e for e in result["errors"])


def test_validate_completeness_invalid_schema_adds_error():
    result = _validate_completeness(
        {
            "title_tag": "Title Tag Here For Testing Purposes",
            "meta_description": "Meta description here that is long enough to pass the test check.",
            "h1": "H1 Here",
            "article_body": "x " * 300,
            "primary_kw": "keyword",
            "schema_jsonld": "bad json",
            "schema_valid": False,
        }
    )
    assert not result["is_complete"]
    assert any("schema" in e.lower() for e in result["errors"])


def test_validate_completeness_short_body_adds_error():
    result = _validate_completeness(
        {
            "title_tag": "Title",
            "meta_description": "Meta",
            "h1": "H1",
            "article_body": "too short",
            "primary_kw": "kw",
            "schema_jsonld": "",
            "schema_valid": False,
        }
    )
    assert not result["is_complete"]
    assert any("article_body" in e for e in result["errors"])


# ── _generate_html_file ───────────────────────────────────────────────────────

def test_generate_html_file_has_doctype():
    html = _generate_html_file("Title", "<title>Title</title>", "H1", "Body")
    assert "<!DOCTYPE html>" in html


def test_generate_html_file_has_h1():
    html = _generate_html_file("T", "", "My H1 Heading", "Body")
    assert "<h1>My H1 Heading</h1>" in html


def test_generate_html_file_has_article_tag():
    html = _generate_html_file("T", "", "H1", "Body")
    assert "<article>" in html
    assert "</article>" in html


def test_generate_html_file_has_head_html():
    html = _generate_html_file("T", '<title>Test Title</title>', "H1", "Body")
    assert "<title>Test Title</title>" in html


# ── assemble_publish_ready_page (integration, no AI calls) ───────────────────

SAMPLE_STEPS = [
    {
        "step": 1,
        "plugin_name": "Create Topic",
        "output_markdown": "## Topic Research\n\nBest AI tools for small business.\n",
    },
    {
        "step": 2,
        "plugin_name": "Keyword Clustering",
        "output_markdown": "**Primary Keyword:** best AI tools for small business\n\nSecondary keywords: ai software, business automation\n",
    },
    {
        "step": 3,
        "plugin_name": "Content Strategy",
        "output_markdown": "## Strategy\n\nPillar page approach.\n",
    },
    {
        "step": 4,
        "plugin_name": "Content Brief",
        "output_markdown": "**Target keyword:** best AI tools for small business\n\nWord count: 2400\n",
    },
    {
        "step": 5,
        "plugin_name": "Create Content",
        "output_markdown": (
            "# Best AI Tools for Small Business\n\n"
            "**Title Tag:** Best AI Tools for Small Business 2026 | YourBrand\n"
            "**Meta Description:** Discover the best AI tools for small business owners. Save time and grow your business with these powerful tools.\n\n"
            "## Introduction\n\nAI tools are transforming how small businesses operate. " + ("word " * 250) + "\n\n"
            '```json\n{"@context":"https://schema.org","@type":"Article","name":"Best AI Tools"}\n```\n\n'
            "![Hero image showing AI dashboard on laptop screen](hero.webp)\n"
        ),
    },
    {
        "step": 6,
        "plugin_name": "On-Page SEO",
        "output_markdown": (
            "# Best AI Tools for Small Business in 2026\n\n"
            "**Title Tag:** Best AI Tools for Small Business 2026 | YourBrand\n"
            "**Meta Description:** Discover the best AI tools for small business owners in 2026. Save time and grow faster.\n\n"
            "## Introduction\n\nAI tools are changing everything. " + ("content " * 300) + "\n"
        ),
    },
    {
        "step": 7,
        "plugin_name": "Internal Linking",
        "output_markdown": (
            "## Inbound Links\n\n"
            "| Source Page | Find This Text | Anchor Text | Placement |\n"
            "| --- | --- | --- | --- |\n"
            "| /about | we help businesses | AI tools guide | intro |\n\n"
            "Pillar page: /ai-resources should link here.\n" + ("linked content " * 200)
        ),
    },
]


def test_assemble_returns_all_top_level_keys():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS, "https://example.com")
    )
    for key in ("pipeline_run_id", "assembled_at", "domain", "slug", "full_url", "validation", "blocks", "downloads"):
        assert key in result, f"Missing top-level key: {key}"


def test_assemble_slug_built_from_primary_keyword():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS, "https://example.com")
    )
    assert "best" in result["slug"]
    assert "ai" in result["slug"]


def test_assemble_full_url_includes_site_url():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS, "https://example.com")
    )
    assert result["full_url"].startswith("https://example.com")


def test_assemble_validation_is_complete_with_good_steps():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS, "https://example.com")
    )
    assert result["validation"]["is_complete"] is True


def test_assemble_extracts_title_tag():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS, "https://example.com")
    )
    assert "Best AI Tools" in result["blocks"]["head"]["title_tag"]


def test_assemble_schema_is_valid():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS, "https://example.com")
    )
    assert result["blocks"]["head"]["schema_valid"] is True


def test_assemble_html_file_has_doctype():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS)
    )
    assert "<!DOCTYPE html>" in result["downloads"]["html_file"]


def test_assemble_inbound_links_extracted():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS)
    )
    links = result["blocks"]["internal_linking_instructions"]["inbound_links"]
    assert len(links) >= 1


def test_assemble_empty_steps_returns_validation_errors():
    result = asyncio.run(
        assemble_publish_ready_page("run-empty", [], "https://example.com")
    )
    assert result["validation"]["is_complete"] is False
    assert len(result["validation"]["errors"]) > 0


def test_assemble_pillar_link_detected():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS)
    )
    assert result["blocks"]["internal_linking_instructions"]["pillar_link_confirmed"] is True
```

- [ ] **Step 2: Run tests — expect failures**

```
cd backend && PYTHONPATH=. .venv/Scripts/pytest tests/test_content_page_assembler.py -v 2>&1 | tail -5
```

Expected: collection error (module not found or import error) if Step 1 wasn't committed yet. If Step 1 is done, some tests may fail — investigate and fix.

- [ ] **Step 3: Run tests — expect all pass**

```
cd backend && PYTHONPATH=. .venv/Scripts/pytest tests/test_content_page_assembler.py -v 2>&1 | tail -5
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_content_page_assembler.py
git commit -m "test: add content page assembler unit tests"
```

---

### Task 3: Backend Schema + Endpoint

**Files:**
- Modify: `backend/app/schemas/pipelines.py`
- Modify: `backend/app/routers/pipelines.py`

**Interfaces:**
- Consumes: `assemble_publish_ready_page` from Task 1, `get_pipeline_recent_results` (already imported in router).
- Produces: `GET /pipelines/{pipeline_id}/assembled-page?project_id=UUID&site_url=str` → JSON.

- [ ] **Step 1: Add the Pydantic model to schemas**

Append to the **end** of `backend/app/schemas/pipelines.py`:

```python
class PublishReadyPageResponse(BaseModel):
    """Loosely typed response for the assembled page — all blocks are dicts
    because the assembler returns deeply nested structures that vary by pipeline."""

    pipeline_run_id: str = ""
    assembled_at: str = ""
    domain: str = ""
    slug: str = ""
    full_url: str = ""
    validation: dict[str, Any] = Field(default_factory=dict)
    blocks: dict[str, Any] = Field(default_factory=dict)
    downloads: dict[str, Any] = Field(default_factory=dict)
```

- [ ] **Step 2: Add the route to the pipelines router**

In `backend/app/routers/pipelines.py`, add `PublishReadyPageResponse` to the schemas import block, then add this route after the `unified_pipeline_report` route:

```python
@router.get("/{pipeline_id}/assembled-page", response_model=PublishReadyPageResponse)
async def assembled_pipeline_page(
    request: Request,
    pipeline_id: str,
    project_id: UUID = Query(...),
    site_url: str = Query(default=""),
):
    """Assemble a publish-ready page from pipeline step outputs.

    Fetches the most recent completed step results and runs them through
    the content page assembler to produce a structured, download-ready
    publish-ready page object.
    """
    user = require_user(request)
    pool = get_pool()

    result = await get_pipeline_recent_results(
        pool,
        pipeline_id=pipeline_id,
        project_id=project_id,
        user_id=user.id,
    )
    if not result:
        raise not_found("No completed pipeline results found for this project")

    # Sanitize site_url for prompt injection safety
    safe_site_url = site_url.replace("\n", " ").replace("\r", " ")[:253]

    from app.services.reports.content_page_assembler import assemble_publish_ready_page

    page = await assemble_publish_ready_page(
        pipeline_run_id=str(result.get("steps", [{}])[0].get("execution_id", "unknown"))
        if result.get("steps")
        else "unknown",
        steps=result["steps"],
        site_url=safe_site_url,
    )
    return page
```

- [ ] **Step 3: Verify backend imports cleanly**

```
cd backend && PYTHONPATH=. .venv/Scripts/python -c "from app.routers.pipelines import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/pipelines.py backend/app/routers/pipelines.py
git commit -m "feat: add GET /pipelines/{id}/assembled-page endpoint"
```

---

### Task 4: Frontend TypeScript Types

**Files:**
- Modify: `frontend/src/lib/types.ts`

**Interfaces:**
- Produces: `PublishReadyPage`, `PageHead`, `PageBody`, `InternalLinkingInstructions`, `ImageBriefItem`, `PublishReadyValidation` — consumed by Tasks 5 and 6.

- [ ] **Step 1: Append the new interfaces to types.ts**

Add to the **end** of `frontend/src/lib/types.ts`:

```typescript
export interface PublishReadyValidation {
  is_complete: boolean;
  errors: string[];
  warnings: string[];
}

export interface PageHead {
  title_tag: string;
  meta_description: string;
  canonical_url: string;
  schema_jsonld: string;
  schema_valid: boolean;
  full_head_html: string;
  open_graph: {
    title: string;
    description: string;
    url: string;
    type: string;
    image: string;
  };
  twitter_card: {
    card: string;
    title: string;
    description: string;
  };
  robots: string;
}

export interface PageBody {
  h1: string;
  full_body_markdown: string;
  word_count: number;
}

export interface InternalLinkInstruction {
  source_page: string;
  find_text: string;
  anchor_text: string;
  placement: string;
}

export interface InternalLinkingInstructions {
  inbound_links: InternalLinkInstruction[];
  outbound_links_inserted: boolean;
  pillar_link_confirmed: boolean;
  orphan_status: string;
}

export interface ImageBriefItem {
  position: string;
  alt_text: string;
  dimensions: string;
  content_description: string;
  file_name: string;
}

export interface PublishReadyPage {
  pipeline_run_id: string;
  assembled_at: string;
  domain: string;
  slug: string;
  full_url: string;
  validation: PublishReadyValidation;
  blocks: {
    head: PageHead;
    url_slug: {
      slug: string;
      full_url: string;
      breadcrumb: string;
    };
    body: PageBody;
    internal_linking_instructions: InternalLinkingInstructions;
    image_brief: ImageBriefItem[];
    publish_checklist: string;
  };
  downloads: {
    html_file: string;
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: add PublishReadyPage TypeScript interfaces"
```

---

### Task 5: Frontend Publish-Ready Page Component

**Files:**
- Create: `frontend/src/components/reports/publish-ready-page.tsx`

**Interfaces:**
- Consumes: `PublishReadyPage` from Task 4, `parseBlocksFromBody` from `@/lib/report-view-model`, `renderReportBlocks` from `@/components/reports/structured-report-view`.
- Produces: `export function PublishReadyPageView(props)` — consumed by Task 6.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/reports/publish-ready-page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check, CheckSquare, Copy, Download, ExternalLink, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseBlocksFromBody } from "@/lib/report-view-model";
import { renderReportBlocks } from "@/components/reports/structured-report-view";
import type {
  ImageBriefItem,
  InternalLinkInstruction,
  PublishReadyPage,
} from "@/lib/types";

// ── Utility ───────────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CharCount({ text, min, max }: { text: string; min: number; max: number }) {
  const len = text.length;
  const color =
    len === 0
      ? "text-muted"
      : len >= min && len <= max
      ? "text-success"
      : "text-destructive";
  return (
    <span className={`text-[11px] font-mono ${color}`}>
      {len} chars
    </span>
  );
}

// ── SERP Preview ──────────────────────────────────────────────────────────────

function SerpPreview({
  title,
  url,
  description,
}: {
  title: string;
  url: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-white p-4 font-sans shadow-sm">
      <p className="text-[11px] text-muted mb-1">Google Search Preview</p>
      <div className="max-w-xl space-y-0.5">
        <p className="text-[18px] font-medium text-[#1a0dab] leading-snug truncate">
          {title || "Page Title"}
        </p>
        <p className="text-[13px] text-[#006621] truncate">{url || "https://example.com/slug"}</p>
        <p className="text-[13px] text-[#545454] leading-relaxed line-clamp-2">
          {description || "Meta description will appear here..."}
        </p>
      </div>
    </div>
  );
}

// ── Tab: SEO & Meta ───────────────────────────────────────────────────────────

function SeoMetaTab({ page }: { page: PublishReadyPage }) {
  const { head, url_slug } = page.blocks;
  return (
    <div className="space-y-5">
      <SerpPreview
        title={head.title_tag}
        url={page.full_url}
        description={head.meta_description}
      />

      {[
        {
          label: "Title Tag",
          value: head.title_tag,
          min: 50,
          max: 60,
        },
        {
          label: "Meta Description",
          value: head.meta_description,
          min: 150,
          max: 160,
        },
      ].map(({ label, value, min, max }) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</p>
            <CharCount text={value} min={min} max={max} />
            <CopyButton text={value} />
          </div>
          <p className="rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm text-foreground">
            {value || <span className="text-muted italic">Not extracted</span>}
          </p>
        </div>
      ))}

      {[
        { label: "Canonical URL", value: head.canonical_url },
        { label: "URL Slug", value: url_slug.slug },
        { label: "Breadcrumb", value: url_slug.breadcrumb },
      ].map(({ label, value }) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</p>
            <CopyButton text={value} />
          </div>
          <p className="rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm font-mono text-foreground">
            {value || <span className="text-muted italic">Not set</span>}
          </p>
        </div>
      ))}

      {/* Open Graph */}
      <details className="group">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted hover:text-primary">
          Open Graph Tags ▸
        </summary>
        <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-surface/80 p-3">
          {Object.entries(head.open_graph).map(([key, val]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="font-mono text-muted w-32 shrink-0">og:{key}</span>
              <span className="text-foreground truncate">{val}</span>
            </div>
          ))}
        </div>
      </details>

      {/* Twitter Card */}
      <details className="group">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted hover:text-primary">
          Twitter Card Tags ▸
        </summary>
        <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-surface/80 p-3">
          {Object.entries(head.twitter_card).map(([key, val]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="font-mono text-muted w-32 shrink-0">twitter:{key}</span>
              <span className="text-foreground truncate">{val}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ── Tab: Full Preview ─────────────────────────────────────────────────────────

function FullPreviewTab({ page }: { page: PublishReadyPage }) {
  const { body } = page.blocks;
  const blocks = parseBlocksFromBody(body.full_body_markdown);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Rendered preview of the complete article body
        </p>
        <span className="font-mono text-[11px] text-muted">
          {body.word_count.toLocaleString()} words
        </span>
      </div>
      <div className="rounded-2xl border border-border/60 bg-white p-6 prose prose-sm max-w-none">
        <h1 className="text-2xl font-bold">{body.h1}</h1>
        {blocks.length > 0 ? (
          renderReportBlocks(blocks)
        ) : (
          <p className="text-muted italic">No article content extracted yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Tab: Body Content ─────────────────────────────────────────────────────────

function BodyContentTab({ page }: { page: PublishReadyPage }) {
  const { body } = page.blocks;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CopyButton text={body.full_body_markdown} label="Copy Article Body" />
        <span className="font-mono text-[11px] text-muted">
          {body.word_count.toLocaleString()} words
        </span>
      </div>
      <pre className="whitespace-pre-wrap rounded-xl border border-border/60 bg-surface/80 p-4 text-sm text-foreground font-sans leading-relaxed max-h-[600px] overflow-y-auto">
        {body.full_body_markdown || "No body content extracted."}
      </pre>
    </div>
  );
}

// ── Tab: Schema ───────────────────────────────────────────────────────────────

function SchemaTab({ page }: { page: PublishReadyPage }) {
  const { head } = page.blocks;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            head.schema_valid
              ? "bg-success/15 text-success border border-success/25"
              : "bg-destructive/15 text-destructive border border-destructive/25"
          }`}
        >
          {head.schema_valid ? (
            <Check className="h-3 w-3" />
          ) : (
            <span>✗</span>
          )}
          {head.schema_valid ? "Valid JSON-LD" : "Invalid or missing JSON-LD"}
        </span>
        {head.schema_jsonld && <CopyButton text={head.schema_jsonld} label="Copy Schema" />}
      </div>

      {head.schema_jsonld ? (
        <pre className="rounded-xl border border-border/60 bg-surface/80 p-4 text-sm font-mono text-foreground overflow-x-auto max-h-[500px] overflow-y-auto">
          {head.schema_jsonld}
        </pre>
      ) : (
        <p className="text-sm text-muted italic">
          No schema JSON-LD was extracted from the pipeline output.
          The On-Page SEO or Create Content step should produce a JSON-LD block.
        </p>
      )}
    </div>
  );
}

// ── Tab: Linking Instructions ─────────────────────────────────────────────────

function LinkingTab({ page }: { page: PublishReadyPage }) {
  const { internal_linking_instructions } = page.blocks;
  const { inbound_links, outbound_links_inserted, pillar_link_confirmed } =
    internal_linking_instructions;

  return (
    <div className="space-y-6">
      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
            outbound_links_inserted
              ? "bg-success/15 text-success border-success/25"
              : "bg-muted/30 text-muted border-border/40"
          }`}
        >
          <Check className="h-3 w-3" />
          Outbound links inserted
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
            pillar_link_confirmed
              ? "bg-success/15 text-success border-success/25"
              : "bg-muted/30 text-muted border-border/40"
          }`}
        >
          <Check className="h-3 w-3" />
          Pillar page link confirmed
        </span>
      </div>

      {/* Inbound links table */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
          Inbound Link Actions (add to existing pages)
        </p>
        {inbound_links.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-surface/60">
                  {["Source Page", "Find This Text", "Use This Anchor Text", "Placement"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {inbound_links.map((link: InternalLinkInstruction, i: number) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-primary">{link.source_page}</td>
                    <td className="px-3 py-2 text-xs text-foreground max-w-[200px] truncate">
                      {link.find_text}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium text-foreground">
                      {link.anchor_text}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{link.placement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted italic">
            No inbound link instructions extracted. The Internal Linking step should produce a
            table of recommended inbound links.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Tab: Image Brief ──────────────────────────────────────────────────────────

function ImageBriefTab({ page }: { page: PublishReadyPage }) {
  const { image_brief } = page.blocks;
  if (image_brief.length === 0) {
    return (
      <p className="text-sm text-muted italic">
        No image alt texts extracted. The Create Content or On-Page SEO step should include image
        alt text recommendations.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {image_brief.map((item: ImageBriefItem, i: number) => {
        const [w, h] = item.dimensions.split("x").map(Number);
        const ratio = h && w ? h / w : 0.525;
        return (
          <div
            key={i}
            className="rounded-xl border border-border/60 bg-surface-elevated/40 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                {item.position}
              </p>
              <span className="text-[11px] text-muted">{item.dimensions}px</span>
            </div>
            {/* Aspect ratio placeholder */}
            <div
              className="w-full rounded-lg bg-surface/60 border border-border/40 flex items-center justify-center text-muted text-sm"
              style={{ aspectRatio: ratio > 0 ? `${w}/${h}` : "16/9", maxHeight: 180 }}
            >
              {item.alt_text}
            </div>
            <div className="space-y-1 text-xs">
              <p>
                <span className="text-muted font-mono">Alt text: </span>
                <span className="text-foreground">{item.alt_text}</span>
                <CopyButton text={item.alt_text} />
              </p>
              <p>
                <span className="text-muted font-mono">File name: </span>
                <span className="font-mono text-foreground">{item.file_name}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Publish Checklist ────────────────────────────────────────────────────

function PublishChecklistTab({ checklist }: { checklist: string }) {
  const lines = checklist.split("\n");
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const checkableLines = lines.filter((l) => l.trimStart().startsWith("- [ ]"));
  const total = checkableLines.length;
  const done = Object.values(checked).filter(Boolean).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  let checkboxIndex = 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-mono text-muted uppercase tracking-widest">Progress</span>
          <span
            className={`font-semibold ${pct === 100 ? "text-success" : "text-foreground"}`}
          >
            {done}/{total} — {pct}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface/60 border border-border/40 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct === 100 && (
          <p className="text-success text-xs font-medium">All done — Ready to Publish ✓</p>
        )}
      </div>

      {/* Checklist items */}
      <div className="space-y-0.5">
        {lines.map((line, i) => {
          if (line.trimStart().startsWith("- [ ]")) {
            const idx = checkboxIndex++;
            const isChecked = checked[idx] ?? false;
            const text = line.replace(/^[\s-]*\[\s*\]\s*/, "");
            return (
              <button
                key={i}
                type="button"
                onClick={() => setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                className="flex items-start gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent-soft/40 transition-colors group"
              >
                {isChecked ? (
                  <CheckSquare className="h-4 w-4 mt-0.5 text-success shrink-0" />
                ) : (
                  <Square className="h-4 w-4 mt-0.5 text-muted shrink-0" />
                )}
                <span
                  className={`text-sm ${
                    isChecked ? "line-through text-muted" : "text-foreground"
                  }`}
                >
                  {text}
                </span>
              </button>
            );
          }
          if (line.startsWith("##")) {
            return (
              <p
                key={i}
                className="font-mono text-[10px] uppercase tracking-widest text-muted pt-4 pb-1"
              >
                {line.replace(/^#+\s*/, "")}
              </p>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PublishReadyPageView({ page }: { page: PublishReadyPage }) {
  const { validation } = page;

  const handleDownloadHtml = () => {
    const blob = new Blob([page.downloads.html_file], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page.slug.replace("/", "") || "page"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([page.blocks.body.full_body_markdown], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page.slug.replace("/", "") || "page"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="glass-panel-strong border-border/70 overflow-hidden">
      {/* Header */}
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/80">
              Full Content Page Pipeline
            </p>
            <CardTitle className="mt-1 text-xl tracking-tight">
              Your Publish-Ready Page
            </CardTitle>
            {page.full_url && (
              <a
                href={page.full_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
              >
                {page.full_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Status badge */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                validation.is_complete
                  ? "bg-success/15 text-success border-success/25"
                  : "bg-amber-500/15 text-amber-600 border-amber-400/25"
              }`}
            >
              {validation.is_complete ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Complete ✓
                </>
              ) : (
                <>⚠ Needs Review</>
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadMarkdown}
            >
              <Download className="h-3.5 w-3.5" />
              .md
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadHtml}
            >
              <Download className="h-3.5 w-3.5" />
              HTML
            </Button>
            <CopyButton text={page.blocks.body.full_body_markdown} label="Copy Body" />
          </div>
        </div>

        {/* Validation errors */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="mt-4 space-y-2">
            {validation.errors.map((e, i) => (
              <p
                key={i}
                className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive"
              >
                ✗ {e}
              </p>
            ))}
            {validation.warnings.map((w, i) => (
              <p
                key={i}
                className="rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-xs text-amber-700"
              >
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
      </CardHeader>

      {/* Tabs */}
      <CardContent className="p-0">
        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="w-full rounded-none border-b border-border/60 bg-surface/60 h-auto p-0 justify-start overflow-x-auto">
            {[
              { value: "preview", label: "Full Preview" },
              { value: "seo", label: "SEO & Meta" },
              { value: "body", label: "Body Content" },
              { value: "schema", label: "Schema" },
              { value: "linking", label: "Linking" },
              { value: "images", label: "Images" },
              { value: "checklist", label: "Checklist" },
            ].map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="p-5">
            <TabsContent value="preview" className="mt-0">
              <FullPreviewTab page={page} />
            </TabsContent>
            <TabsContent value="seo" className="mt-0">
              <SeoMetaTab page={page} />
            </TabsContent>
            <TabsContent value="body" className="mt-0">
              <BodyContentTab page={page} />
            </TabsContent>
            <TabsContent value="schema" className="mt-0">
              <SchemaTab page={page} />
            </TabsContent>
            <TabsContent value="linking" className="mt-0">
              <LinkingTab page={page} />
            </TabsContent>
            <TabsContent value="images" className="mt-0">
              <ImageBriefTab page={page} />
            </TabsContent>
            <TabsContent value="checklist" className="mt-0">
              <PublishChecklistTab checklist={page.blocks.publish_checklist} />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify Tabs component exists**

```
cd frontend && grep -r "from.*ui/tabs" src/ | head -3
```

If no results, the shadcn Tabs component is not installed. Run:

```
cd frontend && npx shadcn@latest add tabs
```

Expected after install: `frontend/src/components/ui/tabs.tsx` exists.

- [ ] **Step 3: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Fix any errors. Common issues:
- `renderReportBlocks` returns `JSX.Element[]` — if used inside a `<div>` it's fine.
- `prose` class requires `@tailwindcss/typography` — if it causes an error, replace `prose prose-sm max-w-none` with just `space-y-3 text-sm`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/reports/publish-ready-page.tsx
git commit -m "feat: add PublishReadyPageView 7-tab component"
```

---

### Task 6: Wire Into Pipeline-View Page

**Files:**
- Modify: `frontend/src/app/(app)/reports/pipeline-view/page.tsx`

**Interfaces:**
- Consumes: `PublishReadyPage` from Task 4, `PublishReadyPageView` from Task 5.
- The assembled-page fetch runs in parallel with the unified-report fetch.
- `PublishReadyPageView` renders ABOVE the `UnifiedPipelineReportView` when the pipeline is `full-content-page-pipeline`.

- [ ] **Step 1: Read the current pipeline-view page**

Read `frontend/src/app/(app)/reports/pipeline-view/page.tsx` in full before editing. The file currently:
- Fetches `/pipelines/{id}/unified-report` as the primary path
- Falls back to `/pipelines/{id}/recent-results` + `StructuredReportView`
- Has `unifiedReport` and `legacyResult` state

- [ ] **Step 2: Add assembled-page fetch + state + render**

Make the following targeted changes to `frontend/src/app/(app)/reports/pipeline-view/page.tsx`:

**Add import** (after the `UnifiedPipelineReportView` import line):
```tsx
import { PublishReadyPageView } from "@/components/reports/publish-ready-page";
import type { PublishReadyPage } from "@/lib/types";
```

**Add state** (inside the component, after the existing state declarations):
```tsx
const [assembledPage, setAssembledPage] = useState<PublishReadyPage | null>(null);
```

**Add fetch** inside the `useEffect`, in the async IIFE, after the unified-report try block succeeds (after `setUnifiedReport(data)` and before `return`):

Replace the current primary path code (the try block that sets `unifiedReport`) with this expanded version:

```tsx
// ── Primary path: try unified report + assembled page in parallel ─────
try {
  const domainParam = domain ? `&domain=${encodeURIComponent(domain)}` : "";
  const siteParam = siteUrlParam ? `&site_url=${encodeURIComponent(siteUrlParam)}` : "";

  const [unifiedData, assembledData] = await Promise.allSettled([
    api.get<UnifiedPipelineReport>(
      `/pipelines/${pipelineId}/unified-report?project_id=${encodeURIComponent(effectiveProjectId)}${domainParam}`,
    ),
    pipelineId === "full-content-page-pipeline"
      ? api.get<PublishReadyPage>(
          `/pipelines/${pipelineId}/assembled-page?project_id=${encodeURIComponent(effectiveProjectId)}${siteParam}`,
        )
      : Promise.reject(new Error("not full-content pipeline")),
  ]);

  if (!cancelled) {
    if (unifiedData.status === "fulfilled") setUnifiedReport(unifiedData.value);
    if (assembledData.status === "fulfilled") setAssembledPage(assembledData.value);
    setUnifiedLoading(false);
  }
  return; // ← primary path done; skip fallback
} catch {
  // Fall through to legacy view
}
```

**Add render** — in the primary unified path render block (the `if (unifiedReport && !useFallback)` branch), add the assembled page ABOVE the `UnifiedPipelineReportView`:

```tsx
if (unifiedReport && !useFallback) {
  return (
    <div className="space-y-6">
      {/* Publish-ready page section — only for full-content pipeline */}
      {assembledPage && (
        <PublishReadyPageView page={assembledPage} />
      )}

      {/* Unified report sections below */}
      <UnifiedPipelineReportView
        report={unifiedReport}
        onSave={legacyResult ? handleSaveAll : undefined}
        saving={saving}
        saveMessage={saveMessage}
        error={error}
        onDownloadPdf={legacyResult ? handleDownloadPdf : undefined}
        pdfDownloading={pdfDownloading}
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/(app)/reports/pipeline-view/page.tsx
git commit -m "feat: show PublishReadyPageView for full-content-page-pipeline"
```

---

## Self-Review Against Spec

### Spec Coverage

| Spec requirement | Task covering it |
|---|---|
| Phase 1: Map pipeline flow | Done in research (not a code task) |
| Phase 2 Block 1 — All HEAD meta tags | Task 1 `_build_meta_html` + Task 5 SEO tab |
| Phase 2 Block 1 — JSON-LD schema | Task 1 `_extract_schema_json` + Task 5 Schema tab |
| Phase 2 Block 1 — OG tags | Task 1 `_build_meta_html` (open_graph dict) |
| Phase 2 Block 1 — Twitter Card | Task 1 `_build_meta_html` (twitter_card dict) |
| Phase 2 Block 2 — URL slug | Task 1 `_build_slug` |
| Phase 2 Block 2 — Canonical URL | Task 1 (derived from site_url + slug) |
| Phase 2 Block 2 — Breadcrumb | Task 1 (`url_slug.breadcrumb`) |
| Phase 2 Block 3 — Complete article body | Task 1 (article_body = linking_md → onpage_md → content_md) |
| Phase 2 Block 3 — H1 | Task 1 `_extract_h1` |
| Phase 2 Block 3 — Internal links inserted | Task 1 (linking step output used as body) |
| Phase 2 Block 3 — Image placeholders | Task 1 `_build_image_brief` + Task 5 Images tab |
| Phase 2 Block 3 — Word count | Task 1 (counted in `word_count`) |
| Phase 2 Block 4 — Inbound linking instructions | Task 1 `_extract_inbound_links` + Task 5 Linking tab |
| Phase 2 Block 5 — Image brief | Task 1 `_build_image_brief` + Task 5 Images tab |
| Phase 2 Block 6 — Publish checklist | Task 1 `_build_publish_checklist` + Task 5 Checklist tab |
| Phase 3 — assemblePublishReadyPage function | Task 1 `assemble_publish_ready_page` |
| Phase 3 Step 1 — Extract all fields | Task 1 extraction functions |
| Phase 3 Step 2 — Validate completeness | Task 1 `_validate_completeness` |
| Phase 3 Step 3 — Validate article body | Task 1 validation (body length check) |
| Phase 3 Step 4 — Build slug | Task 1 `_build_slug` |
| Phase 3 Step 5 — Build meta tags | Task 1 `_build_meta_html` |
| Phase 3 Step 6 — Validate schema JSON | Task 1 `_extract_schema_json` with `json.loads` |
| Phase 3 Step 10 — Return assembled object | Task 1 (return dict) |
| Phase 3 Step 11 — Generate HTML file | Task 1 `_generate_html_file` |
| Phase 4 — Header bar with status badge + action buttons | Task 5 header section |
| Phase 4 — Tab 1 Full Preview | Task 5 `FullPreviewTab` |
| Phase 4 — Tab 2 SEO & Meta + SERP preview | Task 5 `SeoMetaTab` + `SerpPreview` |
| Phase 4 — Tab 3 Body Content | Task 5 `BodyContentTab` |
| Phase 4 — Tab 4 Schema with validation badge | Task 5 `SchemaTab` |
| Phase 4 — Tab 5 Linking Instructions | Task 5 `LinkingTab` |
| Phase 4 — Tab 6 Image Brief | Task 5 `ImageBriefTab` |
| Phase 4 — Tab 7 Publish Checklist interactive | Task 5 `PublishChecklistTab` |
| Phase 4 — Download HTML button | Task 5 `handleDownloadHtml` |
| Phase 6 — End-to-end validation | Run the pipeline and check all 7 tabs manually |
| Phase 7 — Regression check | Other pipelines unchanged (conditional on pipeline ID) |

### Explicitly Deferred (follow-up plan)

| Spec requirement | Status |
|---|---|
| Phase 3 Step 7 — Inbound linking HTML table | In data but not rendered as HTML (rendered in Task 5 Tab 5 as interactive table) |
| Phase 4 — "Publish to WordPress" button | Deferred — `wordpress_agent.py` exists but wiring requires live WP credentials |
| Phase 4 — Checklist gates Publish button | Deferred with WordPress |
| Phase 5 — Elementor new page creation | Deferred — separate follow-up plan |

### Phase 3 Step 3 Gap

The spec requires validating H2/H3 counts against the brief, checking FAQ section presence, checking CTA block count, and detecting placeholder text. These structural checks require comparing the article body against the brief markdown, which is complex multi-document analysis. The current implementation validates:
- title_tag present/length
- meta_description present/length
- h1 present
- article_body present and >200 chars
- primary_kw found
- schema_jsonld valid

The deeper structural checks (H2 count, FAQ, CTA, placeholder scan) are flagged as `warnings` rather than `errors` in the current validation object. The publisher can see them in the Publish Checklist tab. Full structural validation can be added in a follow-up without changing the API shape.

### End-to-End Manual Verification

After all tasks complete, run the Full Content Page Pipeline for a test site. Then navigate to `/reports/pipeline-view?pipelineId=full-content-page-pipeline&projectId=YOUR_PROJECT_ID&site_url=https://yoursite.com`. Verify:

1. A "Your Publish-Ready Page" card appears above the unified report sections.
2. "Complete ✓" badge shows if all fields were extracted; "Needs Review ⚠" badge with error list if not.
3. Full Preview tab renders the article body.
4. SEO & Meta tab shows the SERP preview with real title and description.
5. Schema tab shows "Valid JSON-LD ✓" badge and the schema block.
6. Linking tab shows the inbound links table.
7. Images tab shows image brief cards with aspect-ratio placeholders.
8. Checklist tab shows interactive checkboxes with a progress bar.
9. "HTML" download button downloads a complete HTML file that opens in a browser.
10. ".md" download button downloads the article body as a markdown file.
11. No other pipelines (Audit Loop, GEO Flywheel) are affected.
12. Single-skill `/reports/view` pages are completely unaffected.
