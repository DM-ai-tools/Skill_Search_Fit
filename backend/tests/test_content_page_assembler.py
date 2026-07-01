"""Unit tests for content_page_assembler — all sync, no I/O."""

import asyncio

from app.services.reports.content_page_assembler import (
    _build_image_brief,
    _build_publish_checklist,
    _build_slug,
    _extract_article_body,
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


def test_extract_h1_skips_report_titles():
    md = "# Internal Linking Report — example.com\n\n## Step 1\n"
    assert _extract_h1(md) == ""


# ── _extract_article_body ─────────────────────────────────────────────────────

def test_extract_article_body_prefers_create_content_over_linking_report():
    content = "# Best AI Tools\n\n## Introduction\n\n" + "article word " * 80
    linking = (
        "# Internal Linking Report — example.com\n\n"
        "**Pages Analyzed:** 10\n\n"
        "## Step 1: Site Structure Map\n\n|\n"
    )
    body = _extract_article_body(content, linking)
    assert "Internal Linking Report" not in body
    assert "Introduction" in body


def test_extract_article_body_uses_on_page_article_not_report_banner():
    onpage = (
        "## On-Page SEO Report: Homepage\n\n"
        "**Target Keyword:** widgets\n\n"
        "# Best Widgets Guide\n\n## Introduction\n\n" + "optimized " * 80
    )
    body = _extract_article_body("", onpage, "")
    assert "On-Page SEO Report" not in body
    assert "Best Widgets Guide" in body or "Introduction" in body


def test_extract_article_body_rejects_linking_strategy_only():
    linking = (
        "# Internal Linking Report — example.com\n\n"
        "**Pages Analyzed:** 10\n\n"
        "## Step 1: Site Structure Map\n\n"
        "|— pillar page\n"
    )
    assert _extract_article_body("", "", linking) == ""


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
            "schema_jsonld": '{"@type":"Article"}',
            "schema_valid": True,
        }
    )
    assert result["is_complete"] is False
    assert any("title_tag" in e for e in result["errors"])


def test_validate_completeness_invalid_schema_adds_error():
    # Tests the defensive branch in _validate_completeness directly.
    # In real pipeline usage, _extract_schema_json always returns ("", False)
    # for invalid JSON — it never produces a non-empty invalid schema string.
    # This test covers the validation function in isolation.
    result = _validate_completeness(
        {
            "title_tag": "Title Tag Here For Testing Purposes",
            "meta_description": "Meta description here that is long enough to pass the test check.",
            "h1": "H1 Here",
            "article_body": "x " * 300,
            "primary_kw": "keyword",
            "schema_jsonld": '{"@type":"Article"}',  # truthy
            "schema_valid": False,  # but marked invalid (artificial state)
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

# Module-level result so integration tests share one assembly call.
_SAMPLE_RESULT = asyncio.run(
    assemble_publish_ready_page("run-123", SAMPLE_STEPS, "https://example.com")
)


def test_assemble_returns_all_top_level_keys():
    for key in ("pipeline_run_id", "assembled_at", "domain", "slug", "full_url", "validation", "blocks", "downloads"):
        assert key in _SAMPLE_RESULT, f"Missing top-level key: {key}"


def test_assemble_slug_built_from_primary_keyword():
    assert "best" in _SAMPLE_RESULT["slug"]
    assert "ai" in _SAMPLE_RESULT["slug"]


def test_assemble_full_url_includes_site_url():
    assert _SAMPLE_RESULT["full_url"].startswith("https://example.com")


def test_assemble_validation_is_complete_with_good_steps():
    assert _SAMPLE_RESULT["validation"]["is_complete"] is True


def test_assemble_extracts_title_tag():
    assert "Best AI Tools" in _SAMPLE_RESULT["blocks"]["head"]["title_tag"]


def test_assemble_schema_is_valid():
    assert _SAMPLE_RESULT["blocks"]["head"]["schema_valid"] is True


def test_assemble_html_file_has_doctype():
    result = asyncio.run(
        assemble_publish_ready_page("run-123", SAMPLE_STEPS)
    )
    assert "<!DOCTYPE html>" in result["downloads"]["html_file"]


def test_assemble_inbound_links_extracted():
    links = _SAMPLE_RESULT["blocks"]["internal_linking_instructions"]["inbound_links"]
    assert len(links) >= 1


def test_assemble_empty_steps_returns_validation_errors():
    result = asyncio.run(
        assemble_publish_ready_page("run-empty", [], "https://example.com")
    )
    assert result["validation"]["is_complete"] is False
    assert len(result["validation"]["errors"]) > 0


def test_assemble_pillar_link_detected():
    assert _SAMPLE_RESULT["blocks"]["internal_linking_instructions"]["pillar_link_confirmed"] is True


def test_assemble_body_uses_article_not_linking_report():
    body = _SAMPLE_RESULT["blocks"]["body"]["full_body_markdown"]
    assert "Internal Linking Report" not in body
    assert "Introduction" in body or "Best AI Tools" in body


# ── _build_image_brief ────────────────────────────────────────────────────────

def test_build_image_brief_hero_image_gets_1200x628():
    """Hero image (index 0) should get dimensions 1200x628."""
    alts = ["Hero image showing AI dashboard", "Secondary image"]
    result = _build_image_brief(alts)
    assert result[0]["dimensions"] == "1200x628"


def test_build_image_brief_second_image_gets_800x450():
    """Second image (index 1) should get dimensions 800x450."""
    alts = ["First image", "Second image showing dashboard", "Third image"]
    result = _build_image_brief(alts)
    assert result[1]["dimensions"] == "800x450"


def test_build_image_brief_each_item_has_required_keys():
    """Each image brief item should have all required keys."""
    alts = ["Test alt text"]
    result = _build_image_brief(alts)
    required_keys = {"position", "alt_text", "dimensions", "content_description", "file_name"}
    assert all(key in result[0] for key in required_keys)


def test_build_image_brief_position_label():
    """Position should be formatted as 'Image {i+1}'."""
    alts = ["First", "Second", "Third"]
    result = _build_image_brief(alts)
    assert result[0]["position"] == "Image 1"
    assert result[1]["position"] == "Image 2"
    assert result[2]["position"] == "Image 3"


def test_build_image_brief_file_name_from_alt():
    """File name should be derived from alt text with slugified format."""
    alts = ["Hero Image Showing Dashboard"]
    result = _build_image_brief(alts)
    assert "hero" in result[0]["file_name"].lower()
    assert result[0]["file_name"].endswith(".webp")
    assert "-1.webp" in result[0]["file_name"]


def test_build_image_brief_empty_list_returns_empty_list():
    """Empty alt list should return empty list."""
    result = _build_image_brief([])
    assert result == []


def test_build_image_brief_alt_text_preserved():
    """Alt text should be preserved exactly as provided."""
    alts = ["Complex alt text: with special chars!"]
    result = _build_image_brief(alts)
    assert result[0]["alt_text"] == alts[0]


def test_build_image_brief_third_image_also_gets_800x450():
    """All images after the first should get default 800x450 dimensions."""
    alts = ["First", "Second", "Third", "Fourth", "Fifth"]
    result = _build_image_brief(alts)
    assert result[0]["dimensions"] == "1200x628"
    for i in range(1, len(result)):
        assert result[i]["dimensions"] == "800x450", f"Image {i+1} should have 800x450"


# ── _build_publish_checklist ──────────────────────────────────────────────────

def test_build_publish_checklist_contains_title_tag_value():
    """Checklist should contain the interpolated title_tag value."""
    title = "Best AI Tools for Small Business"
    result = _build_publish_checklist(
        title_tag=title,
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="best AI tools",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert title in result


def test_build_publish_checklist_missing_title_shows_placeholder():
    """Missing title_tag should show [MISSING] placeholder."""
    result = _build_publish_checklist(
        title_tag="",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="keyword",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert "[MISSING]" in result


def test_build_publish_checklist_missing_canonical_url_shows_placeholder():
    """Missing canonical_url should show [MISSING] placeholder."""
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="",
        slug="/page",
        primary_kw="keyword",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert "[MISSING]" in result


def test_build_publish_checklist_missing_slug_shows_placeholder():
    """Missing slug should show [MISSING] placeholder."""
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="",
        primary_kw="keyword",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert "[MISSING]" in result


def test_build_publish_checklist_missing_primary_keyword_shows_placeholder():
    """Missing primary_kw should show [MISSING] placeholder."""
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert "[MISSING]" in result


def test_build_publish_checklist_contains_checkbox_markers():
    """Checklist should contain checkbox markers (- [ ])."""
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="keyword",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert "- [ ]" in result


def test_build_publish_checklist_contains_word_count():
    """Checklist should show the word count in output."""
    word_count = 3500
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="keyword",
        word_count=word_count,
        image_alts=["Hero image"],
    )
    assert str(word_count) in result


def test_build_publish_checklist_contains_seo_section():
    """Checklist should contain SEO section."""
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="keyword",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert "## SEO" in result


def test_build_publish_checklist_contains_content_section():
    """Checklist should contain CONTENT section."""
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="keyword",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert "## CONTENT" in result


def test_build_publish_checklist_contains_images_section():
    """Checklist should contain IMAGES section."""
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="keyword",
        word_count=2500,
        image_alts=["Hero image"],
    )
    assert "## IMAGES" in result


def test_build_publish_checklist_hero_alt_from_first_image():
    """Hero alt should come from first image in alts list."""
    hero_alt = "Complex hero image with special characters!"
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="keyword",
        word_count=2500,
        image_alts=[hero_alt, "Secondary"],
    )
    assert hero_alt in result


def test_build_publish_checklist_empty_image_alts_shows_placeholder():
    """Empty image_alts should show placeholder for hero alt."""
    result = _build_publish_checklist(
        title_tag="Title",
        canonical_url="https://example.com/page",
        slug="/page",
        primary_kw="keyword",
        word_count=2500,
        image_alts=[],
    )
    assert "[hero image alt text]" in result
