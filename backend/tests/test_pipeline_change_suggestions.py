"""Tests for pipeline inter-skill change suggestions."""

from app.services.execution.pipeline_change_suggestions import (
    build_change_suggestions,
    build_edited_inputs_from_suggestions,
    merge_suggestion_updates,
    validate_suggestions_resolved,
)
from app.services.execution.pipeline_inter_skill import build_pending_inputs


def test_build_change_suggestions_detects_keyword_diff():
    field_defs = [{"key": "keywords", "label": "Keywords", "type": "tag-list"}]
    proposed = {"keywords": "ai seo\ncontent automation"}
    base = {"keywords": "", "site_url": "https://example.com"}

    suggestions = build_change_suggestions(
        field_defs=field_defs,
        proposed_inputs=proposed,
        base_inputs=base,
    )
    assert len(suggestions) == 1
    assert suggestions[0]["field_key"] == "keywords"
    assert suggestions[0]["approval_status"] == "pending"
    assert suggestions[0]["proposed_content"] == ["ai seo", "content automation"]


def test_rejected_suggestion_reverts_to_current_content():
    suggestions = [
        {
            "id": "s1",
            "field_key": "keywords",
            "approval_status": "rejected",
            "current_content": [],
            "proposed_content": ["ai seo"],
            "edited_content": None,
        }
    ]
    edited = build_edited_inputs_from_suggestions(suggestions)
    assert edited["keywords"] == []


def test_approved_suggestion_uses_edited_content():
    suggestions = [
        {
            "id": "s1",
            "field_key": "topic",
            "approval_status": "approved",
            "current_content": "",
            "proposed_content": "AI SEO",
            "edited_content": "AI SEO Tools",
        }
    ]
    edited = build_edited_inputs_from_suggestions(suggestions)
    assert edited["topic"] == "AI SEO Tools"


def test_validate_suggestions_resolved_blocks_pending():
    suggestions = [{"id": "s1", "approval_status": "pending"}]
    try:
        validate_suggestions_resolved(suggestions)
        assert False, "expected validation_error"
    except Exception as exc:
        assert "pending" in str(exc).lower()


def test_build_pending_inputs_includes_change_suggestions():
    prior = ["### Step 1: Topic angle\n\n- ai seo tools\n- content automation"]
    step_results = [
        {
            "step": 1,
            "plugin_name": "Create Topic",
            "output_markdown": "- ai seo tools\n- content automation",
            "output": {"markdown": "- ai seo tools\n- content automation"},
        }
    ]
    pending = build_pending_inputs(
        "full-content-page-pipeline",
        0,
        {"site_url": "https://example.com", "brand_name": "Example Co", "seed_topic": "seo"},
        prior,
        step_results=step_results,
    )
    assert pending is not None
    assert pending.get("change_suggestions") == []
    assert pending.get("is_final_review") is False


def test_build_final_review_pending_skipped_for_full_content_page():
    from app.services.execution.pipeline_inter_skill import build_final_review_pending

    step_results = [
        {
            "step": 5,
            "plugin_name": "Create Content",
            "output_markdown": "# Article\n\nBody text here.",
            "output": {"markdown": "# Article\n\nBody text here."},
        },
        {
            "step": 6,
            "plugin_name": "On-Page SEO",
            "output_markdown": "SEO output",
            "output": {
                "structured": {
                    "title_tag": "Best SEO Tools",
                    "meta_description": "A guide to SEO tools.",
                }
            },
        },
    ]
    pending = build_final_review_pending(
        "full-content-page-pipeline",
        {"site_url": "https://example.com"},
        step_results,
    )
    assert pending is None


def test_merge_suggestion_updates_preserves_unknown_fields():
    base = [
        {
            "id": "a",
            "field_key": "topic",
            "approval_status": "pending",
            "proposed_content": "x",
            "current_content": "",
        }
    ]
    merged = merge_suggestion_updates(base, [{"id": "a", "approval_status": "approved"}])
    assert merged[0]["approval_status"] == "approved"
    assert merged[0]["field_key"] == "topic"
