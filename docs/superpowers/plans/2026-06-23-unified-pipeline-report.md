# Unified Pipeline Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current stacked per-skill report view with a single unified pipeline report that tells the complete story of what the pipeline accomplished, organised by the pipeline's purpose rather than by skill execution order.

**Architecture:** A new backend service (`pipeline_synthesizer.py`) maps each pipeline's step outputs into purpose-driven sections, calls Claude to generate an executive narrative, and returns a single `UnifiedPipelineReport` object. A new backend route exposes this. A new frontend component renders it. The `pipeline-view` page tries the new endpoint first and falls back to the existing `StructuredReportView` if unavailable, so nothing breaks.

**Tech Stack:** FastAPI (Python 3.12+), asyncpg, Anthropic/OpenAI via existing `get_ai_executor()`, Next.js 15 App Router, TypeScript, Tailwind with existing design tokens (`bento-tile`, `glass-panel-strong`, `bento-grid-4`, etc.), existing `parseBlocksFromBody` + `renderReportBlocks` from `report-view-model.ts`.

## Global Constraints

- Never modify `frontend/src/app/(app)/reports/view/page.tsx` — single-skill runs must remain unchanged.
- Never modify `backend/app/services/execution/` — pipeline execution logic is untouched; only the report display changes.
- All new frontend types use snake_case field names to match FastAPI's default JSON serialisation.
- Use existing design tokens only — no new CSS classes.
- Narrative generation failures are silent; sections render without a narrative block rather than erroring.
- The fallback to `StructuredReportView` must be seamless — if the unified-report endpoint returns a non-2xx status, the page silently uses the old view.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| CREATE | `backend/app/services/reports/pipeline_synthesizer.py` | Section mapping, metric extraction, AI narrative, final deliverable extraction |
| CREATE | `backend/tests/test_pipeline_synthesizer.py` | Unit tests for all sync helpers |
| MODIFY | `backend/app/schemas/pipelines.py` | Add `UnifiedPipelineSection`, `UnifiedPipelineReport` Pydantic models |
| MODIFY | `backend/app/routers/pipelines.py` | Add `GET /{pipeline_id}/unified-report` endpoint |
| MODIFY | `frontend/src/lib/types.ts` | Add `UnifiedPipelineSection`, `UnifiedPipelineReport` TS interfaces |
| CREATE | `frontend/src/components/reports/unified-pipeline-report.tsx` | Full unified report renderer |
| MODIFY | `frontend/src/app/(app)/reports/pipeline-view/page.tsx` | Try unified endpoint first, fall back to old view |

---

### Task 1: Backend Pipeline Synthesizer Service

**Files:**
- Create: `backend/app/services/reports/pipeline_synthesizer.py`
- Test: `backend/tests/test_pipeline_synthesizer.py`

**Interfaces:**
- Produces: `async def synthesize_pipeline_report(pipeline_id: str, pipeline_name: str, steps: list[dict], domain: str = "") -> dict` — consumed by Task 3.
- Exposes (for tests): `_combine_step_markdown`, `_extract_metrics`, `_extract_final_deliverable`, `PIPELINE_CONFIGS`.

- [ ] **Step 1: Create the synthesizer service**

Create `backend/app/services/reports/pipeline_synthesizer.py` with this exact content:

```python
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
        return {
            "pipeline_id": pipeline_id,
            "pipeline_name": pipeline_name,
            "pipeline_purpose": pipeline_name,
            "domain": domain,
            "headline_summary": {
                "outcome": f"{pipeline_name} completed — {len(steps)} skills run.",
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
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_pipeline_synthesizer.py`:

```python
"""Unit tests for pipeline_synthesizer — sync helpers only, no I/O required."""

import asyncio
import pytest

from app.services.reports.pipeline_synthesizer import (
    PIPELINE_CONFIGS,
    _combine_step_markdown,
    _extract_final_deliverable,
    _extract_metrics,
    synthesize_pipeline_report,
)

SAMPLE_STEPS = [
    {
        "step": 1,
        "label": "Topic angle & seed keywords",
        "plugin_name": "Create Topic",
        "output_markdown": "## Topic Research\n\nBest AI tools for small business.\n",
    },
    {
        "step": 2,
        "label": "Keyword groups & clusters",
        "plugin_name": "Keyword Clustering",
        "output_markdown": "## Clusters\n\nPrimary keyword: best ai tools for small business\n",
    },
    {
        "step": 3,
        "label": "Content pillars & page map",
        "plugin_name": "Content Strategy",
        "output_markdown": "## Strategy\n\nPillar page approach recommended.\n",
    },
]


# ── PIPELINE_CONFIGS ──────────────────────────────────────────────────────────

def test_all_four_pipelines_configured():
    expected = {
        "full-content-page-pipeline",
        "content-production-pipeline",
        "audit-fix-verify",
        "ai-visibility-flywheel",
    }
    assert expected.issubset(set(PIPELINE_CONFIGS.keys()))


def test_each_pipeline_has_at_least_four_sections():
    for pid, cfg in PIPELINE_CONFIGS.items():
        assert len(cfg["sections"]) >= 4, f"{pid} must have >=4 sections"


def test_full_content_pipeline_has_seven_source_steps():
    cfg = PIPELINE_CONFIGS["full-content-page-pipeline"]
    all_steps = {n for s in cfg["sections"] for n in s["source_steps"]}
    assert all_steps == {1, 2, 3, 4, 5, 6, 7}


def test_content_production_pipeline_has_final_deliverable():
    assert PIPELINE_CONFIGS["content-production-pipeline"]["has_final_deliverable"] is True


def test_audit_fix_verify_has_no_final_deliverable():
    assert PIPELINE_CONFIGS["audit-fix-verify"]["has_final_deliverable"] is False


# ── _combine_step_markdown ────────────────────────────────────────────────────

def test_combine_selects_only_requested_steps():
    result = _combine_step_markdown(SAMPLE_STEPS, [1, 2])
    assert "Topic angle" in result
    assert "Keyword groups" in result
    assert "Content pillars" not in result


def test_combine_returns_empty_string_when_no_match():
    result = _combine_step_markdown(SAMPLE_STEPS, [99])
    assert result == ""


def test_combine_single_step_has_no_separator():
    result = _combine_step_markdown(SAMPLE_STEPS, [1])
    assert "---" not in result


def test_combine_two_steps_joined_by_separator():
    result = _combine_step_markdown(SAMPLE_STEPS, [1, 2])
    assert "---" in result


def test_combine_skips_empty_markdown():
    steps = [
        {"step": 1, "label": "A", "plugin_name": "X", "output_markdown": "Content"},
        {"step": 2, "label": "B", "plugin_name": "Y", "output_markdown": "   "},
    ]
    result = _combine_step_markdown(steps, [1, 2])
    assert "A" in result
    assert "B" not in result


# ── _extract_metrics ──────────────────────────────────────────────────────────

def test_extract_word_count():
    md = "The article has a word count: 1850 words total."
    assert _extract_metrics(md)["words_written"] == 1850


def test_extract_seo_score_with_slash():
    md = "Overall SEO score: 74/100"
    assert _extract_metrics(md)["score"] == 74


def test_extract_score_without_slash():
    md = "Site score: 68"
    assert _extract_metrics(md)["score"] == 68


def test_extract_metrics_empty_on_no_match():
    assert _extract_metrics("No numbers here at all.") == {}


def test_extract_slash_score_as_fallback():
    md = "You achieved 82/100 on this audit."
    metrics = _extract_metrics(md)
    assert metrics.get("score") == 82


# ── _extract_final_deliverable ────────────────────────────────────────────────

def test_extract_deliverable_from_create_content_step():
    steps = [
        {
            "step": 5,
            "plugin_name": "Create Content",
            "output_markdown": (
                "# Best AI Tools for Small Business\n\n"
                "Title tag: Best AI Tools for Small Business 2026\n"
                "Meta description: Discover the top AI tools to grow your business.\n"
                "Body content here."
            ),
        }
    ]
    result = _extract_final_deliverable(steps)
    assert result is not None
    assert "Best AI Tools for Small Business" in result["h1"]
    assert "Best AI Tools for Small Business 2026" in result["title_tag"]
    assert "Discover the top AI tools" in result["meta_description"]
    assert result["article_body"]


def test_extract_deliverable_prefers_on_page_seo_over_create_content():
    steps = [
        {
            "step": 5,
            "plugin_name": "Create Content",
            "output_markdown": "# Old H1\nTitle tag: Old Title\nMeta description: Old meta.\n",
        },
        {
            "step": 6,
            "plugin_name": "On-Page SEO",
            "output_markdown": "# Optimised H1\nTitle tag: Optimised Title\nMeta description: Optimised meta.\n",
        },
    ]
    result = _extract_final_deliverable(steps)
    assert result is not None
    assert "Optimised" in result["h1"]


def test_extract_deliverable_returns_none_when_no_content_step():
    steps = [
        {"step": 1, "plugin_name": "SEO Audit", "output_markdown": "Audit results here."}
    ]
    assert _extract_final_deliverable(steps) is None


# ── synthesize_pipeline_report (fallback path — no AI call) ──────────────────

def test_unknown_pipeline_returns_single_combined_section():
    steps = [
        {"step": 1, "label": "Test step", "plugin_name": "TestPlugin", "output_markdown": "Hello world"}
    ]
    result = asyncio.run(synthesize_pipeline_report("unknown-xyz", "Unknown Pipeline", steps))
    assert result["pipeline_id"] == "unknown-xyz"
    assert len(result["sections"]) == 1
    assert result["sections"][0]["id"] == "combined"
    assert result["final_deliverable"] is None


def test_known_pipeline_returns_correct_section_count():
    steps = [
        {"step": i, "label": f"Step {i}", "plugin_name": f"Plugin{i}", "output_markdown": f"Output {i}"}
        for i in range(1, 8)
    ]
    result = asyncio.run(
        synthesize_pipeline_report("full-content-page-pipeline", "Full Content Page Pipeline", steps)
    )
    assert len(result["sections"]) == 5
    assert result["sections"][0]["id"] == "opportunity"
    assert result["sections"][2]["id"] == "article"
    assert result["sections"][2]["expandable"] is True
    assert result["pipeline_purpose"] != ""


def test_domain_appears_in_outcome():
    steps = [
        {"step": 1, "label": "A", "plugin_name": "P", "output_markdown": "x"}
    ]
    result = asyncio.run(
        synthesize_pipeline_report("unknown", "Test", steps, domain="example.com")
    )
    assert "example.com" in result["headline_summary"]["outcome"]
```

- [ ] **Step 3: Run tests — expect failures (files don't exist yet)**

```
cd backend && python -m pytest tests/test_pipeline_synthesizer.py -v
```

Expected: `ImportError: No module named 'app.services.reports.pipeline_synthesizer'`

- [ ] **Step 4: Run tests again — expect all pass**

```
cd backend && python -m pytest tests/test_pipeline_synthesizer.py -v
```

Expected: all 22 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/reports/pipeline_synthesizer.py backend/tests/test_pipeline_synthesizer.py
git commit -m "feat: add pipeline report synthesizer service with unit tests"
```

---

### Task 2: Backend Schema Additions

**Files:**
- Modify: `backend/app/schemas/pipelines.py`

**Interfaces:**
- Produces: `UnifiedPipelineReport` Pydantic model — consumed by Task 3's route return type annotation.

- [ ] **Step 1: Write the failing import test**

Add this temporarily at the bottom of `backend/tests/test_pipeline_synthesizer.py` to confirm the import:

```python
def test_unified_schema_importable():
    from app.schemas.pipelines import UnifiedPipelineReport
    assert UnifiedPipelineReport is not None
```

Run: `python -m pytest tests/test_pipeline_synthesizer.py::test_unified_schema_importable -v`  
Expected: FAIL with `ImportError`.

- [ ] **Step 2: Add the Pydantic models**

Append to the **end** of `backend/app/schemas/pipelines.py`:

```python
class UnifiedPipelineSection(BaseModel):
    id: str
    title: str
    source_step_labels: list[str] = Field(default_factory=list)
    source_step_numbers: list[int] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
    combined_markdown: str = ""
    expandable: bool = False


class UnifiedHeadlineSummary(BaseModel):
    outcome: str = ""
    key_metrics: dict[str, Any] = Field(default_factory=dict)


class UnifiedFinalDeliverable(BaseModel):
    title_tag: str = ""
    meta_description: str = ""
    h1: str = ""
    article_body: str = ""


class UnifiedPipelineReport(BaseModel):
    pipeline_id: str
    pipeline_name: str
    pipeline_purpose: str = ""
    domain: str = ""
    headline_summary: UnifiedHeadlineSummary = Field(default_factory=UnifiedHeadlineSummary)
    narrative: str = ""
    sections: list[UnifiedPipelineSection] = Field(default_factory=list)
    final_deliverable: UnifiedFinalDeliverable | None = None
```

Note: `Any` is already imported via `from typing import Any` at the top of the file.

- [ ] **Step 3: Run the import test — expect pass**

```
cd backend && python -m pytest tests/test_pipeline_synthesizer.py::test_unified_schema_importable -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/pipelines.py
git commit -m "feat: add UnifiedPipelineReport Pydantic schema"
```

---

### Task 3: Backend Unified Report Route

**Files:**
- Modify: `backend/app/routers/pipelines.py`

**Interfaces:**
- Consumes: `get_pipeline_recent_results` (already imported), `synthesize_pipeline_report` from Task 1, `UnifiedPipelineReport` from Task 2.
- Produces: `GET /pipelines/{pipeline_id}/unified-report?project_id=UUID&domain=str` → JSON matching `UnifiedPipelineReport`.

- [ ] **Step 1: Add the route**

In `backend/app/routers/pipelines.py`, add these imports at the top (after existing imports):

```python
from app.schemas.pipelines import (
    PipelineExecuteRequest,
    PipelineExecuteResponse,
    PipelineListItem,
    PipelineStep,
    PipelineStepExecuteRequest,
    PipelineStepResult,
    UnifiedPipelineReport,        # ← add this
)
```

Then add this route **after** the `recent_pipeline_results` route (around line 61):

```python
@router.get("/{pipeline_id}/unified-report")
async def unified_pipeline_report(
    request: Request,
    pipeline_id: str,
    project_id: UUID = Query(...),
    domain: str = Query(default=""),
):
    """Return a synthesised unified pipeline report.

    Fetches the most recent completed step results for this pipeline and
    project, then calls the synthesiser to organise them by pipeline purpose
    and generate an AI executive narrative.
    """
    user = require_user(request)
    pool = get_pool()

    result = await get_pipeline_recent_results(
        pool,
        pipeline_id=pipeline_id,
        project_id=project_id,
        user_id=user.id,
    )
    if not result:
        raise not_found("No completed pipeline results found for this project")

    from app.services.reports.pipeline_synthesizer import synthesize_pipeline_report

    report = await synthesize_pipeline_report(
        pipeline_id=pipeline_id,
        pipeline_name=result["pipeline_name"],
        steps=result["steps"],
        domain=domain,
    )
    return report
```

- [ ] **Step 2: Verify the backend starts without errors**

```
cd backend && python -c "from app.routers.pipelines import router; print('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/pipelines.py
git commit -m "feat: add GET /pipelines/{id}/unified-report endpoint"
```

---

### Task 4: Frontend Type Additions

**Files:**
- Modify: `frontend/src/lib/types.ts`

**Interfaces:**
- Produces: `UnifiedPipelineSection`, `UnifiedPipelineReport` — consumed by Tasks 5 and 6.

- [ ] **Step 1: Append the new interfaces**

Add to the **end** of `frontend/src/lib/types.ts`:

```typescript
export interface UnifiedPipelineSection {
  id: string;
  title: string;
  source_step_labels: string[];
  source_step_numbers: number[];
  metrics: Record<string, string | number>;
  combined_markdown: string;
  expandable: boolean;
}

export interface UnifiedFinalDeliverable {
  title_tag: string;
  meta_description: string;
  h1: string;
  article_body: string;
}

export interface UnifiedPipelineReport {
  pipeline_id: string;
  pipeline_name: string;
  pipeline_purpose: string;
  domain: string;
  headline_summary: {
    outcome: string;
    key_metrics: Record<string, string | number>;
  };
  narrative: string;
  sections: UnifiedPipelineSection[];
  final_deliverable: UnifiedFinalDeliverable | null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: add UnifiedPipelineReport TypeScript interfaces"
```

---

### Task 5: Frontend Unified Report Component

**Files:**
- Create: `frontend/src/components/reports/unified-pipeline-report.tsx`

**Interfaces:**
- Consumes: `UnifiedPipelineReport`, `UnifiedPipelineSection`, `UnifiedFinalDeliverable` from Task 4.
- Consumes: `parseBlocksFromBody`, `renderReportBlocks` from `@/lib/report-view-model` and `@/components/reports/structured-report-view`.
- Produces: `export function UnifiedPipelineReportView(props)` — consumed by Task 6.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/reports/unified-pipeline-report.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Copy, FileDown, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseBlocksFromBody } from "@/lib/report-view-model";
import { renderReportBlocks } from "@/components/reports/structured-report-view";
import type { UnifiedPipelineReport, UnifiedPipelineSection } from "@/lib/types";

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ section }: { section: UnifiedPipelineSection }) {
  const [expanded, setExpanded] = useState(!section.expandable);
  const blocks = parseBlocksFromBody(section.combined_markdown);

  return (
    <section
      id={`section-${section.id}`}
      className="group bento-tile space-y-0 border-border-strong bg-surface-elevated/40 p-0 overflow-hidden"
    >
      {/* Section header */}
      <div className="flex items-center gap-3 border-b border-border-strong px-5 py-4">
        <span className="h-7 w-1 shrink-0 rounded-full bg-primary transition-all duration-300 group-hover:bg-primary-hover" />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {section.title}
          </h2>
          {section.source_step_labels.length > 0 && (
            <p className="mt-0.5 text-[11px] text-muted truncate">
              {section.source_step_labels.join(" · ")}
            </p>
          )}
        </div>

        {/* Inline metrics */}
        {Object.keys(section.metrics).length > 0 && (
          <div className="hidden sm:flex items-center gap-4 shrink-0">
            {Object.entries(section.metrics).map(([key, val]) => (
              <div key={key} className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {key.replace(/_/g, " ")}
                </p>
                <p className="text-sm font-bold tabular-nums text-foreground">{String(val)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Expand toggle */}
        {section.expandable && (
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="ml-2 shrink-0 flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-surface/60 text-muted transition-colors hover:border-primary/30 hover:text-primary"
            aria-label={expanded ? "Collapse section" : "Expand section"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Section body */}
      {expanded && (
        <div className="space-y-3 px-5 py-4">
          {blocks.length > 0 ? (
            renderReportBlocks(blocks)
          ) : (
            <p className="text-sm text-muted italic">No content generated for this section.</p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Final deliverable card ────────────────────────────────────────────────────

function FinalDeliverableCard({
  deliverable,
}: {
  deliverable: NonNullable<UnifiedPipelineReport["final_deliverable"]>;
}) {
  const [copied, setCopied] = useState(false);
  const [schemaExpanded, setSchemaExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(deliverable.article_body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="bento-tile border-primary/20 bg-primary/4 space-y-0 p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-primary/15 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">
            Final Deliverable
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground">
            Your Publish-Ready Page
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0 border-primary/30 text-primary hover:border-primary/60 hover:bg-primary/8"
          onClick={handleCopy}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied!" : "Copy Article"}
        </Button>
      </div>

      {/* Meta fields */}
      <div className="space-y-4 px-5 py-4">
        {deliverable.title_tag && (
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Title Tag</p>
            <p className="rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm font-medium text-foreground">
              {deliverable.title_tag}
            </p>
          </div>
        )}

        {deliverable.meta_description && (
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Meta Description
            </p>
            <p className="rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm text-foreground">
              {deliverable.meta_description}
            </p>
          </div>
        )}

        {deliverable.h1 && (
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">H1</p>
            <p className="rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm font-semibold text-foreground">
              {deliverable.h1}
            </p>
          </div>
        )}

        {/* Article body preview */}
        {deliverable.article_body && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Article Body
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-surface/80 px-3 py-2 space-y-2 text-sm">
              {renderReportBlocks(parseBlocksFromBody(deliverable.article_body))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Metrics strip ─────────────────────────────────────────────────────────────

function MetricsStrip({ report }: { report: UnifiedPipelineReport }) {
  const steps = report.headline_summary.key_metrics.steps_completed as number | undefined;

  // Pull the first score we can find across sections
  const firstScore = report.sections
    .map((s) => s.metrics.score as number | undefined)
    .find((s) => s !== undefined);

  const totalWords = report.sections
    .map((s) => s.metrics.words_written as number | undefined)
    .find((w) => w !== undefined);

  const tiles = [
    steps !== undefined && { label: "Skills Run", value: String(steps) },
    firstScore !== undefined && { label: "Score", value: `${firstScore}/100` },
    totalWords !== undefined && { label: "Words", value: String(totalWords) },
    report.sections.length > 0 && { label: "Sections", value: String(report.sections.length) },
  ].filter(Boolean) as { label: string; value: string }[];

  if (tiles.length === 0) return null;

  return (
    <div className="bento-grid-4">
      {tiles.map(({ label, value }) => (
        <div key={label} className="bento-tile">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UnifiedPipelineReportView({
  report,
  onSave,
  saving,
  saveMessage,
  error,
  pdfDownloading,
  onDownloadPdf,
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
}: {
  report: UnifiedPipelineReport;
  onSave?: () => void;
  saving?: boolean;
  saveMessage?: string;
  error?: string;
  pdfDownloading?: boolean;
  onDownloadPdf?: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── Main column ── */}
      <div className="space-y-5">
        {/* Header card */}
        <Card className="glass-panel-strong overflow-hidden border-border/70">
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  Pipeline Report
                </p>
                <CardTitle className="mt-1 text-xl tracking-tight text-foreground">
                  {report.pipeline_name}
                </CardTitle>
                {report.pipeline_purpose && (
                  <p className="mt-1 text-xs text-muted max-w-xl">{report.pipeline_purpose}</p>
                )}
                {report.domain && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-[11px] text-muted">
                    {report.domain}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onDownloadPdf && (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={onDownloadPdf}
                    disabled={pdfDownloading}
                  >
                    <FileDown className="h-4 w-4" />
                    {pdfDownloading ? "Generating…" : "Download PDF"}
                  </Button>
                )}
                {onSave && (
                  <Button
                    type="button"
                    className="gap-2 shadow-[0_10px_22px_rgba(224,138,60,0.18)]"
                    onClick={onSave}
                    disabled={saving}
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Saving…" : "Save all reports"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          {(saveMessage || error) && (
            <CardContent className="pt-4">
              {saveMessage && (
                <p className="rounded-xl border border-success/25 bg-success-soft/20 px-4 py-2 text-sm text-success">
                  {saveMessage}
                </p>
              )}
              {error && (
                <p className="mt-2 rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </CardContent>
          )}
        </Card>

        {/* Report body */}
        <article className="glass-panel-strong space-y-6 rounded-2xl border-border/70 p-4 sm:p-6 lg:p-7">
          {/* Metrics strip */}
          <MetricsStrip report={report} />

          {/* Narrative block */}
          {report.narrative && (
            <section className="bento-tile bento-wide border-border-strong bg-surface-elevated/50">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/80">
                Executive Summary
              </p>
              <div className="mt-3 space-y-3">
                {report.narrative.split(/\n{2,}/).map((para, i) => (
                  <p
                    key={`para-${i}`}
                    className="text-[15px] leading-relaxed text-foreground"
                  >
                    {para.trim()}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Outcome line */}
          {report.headline_summary.outcome && (
            <p className="text-sm text-muted">{report.headline_summary.outcome}</p>
          )}

          {/* Sections */}
          <div className="space-y-4">
            {report.sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>

          {/* Final deliverable */}
          {report.final_deliverable && (
            <FinalDeliverableCard deliverable={report.final_deliverable} />
          )}
        </article>
      </div>

      {/* ── Sidebar ── */}
      <aside className="order-first space-y-5 xl:order-none xl:sticky xl:top-6 xl:self-start">
        {/* Pipeline overview */}
        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Pipeline Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted leading-relaxed">{report.pipeline_purpose}</p>
            <div className="space-y-1.5">
              {report.sections.map((section, i) => (
                <a
                  key={section.id}
                  href={`#section-${section.id}`}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm text-foreground hover:border-primary/30 hover:text-primary transition-colors"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="truncate">{section.title}</span>
                </a>
              ))}
              {report.final_deliverable && (
                <a
                  href="#section-final-deliverable"
                  className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/12 transition-colors"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                    ★
                  </span>
                  <span>Final Deliverable</span>
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Next Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href={`/pipeline/${report.pipeline_id}`}
              className="block rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/15"
            >
              Re-run Pipeline
            </Link>
            <Link
              href={backHref}
              className="block rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-all duration-200 hover:bg-accent-soft/60 hover:underline"
            >
              {backLabel}
            </Link>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors referencing `unified-pipeline-report.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/reports/unified-pipeline-report.tsx
git commit -m "feat: add UnifiedPipelineReportView component"
```

---

### Task 6: Update Pipeline View Page

**Files:**
- Modify: `frontend/src/app/(app)/reports/pipeline-view/page.tsx`

**Interfaces:**
- Consumes: `UnifiedPipelineReport` from Task 4, `UnifiedPipelineReportView` from Task 5.
- Consumes: existing `api.get`, `StructuredReportView` (kept as fallback).

- [ ] **Step 1: Replace the pipeline-view page**

Replace the full contents of `frontend/src/app/(app)/reports/pipeline-view/page.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { downloadReportPdf } from "@/lib/report-pdf";
import { getExecutionMarkdown } from "@/lib/report-utils";
import { fetchPipelines, getPipelineById } from "@/lib/pipelines";
import { pluginSuggestions } from "@/lib/plugin-report-presenters";
import { mergeMetrics } from "@/lib/report-view-model";
import {
  StructuredReportView,
  buildPipelineStepReports,
} from "@/components/reports/structured-report-view";
import { UnifiedPipelineReportView } from "@/components/reports/unified-pipeline-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PipelineExecuteResponse, UnifiedPipelineReport } from "@/lib/types";
import { useProjectStore } from "@/stores/project-store";

export default function PipelineReportViewPage() {
  const params = useSearchParams();
  const pipelineId = params.get("pipelineId") || "";
  const projectId = params.get("projectId") || "";
  const siteUrlParam = params.get("site_url") || "";
  const { activeProjectId } = useProjectStore();
  const effectiveProjectId = projectId || activeProjectId || "";

  // Unified report state (primary path)
  const [unifiedReport, setUnifiedReport] = useState<UnifiedPipelineReport | null>(null);
  const [unifiedLoading, setUnifiedLoading] = useState(true);

  // Fallback (legacy stacked view) state
  const [legacyResult, setLegacyResult] = useState<PipelineExecuteResponse | null>(null);
  const [pipelineName, setPipelineName] = useState("Pipeline Report");
  const [useFallback, setUseFallback] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [error, setError] = useState("");

  // Derive domain from site_url param
  const domain = useMemo(() => {
    if (!siteUrlParam) return "";
    try {
      return new URL(siteUrlParam).hostname.replace(/^www\./, "");
    } catch {
      return siteUrlParam;
    }
  }, [siteUrlParam]);

  useEffect(() => {
    if (!pipelineId || !effectiveProjectId) {
      setError(
        !pipelineId
          ? "Missing pipelineId."
          : "Select a project to view this pipeline report.",
      );
      setUnifiedLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // Resolve pipeline name for PDF export / fallback label
      try {
        const pipelines = await fetchPipelines();
        const pipeline =
          pipelines.find((p) => p.id === pipelineId) ?? getPipelineById(pipelineId);
        if (pipeline) setPipelineName(pipeline.name);
      } catch {
        // Non-critical — pipeline name just shows as default
      }

      // ── Primary path: unified report ──────────────────────────────────────
      try {
        const domainParam = domain ? `&domain=${encodeURIComponent(domain)}` : "";
        const data = await api.get<UnifiedPipelineReport>(
          `/pipelines/${pipelineId}/unified-report?project_id=${encodeURIComponent(effectiveProjectId)}${domainParam}`,
        );
        if (!cancelled) {
          setUnifiedReport(data);
          setUnifiedLoading(false);
        }
        return; // ← unified path succeeded; skip fallback fetch
      } catch {
        // Unified report unavailable — fall through to legacy view
      }

      // ── Fallback path: stacked per-skill view ─────────────────────────────
      try {
        const data = await api.get<PipelineExecuteResponse>(
          `/pipelines/${pipelineId}/recent-results?project_id=${encodeURIComponent(effectiveProjectId)}`,
        );
        if (!cancelled) {
          setLegacyResult(data);
          setUseFallback(true);
        }
      } catch {
        if (!cancelled) setError("No pipeline report found. Run the pipeline first.");
      } finally {
        if (!cancelled) setUnifiedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pipelineId, effectiveProjectId, domain]);

  // ── Legacy view helpers (only used when useFallback === true) ────────────

  const stepReports = useMemo(() => {
    if (!legacyResult?.steps.length) return [];
    return buildPipelineStepReports(legacyResult.steps, (step) =>
      getExecutionMarkdown(
        step.output ?? { markdown: step.output_markdown, structured: {} },
        step.plugin_name,
      ),
    );
  }, [legacyResult]);

  const combinedMarkdown = useMemo(() => {
    if (!legacyResult) return "";
    return stepReports
      .map((step) => `## Step ${step.step}: ${step.label}\n\n${step.markdown}`)
      .join("\n\n---\n\n");
  }, [legacyResult, stepReports]);

  const metrics = useMemo(
    () =>
      stepReports.length ? mergeMetrics(stepReports.map((s) => s.reportJson)) : null,
    [stepReports],
  );

  const overallScore = useMemo(() => {
    const scores = stepReports
      .map((s) => s.overallScore)
      .filter((s): s is number => s !== null);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [stepReports]);

  const pipelineReportJson = useMemo(() => {
    if (!legacyResult || !stepReports[0]) return null;
    return {
      ...stepReports[0].reportJson,
      plugin_name: pipelineName,
      execution_id: legacyResult.steps.map((s) => s.execution_id).join(","),
    };
  }, [legacyResult, stepReports, pipelineName]);

  const suggestions = useMemo(() => {
    const names = legacyResult?.steps.map((s) => s.plugin_name) ?? [];
    const unique = [...new Set(names)];
    return unique.flatMap((name) => pluginSuggestions(name)).slice(0, 5);
  }, [legacyResult]);

  // ── Save handler (works for both views) ──────────────────────────────────

  const handleSaveAll = async () => {
    if (!effectiveProjectId) return;
    const steps = legacyResult?.steps ?? [];
    if (!steps.length) return;
    setSaving(true);
    setSaveMessage("");
    try {
      for (const step of steps) {
        const output = step.output ?? { markdown: step.output_markdown, structured: {} };
        await api.post("/outputs", {
          project_id: effectiveProjectId,
          plugin_id: step.plugin_id,
          execution_id: step.execution_id,
          input_snapshot: {},
          schema_version: step.schema_version ?? 1,
          generated_output: output,
        });
      }
      setSaveMessage(`Saved ${steps.length} reports to project.`);
    } catch {
      setError("Failed to save one or more reports.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!stepReports.length) return;
    setPdfDownloading(true);
    setError("");
    try {
      await downloadReportPdf({
        pluginName: pipelineName,
        title: pipelineName,
        executionId: legacyResult?.steps.map((s) => s.execution_id).join(", "),
        generatedAt: new Date().toISOString(),
        overallScore,
        sections: [],
        pipelineSteps: stepReports,
        metrics: metrics ?? undefined,
        suggestions,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not generate PDF. Please try again.",
      );
    } finally {
      setPdfDownloading(false);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (unifiedLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface/50" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface/80" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-surface/80" />
      </div>
    );
  }

  // ── Error / empty state ───────────────────────────────────────────────────

  if (!unifiedReport && !legacyResult) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error || "No pipeline report available."}</p>
        {pipelineId && (
          <Link
            href={`/pipeline/${pipelineId}${effectiveProjectId ? `?project=${effectiveProjectId}` : ""}`}
            className="text-primary hover:underline"
          >
            Run pipeline
          </Link>
        )}
      </div>
    );
  }

  // ── Primary: unified report ───────────────────────────────────────────────

  if (unifiedReport && !useFallback) {
    return (
      <UnifiedPipelineReportView
        report={unifiedReport}
        onSave={legacyResult ? handleSaveAll : undefined}
        saving={saving}
        saveMessage={saveMessage}
        error={error}
        onDownloadPdf={legacyResult ? handleDownloadPdf : undefined}
        pdfDownloading={pdfDownloading}
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />
    );
  }

  // ── Fallback: legacy stacked view ────────────────────────────────────────

  return (
    <StructuredReportView
      title={pipelineName}
      subtitle={`${legacyResult!.steps.length} skills • Prepared by SkillSearchFit • ${new Date().toLocaleDateString()}`}
      reportJson={pipelineReportJson}
      metrics={metrics}
      overallScore={overallScore}
      structuredSections={[]}
      pipelineSteps={stepReports}
      fullMarkdown={combinedMarkdown}
      suggestions={suggestions}
      onDownloadPdf={handleDownloadPdf}
      pdfDownloading={pdfDownloading}
      onSave={handleSaveAll}
      saving={saving}
      saveMessage={saveMessage}
      error={error}
      backHref="/dashboard"
      backLabel="Back to dashboard"
      sidebarExtra={
        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Pipeline Skills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stepReports.map((step) => (
              <Link
                key={step.executionId}
                href={`/reports/view?executionId=${step.executionId}&pluginId=${step.pluginId}`}
                className="block rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm text-foreground hover:border-primary/30 hover:text-primary"
              >
                <span className="font-medium">
                  {step.step}. {step.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {displayPluginName(step.pluginName)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      }
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/(app)/reports/pipeline-view/page.tsx
git commit -m "feat: use UnifiedPipelineReportView in pipeline-view page with legacy fallback"
```

---

## Self-Review Against Spec

### Spec Coverage

| Spec requirement | Task that covers it |
|---|---|
| Backend synthesis service | Task 1 |
| Pipeline section map for all 4 pipelines | Task 1 (PIPELINE_CONFIGS) |
| AI-generated executive narrative | Task 1 (`_generate_narrative`) |
| Narrative prompt exact wording | Task 1 (`_generate_narrative` docstring + prompt) |
| Final deliverable extraction for content pipelines | Task 1 (`_extract_final_deliverable`) |
| Unified report Pydantic schema | Task 2 |
| Backend unified-report route | Task 3 |
| Frontend TypeScript types | Task 4 |
| Header with pipeline name, purpose, domain | Task 5 (header card) |
| Metrics strip (steps, score, words) | Task 5 (`MetricsStrip`) |
| Narrative block prominent at top | Task 5 (narrative section in article) |
| Sections organised by purpose, not skill order | Task 1 + Task 5 |
| Expandable/collapsible long sections | Task 5 (`SectionCard` + `expanded` state) |
| Final deliverable with Copy Article button | Task 5 (`FinalDeliverableCard`) |
| Sidebar section nav | Task 5 (Pipeline Overview card) |
| Re-run Pipeline button | Task 5 (Next Actions card) |
| Single-skill runs unchanged | No touch to `reports/view/page.tsx` |
| Pipeline execution unchanged | No touch to `services/execution/` |
| Fallback to old view on endpoint failure | Task 6 (catch → `setUseFallback(true)`) |
| Unit tests for all sync helpers | Task 1 (22 test cases) |

### What Phase 7 Requires for Verification

After completing all tasks, manually test:
1. Run the Full Content Page Pipeline against a test site URL → navigate to `/reports/pipeline-view` → confirm unified report shows 5 sections, narrative block, and final deliverable card.
2. View the same URL without a backend AI key configured → confirm sections render, narrative is empty, no crash.
3. Navigate to `/reports/view` for any single skill → confirm existing format is unchanged.
4. With the backend offline or returning 500 on `unified-report` → confirm the old stacked view appears seamlessly.
5. Confirm "Copy Article" button copies the article body to clipboard.
6. Confirm "Re-run Pipeline" link leads to `/pipeline/{id}`.

### Items Deferred to Follow-up PR

- **Caching**: narrative generation adds ~3-5s on first load. Adding a DB column `synthesized_report` to pipeline_runs would eliminate regeneration. Not in scope here.
- **Progressive disclosure during execution**: showing the unified report building in real-time while `pipeline-view.tsx` runs steps. Requires passing step results to the report page via shared state or a streaming endpoint. Not in scope here.
- **"Download as HTML" button**: would generate an HTML file from the article body. Straightforward but not in scope.
- **"Publish to WordPress"**: wire the Elementor publish agent to the Final Deliverable card. Depends on finding the WordPress publish route in the existing codebase.
- **PDF export for unified report**: `handleDownloadPdf` currently requires `stepReports` (from legacy fetch). The unified path doesn't load `legacyResult` unless the unified endpoint fails. If PDF export is needed for the primary path, a separate API fetch for `recent-results` would be needed.

---

## Unified Report Object Shape (Complete Reference)

```
UnifiedPipelineReport {
  pipeline_id:       string        — matches the pipeline definition ID
  pipeline_name:     string        — human-readable pipeline name
  pipeline_purpose:  string        — one-sentence pipeline purpose
  domain:            string        — hostname extracted from site_url param (may be "")
  headline_summary: {
    outcome:         string        — "Pipeline completed for example.com — N skills executed."
    key_metrics: {
      steps_completed: number      — always present
    }
  }
  narrative:         string        — AI-generated 2-3 paragraph executive summary
                                     (empty string if AI unavailable or on error)
  sections: [
    {
      id:                   string     — kebab-case identifier
      title:                string     — human-readable section title
      source_step_labels:   string[]  — labels of steps that contributed
      source_step_numbers:  number[]  — 1-based step indices that contributed
      metrics: {
        words_written?: number         — extracted via regex from combined_markdown
        score?:         number         — extracted via regex from combined_markdown
      }
      combined_markdown:    string     — concatenated markdown from source steps
      expandable:           boolean    — true for long-form content sections (article body)
    }
  ]
  final_deliverable: null | {
    title_tag:         string   — extracted from on-page-seo or content-creation step
    meta_description:  string   — extracted from on-page-seo or content-creation step
    h1:                string   — extracted from on-page-seo or content-creation step
    article_body:      string   — full article markdown from on-page-seo or content-creation step
  }
}
```
