"""Tests for pipeline step input mapping and autofill helpers."""

from app.data.pipelines import _keywords_from_prior_steps, build_step_inputs
from app.services.execution.pipeline_input_autofill import _boost_pipeline_fields, _merge_base_inputs
from app.services.validation import collect_plugin_input_errors

CONTENT_STRATEGY_FIELDS = [
    {"name": "business_name", "label": "Business Name", "type": "text", "required": True},
    {"name": "business_description", "label": "What Does Your Business Do?", "type": "textarea", "required": True},
    {"name": "target_audience", "label": "Target Audience", "type": "textarea", "required": True},
    {"name": "seed_keywords", "label": "Seed Keywords / Core Topics", "type": "textarea", "required": True},
    {"name": "competitors", "label": "Competitors", "type": "textarea", "required": True},
    {"name": "publishing_cadence", "label": "Publishing Cadence", "type": "select", "required": True, "options": [
        {"value": "weekly", "label": "Weekly"},
        {"value": "growth", "label": "Growth"},
        {"value": "authority", "label": "Authority"},
    ]},
    {"name": "planning_horizon", "label": "Planning Horizon", "type": "select", "required": True, "options": [
        {"value": "4", "label": "4 weeks"},
        {"value": "8", "label": "8 weeks"},
        {"value": "12", "label": "12 weeks"},
    ]},
]


def test_content_strategy_step_inputs_use_plugin_field_names():
    base = {
        "site_url": "https://example.com",
        "brand_name": "Example Co",
        "business_description": "SEO software for agencies",
        "seed_topic": "seo automation",
        "competitors": "rival.com",
        "target_audience": "Agency owners",
    }
    prior = [
        "### Step 1: Topic angle\n\nai seo tools\ncontent automation",
        "### Step 2: Keyword clusters\n\nkeyword research software",
    ]
    inputs = build_step_inputs("Content Strategy", base, prior)

    assert inputs["business_name"] == "Example Co"
    assert inputs["business_description"] == "SEO software for agencies"
    assert "ai seo tools" in inputs["seed_keywords"]
    assert "keyword research software" in inputs["seed_keywords"]
    assert inputs["competitors"] == "rival.com"
    assert inputs["publishing_cadence"] == "growth"
    assert inputs["planning_horizon"] == "8"
    assert not collect_plugin_input_errors(CONTENT_STRATEGY_FIELDS, inputs)


def test_keywords_from_prior_steps_extracts_short_lines():
    prior = ["### Step 1\n\n- ai seo tools\n- content automation\n\nLong paragraph that should not be treated as a keyword because it has too many words in one line for our extractor"]
    keywords = _keywords_from_prior_steps(prior)
    assert "ai seo tools" in keywords
    assert "content automation" in keywords


def test_boost_pipeline_fields_fills_competitors_and_defaults():
    enriched = {
        "site_url": "https://example.com",
        "_website_intelligence": {
            "analysis": {"company_name": "Example Co", "description": "We build SEO tools"},
            "competitors": [{"domain": "rival.com"}],
        },
    }
    boosted = _boost_pipeline_fields(
        {"business_name": "Example Co", "target_audience": "Marketers"},
        enriched,
        [],
    )
    assert boosted["competitors"]
    assert boosted["publishing_cadence"] == "growth"
    assert boosted["planning_horizon"] == "8"


def test_merge_base_inputs_pulls_cache_values():
    merged = _merge_base_inputs(
        {"business_name": "Example Co"},
        {
            "business_description": "SEO platform",
            "seed_keywords": "seo tools\nkeyword research",
            "competitors": "rival.com",
        },
    )
    assert merged["business_description"] == "SEO platform"
    assert "seo tools" in merged["seed_keywords"]
