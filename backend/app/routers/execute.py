import json
from uuid import UUID

from fastapi import APIRouter, Request

from app.db.pool import get_pool
from app.exceptions import not_found
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import require_user
from app.schemas.execution import (
    ExecuteRequest,
    ExecuteResponse,
    ExecutionRecord,
    SaveOutputRequest,
    WorkspaceNotesRequest,
)
from app.schemas.projects import OutputResponse
from app.services.activity import log_activity
from app.services.execution import run_plugin
from app.services.website_analysis.intelligence import enrich_inputs_from_cache

router = APIRouter(tags=["execution"])


@router.post("/execute/{plugin_id}", response_model=ExecuteResponse)
async def execute_plugin(plugin_id: UUID, body: ExecuteRequest, request: Request):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        enriched_inputs = await enrich_inputs_from_cache(conn, body.inputs)
    result = await run_plugin(
        pool,
        plugin_id=plugin_id,
        project_id=body.project_id,
        inputs=enriched_inputs,
        schema_version=body.schema_version,
        user_id=user.id,
        ip_address=ip,
    )
    return ExecuteResponse(**result)


@router.get("/executions/{execution_id}", response_model=ExecutionRecord)
async def get_execution(execution_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, plugin_id, project_id, user_id, inputs, schema_version,
                   status::text, result, error_message, started_at, completed_at
            FROM executions WHERE id = $1 AND user_id = $2
            """,
            execution_id,
            user.id,
        )
    if not row:
        raise not_found("Execution not found")

    d = dict(row)
    for key in ("inputs", "result"):
        if d[key] and isinstance(d[key], str):
            d[key] = json.loads(d[key])
    return ExecutionRecord(**d)


@router.post("/outputs", response_model=OutputResponse)
async def save_output(body: SaveOutputRequest, request: Request):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await conn.fetchrow(
            "SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            body.project_id,
            user.id,
        )
        if not project:
            raise not_found("Project not found")

        row = await conn.fetchrow(
            """
            INSERT INTO outputs (
                project_id, plugin_id, user_id, execution_id,
                input_snapshot, schema_version, generated_output
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
            RETURNING id, project_id, plugin_id, execution_id, input_snapshot,
                      schema_version, generated_output, created_at
            """,
            body.project_id,
            body.plugin_id,
            user.id,
            body.execution_id,
            json.dumps(body.input_snapshot),
            body.schema_version,
            json.dumps(body.generated_output),
        )

        await log_activity(
            conn,
            user_id=user.id,
            action="output_save",
            metadata={
                "output_id": str(row["id"]),
                "plugin_id": str(body.plugin_id),
                "execution_id": str(body.execution_id) if body.execution_id else None,
            },
            ip_address=ip,
        )

    d = dict(row)
    for key in ("input_snapshot", "generated_output"):
        if isinstance(d[key], str):
            d[key] = json.loads(d[key])
    return OutputResponse(**d)


@router.get("/outputs/{output_id}", response_model=OutputResponse)
async def get_output(output_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, project_id, plugin_id, execution_id, input_snapshot,
                   schema_version, generated_output, created_at
            FROM outputs WHERE id = $1 AND user_id = $2
            """,
            output_id,
            user.id,
        )
    if not row:
        raise not_found("Output not found")

    d = dict(row)
    for key in ("input_snapshot", "generated_output"):
        if isinstance(d[key], str):
            d[key] = json.loads(d[key])
    return OutputResponse(**d)


@router.put("/workspace/notes")
async def save_workspace_notes(body: WorkspaceNotesRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await conn.fetchrow(
            "SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            body.project_id,
            user.id,
        )
        if not project:
            raise not_found("Project not found")

        await conn.execute(
            """
            INSERT INTO workspace_sessions (project_id, plugin_id, user_id, inputs, schema_version, notes)
            VALUES ($1, $2, $3, '{}'::jsonb, 1, $4)
            ON CONFLICT (project_id, plugin_id, user_id)
            DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
            """,
            body.project_id,
            body.plugin_id,
            user.id,
            body.notes,
        )
    return {"ok": True}
