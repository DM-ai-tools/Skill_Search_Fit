"""OpenAI presentation review — layout and appearance only, not content quality."""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.services.llm.openai_client import openai_chat_json, openai_configured

logger = logging.getLogger(__name__)

SYSTEM = """You are a UI/UX presentation reviewer for client-facing SEO intelligence reports.

You receive a structural manifest describing how a report is laid out (sections, block counts, layout flags).
You must review ONLY visual presentation: hierarchy, scannability, section balance, metrics placement,
expand/collapse patterns, sidebar navigation, deliverable card prominence, and overall polish.

STRICT RULES:
- Do NOT critique SEO strategy, facts, recommendations, or writing quality.
- Do NOT suggest changes to what the report says — only how it is organized and presented.
- Do NOT invent sections or metrics that are not in the manifest.
- Be specific to the structure provided.

Return JSON with exactly these keys:
{
  "presentation_score": <integer 1-100>,
  "headline": "<short presentation verdict, max 12 words>",
  "summary": "<2-3 sentences on appearance and layout only>",
  "strengths": ["<presentation strength>", ...],
  "improvements": ["<actionable layout improvement>", ...],
  "layout_areas": [
    {
      "area": "<UI region name>",
      "status": "excellent" | "good" | "fair" | "needs_work",
      "observation": "<what you see structurally>",
      "tip": "<appearance-only suggestion>"
    }
  ]
}

Include 4-6 layout_areas covering the most relevant regions from the manifest."""


async def review_report_appearance(manifest: dict[str, Any]) -> dict[str, Any]:
    if not openai_configured():
        raise RuntimeError("OPENAI_API_KEY not configured — required for presentation review")

    import json

    user = (
        "Review the presentation of this report manifest. Appearance and layout only.\n\n"
        f"{json.dumps(manifest, ensure_ascii=False, indent=2)}"
    )

    try:
        result = await openai_chat_json(
            system=SYSTEM,
            user=user,
            max_tokens=2048,
            timeout_seconds=45,
        )
    except Exception as exc:
        logger.warning("Appearance review failed: %s", exc)
        raise

    score = result.get("presentation_score")
    if isinstance(score, (int, float)):
        result["presentation_score"] = max(1, min(100, int(score)))
    else:
        result["presentation_score"] = 75

    for key in ("headline", "summary"):
        result[key] = str(result.get(key) or "").strip()

    for key in ("strengths", "improvements"):
        raw = result.get(key) or []
        result[key] = [str(item).strip() for item in raw if str(item).strip()][:6]

    areas = result.get("layout_areas") or []
    cleaned_areas: list[dict[str, str]] = []
    for item in areas:
        if not isinstance(item, dict):
            continue
        status = str(item.get("status", "good")).lower()
        if status not in {"excellent", "good", "fair", "needs_work"}:
            status = "good"
        cleaned_areas.append(
            {
                "area": str(item.get("area", "Section")).strip() or "Section",
                "status": status,
                "observation": str(item.get("observation", "")).strip(),
                "tip": str(item.get("tip", "")).strip(),
            }
        )
    result["layout_areas"] = cleaned_areas[:8]
    result["review_model"] = settings.openai_model
    return result
