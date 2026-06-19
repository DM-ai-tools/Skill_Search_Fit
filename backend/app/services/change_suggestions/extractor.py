"""Server-side Claude extraction: report text → validated Change[]."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import anthropic
from pydantic import ValidationError

from app.config import settings
from app.schemas.change_suggestions import ChangeSchema, ExtractedChangesEnvelope

logger = logging.getLogger(__name__)

_SYSTEM = """\
You are a structured-data extractor for SEO/content audit reports.

Your only job is to read the provided report and return every discrete,
actionable change recommendation as a JSON object — **no invented copy,
no inferred items, no filler text**.  If a field value is not present in
the source report, use an empty string rather than guessing.

Return ONLY a single valid JSON object with this exact shape:

{
  "changes": [
    {
      "id": "<uuid string>",
      "pageUrl": "<target page URL or slug from the report>",
      "changeType": "metadata" | "schema" | "content" | "technical" | "capture-form",
      "priority": "High" | "Medium" | "Low",
      "impactScore": <integer 0-10 or null>,
      "destination": "WordPress" | "Webflow" | "Wix" | "Mailchimp",
      "fieldLabel": "<e.g. H1, Meta Description, FAQ #3, CTA Button>",
      "currentState": "<verbatim current value from report, or empty string>",
      "proposedContent": "<exact replacement text from report>",
      "sourceExcerpt": "<one short sentence or phrase from the report, max 120 characters>"
    }
  ]
}

Rules:
- Every `id` must be a unique UUID v4 string.
- `changeType` must be one of the five allowed values exactly.
- `priority` must be one of the three allowed values exactly.
- `destination` must be one of the four allowed values exactly.
- `sourceExcerpt` MUST be ≤ 120 characters — truncate with "…" if needed.
- Do NOT wrap the JSON in markdown code fences.
- Do NOT add any text before or after the JSON object.
"""

_USER_TEMPLATE = """\
Extract all discrete changes from the following audit report.

---REPORT START---
{report_content}
---REPORT END---
"""


def _assign_ids(data: dict[str, Any]) -> dict[str, Any]:
    """Ensure every change has a unique UUID id regardless of what Claude produced."""
    for item in data.get("changes", []):
        item["id"] = str(uuid.uuid4())
    return data


async def extract_changes(raw_content: str) -> list[ChangeSchema]:
    """
    Call Claude, validate output against ExtractedChangesEnvelope.
    Retries once on schema failure with the validation error appended.
    Raises ValueError if both attempts fail.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    user_msg = _USER_TEMPLATE.format(report_content=raw_content)

    # Extraction needs a high output ceiling; do not reuse low ANTHROPIC_MAX_TOKENS values.
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
            system=_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )

        if response.stop_reason == "max_tokens":
            raise ValueError(
                "Output token limit reached: the model stopped before finishing the JSON. "
                "The report may be too large. Try reducing report length or contact support."
            )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        try:
            raw = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Model returned non-JSON output: {exc}\n\nRaw:\n{text[:300]}") from exc

        raw = _assign_ids(raw)

        try:
            envelope = ExtractedChangesEnvelope.model_validate(raw)
        except ValidationError as exc:
            raise ValueError(f"Schema validation failed: {exc}") from exc

        if not envelope.changes:
            raise ValueError("Model returned zero changes — cannot proceed with empty extraction.")

        return envelope.changes

    try:
        return await _attempt()
    except ValueError as first_error:
        logger.warning("First extraction attempt failed: %s — retrying with error context", first_error)
        # Only include the error description in the retry — never the raw truncated JSON,
        # as that inflates the prompt and can trigger the same token-limit failure.
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
