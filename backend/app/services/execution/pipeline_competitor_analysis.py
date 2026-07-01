"""Pipeline-specific competitor intelligence pre-run (before first skill)."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.config import settings
from app.services.llm.openai_client import openai_chat_json, openai_configured

logger = logging.getLogger(__name__)

ANALYSIS_TIMEOUT_SECONDS = 30

_PROMPTS: dict[str, str] = {
    "full-content-page-pipeline": """You are analysing competitors for a content page targeting this topic: {seed_topic} on {site_url}.

Find the top 3-5 pages currently ranking for this topic. For each competitor page extract URL, title tag, approximate word count, H2 headings, schema types, primary angle, and weak subtopics.

Identify the biggest content gap, positioning angle for a new page, and minimum competitive word count.

Return JSON with exactly these fields:
competitor_urls (array), competitor_titles (array), competitor_word_counts (array of numbers),
competitor_h2s (array of arrays), competitor_gaps (array of strings), competitor_schema_types (array),
positioning_opportunity (string), minimum_competitive_word_count (number)""",
    "audit-fix-verify": """Benchmark competitor technical SEO for {site_url} in industry context: {seed_topic}.

For top 3 competitors extract estimated page speed (Fast/Medium/Slow), schema types, meta tag quality notes, and technical advantages.

Return JSON:
competitor_tech_scores (object url->score label), competitor_page_speeds (object),
competitor_schema_coverage (array), competitor_meta_quality (array of strings),
technical_gaps_to_close (array), priority_technical_fix (string)""",
    "ai-visibility-flywheel": """Analyse which brands AI assistants recommend for prompts related to {seed_topic} for {site_url}.

For recommended brands note citation content patterns, schema, FAQ structures, entity signals.

Return JSON:
ai_recommended_competitors (array), competitor_faq_structures (array), competitor_entity_signals (array),
citation_winning_patterns (array), entity_gap (array), prompts_to_win (array)""",
    "content-production-pipeline": """Analyse content competitors for {seed_topic} on {site_url}.

Find top 3-5 ranking competitor pages. Extract URLs, titles, word counts, H2 structures, content gaps, and differentiation angle.

Return JSON:
competitor_urls, competitor_titles, competitor_word_counts, competitor_h2s, competitor_gaps,
competitor_schema_types, positioning_opportunity, minimum_competitive_word_count""",
}

_DEFAULT_PROMPT = """Analyse competitors relevant to {seed_topic} for {site_url}.
Return JSON with competitor_urls, competitor_summary, positioning_opportunity, key_gaps (all arrays/strings as appropriate)."""


def _format_prompt(pipeline_id: str, inputs: dict[str, Any]) -> str:
    template = _PROMPTS.get(pipeline_id, _DEFAULT_PROMPT)
    site_url = str(inputs.get("site_url") or "")
    seed = str(inputs.get("seed_topic") or inputs.get("seed_keywords") or inputs.get("brand_name") or "")
    return template.format(site_url=site_url, seed_topic=seed, TOPIC_SEED=seed, SITE_URL=site_url)


async def run_pipeline_competitor_analysis(
    pipeline_id: str,
    pipeline_inputs: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    """Return (competitor_data, failed). Never raises — failure returns empty data."""
    user = _format_prompt(pipeline_id, pipeline_inputs)
    system = (
        "You are a competitor intelligence analyst for SEO pipelines. "
        "Return only valid JSON matching the requested schema. Be specific and factual."
    )

    if not openai_configured():
        logger.warning("Competitor pre-run skipped: OPENAI_API_KEY not set")
        return {}, True

    try:
        result = await asyncio.wait_for(
            openai_chat_json(
                system=system,
                user=user,
                max_tokens=4096,
                timeout_seconds=25,
            ),
            timeout=ANALYSIS_TIMEOUT_SECONDS,
        )
        if isinstance(result, dict):
            return result, False
        return {}, True
    except Exception as exc:
        logger.warning("Pipeline competitor analysis failed: %s", exc)
        return {}, True


def competitor_context_block(competitor_data: dict[str, Any]) -> str:
    if not competitor_data:
        return ""
    payload = json.dumps(competitor_data, ensure_ascii=False, indent=2)
    return (
        "COMPETITOR INTELLIGENCE (use this to make your output more competitive and specific):\n"
        f"{payload}"
    )
