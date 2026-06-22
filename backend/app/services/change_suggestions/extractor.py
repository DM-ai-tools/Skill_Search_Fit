"""Server-side Claude extraction: report text → validated Change[]."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any

import anthropic
from pydantic import ValidationError

from app.config import settings
from app.schemas.change_suggestions import ChangeSchema, ExtractedChangesEnvelope
from app.services.change_suggestions.json_utils import parse_json_object, strip_json_fences
from app.services.change_suggestions.plugin_specs import get_change_count_bounds, get_extraction_addon

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent / "extractor_system_prompt.txt"
_SYSTEM = _PROMPT_PATH.read_text(encoding="utf-8")

_USER_TEMPLATE = """\
Extract all discrete, publish-ready changes from the following audit report.
Return 3-10 focused changes. Every proposedContent must be final copy ready
to publish — not instructions.

IMPORTANT: If the report contains a "## Implementation Changes" section with
"Proposed Change:" fields, copy proposedContent VERBATIM from those fields.
Do not paraphrase recommendations from other sections into instructions.

---REPORT START---
{report_content}
---REPORT END---
"""

_EXTRACTION_TOOL_NAME = "submit_extracted_changes"


def _extraction_tool() -> dict[str, Any]:
    item = {
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "Human-readable page name"},
            "pageUrl": {"type": "string", "description": "Full https URL of the page"},
            "changeType": {
                "type": "string",
                "enum": ["metadata", "schema", "content", "technical", "capture-form"],
            },
            "priority": {"type": "string", "enum": ["High", "Medium", "Low"]},
            "impactScore": {"type": "integer", "minimum": 1, "maximum": 100},
            "destination": {"type": "string", "enum": ["WordPress", "Webflow", "Wix"]},
            "fieldLabel": {"type": "string"},
            "currentState": {"type": "string"},
            "proposedContent": {
                "type": "string",
                "description": "Final publish-ready content only — no instructions",
            },
            "sourceExcerpt": {
                "type": "string",
                "description": "One short sentence from the report, max 120 characters",
            },
        },
        "required": [
            "location",
            "pageUrl",
            "changeType",
            "priority",
            "destination",
            "fieldLabel",
            "currentState",
            "proposedContent",
        ],
    }
    return {
        "name": _EXTRACTION_TOOL_NAME,
        "description": "Submit extracted publish-ready SEO/content changes from the audit report.",
        "input_schema": {
            "type": "object",
            "properties": {"changes": {"type": "array", "items": item}},
            "required": ["changes"],
        },
    }


def _assign_ids(data: dict[str, Any]) -> dict[str, Any]:
    """Ensure every change has a unique UUID id regardless of what Claude produced."""
    for item in data.get("changes", []):
        item["id"] = str(uuid.uuid4())
    return data


def _validate_envelope(raw: dict[str, Any], min_count: int) -> list[ChangeSchema]:
    raw = _assign_ids(raw)
    try:
        envelope = ExtractedChangesEnvelope.model_validate(raw)
    except ValidationError as exc:
        raise ValueError(f"Schema validation failed: {exc}") from exc

    if not envelope.changes:
        raise ValueError("Model returned zero changes — cannot proceed with empty extraction.")

    if len(envelope.changes) < min_count:
        raise ValueError(
            f"Model returned only {len(envelope.changes)} changes — minimum {min_count} required."
        )

    return envelope.changes


def _parse_response_content(content: list[Any], min_count: int) -> list[ChangeSchema]:
    tool_block = next(
        (block for block in content if getattr(block, "type", None) == "tool_use"),
        None,
    )
    if tool_block and getattr(tool_block, "name", None) == _EXTRACTION_TOOL_NAME:
        payload = tool_block.input
        if not isinstance(payload, dict):
            raise ValueError("Tool response was not a JSON object")
        return _validate_envelope(payload, min_count)

    text_parts = [
        block.text
        for block in content
        if getattr(block, "type", None) == "text" and getattr(block, "text", None)
    ]
    if not text_parts:
        raise ValueError("Model returned no tool output or text content")

    text = strip_json_fences("\n".join(text_parts).strip())
    raw = parse_json_object(text)
    return _validate_envelope(raw, min_count)


async def extract_changes(raw_content: str, plugin_slug: str | None = None) -> list[ChangeSchema]:
    """
    Call Claude, validate output against ExtractedChangesEnvelope.
    Retries once on schema failure with the validation error appended.
    Raises ValueError if both attempts fail.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    min_count, max_count = get_change_count_bounds(plugin_slug)
    system = _SYSTEM + get_extraction_addon(plugin_slug)
    user_msg = _USER_TEMPLATE.format(report_content=raw_content).replace(
        "Return 3-10 focused changes",
        f"Return {min_count}-{max_count} focused changes",
    )

    extraction_max_tokens = max(
        settings.change_suggestions_extraction_max_tokens,
        settings.anthropic_max_tokens,
        16384,
    )

    async def _attempt(extra: str = "") -> list[ChangeSchema]:
        prompt = user_msg + extra
        response = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=extraction_max_tokens,
            system=system,
            tools=[_extraction_tool()],
            tool_choice={"type": "tool", "name": _EXTRACTION_TOOL_NAME},
            messages=[{"role": "user", "content": prompt}],
        )

        if response.stop_reason == "max_tokens":
            raise ValueError(
                "Output token limit reached: the model stopped before finishing the JSON. "
                "The report may be too large. Try reducing report length or contact support."
            )

        return _parse_response_content(response.content, min_count)

    try:
        return await _attempt()
    except ValueError as first_error:
        logger.warning("First extraction attempt failed: %s — retrying with error context", first_error)
        error_desc = str(first_error).split("\n\nRaw:")[0]
        retry_suffix = (
            f"\n\n[PREVIOUS ATTEMPT FAILED WITH THIS ERROR — fix it and retry]\n{error_desc}"
        )
        try:
            return await _attempt(retry_suffix)
        except ValueError as second_error:
            raise ValueError(
                f"Extraction failed after two attempts.\n"
                f"Attempt 1: {first_error}\n"
                f"Attempt 2: {second_error}"
            ) from second_error
