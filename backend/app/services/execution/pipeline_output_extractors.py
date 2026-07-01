"""Structured extraction of next-step inputs from prior plugin step output."""

from __future__ import annotations

import re
from typing import Any

from app.data.pipelines import _keywords_from_prior_steps

Extractor = dict[str, Any]


def _last_step_result(step_results: list[dict[str, Any]] | None) -> dict[str, Any] | None:
    if not step_results:
        return None
    return step_results[-1]


def _step_markdown(step: dict[str, Any] | None) -> str:
    if not step:
        return ""
    output = step.get("output") or {}
    if isinstance(output, dict):
        md = output.get("markdown") or step.get("output_markdown") or ""
        if md:
            return str(md)
    return str(step.get("output_markdown") or "")


def _structured(step: dict[str, Any] | None) -> dict[str, Any]:
    if not step:
        return {}
    output = step.get("output")
    if isinstance(output, dict):
        structured = output.get("structured")
        if isinstance(structured, dict):
            return structured
        return output
    return {}


def _bullet_lines(text: str, *, max_items: int = 12) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        cleaned = re.sub(r"^[\s#>*\-\d|.]+", "", line).strip()
        if not cleaned or len(cleaned) > 120:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        found.append(cleaned)
        if len(found) >= max_items:
            break
    return found


def _table_column_values(markdown: str, column_hints: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    lines = markdown.splitlines()
    target_col: int | None = None
    for line in lines:
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not cells:
            continue
        lower_cells = [c.lower() for c in cells]
        if target_col is None:
            for hint in column_hints:
                for idx, cell in enumerate(lower_cells):
                    if hint in cell:
                        target_col = idx
                        break
                if target_col is not None:
                    break
            continue
        if re.match(r"^[\s\-:|]+$", line):
            continue
        if target_col < len(cells):
            val = cells[target_col].strip()
            if val and val.lower() not in {"keyword", "primary", "title", "topic"}:
                values.append(val)
    return values


def _first_heading(markdown: str) -> str:
    for line in markdown.splitlines():
        match = re.match(r"^#{1,3}\s+(.+)$", line.strip())
        if match:
            title = match.group(1).strip()
            if title.lower() not in {
                "keyword clusters",
                "content strategy",
                "content brief",
                "competitor analysis report",
            }:
                return title
    return ""


def _extract_urls(text: str) -> list[str]:
    return re.findall(r"https?://[^\s|)>\"']+", text)


def _join_unique(lines: list[str]) -> str:
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        key = line.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(line.strip())
    return "\n".join(out)


def _brand_name(base: dict[str, Any]) -> str:
    return str(base.get("brand_name") or base.get("business_name") or "").strip()


def _site_url(base: dict[str, Any]) -> str:
    return str(base.get("site_url") or base.get("website_url") or "").strip()


def extract_desired_word_count(
    competitor_data: dict[str, Any] | None,
    markdown: str = "",
) -> int:
    if competitor_data:
        wc = competitor_data.get("minimum_competitive_word_count")
        if wc is not None:
            try:
                return max(500, int(wc))
            except (TypeError, ValueError):
                pass
    match = re.search(r"(?:word count|words)\s*[:|-]?\s*(\d{3,5})", markdown, re.I)
    if match:
        return max(500, int(match.group(1)))
    return 1500


def extract_create_topic_keywords(step: dict[str, Any] | None) -> str:
    markdown = _step_markdown(step)
    structured = _structured(step)
    topics = structured.get("topics") or structured.get("topic_ideas")
    if isinstance(topics, list):
        titles = [str(t.get("title", t) if isinstance(t, dict) else t) for t in topics]
        titles = [t for t in titles if t.strip()]
        if titles:
            return _join_unique(titles)
    table_kw = _table_column_values(markdown, ("topic", "title", "keyword", "seed"))
    if table_kw:
        return _join_unique(table_kw)
    bullets = _bullet_lines(markdown)
    if bullets:
        return _join_unique(bullets)
    return _keywords_from_prior_steps([markdown])


def extract_create_topic_seed(step: dict[str, Any] | None, base: dict[str, Any]) -> str:
    markdown = _step_markdown(step)
    heading = _first_heading(markdown)
    if heading:
        return heading
    bullets = _bullet_lines(markdown, max_items=1)
    if bullets:
        return bullets[0]
    return str(base.get("seed_topic") or base.get("seed") or "")


def extract_cluster_primary_keywords(step: dict[str, Any] | None) -> str:
    markdown = _step_markdown(step)
    structured = _structured(step)
    clusters = structured.get("clusters")
    if isinstance(clusters, list):
        primaries: list[str] = []
        for cluster in clusters:
            if isinstance(cluster, dict):
                primary = cluster.get("primary_keyword") or cluster.get("primary")
                if primary:
                    primaries.append(str(primary))
        if primaries:
            return _join_unique(primaries)
    table_kw = _table_column_values(markdown, ("primary", "keyword", "cluster"))
    if table_kw:
        return _join_unique(table_kw)
    return _keywords_from_prior_steps([markdown])


def extract_strategy_seed_keywords(step: dict[str, Any] | None) -> str:
    markdown = _step_markdown(step)
    table_kw = _table_column_values(markdown, ("keyword", "title", "topic"))
    if table_kw:
        return _join_unique(table_kw)
    return _keywords_from_prior_steps([markdown])


def extract_brief_target_keyword(step: dict[str, Any] | None, base: dict[str, Any]) -> str:
    markdown = _step_markdown(step)
    structured = _structured(step)
    for key in ("target_keyword", "primary_keyword", "keyword"):
        val = structured.get(key)
        if val:
            return str(val)
    match = re.search(r"(?:target keyword|primary keyword)\s*[:|-]\s*(.+)", markdown, re.I)
    if match:
        return match.group(1).strip()
    bullets = _bullet_lines(markdown, max_items=1)
    if bullets:
        return bullets[0]
    return str(base.get("seed_topic") or base.get("seed") or "")


def extract_article_body(step: dict[str, Any] | None) -> str:
    markdown = _step_markdown(step)
    structured = _structured(step)
    for key in ("article_body", "body", "content", "markdown"):
        val = structured.get(key)
        if val and str(val).strip():
            return str(val)[:12000]
    return markdown[:12000]


def extract_competitor_urls(step: dict[str, Any] | None, base: dict[str, Any]) -> str:
    markdown = _step_markdown(step)
    urls = _extract_urls(markdown)
    if urls:
        return _join_unique(urls)
    return str(base.get("competitors") or "")


def extract_competitor_gaps(step: dict[str, Any] | None) -> str:
    markdown = _step_markdown(step)
    table_kw = _table_column_values(markdown, ("topic", "keyword", "gap", "opportunity"))
    if table_kw:
        return _join_unique(table_kw)
    return _keywords_from_prior_steps([markdown])


def extract_ai_visibility_prompts(step: dict[str, Any] | None) -> str:
    markdown = _step_markdown(step)
    structured = _structured(step)
    prompts = structured.get("target_prompts") or structured.get("prompts")
    if isinstance(prompts, list):
        return _join_unique([str(p) for p in prompts if str(p).strip()])
    bullets = _bullet_lines(markdown, max_items=8)
    if bullets:
        return _join_unique(bullets)
    return markdown[:2000]


def _structured_field_values(step: dict[str, Any] | None, keys: list[str]) -> dict[str, Any]:
    """Map transition field keys from plugin structured output when present."""
    structured = _structured(step)
    if not structured:
        return {}
    aliases = {
        "keywords": ("keywords", "seed_keywords", "topic_keywords"),
        "seed_keywords": ("seed_keywords", "primary_keywords", "keywords"),
        "target_keyword": ("target_keyword", "primary_keyword", "keyword"),
        "business_name": ("business_name", "brand_name", "company_name"),
        "business_niche": ("business_niche", "niche", "industry"),
        "competitors": ("competitors", "competitor_urls"),
        "competitor_urls": ("competitor_urls", "competitors"),
        "content_brief": ("content_brief", "brief", "outline"),
        "desired_word_count": ("desired_word_count", "target_word_count", "word_count"),
    }
    out: dict[str, Any] = {}
    for key in keys:
        candidates = aliases.get(key, (key,))
        for candidate in candidates:
            val = structured.get(candidate)
            if val is None or val == "":
                continue
            if isinstance(val, list):
                out[key] = _join_unique([str(v) for v in val])
            else:
                out[key] = val
            break
    return out


def apply_transition_extractors(
    pipeline_id: str,
    completed_step_index: int,
    auto_inputs: dict[str, Any],
    *,
    step_results: list[dict[str, Any]] | None,
    base_inputs: dict[str, Any],
    prior_markdown: list[str],
    competitor_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge structured extractions from the last completed step onto mapped inputs."""
    merged = dict(auto_inputs)
    last = _last_step_result(step_results)

    from app.services.execution.pipeline_inter_skill import get_transition_field_defs

    field_defs = get_transition_field_defs(pipeline_id, completed_step_index)
    if field_defs and last:
        merged.update(_structured_field_values(last, [f["key"] for f in field_defs]))

    brand = _brand_name(base_inputs)
    site = _site_url(base_inputs)

    if brand:
        merged.setdefault("business_name", brand)
        merged.setdefault("business_niche", brand)

    if site:
        merged.setdefault("website_url", site)
        merged.setdefault("site_url", site)
        merged.setdefault("page_url", site)
        merged.setdefault("priority_pages", site)
        merged.setdefault("internal_link_targets", site)

    if not last:
        return merged

    plugin_name = str(last.get("plugin_name") or "")
    markdown = _step_markdown(last)

    # ── Full Content Page Pipeline ─────────────────────────────────────────────
    if pipeline_id == "full-content-page-pipeline":
        if completed_step_index == 0 and plugin_name == "Create Topic":
            keywords = extract_create_topic_keywords(last)
            if keywords:
                merged["keywords"] = keywords
        elif completed_step_index == 1 and plugin_name == "Keyword Clustering":
            seed_kw = extract_cluster_primary_keywords(last)
            if seed_kw:
                merged["seed_keywords"] = seed_kw
            if markdown:
                merged["existing_content"] = markdown[:6000]
        elif completed_step_index == 2 and plugin_name in ("Content Strategy", "content-strategy"):
            target = extract_brief_target_keyword(last, base_inputs)
            if target:
                merged["target_keyword"] = target
            competitors = extract_competitor_urls(last, base_inputs)
            if competitors:
                merged["competitor_urls"] = competitors
            if markdown:
                merged["unique_angle"] = markdown[:4000]
            merged["desired_word_count"] = extract_desired_word_count(competitor_data, markdown)
        elif completed_step_index == 3 and plugin_name in ("Content Brief Generator", "Content Brief"):
            target = extract_brief_target_keyword(last, base_inputs)
            topic = _first_heading(markdown) or target
            if topic:
                merged["topic"] = topic
            if target:
                merged["primary_keyword"] = target
            if markdown:
                merged["content_brief"] = markdown[:12000]
            merged["target_word_count"] = extract_desired_word_count(competitor_data, markdown)
        elif completed_step_index == 4 and plugin_name in ("Create SEO-Optimized Content", "Create Content"):
            body = extract_article_body(last)
            if body:
                merged["page_content"] = body
            target = extract_brief_target_keyword(last, base_inputs)
            if target:
                merged["target_keyword"] = target
            if site:
                merged["page_url"] = site
        elif completed_step_index == 5 and plugin_name in ("On-Page SEO Optimization", "On-Page SEO"):
            body = extract_article_body(last)
            if body:
                merged["page_inventory"] = body[:8000]
            seed = str(base_inputs.get("seed_topic") or brand or "")
            if seed:
                merged["topic_clusters"] = seed
            if site:
                merged["priority_pages"] = site

    # ── Content Production Pipeline ───────────────────────────────────────────
    elif pipeline_id == "content-production-pipeline":
        if completed_step_index == 0 and plugin_name == "Competitor Analyzer":
            gaps = extract_competitor_gaps(last)
            if gaps:
                merged["seed"] = gaps.splitlines()[0]
            competitors = extract_competitor_urls(last, base_inputs)
            if competitors:
                merged["competitors"] = competitors
        elif completed_step_index == 1 and plugin_name == "Create Topic":
            keywords = extract_create_topic_keywords(last)
            if keywords:
                merged["keywords"] = keywords
            if brand:
                merged["business_niche"] = brand
        elif completed_step_index == 2 and plugin_name == "Keyword Clustering":
            primaries = extract_cluster_primary_keywords(last)
            target = primaries.splitlines()[0] if primaries else ""
            if target:
                merged["target_keyword"] = target
            competitors = extract_competitor_urls(last, base_inputs)
            if competitors:
                merged["competitor_urls"] = competitors
            merged["desired_word_count"] = extract_desired_word_count(competitor_data, markdown)
        elif completed_step_index == 3 and plugin_name in ("Content Brief Generator", "Content Brief"):
            topic = _first_heading(markdown) or extract_brief_target_keyword(last, base_inputs)
            if topic:
                merged["topic"] = topic
            if markdown:
                merged["content_brief"] = markdown[:12000]
            merged["target_word_count"] = extract_desired_word_count(competitor_data, markdown)
        elif completed_step_index == 4 and plugin_name in ("Create SEO-Optimized Content", "Create Content"):
            body = extract_article_body(last)
            if body:
                merged["page_inventory"] = body[:8000]
            seed = str(base_inputs.get("seed_topic") or "")
            if seed:
                merged["topic_clusters"] = seed

    # ── Audit → Fix → Verify ──────────────────────────────────────────────────
    elif pipeline_id == "audit-fix-verify":
        if markdown:
            if completed_step_index == 0:
                merged["known_issues"] = markdown[:6000]
                if site:
                    merged["pages_to_audit"] = site
            elif completed_step_index in (1, 2, 3, 4):
                merged.setdefault("known_issues", markdown[:6000])
                merged.setdefault("page_content", markdown[:10000])
                merged.setdefault("codebase_content", markdown[:6000])
            if site:
                merged.setdefault("page_url", site)
                merged.setdefault("target_keyword", str(base_inputs.get("seed_topic") or brand or ""))

    # ── AI Visibility Flywheel ────────────────────────────────────────────────
    elif pipeline_id == "ai-visibility-flywheel":
        if completed_step_index == 0 and plugin_name in ("AI Visibility & Tracking", "AI Visibility"):
            prompts = extract_ai_visibility_prompts(last)
            if prompts:
                merged["target_prompts"] = prompts
            gaps = extract_competitor_gaps(last)
            if gaps:
                merged["competitors"] = gaps
        elif completed_step_index == 1 and plugin_name == "Competitor Analyzer":
            if markdown:
                merged["competitors"] = markdown[:4000]
        elif completed_step_index == 2 and plugin_name in ("Create SEO-Optimized Content", "Create Content"):
            merged["content_brief"] = markdown[:8000] if markdown else merged.get("content_brief", "")
            topic = _first_heading(markdown) or extract_brief_target_keyword(last, base_inputs)
            if topic:
                merged["topic"] = topic
        elif completed_step_index == 3 and plugin_name in ("Generate Schema Markup", "Schema Markup"):
            merged["page_content"] = extract_article_body(last)

    if not str(merged.get("keywords") or "").strip() and plugin_name == "Create Topic":
        kw = _keywords_from_prior_steps(prior_markdown)
        if kw:
            merged["keywords"] = kw

    return merged
