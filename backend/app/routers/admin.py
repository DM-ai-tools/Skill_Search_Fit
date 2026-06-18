import json
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.db.pool import get_pool
from app.exceptions import AppError, not_found
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import require_admin
from app.schemas.admin import (
    ActivityLogItem,
    AdminDashboardStats,
    AdminUserCreate,
    AdminUserResponse,
    AdminUserUpdate,
    PluginCreate,
    PluginStatusUpdate,
    PluginUpdate,
    PromptsUpsertRequest,
    TopPluginStat,
)
from app.schemas.plugins import PluginDetail, PluginListItem
from app.services.activity import log_activity
from app.services.password import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminDashboardStats)
async def dashboard(request: Request):
    require_admin(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        total_users = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL"
        )
        total_projects = await conn.fetchval(
            "SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL"
        )
        executions_7d = await conn.fetchval(
            """
            SELECT COUNT(*) FROM executions
            WHERE started_at >= NOW() - INTERVAL '7 days'
            """
        )
        signups_7d = await conn.fetchval(
            """
            SELECT COUNT(*) FROM users
            WHERE created_at >= NOW() - INTERVAL '7 days' AND deleted_at IS NULL
            """
        )
        total_outputs = await conn.fetchval("SELECT COUNT(*) FROM outputs")
        top_plugins = await conn.fetch(
            """
            SELECT e.plugin_id, p.plugin_name, COUNT(*) AS execution_count
            FROM executions e
            JOIN plugins p ON p.id = e.plugin_id
            WHERE e.started_at >= NOW() - INTERVAL '30 days'
            GROUP BY e.plugin_id, p.plugin_name
            ORDER BY execution_count DESC
            LIMIT 5
            """
        )

    return AdminDashboardStats(
        total_active_users=total_users or 0,
        total_projects=total_projects or 0,
        executions_last_7_days=executions_7d or 0,
        new_signups_last_7_days=signups_7d or 0,
        total_saved_outputs=total_outputs or 0,
        top_plugins_last_30_days=[
            TopPluginStat(
                plugin_id=r["plugin_id"],
                plugin_name=r["plugin_name"],
                execution_count=r["execution_count"],
            )
            for r in top_plugins
        ],
    )


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(request: Request):
    require_admin(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, email, role::text, created_at, deleted_at
            FROM users ORDER BY created_at DESC
            """
        )
    return [AdminUserResponse(**dict(r)) for r in rows]


@router.post("/users", response_model=AdminUserResponse)
async def create_user(body: AdminUserCreate, request: Request):
    admin = require_admin(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
        if existing:
            raise AppError("EMAIL_EXISTS", "Email already in use", status_code=409)

        row = await conn.fetchrow(
            """
            INSERT INTO users (name, email, password_hash, role)
            VALUES ($1, $2, $3, $4::user_role)
            RETURNING id, name, email, role::text, created_at, deleted_at
            """,
            body.name,
            body.email,
            hash_password(body.password),
            body.role,
        )
        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_user_create",
            metadata={"target_user_id": str(row["id"])},
            ip_address=ip,
        )
    return AdminUserResponse(**dict(row))


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(user_id: UUID, body: AdminUserUpdate, request: Request):
    admin = require_admin(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        updates = []
        if body.password:
            await conn.execute(
                "UPDATE users SET password_hash = $2 WHERE id = $1",
                user_id,
                hash_password(body.password),
            )

        row = await conn.fetchrow(
            """
            UPDATE users
            SET name = COALESCE($2, name),
                email = COALESCE($3, email),
                role = COALESCE($4::user_role, role)
            WHERE id = $1
            RETURNING id, name, email, role::text, created_at, deleted_at
            """,
            user_id,
            body.name,
            body.email,
            body.role,
        )
        if not row:
            raise not_found("User not found")

        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_user_update",
            metadata={"target_user_id": str(user_id)},
            ip_address=ip,
        )
    return AdminUserResponse(**dict(row))


@router.delete("/users/{user_id}")
async def deactivate_user(user_id: UUID, request: Request):
    admin = require_admin(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
            user_id,
        )
        if result == "UPDATE 0":
            raise not_found("User not found")

        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_user_deactivate",
            metadata={"target_user_id": str(user_id)},
            ip_address=ip,
        )
    return {"ok": True}


@router.get("/plugins", response_model=list[PluginListItem])
async def list_all_plugins(request: Request):
    require_admin(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, plugin_name, description, category, icon, schema_version, status::text
            FROM plugins ORDER BY plugin_name
            """
        )
    return [PluginListItem(**dict(r)) for r in rows]


@router.get("/plugins/{plugin_id}", response_model=PluginDetail)
async def get_plugin(plugin_id: UUID, request: Request):
    require_admin(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT pl.id, pl.plugin_name, pl.description, pl.category, pl.icon,
                   pl.input_fields, pl.schema_version, pl.output_template,
                   pl.status::text, pl.created_at, pl.updated_at,
                   COALESCE(
                       json_agg(
                           json_build_object(
                               'prompt_type', pr.prompt_type::text,
                               'prompt_content', pr.prompt_content
                           )
                       ) FILTER (WHERE pr.id IS NOT NULL),
                       '[]'
                   ) AS prompts
            FROM plugins pl
            LEFT JOIN prompts pr ON pr.plugin_id = pl.id
            WHERE pl.id = $1
            GROUP BY pl.id
            """,
            plugin_id,
        )
    if not row:
        raise not_found("Plugin not found")

    d = dict(row)
    if isinstance(d["input_fields"], str):
        d["input_fields"] = json.loads(d["input_fields"])
    if isinstance(d["prompts"], str):
        d["prompts"] = json.loads(d["prompts"])
    return PluginDetail(**d)


@router.post("/plugins", response_model=PluginDetail)
async def create_plugin(body: PluginCreate, request: Request):
    admin = require_admin(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO plugins (
                plugin_name, description, category, icon,
                input_fields, output_template, status
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::plugin_status)
            RETURNING id, plugin_name, description, category, icon, input_fields,
                      schema_version, output_template, status::text, created_at, updated_at
            """,
            body.plugin_name,
            body.description,
            body.category,
            body.icon,
            json.dumps(body.input_fields),
            json.dumps(body.output_template) if body.output_template else None,
            body.status,
        )
        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_plugin_create",
            metadata={"plugin_id": str(row["id"])},
            ip_address=ip,
        )

    d = dict(row)
    d["prompts"] = []
    if isinstance(d["input_fields"], str):
        d["input_fields"] = json.loads(d["input_fields"])
    return PluginDetail(**d)


@router.patch("/plugins/{plugin_id}", response_model=PluginDetail)
async def update_plugin(plugin_id: UUID, body: PluginUpdate, request: Request):
    admin = require_admin(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        current = await conn.fetchrow(
            "SELECT input_fields, schema_version FROM plugins WHERE id = $1",
            plugin_id,
        )
        if not current:
            raise not_found("Plugin not found")

        new_version = current["schema_version"]
        schema_changed = False
        if body.input_fields is not None:
            old_fields = current["input_fields"]
            if isinstance(old_fields, str):
                old_fields = json.loads(old_fields)
            if body.input_fields != old_fields:
                new_version += 1
                schema_changed = True

        row = await conn.fetchrow(
            """
            UPDATE plugins
            SET plugin_name = COALESCE($2, plugin_name),
                description = COALESCE($3, description),
                category = COALESCE($4, category),
                icon = COALESCE($5, icon),
                input_fields = COALESCE($6::jsonb, input_fields),
                schema_version = $7,
                output_template = COALESCE($8::jsonb, output_template),
                status = COALESCE($9::plugin_status, status)
            WHERE id = $1
            RETURNING id, plugin_name, description, category, icon, input_fields,
                      schema_version, output_template, status::text, created_at, updated_at
            """,
            plugin_id,
            body.plugin_name,
            body.description,
            body.category,
            body.icon,
            json.dumps(body.input_fields) if body.input_fields is not None else None,
            new_version,
            json.dumps(body.output_template) if body.output_template is not None else None,
            body.status,
        )

        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_plugin_update",
            metadata={
                "plugin_id": str(plugin_id),
                "schema_version_changed": schema_changed,
            },
            ip_address=ip,
        )

    d = dict(row)
    d["prompts"] = []
    if isinstance(d["input_fields"], str):
        d["input_fields"] = json.loads(d["input_fields"])
    return PluginDetail(**d)


@router.patch("/plugins/{plugin_id}/status")
async def update_plugin_status(plugin_id: UUID, body: PluginStatusUpdate, request: Request):
    require_admin(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE plugins SET status = $2::plugin_status WHERE id = $1",
            plugin_id,
            body.status,
        )
        if result == "UPDATE 0":
            raise not_found("Plugin not found")
    return {"ok": True}


@router.get("/plugins/{plugin_id}/prompts")
async def get_prompts(plugin_id: UUID, request: Request):
    require_admin(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT prompt_type::text, prompt_content
            FROM prompts WHERE plugin_id = $1
            """,
            plugin_id,
        )
    return {"prompts": [dict(r) for r in rows]}


@router.put("/plugins/{plugin_id}/prompts")
async def upsert_prompts(plugin_id: UUID, body: PromptsUpsertRequest, request: Request):
    admin = require_admin(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        plugin = await conn.fetchrow("SELECT id FROM plugins WHERE id = $1", plugin_id)
        if not plugin:
            raise not_found("Plugin not found")

        for p in body.prompts:
            await conn.execute(
                """
                INSERT INTO prompts (plugin_id, prompt_type, prompt_content)
                VALUES ($1, $2::prompt_type, $3)
                ON CONFLICT (plugin_id, prompt_type)
                DO UPDATE SET prompt_content = EXCLUDED.prompt_content
                """,
                plugin_id,
                p.prompt_type,
                p.prompt_content,
            )

        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_prompt_update",
            metadata={"plugin_id": str(plugin_id)},
            ip_address=ip,
        )
    return {"ok": True}


@router.get("/logs", response_model=list[ActivityLogItem])
async def list_logs(
    request: Request,
    action: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    require_admin(request)
    offset = (page - 1) * limit
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT al.id, al.action, al.metadata, al.timestamp,
                   u.name AS user_name, u.email AS user_email
            FROM activity_logs al
            LEFT JOIN users u ON u.id = al.user_id
            WHERE ($1::VARCHAR IS NULL OR al.action = $1)
            ORDER BY al.timestamp DESC
            LIMIT $2 OFFSET $3
            """,
            action,
            limit,
            offset,
        )

    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d["metadata"], str):
            d["metadata"] = json.loads(d["metadata"])
        result.append(ActivityLogItem(**d))
    return result
