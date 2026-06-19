import json
from datetime import datetime, timezone
from uuid import UUID

import asyncpg

from app.exceptions import conflict, not_found
from app.config import settings
from app.services.activity import log_activity
from app.services.execution.ai_executor import get_ai_executor
from app.services.execution.stubs import prompt_loader, response_processor
from app.services.validation import validate_plugin_inputs


async def run_plugin(
    pool: asyncpg.Pool,
    *,
    plugin_id: UUID,
    project_id: UUID,
    inputs: dict,
    schema_version: int,
    user_id: UUID,
    ip_address: str | None = None,
    pipeline_context: str | None = None,
) -> dict:
    # ── Phase 1: fast DB setup — acquire then immediately release ────────────
    async with pool.acquire() as conn:
        plugin = await conn.fetchrow(
            """
            SELECT id, plugin_name, category, input_fields, schema_version, output_template, status::text
            FROM plugins WHERE id = $1
            """,
            plugin_id,
        )
        if not plugin:
            raise not_found("Plugin not found")
        if plugin["status"] != "enabled":
            from app.exceptions import forbidden
            raise forbidden("Plugin is disabled")

        if schema_version != plugin["schema_version"]:
            raise conflict(
                f"Plugin schema has changed (current: {plugin['schema_version']})",
                code="SCHEMA_OUTDATED",
            )

        project = await conn.fetchrow(
            "SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            project_id,
            user_id,
        )
        if not project:
            raise not_found("Project not found")

        input_fields = (
            json.loads(plugin["input_fields"])
            if isinstance(plugin["input_fields"], str)
            else plugin["input_fields"]
        )
        validate_plugin_inputs(input_fields, inputs)

        execution_id = await conn.fetchval(
            """
            INSERT INTO executions (plugin_id, project_id, user_id, inputs, schema_version, status)
            VALUES ($1, $2, $3, $4::jsonb, $5, 'running')
            RETURNING id
            """,
            plugin_id,
            project_id,
            user_id,
            json.dumps(inputs),
            schema_version,
        )

        system_prompt = await prompt_loader.load_system(conn, plugin_id)
        user_prompt = await prompt_loader.load_user_message(conn, plugin_id, inputs)

        plugin_name = plugin["plugin_name"]
        plugin_category = plugin["category"]
        output_template = plugin["output_template"]

    # ── Phase 2: AI execution — no DB connection held ───────────────────────
    if pipeline_context:
        user_prompt = (
            f"{user_prompt}\n\n---\n\n## Pipeline context from prior steps\n\n{pipeline_context}"
        )

    max_tokens = settings.anthropic_max_tokens
    if plugin_category == "content":
        max_tokens = max(max_tokens, 8192)
    if plugin_category in ("technical", "research"):
        max_tokens = max(max_tokens, 16384)

    executor = get_ai_executor()
    try:
        raw = await executor.execute(
            system_prompt,
            user_prompt,
            inputs,
            plugin_name,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE executions
                SET status = 'failed', error_message = $2, completed_at = $3
                WHERE id = $1
                """,
                execution_id,
                str(exc),
                datetime.now(timezone.utc),
            )
        raise

    if isinstance(output_template, str):
        output_template = json.loads(output_template) if output_template else None
    output = response_processor.process(raw, output_template)
    output["execution_id"] = str(execution_id)

    # ── Phase 3: save results — new short-lived connection ───────────────────
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE executions
            SET status = 'completed', result = $2::jsonb, completed_at = $3
            WHERE id = $1
            """,
            execution_id,
            json.dumps(output),
            datetime.now(timezone.utc),
        )

        await conn.execute(
            """
            INSERT INTO workspace_sessions (project_id, plugin_id, user_id, inputs, schema_version, notes)
            VALUES ($1, $2, $3, $4::jsonb, $5, '')
            ON CONFLICT (project_id, plugin_id, user_id)
            DO UPDATE SET
                inputs = EXCLUDED.inputs,
                schema_version = EXCLUDED.schema_version,
                updated_at = NOW()
            """,
            project_id,
            plugin_id,
            user_id,
            json.dumps(inputs),
            schema_version,
        )

        await log_activity(
            conn,
            user_id=user_id,
            action="plugin_execute",
            metadata={
                "plugin_id": str(plugin_id),
                "project_id": str(project_id),
                "execution_id": str(execution_id),
            },
            ip_address=ip_address,
        )

    return {
        "execution_id": execution_id,
        "status": "completed",
        "output": output,
        "workflow_steps": [
            {"step": 1, "label": "Validate inputs", "status": "done"},
            {"step": 2, "label": "Load prompt", "status": "done"},
            {
                "step": 3,
                "label": (
                    "Claude AI execution"
                    if raw.get("structured", {}).get("ai_mode") == "claude"
                    else "AI execution (preview)"
                ),
                "status": "done",
            },
            {"step": 4, "label": "Process response", "status": "done"},
        ],
    }
