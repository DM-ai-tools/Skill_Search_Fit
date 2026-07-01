"""Polish publish-ready article preview via OpenAI — formatting only, same facts."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import settings
from app.services.llm.openai_client import openai_chat_json, openai_configured
from app.services.reports.report_plain_text import plain_text

logger = logging.getLogger(__name__)

_MAX_BODY_CHARS = 12_000

SYSTEM = """You are a publish-ready article formatter for SkillSearchFit SEO content pipelines.

You receive raw article markdown extracted from a content pipeline. Produce a clean, accurate
full-page preview a client can read as if it were live on their website.

STRICT ACCURACY RULES:
- Do NOT change, add, or remove facts, claims, keywords, brand names, URLs, statistics, or recommendations.
- Do NOT invent paragraphs, examples, or FAQ answers.
- Keep the same section order and meaning as the source article.
- Preserve link intent: keep internal/external link notes as readable plain text.
- Omit SEO audit noise, strategy reports, site-structure ASCII trees, and tables that are not article prose.
- If content is missing, return minimal empty sections — never fabricate.

FORMATTING RULES:
- PLAIN TEXT ONLY in section content — no #, **, backticks, pipe tables, --- dividers, or ASCII diagrams.
- Put each heading in the section "heading" field, never as # lines inside content.
- Use "- " prefix for bullet lines inside content when the source had lists.
- Separate paragraphs with blank lines inside content.

Return JSON with exactly this shape:
{
  "display_title": "article H1 from source",
  "display_subtitle": "one-line from meta description or intro, or empty string",
  "sections": [
    {
      "id": "slug-like-id",
      "heading": "section heading",
      "level": 2,
      "content": "plain text body for this section"
    }
  ]
}

level: 2 for main sections (H2), 3 for subsections (H3). Include intro, body, FAQ, and conclusion when present."""


def _slug_id(text: str, fallback: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    slug = re.sub(r"\s+", "-", slug.strip())[:48]
    return slug or fallback


async def polish_article_preview(payload: dict[str, Any]) -> dict[str, Any]:
    if not openai_configured():
        raise RuntimeError("OPENAI_API_KEY not configured")

    body_md = str(payload.get("full_body_markdown") or "")
    if len(body_md) > _MAX_BODY_CHARS:
        body_md = body_md[:_MAX_BODY_CHARS] + "\n\n…"

    source = {
        "h1": payload.get("h1") or "",
        "title_tag": payload.get("title_tag") or "",
        "meta_description": payload.get("meta_description") or "",
        "full_url": payload.get("full_url") or "",
        "word_count": payload.get("word_count") or 0,
        "full_body_markdown": body_md,
    }

    user = (
        "Format this article for an accurate client-facing full-page preview. "
        "Facts unchanged — remove markdown noise and non-article report content only.\n\n"
        f"{json.dumps(source, ensure_ascii=False, indent=2)}"
    )

    result = await openai_chat_json(
        system=SYSTEM,
        user=user,
        max_tokens=8192,
        timeout_seconds=180,
    )

    display_title = plain_text(
        str(result.get("display_title") or source["h1"] or source["title_tag"] or "Article Preview")
    )
    display_subtitle = plain_text(str(result.get("display_subtitle") or source["meta_description"] or ""))

    sections: list[dict[str, Any]] = []
    for i, item in enumerate(result.get("sections") or []):
        if not isinstance(item, dict):
            continue
        heading = plain_text(str(item.get("heading") or ""))
        content = plain_text(str(item.get("content") or ""))
        if not heading and not content:
            continue
        level = int(item.get("level") or 2)
        if level not in (2, 3, 4):
            level = 2
        sections.append(
            {
                "id": str(item.get("id") or _slug_id(heading, f"section-{i + 1}")),
                "heading": heading,
                "level": level,
                "content": content,
            }
        )

    if not sections and body_md.strip():
        sections.append(
            {
                "id": "article-body",
                "heading": "",
                "level": 2,
                "content": plain_text(body_md),
            }
        )

    return {
        "display_title": display_title,
        "display_subtitle": display_subtitle,
        "sections": sections,
        "preview_model": settings.openai_model,
    }
