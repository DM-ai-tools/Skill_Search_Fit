"""Inter-skill review field metadata and input preparation per pipeline transition."""

from __future__ import annotations

import copy
from typing import Any

from app.services.execution.pipeline_constants import FULL_CONTENT_PAGE_PIPELINE_ID
from app.services.execution.pipeline_change_suggestions import build_change_suggestions
from app.services.execution.pipeline_output_extractors import apply_transition_extractors

FieldDef = dict[str, Any]

# Transition keyed by (pipeline_id, from_step_index_0based)
_TRANSITION_FIELDS: dict[tuple[str, int], list[FieldDef]] = {
    # ── Full Content Page Pipeline ───────────────────────────────────────────
    ("full-content-page-pipeline", 0): [
        {
            "key": "keywords",
            "label": "Seed Keywords",
            "description": "Keywords from topic research, passed into clustering",
            "type": "tag-list",
            "editNote": "Add, remove, or modify keywords before clustering.",
            "editable": True,
            "required": True,
        },
        {
            "key": "business_niche",
            "label": "Business / Niche Context",
            "description": "Niche context for keyword clustering",
            "type": "string",
            "editable": True,
            "required": True,
        },
    ],
    ("full-content-page-pipeline", 1): [
        {
            "key": "seed_keywords",
            "label": "Primary Keyword Clusters",
            "description": "Cluster primary keywords passed into content strategy",
            "type": "textarea",
            "editNote": "Edit the primary cluster keywords carefully.",
            "editable": True,
            "required": True,
        },
        {
            "key": "business_name",
            "label": "Business Name",
            "description": "Brand name for strategy",
            "type": "string",
            "editable": True,
            "required": True,
        },
        {
            "key": "competitors",
            "label": "Competitors",
            "description": "Competitor context for strategy",
            "type": "textarea",
            "editable": True,
        },
    ],
    ("full-content-page-pipeline", 2): [
        {
            "key": "target_keyword",
            "label": "Target Keyword",
            "description": "Primary keyword for the article brief",
            "type": "string",
            "editable": True,
            "required": True,
        },
        {
            "key": "desired_word_count",
            "label": "Target Word Count",
            "description": "Minimum word count for competitive depth",
            "type": "number",
            "editable": True,
            "required": True,
        },
        {
            "key": "competitor_urls",
            "label": "Competitor URLs",
            "description": "Pages to beat for this brief",
            "type": "url-list",
            "editable": True,
        },
        {
            "key": "unique_angle",
            "label": "Differentiation Angle",
            "description": "Strategy context and angle for the brief",
            "type": "textarea",
            "editable": True,
        },
    ],
    ("full-content-page-pipeline", 3): [
        {
            "key": "topic",
            "label": "Article Topic",
            "description": "Topic title for the draft",
            "type": "string",
            "editable": True,
            "required": True,
        },
        {
            "key": "primary_keyword",
            "label": "Primary Keyword",
            "description": "Main ranking keyword",
            "type": "string",
            "editable": True,
            "required": True,
        },
        {
            "key": "target_word_count",
            "label": "Target Word Count",
            "description": "Article length target",
            "type": "number",
            "editable": True,
            "required": True,
        },
        {
            "key": "content_brief",
            "label": "Article Brief",
            "description": "Outline and requirements for the article",
            "type": "textarea",
            "editable": True,
            "required": True,
        },
    ],
    ("full-content-page-pipeline", 4): [
        {
            "key": "page_content",
            "label": "Article Body",
            "description": "Full article text for on-page SEO optimization",
            "type": "textarea",
            "editable": True,
            "required": True,
        },
        {
            "key": "target_keyword",
            "label": "Target Keyword",
            "description": "Primary SEO keyword",
            "type": "string",
            "editable": True,
            "required": True,
        },
        {
            "key": "page_url",
            "label": "Page URL",
            "description": "Canonical page URL",
            "type": "string",
            "editable": True,
            "required": True,
        },
    ],
    ("full-content-page-pipeline", 5): [
        {
            "key": "page_inventory",
            "label": "Page Inventory",
            "description": "Optimized page content for link analysis",
            "type": "textarea",
            "editable": True,
            "required": True,
        },
        {
            "key": "topic_clusters",
            "label": "Topic Clusters",
            "description": "Hub topics for internal linking",
            "type": "string",
            "editable": True,
        },
        {
            "key": "priority_pages",
            "label": "Priority Pages",
            "description": "Pages that need more internal links",
            "type": "string",
            "editable": True,
        },
    ],
    # ── Content Production Pipeline ──────────────────────────────────────────
    ("content-production-pipeline", 0): [
        {"key": "seed", "label": "Seed Topic", "type": "string", "editable": True, "required": True},
        {"key": "business_niche", "label": "Business Niche", "type": "string", "editable": True, "required": True},
        {"key": "competitors", "label": "Competitor URLs", "type": "url-list", "editable": True},
    ],
    ("content-production-pipeline", 1): [
        {"key": "keywords", "label": "Seed Keywords", "type": "tag-list", "editable": True, "required": True},
        {"key": "business_niche", "label": "Business Niche", "type": "string", "editable": True, "required": True},
    ],
    ("content-production-pipeline", 2): [
        {"key": "target_keyword", "label": "Target Keyword", "type": "string", "editable": True, "required": True},
        {"key": "competitor_urls", "label": "Competitor URLs", "type": "url-list", "editable": True},
    ],
    ("content-production-pipeline", 3): [
        {"key": "topic", "label": "Article Topic", "type": "string", "editable": True, "required": True},
        {"key": "content_brief", "label": "Content Brief", "type": "textarea", "editable": True, "required": True},
        {"key": "target_word_count", "label": "Target Word Count", "type": "number", "editable": True, "required": True},
    ],
    ("content-production-pipeline", 4): [
        {"key": "page_inventory", "label": "Page Inventory", "type": "textarea", "editable": True, "required": True},
        {"key": "topic_clusters", "label": "Topic Clusters", "type": "textarea", "editable": True},
    ],
    # ── Audit → Fix → Verify ─────────────────────────────────────────────────
    ("audit-fix-verify", 0): [
        {"key": "known_issues", "label": "Audit Findings", "type": "textarea", "editable": True, "required": True},
        {"key": "pages_to_audit", "label": "Pages to Fix", "type": "string", "editable": True, "required": True},
    ],
    ("audit-fix-verify", 1): [
        {"key": "known_issues", "label": "Technical Issues", "type": "textarea", "editable": True, "required": True},
    ],
    ("audit-fix-verify", 2): [
        {"key": "codebase_content", "label": "Link Context", "type": "textarea", "editable": True, "required": True},
    ],
    ("audit-fix-verify", 3): [
        {"key": "page_content", "label": "Page Content", "type": "textarea", "editable": True, "required": True},
        {"key": "target_keyword", "label": "Target Keyword", "type": "string", "editable": True, "required": True},
    ],
    ("audit-fix-verify", 4): [
        {"key": "page_content", "label": "Optimized Content", "type": "textarea", "editable": True, "required": True},
    ],
    # ── AI Visibility Flywheel ───────────────────────────────────────────────
    ("ai-visibility-flywheel", 0): [
        {"key": "target_prompts", "label": "Target AI Prompts", "type": "textarea", "editable": True, "required": True},
        {"key": "competitors", "label": "Competitor Brands", "type": "tag-list", "editable": True},
    ],
    ("ai-visibility-flywheel", 1): [
        {"key": "competitors", "label": "Competitor Context", "type": "textarea", "editable": True, "required": True},
    ],
    ("ai-visibility-flywheel", 2): [
        {"key": "topic", "label": "Content Topic", "type": "string", "editable": True, "required": True},
        {"key": "content_brief", "label": "GEO Brief", "type": "textarea", "editable": True, "required": True},
    ],
    ("ai-visibility-flywheel", 3): [
        {"key": "page_content", "label": "Content for Schema", "type": "textarea", "editable": True, "required": True},
    ],
}


def _generic_fields(inputs: dict[str, Any]) -> list[FieldDef]:
    fields: list[FieldDef] = []
    for key, value in inputs.items():
        if key.startswith("_"):
            continue
        ftype = "textarea" if isinstance(value, str) and len(str(value)) > 120 else "string"
        if isinstance(value, list):
            ftype = "tag-list"
        fields.append(
            {
                "key": key,
                "label": key.replace("_", " ").title(),
                "description": "Input for the next pipeline step",
                "type": ftype,
                "editable": True,
                "required": True,
            }
        )
    return fields


def get_transition_field_defs(pipeline_id: str, completed_step_index: int) -> list[FieldDef]:
    """completed_step_index is 0-based index of the step that just finished."""
    return copy.deepcopy(
        _TRANSITION_FIELDS.get((pipeline_id, completed_step_index)) or []
    )


def _split_lines(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]


def _join_lines(values: list[str]) -> str:
    return "\n".join(values)


def _normalize_for_compare(value: Any, field_type: str) -> Any:
    if field_type in ("tag-list", "url-list") and isinstance(value, str):
        return _split_lines(value)
    return value


def merge_edited_inputs(
    original: dict[str, Any],
    edited: dict[str, Any],
    field_defs: list[FieldDef],
) -> tuple[dict[str, Any], int]:
    merged = copy.deepcopy(original)
    edit_count = 0
    for field in field_defs:
        key = field["key"]
        if key not in edited:
            continue
        new_val = edited[key]
        old_val = merged.get(key)
        field_type = field.get("type", "string")
        if _normalize_for_compare(new_val, field_type) != _normalize_for_compare(old_val, field_type):
            edit_count += 1
        if field_type == "tag-list" and isinstance(new_val, list):
            merged[key] = _join_lines(new_val)
        elif field_type == "url-list" and isinstance(new_val, list):
            merged[key] = _join_lines(new_val)
        else:
            merged[key] = new_val
    return merged, edit_count


def map_next_step_inputs(
    pipeline_id: str,
    completed_step_index: int,
    base_inputs: dict[str, Any],
    prior_markdown: list[str],
    next_plugin_name: str,
    *,
    step_results: list[dict[str, Any]] | None = None,
    competitor_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build and enrich inputs for the next plugin from prior step outputs."""
    auto_inputs = build_step_inputs(next_plugin_name, base_inputs, prior_markdown)
    return apply_transition_extractors(
        pipeline_id,
        completed_step_index,
        auto_inputs,
        step_results=step_results,
        base_inputs=base_inputs,
        prior_markdown=prior_markdown,
        competitor_data=competitor_data,
    )

def build_pending_inputs(
    pipeline_id: str,
    completed_step_index: int,
    base_inputs: dict[str, Any],
    prior_markdown: list[str],
    step_results: list[dict[str, Any]] | None = None,
    competitor_data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    pipeline = get_pipeline(pipeline_id)
    if not pipeline:
        return None
    next_index = completed_step_index + 1
    if next_index >= len(pipeline["steps"]):
        return None

    next_step = pipeline["steps"][next_index]
    auto_inputs = map_next_step_inputs(
        pipeline_id,
        completed_step_index,
        base_inputs,
        prior_markdown,
        next_step["plugin_name"],
        step_results=step_results,
        competitor_data=competitor_data,
    )
    field_defs = get_transition_field_defs(pipeline_id, completed_step_index)
    if not field_defs:
        field_defs = _generic_fields(auto_inputs)

    fields_with_values = []
    for f in field_defs:
        key = f["key"]
        val = auto_inputs.get(key, "")
        display_val = val
        if f.get("type") == "tag-list" and isinstance(val, str):
            display_val = _split_lines(val) if val else []
        elif f.get("type") == "url-list" and isinstance(val, str):
            display_val = _split_lines(val) if val else []
        fields_with_values.append({**f, "value": display_val})

    return {
        "step_index": next_index + 1,
        "plugin_name": next_step["plugin_name"],
        "skill_name": next_step["label"],
        "inputs": auto_inputs,
        "field_definitions": fields_with_values,
        "change_suggestions": [],
        "is_final_review": False,
    }


# Final review fields shown once after all pipeline steps complete.
_FINAL_REVIEW_FIELDS: dict[str, list[FieldDef]] = {
    "full-content-page-pipeline": [
        {
            "key": "article_body",
            "label": "Article Draft",
            "description": "Full article content from the Create Content step",
            "type": "textarea",
            "editable": True,
            "required": True,
        },
        {
            "key": "meta_title",
            "label": "Page Title",
            "description": "SEO title from the On-Page SEO step",
            "type": "string",
            "editable": True,
            "required": True,
        },
        {
            "key": "meta_description",
            "label": "Meta Description",
            "description": "Meta description from the On-Page SEO step",
            "type": "textarea",
            "editable": True,
            "required": True,
        },
    ],
}


def _step_by_plugin_name(
    step_results: list[dict[str, Any]] | None,
    plugin_name: str,
) -> dict[str, Any] | None:
    if not step_results:
        return None
    for step in reversed(step_results):
        if step.get("plugin_name") == plugin_name:
            return step
    return None


def _structured_field(step: dict[str, Any] | None, key: str, fallback: str = "") -> str:
    if not step:
        return fallback
    output = step.get("output") or {}
    if not isinstance(output, dict):
        return fallback
    structured = output.get("structured") or {}
    if not isinstance(structured, dict):
        return fallback
    value = structured.get(key)
    return str(value).strip() if value not in (None, "") else fallback


def _extract_final_review_proposed(
    pipeline_id: str,
    step_results: list[dict[str, Any]] | None,
    base_inputs: dict[str, Any],
) -> dict[str, Any]:
    from app.services.execution.pipeline_output_extractors import extract_article_body

    if pipeline_id == "full-content-page-pipeline":
        content_step = _step_by_plugin_name(step_results, "Create Content")
        seo_step = _step_by_plugin_name(step_results, "On-Page SEO")
        return {
            "article_body": extract_article_body(content_step),
            "meta_title": _structured_field(seo_step, "title_tag")
            or _structured_field(seo_step, "meta_title"),
            "meta_description": _structured_field(seo_step, "meta_description"),
        }
    return {}


def build_final_review_pending(
    pipeline_id: str,
    base_inputs: dict[str, Any],
    step_results: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    """Build a post-completion review gate with change suggestions (pipeline end only)."""
    # Full Content Page goes straight to the unified report — no final review screen.
    if pipeline_id == FULL_CONTENT_PAGE_PIPELINE_ID:
        return None

    pipeline = get_pipeline(pipeline_id)
    if not pipeline:
        return None

    field_defs = copy.deepcopy(_FINAL_REVIEW_FIELDS.get(pipeline_id) or [])
    if not field_defs:
        return None

    proposed = _extract_final_review_proposed(pipeline_id, step_results, base_inputs)
    if not any(str(v).strip() for v in proposed.values()):
        return None

    empty_baseline = {key: "" for key in proposed}
    change_suggestions = build_change_suggestions(
        field_defs=field_defs,
        proposed_inputs=proposed,
        base_inputs=empty_baseline,
    )
    if not change_suggestions:
        return None

    fields_with_values = []
    for field in field_defs:
        key = field["key"]
        val = proposed.get(key, "")
        display_val = val
        if field.get("type") == "textarea":
            display_val = str(val or "")
        fields_with_values.append({**field, "value": display_val})

    return {
        "step_index": len(pipeline["steps"]),
        "plugin_name": "Pipeline Review",
        "skill_name": "Final change review",
        "inputs": proposed,
        "field_definitions": fields_with_values,
        "change_suggestions": change_suggestions,
        "is_final_review": True,
    }
