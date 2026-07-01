"""Change suggestions for inter-skill pipeline review gates."""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from app.exceptions import validation_error

ApprovalStatus = Literal["pending", "approved", "rejected"]


def _display_value(value: Any, field_type: str) -> Any:
    if field_type in ("tag-list", "url-list") and isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line.strip()]
    return value


def _baseline_for_field(key: str, base_inputs: dict[str, Any]) -> Any:
    if key in base_inputs:
        return base_inputs[key]
    aliases = {
        "website_url": "site_url",
        "site_url": "website_url",
        "business_niche": "brand_name",
        "brand_name": "business_niche",
    }
    alt = aliases.get(key)
    if alt and alt in base_inputs:
        return base_inputs[alt]
    return ""


def build_change_suggestions(
    *,
    field_defs: list[dict[str, Any]],
    proposed_inputs: dict[str, Any],
    base_inputs: dict[str, Any],
    existing: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Build per-field change suggestions from extracted transition inputs."""
    existing_by_key = {s["field_key"]: s for s in (existing or []) if s.get("field_key")}
    suggestions: list[dict[str, Any]] = []

    for field in field_defs:
        key = field["key"]
        field_type = field.get("type", "string")
        proposed = proposed_inputs.get(key, "")
        current = _baseline_for_field(key, base_inputs)
        current_display = _display_value(current, field_type)
        proposed_display = _display_value(proposed, field_type)

        if current_display == proposed_display:
            continue

        prior = existing_by_key.get(key)
        if prior:
            suggestions.append(
                {
                    **prior,
                    "field_label": field.get("label", key),
                    "field_type": field_type,
                    "current_content": current_display,
                    "proposed_content": proposed_display,
                }
            )
            continue

        suggestions.append(
            {
                "id": str(uuid.uuid4()),
                "field_key": key,
                "field_label": field.get("label", key.replace("_", " ").title()),
                "field_type": field_type,
                "current_content": current_display,
                "proposed_content": proposed_display,
                "edited_content": None,
                "approval_status": "pending",
            }
        )

    return suggestions


def merge_suggestion_updates(
    suggestions: list[dict[str, Any]],
    updates: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    if not updates:
        return copy.deepcopy(suggestions)
    by_id = {u["id"]: u for u in updates if u.get("id")}
    merged: list[dict[str, Any]] = []
    for suggestion in suggestions:
        update = by_id.get(suggestion["id"])
        if not update:
            merged.append(copy.deepcopy(suggestion))
            continue
        next_item = copy.deepcopy(suggestion)
        if "approval_status" in update:
            next_item["approval_status"] = update["approval_status"]
        if "edited_content" in update:
            next_item["edited_content"] = update["edited_content"]
        merged.append(next_item)
    return merged


def _resolved_value(suggestion: dict[str, Any]) -> Any:
    status = suggestion.get("approval_status", "pending")
    if status == "rejected":
        return suggestion.get("current_content")
    if status == "approved":
        edited = suggestion.get("edited_content")
        if edited is not None:
            return edited
        return suggestion.get("proposed_content")
    return None


def build_edited_inputs_from_suggestions(
    suggestions: list[dict[str, Any]],
    *,
    approve_pending: bool = False,
) -> dict[str, Any]:
    """Convert suggestion decisions into edited_inputs for merge_edited_inputs."""
    edited: dict[str, Any] = {}
    for suggestion in suggestions:
        status = suggestion.get("approval_status", "pending")
        if status == "pending":
            if approve_pending:
                edited[suggestion["field_key"]] = suggestion.get("proposed_content")
            continue
        value = _resolved_value(suggestion)
        if value is not None:
            edited[suggestion["field_key"]] = value
    return edited


def validate_suggestions_resolved(
    suggestions: list[dict[str, Any]],
    *,
    approve_pending: bool = False,
) -> None:
    if approve_pending:
        return
    pending = [s for s in suggestions if s.get("approval_status") == "pending"]
    if pending:
        raise validation_error(
            f"Resolve all change suggestions before continuing ({len(pending)} pending)",
            [],
        )


def apply_final_review_outputs(
    pipeline_id: str,
    step_results: list[dict[str, Any]],
    approved: dict[str, Any],
) -> list[dict[str, Any]]:
    """Merge approved final-review content back into step results."""
    updated = copy.deepcopy(step_results)
    if pipeline_id != "full-content-page-pipeline":
        return updated

    for step in updated:
        plugin = step.get("plugin_name")
        output = step.setdefault("output", {})
        if not isinstance(output, dict):
            continue
        structured = output.setdefault("structured", {})
        if not isinstance(structured, dict):
            structured = {}
            output["structured"] = structured

        if plugin == "Create Content" and "article_body" in approved:
            body = str(approved["article_body"] or "")
            step["output_markdown"] = body
            output["markdown"] = body
            structured["article_body"] = body
        if plugin == "On-Page SEO":
            if "meta_title" in approved:
                structured["title_tag"] = approved["meta_title"]
                structured["meta_title"] = approved["meta_title"]
            if "meta_description" in approved:
                structured["meta_description"] = approved["meta_description"]

    return updated


def append_suggestion_audit_entry(
    audit_log: list[dict[str, Any]],
    *,
    step_index: int,
    plugin_name: str,
    suggestions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "step_index": step_index,
        "plugin_name": plugin_name,
        "decisions": [
            {
                "id": s["id"],
                "field_key": s["field_key"],
                "approval_status": s.get("approval_status"),
                "used_content": _resolved_value(s) if s.get("approval_status") != "pending" else None,
            }
            for s in suggestions
        ],
    }
    return [*audit_log, entry]
