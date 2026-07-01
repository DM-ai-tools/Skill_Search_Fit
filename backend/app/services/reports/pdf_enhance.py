"""Polish report narrative for PDF export via OpenAI."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings
from app.services.llm.openai_client import openai_chat_json, openai_configured

logger = logging.getLogger(__name__)

_MAX_SOURCE_CHARS = 24_000


def _section_text(section: dict[str, Any]) -> str:
    title = str(section.get("title") or "").strip()
    parts = [title] if title else []
    for block in section.get("blocks") or []:
        if not isinstance(block, dict):
            continue
        text = str(block.get("text") or "").strip()
        if text:
            parts.append(text)
        rows = block.get("rows")
        if isinstance(rows, list) and rows:
            for row in rows[:6]:
                if isinstance(row, list):
                    parts.append(" | ".join(str(c) for c in row))
    return "\n".join(parts).strip()


def _collect_source_text(doc: dict[str, Any]) -> str:
    chunks: list[str] = []
    plugin = str(doc.get("pluginName") or "").strip()
    title = str(doc.get("title") or "").strip()
    if plugin:
        chunks.append(f"Plugin: {plugin}")
    if title:
        chunks.append(f"Title: {title}")
    if doc.get("overallScore") is not None:
        chunks.append(f"Overall score: {doc['overallScore']}/100")
    if doc.get("siteUrl"):
        chunks.append(f"Website: {doc['siteUrl']}")

    for section in doc.get("sections") or []:
        if isinstance(section, dict):
            text = _section_text(section)
            if text:
                chunks.append(text)

    for step in doc.get("pipelineSteps") or []:
        if not isinstance(step, dict):
            continue
        label = str(step.get("label") or step.get("pluginName") or "").strip()
        if label:
            chunks.append(f"Pipeline step: {label}")
        for section in step.get("structuredSections") or []:
            if isinstance(section, dict):
                text = _section_text(section)
                if text:
                    chunks.append(text)

    source = "\n\n".join(chunks).strip()
    if len(source) > _MAX_SOURCE_CHARS:
        source = source[:_MAX_SOURCE_CHARS] + "\n…"
    return source


async def enhance_report_for_pdf(doc: dict[str, Any]) -> dict[str, Any]:
    """Return doc with polished executiveSummary / keyTakeaways when OpenAI is configured."""
    if not openai_configured():
        return doc

    source = _collect_source_text(doc)
    if not source:
        return doc

    existing_summary = str(doc.get("executiveSummary") or "").strip()
    existing_takeaways = doc.get("keyTakeaways") or []
    if not isinstance(existing_takeaways, list):
        existing_takeaways = []

    user_payload = {
        "report_source": source,
        "existing_executive_summary": existing_summary,
        "existing_key_takeaways": [str(t) for t in existing_takeaways if str(t).strip()],
    }

    system = (
        "You prepare client-ready narrative for an SEO intelligence report PDF. "
        "Return JSON with exactly these keys: executiveSummary (string), keyTakeaways (array of strings). "
        "Write 2–4 sentences for executiveSummary and 3–6 concise keyTakeaways. "
        "Polish existing copy when provided; otherwise synthesize from report_source. "
        "Do not invent metrics, URLs, scores, or claims that are not supported by report_source. "
        "Preserve factual numbers and findings. Use professional, clear language suitable for executives."
    )

    try:
        result = await openai_chat_json(
            system=system,
            user=json.dumps(user_payload, ensure_ascii=False),
            max_tokens=min(settings.openai_max_tokens, 4096),
            timeout_seconds=45,
        )
    except Exception as exc:
        logger.warning("OpenAI PDF enhance failed, using original report: %s", exc)
        return doc

    summary = str(result.get("executiveSummary") or "").strip()
    takeaways_raw = result.get("keyTakeaways") or []
    takeaways = [str(t).strip() for t in takeaways_raw if str(t).strip()]

    enhanced = dict(doc)
    if summary:
        enhanced["executiveSummary"] = summary
    if takeaways:
        enhanced["keyTakeaways"] = takeaways
    return enhanced
