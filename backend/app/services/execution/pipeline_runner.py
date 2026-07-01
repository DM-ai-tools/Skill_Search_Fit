import copy
import json

import asyncpg

from app.data.pipelines import build_step_inputs, get_pipeline
from app.exceptions import not_found
from app.services.execution.pipeline_input_autofill import autofill_pipeline_step_inputs
from app.services.execution.runner import run_plugin
from app.services.execution.pipeline_competitor_analysis import competitor_context_block
from app.services.website_analysis.intelligence import enrich_inputs_from_cache

# Max characters of prior step output passed as context to each subsequent step.
# Keeps prompts within ~3k tokens so later steps don't dramatically slow down.
_MAX_CONTEXT_CHARS = 6_000


def _pipeline_context(prior_markdown: list[str], step_index: int) -> str | None:
    if not prior_markdown:
        return None
    full_context = "\n\n---\n\n".join(prior_markdown)
    if len(full_context) > _MAX_CONTEXT_CHARS:
        full_context = full_context[-_MAX_CONTEXT_CHARS:]
    context_header = f"## Prior pipeline outputs (steps 1–{step_index - 1})\n\n"
    return context_header + full_context


async def _run_pipeline_step(
    pool: asyncpg.Pool,
    *,
    pipeline: dict,
    step_index: int,
    project_id,
    enriched_inputs: dict,
    prior_markdown: list[str],
    user_id,
    ip_address: str | None = None,
    competitor_data: dict | None = None,
    step_input_overrides: dict | None = None,
    replace_step_inputs: bool = False,
) -> dict:
    steps = pipeline["steps"]
    if step_index < 1 or step_index > len(steps):
        from app.exceptions import validation_error

        raise validation_error("Invalid pipeline step index", [{"field": "step_index", "message": "Out of range"}])

    step_def = steps[step_index - 1]
    plugin_name = step_def["plugin_name"]

    async with pool.acquire() as conn:
        plugin = await conn.fetchrow(
            """
            SELECT id, schema_version, input_fields, category, description, plugin_name
            FROM plugins
            WHERE plugin_name = $1 AND status = 'enabled'
            """,
            plugin_name,
        )
    if not plugin:
        raise not_found(f"Plugin not enabled: {plugin_name}")

    label = step_def["label"]
    if step_input_overrides:
        step_inputs = copy.deepcopy(step_input_overrides)
    else:
        step_inputs = build_step_inputs(plugin_name, enriched_inputs, prior_markdown)
    input_fields = (
        json.loads(plugin["input_fields"])
        if isinstance(plugin["input_fields"], str)
        else plugin["input_fields"]
    )
    step_inputs = await autofill_pipeline_step_inputs(
        input_fields=input_fields,
        step_inputs=step_inputs,
        enriched_base=enriched_inputs,
        prior_markdown=prior_markdown,
        plugin_name=plugin_name,
        plugin_category=plugin.get("category") or "",
        plugin_description=plugin.get("description") or "",
    )
    if step_input_overrides:
        # Reviewed values always win after autofill fills any remaining gaps.
        step_inputs = {**step_inputs, **step_input_overrides}
    pipeline_context = _pipeline_context(prior_markdown, step_index)
    competitor_block = competitor_context_block(competitor_data or {})
    if competitor_block:
        pipeline_context = (
            f"{competitor_block}\n\n---\n\n{pipeline_context}"
            if pipeline_context
            else competitor_block
        )

    result = await run_plugin(
        pool,
        plugin_id=plugin["id"],
        project_id=project_id,
        inputs=step_inputs,
        schema_version=plugin["schema_version"],
        user_id=user_id,
        ip_address=ip_address,
        pipeline_context=pipeline_context,
    )

    markdown = result["output"].get("markdown", "")
    output = result["output"] if isinstance(result.get("output"), dict) else {"markdown": markdown}
    return {
        "step": step_index,
        "plugin_id": plugin["id"],
        "plugin_name": plugin_name,
        "label": label,
        "execution_id": result["execution_id"],
        "status": result["status"],
        "output_markdown": markdown,
        "output": output,
        "schema_version": plugin["schema_version"],
    }


async def get_pipeline_recent_results(
    pool: asyncpg.Pool,
    *,
    pipeline_id: str,
    project_id,
    user_id,
) -> dict | None:
    pipeline = get_pipeline(pipeline_id)
    if not pipeline:
        raise not_found("Pipeline not found")

    step_count = len(pipeline["steps"])

    async with pool.acquire() as conn:
        run_row = await conn.fetchrow(
            """
            SELECT id, step_results, status
            FROM pipeline_runs
            WHERE pipeline_id = $1
              AND project_id = $2
              AND user_id = $3
              AND status IN ('completed', 'paused_for_review')
              AND jsonb_array_length(step_results) >= $4
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            pipeline_id,
            project_id,
            user_id,
            step_count,
        )

    if run_row:
        step_results = run_row["step_results"]
        if isinstance(step_results, str):
            import json

            step_results = json.loads(step_results)
        if isinstance(step_results, list) and len(step_results) >= step_count:
            prior_markdown = [
                f"### Step {s['step']}: {s['label']}\n\n{s.get('output_markdown', '')}"
                for s in step_results[:step_count]
            ]
            combined = f"# {pipeline['name']}\n\n" + "\n\n".join(prior_markdown)
            return {
                "pipeline_id": pipeline_id,
                "pipeline_name": pipeline["name"],
                "pipeline_run_id": str(run_row["id"]),
                "status": "completed" if run_row["status"] == "completed" else run_row["status"],
                "steps": step_results[:step_count],
                "combined_markdown": combined,
                "workflow_steps": [
                    {"step": s["step"], "label": s["label"], "status": "done"}
                    for s in step_results[:step_count]
                ],
            }

    plugin_names = [s["plugin_name"] for s in pipeline["steps"]]
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (p.plugin_name)
                p.plugin_name,
                p.id AS plugin_id,
                p.schema_version,
                e.id AS execution_id,
                e.status,
                e.result,
                e.completed_at
            FROM plugins p
            JOIN executions e ON e.plugin_id = p.id
            WHERE e.project_id = $1
              AND e.user_id = $2
              AND p.plugin_name = ANY($3::text[])
              AND e.status = 'completed'
            ORDER BY p.plugin_name, e.completed_at DESC
            """,
            project_id,
            user_id,
            plugin_names,
        )

    if not rows:
        return None

    by_name = {row["plugin_name"]: row for row in rows}
    step_results: list[dict] = []
    prior_markdown: list[str] = []

    for index, step_def in enumerate(pipeline["steps"], start=1):
        plugin_name = step_def["plugin_name"]
        row = by_name.get(plugin_name)
        if not row:
            return None

        result_payload = row["result"] or {}
        if isinstance(result_payload, str):
            import json

            result_payload = json.loads(result_payload)
        markdown = ""
        output: dict = {}
        if isinstance(result_payload, dict):
            markdown = str(result_payload.get("markdown", ""))
            output = result_payload

        step_result = {
            "step": index,
            "plugin_id": row["plugin_id"],
            "plugin_name": plugin_name,
            "label": step_def["label"],
            "execution_id": row["execution_id"],
            "status": row["status"],
            "output_markdown": markdown,
            "output": output,
            "schema_version": row["schema_version"],
        }
        step_results.append(step_result)
        prior_markdown.append(f"### Step {index}: {step_def['label']}\n\n{markdown}")

    combined = f"# {pipeline['name']}\n\n" + "\n\n".join(prior_markdown)
    return {
        "pipeline_id": pipeline_id,
        "pipeline_name": pipeline["name"],
        "status": "completed",
        "steps": step_results,
        "combined_markdown": combined,
        "workflow_steps": [
            {"step": s["step"], "label": s["label"], "status": "done"} for s in step_results
        ],
    }


async def run_pipeline_step(
    pool: asyncpg.Pool,
    *,
    pipeline_id: str,
    step_index: int,
    project_id,
    base_inputs: dict,
    prior_markdown: list[str],
    user_id,
    ip_address: str | None = None,
    competitor_data: dict | None = None,
    step_input_overrides: dict | None = None,
    replace_step_inputs: bool = False,
) -> dict:
    pipeline = get_pipeline(pipeline_id)
    if not pipeline:
        raise not_found("Pipeline not found")

    async with pool.acquire() as conn:
        enriched_inputs = await enrich_inputs_from_cache(conn, base_inputs)

    return await _run_pipeline_step(
        pool,
        pipeline=pipeline,
        step_index=step_index,
        project_id=project_id,
        enriched_inputs=enriched_inputs,
        prior_markdown=prior_markdown,
        user_id=user_id,
        ip_address=ip_address,
        competitor_data=competitor_data,
        step_input_overrides=step_input_overrides,
        replace_step_inputs=replace_step_inputs,
    )


async def run_pipeline(
    pool: asyncpg.Pool,
    *,
    pipeline_id: str,
    project_id,
    base_inputs: dict,
    user_id,
    ip_address: str | None = None,
) -> dict:
    pipeline = get_pipeline(pipeline_id)
    if not pipeline:
        raise not_found("Pipeline not found")

    async with pool.acquire() as conn:
        enriched_inputs = await enrich_inputs_from_cache(conn, base_inputs)

    prior_markdown: list[str] = []
    step_results: list[dict] = []
    workflow_steps: list[dict] = []

    for index, step_def in enumerate(pipeline["steps"], start=1):
        label = step_def["label"]
        workflow_steps.append({"step": index, "label": label, "status": "running"})

        step_result = await _run_pipeline_step(
            pool,
            pipeline=pipeline,
            step_index=index,
            project_id=project_id,
            enriched_inputs=enriched_inputs,
            prior_markdown=prior_markdown,
            user_id=user_id,
            ip_address=ip_address,
        )
        prior_markdown.append(
            f"### Step {step_result['step']}: {step_result['label']}\n\n{step_result['output_markdown']}"
        )
        workflow_steps[-1]["status"] = "done"
        step_results.append(step_result)

    combined = f"# {pipeline['name']}\n\n" + "\n\n".join(prior_markdown)

    return {
        "pipeline_id": pipeline_id,
        "pipeline_name": pipeline["name"],
        "status": "completed",
        "steps": step_results,
        "combined_markdown": combined,
        "workflow_steps": workflow_steps,
    }
