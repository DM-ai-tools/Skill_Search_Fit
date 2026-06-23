"""Synthesises per-step pipeline outputs into one unified pipeline report."""

from __future__ import annotations

import re
from typing import Any

# ── Pipeline section definitions ───────────────────────────────────────────────
# Each entry maps a pipeline_id to its purpose and the sections the
# unified report should show (organised by pipeline purpose, not skill order).

PIPELINE_CONFIGS: dict[str, dict[str, Any]] = {
    "full-content-page-pipeline": {
        "purpose": "Produce one fully optimised, publish-ready content page from a seed idea.",
        "sections": [
            {
                "id": "opportunity",
                "title": "The Opportunity",
                "source_steps": [1, 2],
                "expandable": False,
            },
            {
                "id": "content-strategy",
                "title": "The Content Strategy",
                "source_steps": [3, 4],
                "expandable": False,
            },
            {
                "id": "article",
                "title": "The Article",
                "source_steps": [5],
                "expandable": True,
            },
            {
                "id": "seo-optimizations",
                "title": "SEO Optimisations Applied",
                "source_steps": [6],
                "expandable": False,
            },
            {
                "id": "internal-linking",
                "title": "Internal Linking Plan",
                "source_steps": [7],
                "expandable": False,
            },
        ],
        "has_final_deliverable": True,
    },
    "content-production-pipeline": {
        "purpose": (
            "Gap-driven articles published end-to-end from competitor gaps "
            "through internal linking."
        ),
        "sections": [
            {
                "id": "competitor-gaps",
                "title": "Competitor Gap Analysis",
                "source_steps": [1],
                "expandable": False,
            },
            {
                "id": "topics-keywords",
                "title": "Topics & Keywords",
                "source_steps": [2, 3],
                "expandable": False,
            },
            {
                "id": "content-brief",
                "title": "Content Brief",
                "source_steps": [4],
                "expandable": False,
            },
            {
                "id": "article",
                "title": "The Article",
                "source_steps": [5],
                "expandable": True,
            },
            {
                "id": "internal-linking",
                "title": "Internal Linking Plan",
                "source_steps": [6],
                "expandable": False,
            },
        ],
        "has_final_deliverable": True,
    },
    "audit-fix-verify": {
        "purpose": (
            "Find every SEO issue on the site, fix all of them, "
            "and verify the fixes worked."
        ),
        "sections": [
            {
                "id": "site-health",
                "title": "Site Health Overview",
                "source_steps": [1],
                "expandable": False,
            },
            {
                "id": "technical-fixes",
                "title": "Technical Fixes",
                "source_steps": [2, 3],
                "expandable": False,
            },
            {
                "id": "on-page-improvements",
                "title": "On-Page Improvements",
                "source_steps": [4],
                "expandable": False,
            },
            {
                "id": "structured-data",
                "title": "Structured Data Added",
                "source_steps": [5],
                "expandable": False,
            },
            {
                "id": "verification",
                "title": "Verification & Score Improvement",
                "source_steps": [6],
                "expandable": False,
            },
        ],
        "has_final_deliverable": False,
    },
    "ai-visibility-flywheel": {
        "purpose": (
            "Get the brand recommended by AI assistants "
            "(ChatGPT, Claude, Gemini, Perplexity) for buying-intent prompts."
        ),
        "sections": [
            {
                "id": "ai-visibility-score",
                "title": "AI Visibility Score",
                "source_steps": [1],
                "expandable": False,
            },
            {
                "id": "competitor-positioning",
                "title": "Competitor Positioning",
                "source_steps": [2],
                "expandable": False,
            },
            {
                "id": "content-produced",
                "title": "Content Produced to Win Visibility",
                "source_steps": [3],
                "expandable": True,
            },
            {
                "id": "schema-signals",
                "title": "Schema & Technical Signals",
                "source_steps": [4],
                "expandable": False,
            },
            {
                "id": "projected-improvement",
                "title": "Projected Visibility Improvement",
                "source_steps": [5],
                "expandable": False,
            },
        ],
        "has_final_deliverable": False,
    },
}


# ── Sync helpers (pure — no I/O, easy to unit-test) ───────────────────────────

def _combine_step_markdown(steps: list[dict], step_numbers: list[int]) -> str:
    """Join markdown from the given step numbers with a visual separator."""
    parts = [
        f"### {s['label']}\n\n{s['output_markdown']}"
        for s in steps
        if s.get("step") in step_numbers and s.get("output_markdown", "").strip()
    ]
    return "\n\n---\n\n".join(parts)


def _extract_metrics(markdown: str) -> dict[str, Any]:
    """Extract simple numeric metrics from markdown via regex.

    Returns whatever can be found; callers treat missing keys as absent.
    """
    metrics: dict[str, Any] = {}

    wc = re.search(r"(?:word\s*count|words?)[:\s]+(\d{3,6})", markdown, re.IGNORECASE)
    if wc:
        metrics["words_written"] = int(wc.group(1))

    score = re.search(
        r"(?:overall|seo|site|visibility|audit)\s*score[:\s]+(\d{1,3})\s*(?:/\s*100)?",
        markdown,
        re.IGNORECASE,
    )
    if score:
        metrics["score"] = int(score.group(1))

    slash_score = re.search(r"\b(\d{1,3})\s*/\s*100\b", markdown)
    if slash_score and "score" not in metrics:
        val = int(slash_score.group(1))
        if 1 <= val <= 100:
            metrics["score"] = val

    return metrics


def _extract_final_deliverable(steps: list[dict]) -> dict[str, Any] | None:
    """Extract the article content from the content-creation or on-page-seo step.

    Returns None when no relevant step is found.
    """
    # Prefer on-page-seo (most optimised version) then content creation
    priority = ["On-Page SEO", "on_page", "Create Content", "create_content"]
    for fragment in priority:
        step = next(
            (
                s
                for s in steps
                if fragment.lower().replace("-", "_")
                in s.get("plugin_name", "").lower().replace("-", "_")
            ),
            None,
        )
        if step:
            md = step.get("output_markdown", "")
            title_m = re.search(
                r"(?:title\s*tag|meta\s*title|seo\s*title)[:\s]+(.+?)(?:\n|$)",
                md,
                re.IGNORECASE,
            )
            meta_m = re.search(
                r"meta\s*description[:\s]+(.+?)(?:\n|$)",
                md,
                re.IGNORECASE,
            )
            h1_m = re.search(r"^#\s+(.+)$", md, re.MULTILINE)
            return {
                "title_tag": title_m.group(1).strip() if title_m else "",
                "meta_description": meta_m.group(1).strip() if meta_m else "",
                "h1": h1_m.group(1).strip() if h1_m else "",
                "article_body": md,
            }
    return None


# ── Async helpers ──────────────────────────────────────────────────────────────

async def _generate_narrative(
    pipeline_name: str,
    purpose: str,
    domain: str,
    steps: list[dict],
) -> str:
    """Call the configured AI executor to write a 2-3 paragraph executive summary.

    Returns an empty string on any error (narrative is non-critical).
    """
    key_outputs = "\n".join(
        f"- Step {s['step']} ({s['label']}): {s['output_markdown'][:400].strip()}"
        for s in steps
    )
    system = (
        "You are writing an executive summary for a client SEO report. "
        "Be concise, plain-English, and professional. Never use bullet points."
    )
    user = (
        f"Pipeline: {pipeline_name}\n"
        f"Purpose: {purpose}\n"
        f"Domain: {domain or 'the client website'}\n"
        f"Key step outputs:\n{key_outputs}\n\n"
        "Write exactly 2-3 short paragraphs summarising:\n"
        "1. What this pipeline set out to do and what was discovered.\n"
        "2. What was produced or fixed.\n"
        "3. What the client should do next.\n"
        "No bullet points. No skill names. Write as a unified narrative about their website."
    )
    try:
        from app.services.execution.ai_executor import get_ai_executor

        executor = get_ai_executor()
        result = await executor.execute(
            system_prompt=system,
            user_prompt=user,
            inputs={},
            plugin_name="Pipeline Narrative",
            max_tokens=600,
        )
        text = result.get("markdown", "").strip()
        # Discard preview-mode stubs (they start with "> **Preview mode**")
        if text.startswith(">") or "preview mode" in text.lower()[:120]:
            return ""
        return text
    except Exception:
        return ""


# ── Public API ─────────────────────────────────────────────────────────────────

async def synthesize_pipeline_report(
    pipeline_id: str,
    pipeline_name: str,
    steps: list[dict],
    domain: str = "",
) -> dict[str, Any]:
    """Build a unified pipeline report dict from all step outputs.

    Falls back to a single combined section for pipeline IDs not in PIPELINE_CONFIGS
    so that new pipelines always display something without requiring a config entry.
    """
    config = PIPELINE_CONFIGS.get(pipeline_id)

    if config is None:
        combined = "\n\n---\n\n".join(
            f"### Step {s['step']}: {s['label']}\n\n{s['output_markdown']}"
            for s in steps
        )
        fallback_outcome = (
            f"{pipeline_name} completed for {domain} — {len(steps)} skills run."
            if domain
            else f"{pipeline_name} completed — {len(steps)} skills run."
        )
        return {
            "pipeline_id": pipeline_id,
            "pipeline_name": pipeline_name,
            "pipeline_purpose": pipeline_name,
            "domain": domain,
            "headline_summary": {
                "outcome": fallback_outcome,
                "key_metrics": {"steps_completed": len(steps)},
            },
            "narrative": "",
            "sections": [
                {
                    "id": "combined",
                    "title": "Pipeline Output",
                    "source_step_labels": [s["label"] for s in steps],
                    "source_step_numbers": [s["step"] for s in steps],
                    "metrics": {},
                    "combined_markdown": combined,
                    "expandable": False,
                }
            ],
            "final_deliverable": None,
        }

    # Build per-section data from the config map
    sections: list[dict[str, Any]] = []
    for sec_def in config["sections"]:
        combined_md = _combine_step_markdown(steps, sec_def["source_steps"])
        metrics = _extract_metrics(combined_md)
        source_labels = [
            s["label"] for s in steps if s.get("step") in sec_def["source_steps"]
        ]
        sections.append(
            {
                "id": sec_def["id"],
                "title": sec_def["title"],
                "source_step_labels": source_labels,
                "source_step_numbers": sec_def["source_steps"],
                "metrics": metrics,
                "combined_markdown": combined_md,
                "expandable": sec_def.get("expandable", False),
            }
        )

    narrative = await _generate_narrative(pipeline_name, config["purpose"], domain, steps)
    final_deliverable = (
        _extract_final_deliverable(steps) if config.get("has_final_deliverable") else None
    )

    outcome = (
        f"{pipeline_name} completed for {domain} — {len(steps)} skills executed."
        if domain
        else f"{pipeline_name} completed — {len(steps)} skills executed."
    )

    return {
        "pipeline_id": pipeline_id,
        "pipeline_name": pipeline_name,
        "pipeline_purpose": config["purpose"],
        "domain": domain,
        "headline_summary": {
            "outcome": outcome,
            "key_metrics": {"steps_completed": len(steps)},
        },
        "narrative": narrative,
        "sections": sections,
        "final_deliverable": final_deliverable,
    }
