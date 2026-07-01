"""Regenerate client report presentation via OpenAI — appearance only, same facts."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings
from app.services.llm.openai_client import openai_chat_json, openai_configured
from app.services.reports.report_plain_text import plain_text as _plain_text

logger = logging.getLogger(__name__)

_MAX_SECTION_CHARS = 5_000

SYSTEM = """You are an executive report presentation designer for SkillSearchFit SEO intelligence reports.

You receive the full pipeline report source. Your job is to REFORMAT it into a polished, client-ready
presentation layout. You are changing ONLY appearance: headings, section framing, callouts, bullet grouping,
and executive summary flow.

STRICT RULES:
- Do NOT change facts, numbers, recommendations, keywords, or strategic advice.
- Do NOT add new information, opinions, or SEO guidance that is not in the source.
- Do NOT remove substantive findings — reorganize and reframe for readability only.
- Preserve all metrics and scores exactly as given.
- Use professional, scannable executive-report tone.
- Write PLAIN TEXT ONLY in executive_markdown and presentation_markdown.
  NO markdown symbols: no # headings, no ** or * emphasis, no backticks, no > blockquotes,
  no pipe tables, no --- dividers, no [links](url). Use simple sentences and lines starting
  with "- " for bullet lists only.
- Put section titles in display_title only — never repeat them with # symbols in the body.

Return JSON with exactly this shape:
{
  "cover_title": "string — polished report title",
  "cover_subtitle": "string — one-line client context",
  "cover_badge": "string — e.g. Confidential · Pipeline Report",
  "highlights": [{"label": "string", "value": "string"}],
  "executive_markdown": "string — 2-4 short plain-text paragraphs (blank line between paragraphs)",
  "sections": [
    {
      "id": "must match source section id",
      "display_title": "string — polished section title",
      "kicker": "string — one-line section context",
      "layout": "standard" | "featured" | "compact",
      "presentation_markdown": "string — same section facts as clean plain text and - bullets only"
    }
  ],
  "deliverable_headline": "string — only if final_deliverable present, else empty",
  "deliverable_subheadline": "string"
}

highlights: 3-5 tiles from headline_summary metrics and section metrics.
sections: one entry per source section, same ids, presentation_markdown must contain the source facts as plain readable text."""


def _trim_report_payload(report: dict[str, Any]) -> dict[str, Any]:
    """Trim section bodies for token limits while keeping structure."""
    sections = []
    for sec in report.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        md = str(sec.get("combined_markdown") or "")
        if len(md) > _MAX_SECTION_CHARS:
            md = md[:_MAX_SECTION_CHARS] + "\n\n…"
        sections.append(
            {
                "id": sec.get("id"),
                "title": sec.get("title"),
                "source_step_labels": sec.get("source_step_labels", []),
                "metrics": sec.get("metrics", {}),
                "expandable": sec.get("expandable", False),
                "combined_markdown": md,
            }
        )

    deliverable = report.get("final_deliverable")
    deliverable_trimmed = None
    if isinstance(deliverable, dict):
        body = str(deliverable.get("article_body") or "")
        if len(body) > _MAX_SECTION_CHARS:
            body = body[:_MAX_SECTION_CHARS] + "\n\n…"
        deliverable_trimmed = {
            "title_tag": deliverable.get("title_tag", ""),
            "meta_description": deliverable.get("meta_description", ""),
            "h1": deliverable.get("h1", ""),
            "article_body": body,
        }

    return {
        "pipeline_id": report.get("pipeline_id"),
        "pipeline_name": report.get("pipeline_name"),
        "pipeline_purpose": report.get("pipeline_purpose"),
        "domain": report.get("domain"),
        "narrative": str(report.get("narrative") or "")[:3000],
        "headline_summary": report.get("headline_summary") or {},
        "sections": sections,
        "final_deliverable": deliverable_trimmed,
    }


async def regenerate_report_presentation(report: dict[str, Any]) -> dict[str, Any]:
    if not openai_configured():
        raise RuntimeError("OPENAI_API_KEY not configured")

    payload = _trim_report_payload(report)
    user = (
        "Reformat this pipeline report for executive presentation. "
        "Appearance only — preserve all facts. "
        "Output plain text only — remove all markdown symbols (#, **, `, etc.) from body fields.\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )

    result = await openai_chat_json(
        system=SYSTEM,
        user=user,
        max_tokens=8192,
        timeout_seconds=90,
    )

    # Normalize response
    result["cover_title"] = _plain_text(str(result.get("cover_title") or report.get("pipeline_name") or "Pipeline Report"))
    result["cover_subtitle"] = _plain_text(str(result.get("cover_subtitle") or report.get("pipeline_purpose") or ""))
    result["cover_badge"] = _plain_text(str(result.get("cover_badge") or "Confidential · Pipeline Report"))
    result["executive_markdown"] = _plain_text(
        str(result.get("executive_markdown") or report.get("narrative") or "")
    )

    highlights = result.get("highlights") or []
    cleaned_highlights: list[dict[str, str]] = []
    for h in highlights:
        if isinstance(h, dict) and h.get("label") and h.get("value"):
            cleaned_highlights.append(
                {"label": str(h["label"]), "value": str(h["value"])}
            )
    result["highlights"] = cleaned_highlights[:6]

    source_sections = {str(s.get("id")): s for s in payload["sections"] if s.get("id")}
    presented_sections: list[dict[str, Any]] = []
    for item in result.get("sections") or []:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id") or "")
        source = source_sections.get(sid, {})
        layout = str(item.get("layout") or "standard").lower()
        if layout not in {"standard", "featured", "compact"}:
            layout = "standard"
        presented_sections.append(
            {
                "id": sid or str(item.get("display_title", "section")),
                "display_title": _plain_text(str(item.get("display_title") or source.get("title") or "Section")),
                "kicker": _plain_text(str(item.get("kicker") or "")),
                "layout": layout,
                "presentation_markdown": _plain_text(
                    str(item.get("presentation_markdown") or source.get("combined_markdown") or "")
                ),
                "source_step_labels": source.get("source_step_labels") or [],
                "metrics": source.get("metrics") or {},
            }
        )

    # Ensure every source section appears even if model omitted one
    seen = {s["id"] for s in presented_sections}
    for sid, source in source_sections.items():
        if sid not in seen:
            presented_sections.append(
                {
                    "id": sid,
                    "display_title": _plain_text(str(source.get("title") or "Section")),
                    "kicker": "",
                    "layout": "standard",
                    "presentation_markdown": _plain_text(str(source.get("combined_markdown") or "")),
                    "source_step_labels": source.get("source_step_labels") or [],
                    "metrics": source.get("metrics") or {},
                }
            )

    result["sections"] = presented_sections
    result["deliverable_headline"] = str(result.get("deliverable_headline") or "")
    result["deliverable_subheadline"] = str(result.get("deliverable_subheadline") or "")
    result["presentation_model"] = settings.openai_model
    return result
