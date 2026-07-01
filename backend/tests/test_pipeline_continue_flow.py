"""Integration-style test for continue payload merging (no database)."""

from app.services.execution.pipeline_inter_skill import (
    build_pending_inputs,
    get_transition_field_defs,
    merge_edited_inputs,
)


def test_continue_flow_preserves_edited_keyword_for_next_step():
    """Simulates: step 1 done → review → user edits keywords → continue payload."""
    base = {
        "site_url": "https://example.com",
        "brand_name": "Example Co",
        "seed_topic": "seo automation",
    }
    prior = [
        "### Step 1: Topic angle\n\n- ai seo tools\n- content automation",
    ]
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
        base,
        prior,
        step_results=step_results,
    )
    assert pending is not None

    field_defs = pending["field_definitions"] or get_transition_field_defs(
        "full-content-page-pipeline",
        pending["step_index"] - 2,
    )
    edited = {"keywords": ["ai seo tools", "user added keyword"], "business_niche": "Example Co"}
    overrides, edit_count = merge_edited_inputs(pending["inputs"], edited, field_defs)

    assert edit_count >= 1
    assert "user added keyword" in overrides["keywords"]
    assert overrides["business_niche"] == "Example Co"
    assert overrides["website_url"] == "https://example.com"
