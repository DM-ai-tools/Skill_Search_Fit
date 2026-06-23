"""Unit tests for pipeline_synthesizer — sync helpers only, no I/O required."""

import asyncio
import pytest

from app.services.reports.pipeline_synthesizer import (
    PIPELINE_CONFIGS,
    _combine_step_markdown,
    _extract_final_deliverable,
    _extract_metrics,
    synthesize_pipeline_report,
)

SAMPLE_STEPS = [
    {
        "step": 1,
        "label": "Topic angle & seed keywords",
        "plugin_name": "Create Topic",
        "output_markdown": "## Topic Research\n\nBest AI tools for small business.\n",
    },
    {
        "step": 2,
        "label": "Keyword groups & clusters",
        "plugin_name": "Keyword Clustering",
        "output_markdown": "## Clusters\n\nPrimary keyword: best ai tools for small business\n",
    },
    {
        "step": 3,
        "label": "Content pillars & page map",
        "plugin_name": "Content Strategy",
        "output_markdown": "## Strategy\n\nPillar page approach recommended.\n",
    },
]


# ── PIPELINE_CONFIGS ──────────────────────────────────────────────────────────

def test_all_four_pipelines_configured():
    expected = {
        "full-content-page-pipeline",
        "content-production-pipeline",
        "audit-fix-verify",
        "ai-visibility-flywheel",
    }
    assert expected.issubset(set(PIPELINE_CONFIGS.keys()))


def test_each_pipeline_has_at_least_four_sections():
    for pid, cfg in PIPELINE_CONFIGS.items():
        assert len(cfg["sections"]) >= 4, f"{pid} must have >=4 sections"


def test_full_content_pipeline_has_seven_source_steps():
    cfg = PIPELINE_CONFIGS["full-content-page-pipeline"]
    all_steps = {n for s in cfg["sections"] for n in s["source_steps"]}
    assert all_steps == {1, 2, 3, 4, 5, 6, 7}


def test_content_production_pipeline_has_final_deliverable():
    assert PIPELINE_CONFIGS["content-production-pipeline"]["has_final_deliverable"] is True


def test_audit_fix_verify_has_no_final_deliverable():
    assert PIPELINE_CONFIGS["audit-fix-verify"]["has_final_deliverable"] is False


# ── _combine_step_markdown ────────────────────────────────────────────────────

def test_combine_selects_only_requested_steps():
    result = _combine_step_markdown(SAMPLE_STEPS, [1, 2])
    assert "Topic angle" in result
    assert "Keyword groups" in result
    assert "Content pillars" not in result


def test_combine_returns_empty_string_when_no_match():
    result = _combine_step_markdown(SAMPLE_STEPS, [99])
    assert result == ""


def test_combine_single_step_has_no_separator():
    result = _combine_step_markdown(SAMPLE_STEPS, [1])
    assert "---" not in result


def test_combine_two_steps_joined_by_separator():
    result = _combine_step_markdown(SAMPLE_STEPS, [1, 2])
    assert "---" in result


def test_combine_skips_empty_markdown():
    steps = [
        {"step": 1, "label": "A", "plugin_name": "X", "output_markdown": "Content"},
        {"step": 2, "label": "B", "plugin_name": "Y", "output_markdown": "   "},
    ]
    result = _combine_step_markdown(steps, [1, 2])
    assert "A" in result
    assert "B" not in result


# ── _extract_metrics ──────────────────────────────────────────────────────────

def test_extract_word_count():
    md = "The article has a word count: 1850 words total."
    assert _extract_metrics(md)["words_written"] == 1850


def test_extract_seo_score_with_slash():
    md = "Overall SEO score: 74/100"
    assert _extract_metrics(md)["score"] == 74


def test_extract_score_without_slash():
    md = "Site score: 68"
    assert _extract_metrics(md)["score"] == 68


def test_extract_metrics_empty_on_no_match():
    assert _extract_metrics("No numbers here at all.") == {}


def test_extract_slash_score_as_fallback():
    md = "You achieved 82/100 on this audit."
    metrics = _extract_metrics(md)
    assert metrics.get("score") == 82


# ── _extract_final_deliverable ────────────────────────────────────────────────

def test_extract_deliverable_from_create_content_step():
    steps = [
        {
            "step": 5,
            "plugin_name": "Create Content",
            "output_markdown": (
                "# Best AI Tools for Small Business\n\n"
                "Title tag: Best AI Tools for Small Business 2026\n"
                "Meta description: Discover the top AI tools to grow your business.\n"
                "Body content here."
            ),
        }
    ]
    result = _extract_final_deliverable(steps)
    assert result is not None
    assert "Best AI Tools for Small Business" in result["h1"]
    assert "Best AI Tools for Small Business 2026" in result["title_tag"]
    assert "Discover the top AI tools" in result["meta_description"]
    assert result["article_body"]


def test_extract_deliverable_prefers_on_page_seo_over_create_content():
    steps = [
        {
            "step": 5,
            "plugin_name": "Create Content",
            "output_markdown": "# Old H1\nTitle tag: Old Title\nMeta description: Old meta.\n",
        },
        {
            "step": 6,
            "plugin_name": "On-Page SEO",
            "output_markdown": "# Optimised H1\nTitle tag: Optimised Title\nMeta description: Optimised meta.\n",
        },
    ]
    result = _extract_final_deliverable(steps)
    assert result is not None
    assert "Optimised" in result["h1"]


def test_extract_deliverable_returns_none_when_no_content_step():
    steps = [
        {"step": 1, "plugin_name": "SEO Audit", "output_markdown": "Audit results here."}
    ]
    assert _extract_final_deliverable(steps) is None


# ── synthesize_pipeline_report (fallback path — no AI call) ──────────────────

def test_unknown_pipeline_returns_single_combined_section():
    steps = [
        {"step": 1, "label": "Test step", "plugin_name": "TestPlugin", "output_markdown": "Hello world"}
    ]
    result = asyncio.run(synthesize_pipeline_report("unknown-xyz", "Unknown Pipeline", steps))
    assert result["pipeline_id"] == "unknown-xyz"
    assert len(result["sections"]) == 1
    assert result["sections"][0]["id"] == "combined"
    assert result["final_deliverable"] is None


def test_known_pipeline_returns_correct_section_count():
    steps = [
        {"step": i, "label": f"Step {i}", "plugin_name": f"Plugin{i}", "output_markdown": f"Output {i}"}
        for i in range(1, 8)
    ]
    result = asyncio.run(
        synthesize_pipeline_report("full-content-page-pipeline", "Full Content Page Pipeline", steps)
    )
    assert len(result["sections"]) == 5
    assert result["sections"][0]["id"] == "opportunity"
    assert result["sections"][2]["id"] == "article"
    assert result["sections"][2]["expandable"] is True
    assert result["pipeline_purpose"] != ""


def test_domain_appears_in_outcome():
    steps = [
        {"step": 1, "label": "A", "plugin_name": "P", "output_markdown": "x"}
    ]
    result = asyncio.run(
        synthesize_pipeline_report("unknown", "Test", steps, domain="example.com")
    )
    assert "example.com" in result["headline_summary"]["outcome"]
