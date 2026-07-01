"""Automation scheduling and collaboration comments APIs."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.db.pool import get_pool
from app.exceptions import not_found
from app.middleware.session import require_user

router = APIRouter(prefix="/automation", tags=["automation"])


class ScheduleCreateRequest(BaseModel):
    project_id: UUID
    workflow_type: str = Field(..., min_length=3, max_length=32)
    workflow_id: str = Field(..., min_length=1, max_length=128)
    cron_expression: str = Field(..., min_length=5, max_length=120)
    payload: dict = Field(default_factory=dict)


class CommentCreateRequest(BaseModel):
    project_id: UUID
    artifact_type: str = Field(..., min_length=3, max_length=40)
    artifact_id: UUID
    message: str = Field(..., min_length=1, max_length=5000)


async def _ensure_project(conn, project_id: UUID, user_id: UUID) -> None:
    owned = await conn.fetchval(
        "SELECT 1 FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        project_id,
        user_id,
    )
    if not owned:
        raise not_found("Project not found")


@router.get("/schedules")
async def list_schedules(request: Request, project_id: UUID) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _ensure_project(conn, project_id, user.id)
        rows = await conn.fetch(
            """
            SELECT id, project_id, workflow_type, workflow_id, cron_expression, is_active, payload, created_at, updated_at
            FROM scheduled_workflows
            WHERE user_id = $1 AND project_id = $2
            ORDER BY created_at DESC
            """,
            user.id,
            project_id,
        )
    return {"schedules": [dict(r) for r in rows]}


@router.post("/schedules")
async def create_schedule(body: ScheduleCreateRequest, request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _ensure_project(conn, body.project_id, user.id)
        row = await conn.fetchrow(
            """
            INSERT INTO scheduled_workflows
                (user_id, project_id, workflow_type, workflow_id, cron_expression, payload)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING id, project_id, workflow_type, workflow_id, cron_expression, is_active, payload, created_at, updated_at
            """,
            user.id,
            body.project_id,
            body.workflow_type,
            body.workflow_id,
            body.cron_expression,
            json.dumps(body.payload),
        )
    return {"schedule": dict(row)}


@router.patch("/schedules/{schedule_id}/toggle")
async def toggle_schedule(schedule_id: UUID, request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE scheduled_workflows
            SET is_active = NOT is_active, updated_at = NOW()
            WHERE id = $1 AND user_id = $2
            RETURNING id, project_id, workflow_type, workflow_id, cron_expression, is_active, payload, created_at, updated_at
            """,
            schedule_id,
            user.id,
        )
    if not row:
        raise not_found("Schedule not found")
    return {"schedule": dict(row)}


@router.get("/comments")
async def list_comments(request: Request, project_id: UUID, artifact_type: str, artifact_id: UUID) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _ensure_project(conn, project_id, user.id)
        rows = await conn.fetch(
            """
            SELECT c.id, c.project_id, c.artifact_type, c.artifact_id, c.message, c.created_at,
                   u.id AS user_id, u.name AS user_name, u.email AS user_email
            FROM artifact_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.project_id = $1 AND c.artifact_type = $2 AND c.artifact_id = $3
            ORDER BY c.created_at DESC
            """,
            project_id,
            artifact_type,
            artifact_id,
        )
    return {"comments": [dict(r) for r in rows]}


@router.post("/comments")
async def create_comment(body: CommentCreateRequest, request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _ensure_project(conn, body.project_id, user.id)
        row = await conn.fetchrow(
            """
            INSERT INTO artifact_comments (user_id, project_id, artifact_type, artifact_id, message)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, project_id, artifact_type, artifact_id, message, created_at
            """,
            user.id,
            body.project_id,
            body.artifact_type,
            body.artifact_id,
            body.message.strip(),
        )
    return {"comment": dict(row)}
