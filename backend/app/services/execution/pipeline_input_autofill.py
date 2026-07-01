"""Autofill missing plugin inputs during pipeline execution."""

from __future__ import annotations

from typing import Any

from app.data.pipelines import _keywords_from_prior_steps, _resolved_competitors
from app.services.validation import collect_plugin_input_errors
from app.services.website_analysis.autofill import hydrate_autofill_fields_async


def _merge_base_inputs(step_inputs: dict[str, Any], enriched_base: dict[str, Any]) -> dict[str, Any]:
    merged = dict(step_inputs)
    passthrough_keys = (
        "business_name",
        "brand_name",
        "business_description",
        "target_audience",
        "seed_keywords",
        "seed_topic",
        "competitors",
        "website_url",
        "site_url",
        "publishing_cadence",
        "planning_horizon",
        "business_priorities",
        "existing_content",
        "value_proposition",
    )
    for key in passthrough_keys:
        if str(merged.get(key, "") or "").strip():
            continue
        value = enriched_base.get(key)
        if value is not None and str(value).strip():
            merged[key] = value
    return merged


def _boost_pipeline_fields(
    step_inputs: dict[str, Any],
    enriched_base: dict[str, Any],
    prior_markdown: list[str],
) -> dict[str, Any]:
    boosted = dict(step_inputs)

    if not str(boosted.get("competitors", "") or "").strip():
        competitors = _resolved_competitors(enriched_base, prior_markdown)
        if competitors:
            boosted["competitors"] = competitors

    if not str(boosted.get("seed_keywords", "") or "").strip():
        from_prior = _keywords_from_prior_steps(prior_markdown)
        if from_prior:
            boosted["seed_keywords"] = from_prior
        elif enriched_base.get("seed_topic"):
            boosted["seed_keywords"] = enriched_base["seed_topic"]
        elif enriched_base.get("seed"):
            boosted["seed_keywords"] = enriched_base["seed"]

    if not str(boosted.get("business_description", "") or "").strip():
        boosted["business_description"] = (
            enriched_base.get("business_description")
            or enriched_base.get("value_proposition")
            or ""
        )

    if not str(boosted.get("existing_content", "") or "").strip() and prior_markdown:
        boosted["existing_content"] = "\n\n---\n\n".join(prior_markdown)[:6000]

    if not str(boosted.get("publishing_cadence", "") or "").strip():
        boosted["publishing_cadence"] = enriched_base.get("publishing_cadence") or "growth"

    if not str(boosted.get("planning_horizon", "") or "").strip():
        boosted["planning_horizon"] = enriched_base.get("planning_horizon") or "8"

    return boosted


async def autofill_pipeline_step_inputs(
    *,
    input_fields: list[dict[str, Any]],
    step_inputs: dict[str, Any],
    enriched_base: dict[str, Any],
    prior_markdown: list[str],
    plugin_name: str,
    plugin_category: str = "",
    plugin_description: str = "",
) -> dict[str, Any]:
    """Fill any missing required plugin fields from cache, heuristics, and AI."""
    result = _boost_pipeline_fields(
        _merge_base_inputs(step_inputs, enriched_base),
        enriched_base,
        prior_markdown,
    )

    if not collect_plugin_input_errors(input_fields, result):
        return result

    site_url = str(
        result.get("site_url")
        or result.get("website_url")
        or enriched_base.get("site_url")
        or enriched_base.get("website_url")
        or ""
    ).strip()

    website_analysis = enriched_base.get("_website_intelligence") or {}
    field_map = {
        str(field.get("name", "")): {
            "value": result.get(field.get("name", ""), ""),
            "confidence": 0.9 if str(result.get(field.get("name", ""), "") or "").strip() else 0.5,
        }
        for field in input_fields
        if field.get("name")
    }

    hydrated = await hydrate_autofill_fields_async(
        input_fields,
        field_map,
        site_url,
        website_analysis,
        plugin_name=plugin_name,
        plugin_category=plugin_category,
        plugin_description=plugin_description,
    )

    for name, entry in hydrated.items():
        if not isinstance(entry, dict):
            continue
        value = entry.get("value")
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        result[name] = value

    return result
