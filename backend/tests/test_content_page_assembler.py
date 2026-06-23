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
