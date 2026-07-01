"""Organization/workspace tenancy endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.db.pool import get_pool
from app.exceptions import not_found
from app.middleware.session import require_user

router = APIRouter(prefix="/tenancy", tags=["tenancy"])


class OrganizationCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)


class WorkspaceCreateRequest(BaseModel):
    organization_id: UUID
    name: str = Field(..., min_length=2, max_length=120)


@router.get("/organizations")
async def list_organizations(request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT o.id, o.name, o.created_at
            FROM organizations o
            WHERE o.owner_user_id = $1
            ORDER BY o.created_at DESC
            """,
            user.id,
        )
    return {"organizations": [dict(r) for r in rows]}


@router.post("/organizations")
async def create_organization(body: OrganizationCreateRequest, request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        org = await conn.fetchrow(
            """
            INSERT INTO organizations (name, owner_user_id)
            VALUES ($1, $2)
            RETURNING id, name, created_at
            """,
            body.name.strip(),
            user.id,
        )
        workspace = await conn.fetchrow(
            """
            INSERT INTO workspaces (organization_id, name)
            VALUES ($1, 'Default Workspace')
            RETURNING id, name, created_at
            """,
            org["id"],
        )
        await conn.execute(
            """
            INSERT INTO workspace_memberships (workspace_id, user_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT (workspace_id, user_id) DO NOTHING
            """,
            workspace["id"],
            user.id,
        )
    return {"organization": dict(org), "default_workspace": dict(workspace)}


@router.get("/workspaces")
async def list_workspaces(request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT w.id, w.name, w.organization_id, m.role, w.created_at
            FROM workspaces w
            JOIN workspace_memberships m ON m.workspace_id = w.id
            WHERE m.user_id = $1
            ORDER BY w.created_at DESC
            """,
            user.id,
        )
    return {"workspaces": [dict(r) for r in rows]}


@router.post("/workspaces")
async def create_workspace(body: WorkspaceCreateRequest, request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        owned = await conn.fetchval(
            "SELECT 1 FROM organizations WHERE id = $1 AND owner_user_id = $2",
            body.organization_id,
            user.id,
        )
        if not owned:
            raise not_found("Organization not found")
        workspace = await conn.fetchrow(
            """
            INSERT INTO workspaces (organization_id, name)
            VALUES ($1, $2)
            RETURNING id, name, organization_id, created_at
            """,
            body.organization_id,
            body.name.strip(),
        )
        await conn.execute(
            """
            INSERT INTO workspace_memberships (workspace_id, user_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT (workspace_id, user_id) DO NOTHING
            """,
            workspace["id"],
            user.id,
        )
    return {"workspace": dict(workspace)}
