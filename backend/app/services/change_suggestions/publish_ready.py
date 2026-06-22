"""Rewrite change proposedContent into publish-ready copy via Claude."""

from __future__ import annotations

import json
import logging
from typing import Any

import anthropic

from app.config import settings
from app.services.change_suggestions.json_utils import parse_json_object, strip_json_fences
from app.services.change_suggestions.validator import looks_like_instruction

logger = logging.getLogger(__name__)

_REFINE_SYSTEM = """\
You are a publish-content specialist for website CMS deployments (WordPress, Webflow, Wix).

You receive audit report context and a list of change items. For EACH item, rewrite
`proposedContent` so it contains ONLY the exact final content to deploy live.

Rules by changeType:
  metadata     → exact title tag text, meta description (150-160 chars), or og tag value
  schema       → complete valid JSON-LD only (no markdown fences, no commentary)
  content      → exact heading, paragraph, CTA, or body copy as it should appear on the page
  technical    → exact HTML snippet, attribute value, or alt text string only
  capture-form → exact label or button text only

STRICT:
- No instructions ("Add…", "Update…", "Consider…", "Ensure…")
- No placeholders like [keyword] or {business_name}
- No explanations before or after the content
- Use real business details from the report context
- If currentState is empty, still write complete publish-ready replacement copy

Return ONLY valid JSON:
{
  "changes": [
    {"id": "<same id from input>", "proposedContent": "<publish-ready content>"}
  ]
}
"""

_USER_TEMPLATE = """\
Report context (for business name, industry, tone, and page details):
---REPORT EXCERPT---
{report_excerpt}
---END---

Rewrite proposedContent to publish-ready final copy for these changes:
{changes_json}
"""


def _needs_refinement(change: dict[str, Any]) -> bool:
    proposed = (change.get("proposedContent") or "").strip()
    if not proposed:
        return True
    if change.get("needsReview") and "instruction" in str(change.get("reviewReason") or "").lower():
        return True
    return looks_like_instruction(proposed)


async def refine_publish_ready(
    changes: list[dict[str, Any]],
    raw_content: str,
) -> list[dict[str, Any]]:
    """
    Batch-rewrite proposedContent for changes that are not publish-ready.
    Returns the same change list with updated proposedContent fields.
    """
    to_refine = [c for c in changes if _needs_refinement(c)]
    if not to_refine:
        return changes

    logger.info("Refining %d / %d changes to publish-ready content", len(to_refine), len(changes))

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    excerpt = raw_content[:12000]
    payload = [
        {
            "id": c["id"],
            "fieldLabel": c.get("fieldLabel"),
            "changeType": c.get("changeType"),
            "location": c.get("location"),
            "pageUrl": c.get("pageUrl"),
            "currentState": c.get("currentState"),
            "proposedContent": c.get("proposedContent"),
        }
        for c in to_refine
    ]

    response = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=8192,
        system=_REFINE_SYSTEM,
        messages=[{
            "role": "user",
            "content": _USER_TEMPLATE.format(
                report_excerpt=excerpt,
                changes_json=json.dumps(payload, indent=2),
            ),
        }],
    )

    text = strip_json_fences(response.content[0].text.strip())
    try:
        parsed = parse_json_object(text)
    except ValueError as exc:
        logger.warning("Publish-ready refine returned invalid JSON: %s", exc)
        return changes

    by_id = {item["id"]: item.get("proposedContent", "") for item in parsed.get("changes", [])}
    result: list[dict[str, Any]] = []
    for change in changes:
        updated = dict(change)
        if change["id"] in by_id:
            new_content = (by_id[change["id"]] or "").strip()
            if new_content and not looks_like_instruction(new_content):
                updated["proposedContent"] = new_content
                updated["needsReview"] = False
                updated["reviewReason"] = None
            elif new_content:
                updated["proposedContent"] = new_content
                updated["needsReview"] = True
                updated["reviewReason"] = "Could not auto-generate publish-ready copy"
        result.append(updated)
    return result
