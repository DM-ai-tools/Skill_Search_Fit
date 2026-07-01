import json
from uuid import UUID

from fastapi import APIRouter, Request

from app.db.pool import get_pool
from app.exceptions import AppError, not_found
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import require_user
from app.schemas.projects import (
    OutputResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    WorkspaceSessionResponse,
)
from app.services.activity import log_activity

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def list_projects(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT p.id, p.project_name, p.created_at, p.updated_at,
                   COUNT(o.id) AS output_count
            FROM projects p
            LEFT JOIN outputs o ON o.project_id = p.id
            WHERE p.user_id = $1 AND p.deleted_at IS NULL
            GROUP BY p.id
            ORDER BY p.updated_at DESC
            """,
            user.id,
        )
    return [ProjectResponse(**dict(r)) for r in rows]


@router.post("", response_model=ProjectResponse)
async def create_project(body: ProjectCreate, request: Request):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO projects (user_id, project_name)
                VALUES ($1, $2)
                RETURNING id, project_name, created_at, updated_at
                """,
                user.id,
                body.project_name,
            )
        except Exception as e:
            if "idx_projects_user_name" in str(e):
                raise AppError("PROJECT_NAME_EXISTS", "A project with this name already exists", status_code=409)
            raise

        await log_activity(
            conn,
            user_id=user.id,
            action="project_create",
            metadata={"project_id": str(row["id"])},
            ip_address=ip,
        )
    return ProjectResponse(**dict(row), output_count=0)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.id, p.project_name, p.created_at, p.updated_at,
                   COUNT(o.id) AS output_count
            FROM projects p
            LEFT JOIN outputs o ON o.project_id = p.id
            WHERE p.id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL
            GROUP BY p.id
            """,
            project_id,
            user.id,
        )
    if not row:
        raise not_found("Project not found")
    return ProjectResponse(**dict(row))


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: UUID, body: ProjectUpdate, request: Request):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        old = await conn.fetchrow(
            "SELECT project_name FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            project_id,
            user.id,
        )
        if not old:
            raise not_found("Project not found")

        try:
            row = await conn.fetchrow(
                """
                UPDATE projects SET project_name = $3
                WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
                RETURNING id, project_name, created_at, updated_at
                """,
                project_id,
                user.id,
                body.project_name,
            )
        except Exception as e:
            if "idx_projects_user_name" in str(e):
                raise AppError("PROJECT_NAME_EXISTS", "A project with this name already exists", status_code=409)
            raise

        count = await conn.fetchval("SELECT COUNT(*) FROM outputs WHERE project_id = $1", project_id)
        await log_activity(
            conn,
            user_id=user.id,
            action="project_rename",
            metadata={
                "project_id": str(project_id),
                "old_name": old["project_name"],
                "new_name": body.project_name,
            },
            ip_address=ip,
        )
    return ProjectResponse(**dict(row), output_count=count or 0)


@router.delete("/{project_id}")
async def delete_project(project_id: UUID, request: Request):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE projects SET deleted_at = NOW()
            WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
            """,
            project_id,
            user.id,
        )
        if result == "UPDATE 0":
            raise not_found("Project not found")

        await log_activity(
            conn,
            user_id=user.id,
            action="project_delete",
            metadata={"project_id": str(project_id)},
            ip_address=ip,
        )
    return {"ok": True}


@router.get("/{project_id}/outputs", response_model=list[OutputResponse])
async def list_outputs(project_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await conn.fetchrow(
            "SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            project_id,
            user.id,
        )
        if not project:
            raise not_found("Project not found")

        rows = await conn.fetch(
            """
            SELECT o.id, o.project_id, o.plugin_id, p.plugin_name, o.execution_id, o.input_snapshot,
                   o.schema_version, o.generated_output, o.created_at
            FROM outputs o
            JOIN plugins p ON p.id = o.plugin_id
            WHERE o.project_id = $1
            ORDER BY o.created_at DESC
            """,
            project_id,
        )

    result = []
    for r in rows:
        d = dict(r)
        for key in ("input_snapshot", "generated_output"):
            if isinstance(d[key], str):
                d[key] = json.loads(d[key])
        gen = d.get("generated_output") or {}
        if isinstance(gen, dict) and gen.get("report_title"):
            d["plugin_name"] = str(gen["report_title"])
        result.append(OutputResponse(**d))
    return result


@router.get("/{project_id}/sessions", response_model=list[WorkspaceSessionResponse])
async def list_sessions(project_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await conn.fetchrow(
            "SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
            project_id,
            user.id,
        )
        if not project:
            raise not_found("Project not found")

        rows = await conn.fetch(
            """
            SELECT ws.id, ws.plugin_id, p.plugin_name, ws.inputs, ws.schema_version,
                   ws.notes, ws.updated_at
            FROM workspace_sessions ws
            JOIN plugins p ON p.id = ws.plugin_id
            WHERE ws.project_id = $1 AND ws.user_id = $2
            ORDER BY ws.updated_at DESC
            """,
            project_id,
            user.id,
        )

    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d["inputs"], str):
            d["inputs"] = json.loads(d["inputs"])
        result.append(WorkspaceSessionResponse(**d))
    return result
