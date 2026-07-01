"""Tests for inter-skill review input preparation."""

from app.services.execution.pipeline_inter_skill import (
    build_pending_inputs,
    merge_edited_inputs,
)
from app.services.execution.pipeline_output_extractors import (
    extract_create_topic_keywords,
    extract_cluster_primary_keywords,
)


def test_merge_edited_inputs_applies_tag_list_edits():
    original = {"keywords": "alpha\nbeta", "seed": "topic angle"}
    edited = {"keywords": ["alpha", "gamma"]}
    field_defs = [
        {"key": "keywords", "type": "tag-list"},
        {"key": "seed", "type": "textarea"},
    ]
    merged, edit_count = merge_edited_inputs(original, edited, field_defs)
    assert merged["keywords"] == "alpha\ngamma"
    assert merged["seed"] == "topic angle"
    assert edit_count == 1


def test_merge_edited_inputs_no_edits_when_skip():
    original = {"keywords": "alpha\nbeta", "seed": "topic"}
    merged, edit_count = merge_edited_inputs(original, {}, [{"key": "keywords", "type": "tag-list"}])
    assert merged == original
    assert edit_count == 0


def test_merge_edited_inputs_normalizes_tag_list_comparison():
    original = {"keywords": "a\nb"}
    edited = {"keywords": ["a", "b"]}
    field_defs = [{"key": "keywords", "type": "tag-list"}]
    _, edit_count = merge_edited_inputs(original, edited, field_defs)
    assert edit_count == 0


def test_build_pending_inputs_uses_structured_extraction():
    prior = ["### Step 1: Topic angle\n\n- ai seo tools\n- content automation"]
    step_results = [
        {
            "step": 1,
            "plugin_name": "Create Topic",
            "output_markdown": "- ai seo tools\n- content automation",
            "output": {"markdown": "- ai seo tools\n- content automation"},
        }
    ]
    base = {
        "site_url": "https://example.com",
        "brand_name": "Example Co",
        "seed_topic": "fallback seed",
    }
    pending = build_pending_inputs(
        "full-content-page-pipeline",
        0,
        base,
        prior,
        step_results=step_results,
    )
    assert pending is not None
    assert pending["plugin_name"] == "Keyword Clustering"
    assert "ai seo tools" in str(pending["inputs"].get("keywords", ""))
    assert any(f["key"] == "keywords" for f in pending["field_definitions"])


def test_extract_create_topic_keywords_from_bullets():
    step = {
        "output_markdown": "- keyword research\n- topic clusters",
        "output": {"markdown": "- keyword research\n- topic clusters"},
    }
    keywords = extract_create_topic_keywords(step)
    assert "keyword research" in keywords
    assert "topic clusters" in keywords


def test_extract_cluster_primary_keywords_from_table():
    step = {
        "output_markdown": "| Cluster | Primary |\n| --- | --- |\n| A | seo tools |",
        "output": {},
    }
    keywords = extract_cluster_primary_keywords(step)
    assert "seo tools" in keywords


def test_build_pending_inputs_uses_competitor_word_count():
    prior = ["### Step 1\n\nstrategy"]
    step_results = [
        {
            "step": 1,
            "plugin_name": "Keyword Clustering",
            "output_markdown": "Primary: seo tools",
            "output": {},
        }
    ]
    base = {"site_url": "https://example.com", "brand_name": "Example Co", "seed_topic": "seo"}
    pending = build_pending_inputs(
        "full-content-page-pipeline",
        1,
        base,
        prior,
        step_results=step_results,
        competitor_data={"minimum_competitive_word_count": 2200},
    )
    assert pending is not None
    assert pending["inputs"].get("seed_keywords")
    # Next step after clustering is Content Strategy — word count applies on brief transition
    pending_brief = build_pending_inputs(
        "full-content-page-pipeline",
        2,
        base,
        prior + ["### Step 2\n\n| Keyword | seo tools |"],
        step_results=[
            *step_results,
            {
                "step": 2,
                "plugin_name": "Content Strategy",
                "output_markdown": "Target keyword: seo tools",
                "output": {},
            },
        ],
        competitor_data={"minimum_competitive_word_count": 2200},
    )
    assert pending_brief is not None
    assert pending_brief["inputs"].get("desired_word_count") == 2200


def test_map_next_step_inputs_centralizes_mapping():
    from app.services.execution.pipeline_inter_skill import map_next_step_inputs

    base = {"site_url": "https://example.com", "brand_name": "Co", "seed_topic": "seo"}
    prior = ["### Step 1\n\n- ai tools"]
    mapped = map_next_step_inputs(
        "full-content-page-pipeline",
        0,
        base,
        prior,
        "Keyword Clustering",
        step_results=[
            {
                "step": 1,
                "plugin_name": "Create Topic",
                "output_markdown": "- ai tools",
                "output": {},
            }
        ],
    )
    assert "ai tools" in str(mapped.get("keywords", ""))

    prior = [
        "### Step 1\n\nai topic",
        "### Step 2\n\n| Primary | seo automation |",
    ]
    step_results = [
        {"step": 1, "plugin_name": "Create Topic", "output_markdown": "ai topic", "output": {}},
        {
            "step": 2,
            "plugin_name": "Keyword Clustering",
            "output_markdown": "Primary: seo automation",
            "output": {},
        },
    ]
    base = {"site_url": "https://example.com", "brand_name": "Example Co", "seed_topic": "seo"}
    pending = build_pending_inputs(
        "full-content-page-pipeline",
        1,
        base,
        prior,
        step_results=step_results,
    )
    assert pending is not None
    assert pending["plugin_name"] == "Content Strategy"
    keys = {f["key"] for f in pending["field_definitions"]}
    assert "seed_keywords" in keys
    assert "business_name" in keys
