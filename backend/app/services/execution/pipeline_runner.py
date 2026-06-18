import asyncpg

from app.data.pipelines import build_step_inputs, get_pipeline
from app.exceptions import not_found
from app.services.execution.runner import run_plugin
from app.services.website_analysis.intelligence import enrich_inputs_from_cache


async def _enrich_inputs_from_intelligence(
    conn: asyncpg.Connection,
    base_inputs: dict,
) -> dict:
    return await enrich_inputs_from_cache(conn, base_inputs)


async def run_pipeline(
    conn: asyncpg.Connection,
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

    enriched_inputs = await _enrich_inputs_from_intelligence(conn, base_inputs)

    prior_markdown: list[str] = []
    step_results: list[dict] = []
    workflow_steps: list[dict] = []

    for index, step_def in enumerate(pipeline["steps"], start=1):
        plugin_name = step_def["plugin_name"]
        plugin = await conn.fetchrow(
            """
            SELECT id, schema_version FROM plugins
            WHERE plugin_name = $1 AND status = 'enabled'
            """,
            plugin_name,
        )
        if not plugin:
            raise not_found(f"Plugin not enabled: {plugin_name}")

        label = step_def["label"]
        workflow_steps.append({"step": index, "label": label, "status": "running"})

        step_inputs = build_step_inputs(plugin_name, enriched_inputs, prior_markdown)
        context_header = (
            f"## Prior pipeline outputs (steps 1–{index - 1})\n\n"
            if prior_markdown
            else ""
        )
        pipeline_context = (
            context_header + "\n\n---\n\n".join(prior_markdown) if prior_markdown else None
        )

        result = await run_plugin(
            conn,
            plugin_id=plugin["id"],
            project_id=project_id,
            inputs=step_inputs,
            schema_version=plugin["schema_version"],
            user_id=user_id,
            ip_address=ip_address,
            pipeline_context=pipeline_context,
        )

        markdown = result["output"].get("markdown", "")
        prior_markdown.append(f"### Step {index}: {label}\n\n{markdown}")

        workflow_steps[-1]["status"] = "done"
        step_results.append(
            {
                "step": index,
                "plugin_id": plugin["id"],
                "plugin_name": plugin_name,
                "label": label,
                "execution_id": result["execution_id"],
                "status": result["status"],
                "output_markdown": markdown,
            }
        )

    combined = f"# {pipeline['name']}\n\n" + "\n\n".join(prior_markdown)

    return {
        "pipeline_id": pipeline_id,
        "pipeline_name": pipeline["name"],
        "status": "completed",
        "steps": step_results,
        "combined_markdown": combined,
        "workflow_steps": workflow_steps,
    }
