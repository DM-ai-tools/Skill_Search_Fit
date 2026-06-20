import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Request, Response

from app.db.pool import get_pool
from app.exceptions import AppError, not_found
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import require_admin, require_user, set_session_cookies
from app.schemas.admin import (
    ActivityLogItem,
    AdminConfigEntry,
    AdminConfigPatch,
    AdminDashboardStats,
    AdminReportDetail,
    AdminReportListItem,
    AdminUserCreate,
    AdminUserDetail,
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
from app.services.password import hash_password, verify_password

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
        total_plugins = await conn.fetchval("SELECT COUNT(*) FROM plugins")
        enabled_plugins = await conn.fetchval(
            "SELECT COUNT(*) FROM plugins WHERE status = 'enabled'"
        )
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
        total_plugins=total_plugins or 0,
        enabled_plugins=enabled_plugins or 0,
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
        row = await conn.fetchrow(
            """
            UPDATE users
            SET name = COALESCE($2, name),
                email = COALESCE($3, email),
                role = COALESCE($4::user_role, role),
                password_hash = COALESCE($5, password_hash)
            WHERE id = $1
            RETURNING id, name, email, role::text, created_at, deleted_at
            """,
            user_id,
            body.name,
            body.email,
            body.role,
            hash_password(body.password) if body.password else None,
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
    user_id: UUID | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    require_admin(request)
    offset = (page - 1) * limit
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT al.id, al.action, al.metadata, al.timestamp, al.ip_address,
                   u.name AS user_name, u.email AS user_email
            FROM activity_logs al
            LEFT JOIN users u ON u.id = al.user_id
            WHERE ($1::VARCHAR IS NULL OR al.action ILIKE '%' || $1 || '%')
              AND ($2::UUID IS NULL OR al.user_id = $2)
              AND ($3::TIMESTAMPTZ IS NULL OR al.timestamp >= $3::TIMESTAMPTZ)
              AND ($4::TIMESTAMPTZ IS NULL OR al.timestamp <= $4::TIMESTAMPTZ)
            ORDER BY al.timestamp DESC
            LIMIT $5 OFFSET $6
            """,
            action,
            user_id,
            date_from,
            date_to,
            limit,
            offset,
        )

    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d["metadata"], str):
            d["metadata"] = json.loads(d["metadata"])
        if d.get("ip_address"):
            d["ip_address"] = str(d["ip_address"])
        result.append(ActivityLogItem(**d))
    return result


# ── User detail ───────────────────────────────────────────────────────────────

@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(user_id: UUID, request: Request):
    require_admin(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            "SELECT id, name, email, role::text, created_at, deleted_at FROM users WHERE id = $1",
            user_id,
        )
        if not user_row:
            raise not_found("User not found")

        total_executions = await conn.fetchval(
            "SELECT COUNT(*) FROM executions WHERE user_id = $1", user_id
        )
        total_projects = await conn.fetchval(
            "SELECT COUNT(*) FROM projects WHERE user_id = $1 AND deleted_at IS NULL", user_id
        )
        recent_executions = await conn.fetch(
            """
            SELECT e.id, e.status::text, e.started_at, e.completed_at, p.plugin_name
            FROM executions e
            JOIN plugins p ON p.id = e.plugin_id
            WHERE e.user_id = $1
            ORDER BY e.started_at DESC LIMIT 10
            """,
            user_id,
        )
        recent_activity = await conn.fetch(
            """
            SELECT id, action, metadata, timestamp
            FROM activity_logs WHERE user_id = $1
            ORDER BY timestamp DESC LIMIT 10
            """,
            user_id,
        )

    def _fix_meta(d: dict) -> dict:
        if isinstance(d.get("metadata"), str):
            d["metadata"] = json.loads(d["metadata"])
        return d

    return AdminUserDetail(
        **dict(user_row),
        total_executions=total_executions or 0,
        total_projects=total_projects or 0,
        recent_executions=[dict(r) for r in recent_executions],
        recent_activity=[_fix_meta(dict(r)) for r in recent_activity],
    )


# ── Impersonation ─────────────────────────────────────────────────────────────

@router.post("/users/{user_id}/impersonate")
async def impersonate_user(user_id: UUID, request: Request, response: Response):
    admin = require_admin(request)
    if admin.is_impersonating:
        raise AppError("ALREADY_IMPERSONATING", "Exit current impersonation before starting a new one", status_code=400)

    ip = get_client_ip(request)
    admin_session_id = request.state.session.session_id
    pool = get_pool()
    async with pool.acquire() as conn:
        target = await conn.fetchrow(
            "SELECT id, name, email, role::text, created_at FROM users WHERE id = $1 AND deleted_at IS NULL",
            user_id,
        )
        if not target:
            raise not_found("User not found")

        session_id = uuid4()
        csrf_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=3600 * 8)
        data = json.dumps({
            "login_status": True,
            "role": target["role"],
            "impersonating": True,
            "original_admin_id": str(admin.id),
            "original_session_id": str(admin_session_id),
        })
        await conn.execute(
            """
            INSERT INTO sessions (id, user_id, data, csrf_token, expires_at, ip_address)
            VALUES ($1::uuid, $2, $3::jsonb, $4, $5, $6::inet)
            """,
            session_id, user_id, data, csrf_token, expires_at, ip,
        )
        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_impersonate",
            metadata={"target_user_id": str(user_id), "target_name": target["name"]},
            ip_address=ip,
        )

    set_session_cookies(response, session_id, csrf_token)
    return {"ok": True, "redirect": "/dashboard"}


# ── Reports ───────────────────────────────────────────────────────────────────

@router.get("/reports", response_model=list[AdminReportListItem])
async def list_reports(
    request: Request,
    user_id: UUID | None = None,
    plugin_id: UUID | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
):
    require_admin(request)
    offset = (page - 1) * limit
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT e.id, e.status::text, e.started_at, e.completed_at, e.error_message,
                   u.id AS user_id, u.name AS user_name, u.email AS user_email,
                   p.id AS plugin_id, p.plugin_name,
                   proj.id AS project_id, proj.project_name
            FROM executions e
            JOIN users u ON u.id = e.user_id
            JOIN plugins p ON p.id = e.plugin_id
            LEFT JOIN projects proj ON proj.id = e.project_id
            WHERE ($1::UUID IS NULL OR e.user_id = $1)
              AND ($2::UUID IS NULL OR e.plugin_id = $2)
              AND ($3::VARCHAR IS NULL OR e.status::text = $3)
            ORDER BY e.started_at DESC
            LIMIT $4 OFFSET $5
            """,
            user_id, plugin_id, status, limit, offset,
        )
    return [AdminReportListItem(**dict(r)) for r in rows]


@router.get("/reports/{execution_id}", response_model=AdminReportDetail)
async def get_report(execution_id: UUID, request: Request):
    require_admin(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT e.id, e.status::text, e.started_at, e.completed_at, e.error_message,
                   e.inputs, e.result, e.schema_version,
                   u.id AS user_id, u.name AS user_name, u.email AS user_email,
                   p.id AS plugin_id, p.plugin_name,
                   proj.id AS project_id, proj.project_name
            FROM executions e
            JOIN users u ON u.id = e.user_id
            JOIN plugins p ON p.id = e.plugin_id
            LEFT JOIN projects proj ON proj.id = e.project_id
            WHERE e.id = $1
            """,
            execution_id,
        )
    if not row:
        raise not_found("Report not found")
    d = dict(row)
    if isinstance(d.get("inputs"), str):
        d["inputs"] = json.loads(d["inputs"])
    if isinstance(d.get("result"), str):
        d["result"] = json.loads(d["result"])
    return AdminReportDetail(**d)


@router.delete("/reports/{execution_id}")
async def delete_report(execution_id: UUID, request: Request):
    admin = require_admin(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM executions WHERE id = $1", execution_id
        )
        if result == "DELETE 0":
            raise not_found("Report not found")
        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_report_delete",
            metadata={"execution_id": str(execution_id)},
            ip_address=ip,
        )
    return {"ok": True}


# ── Config ────────────────────────────────────────────────────────────────────

_SECRET_KEYWORDS = {"api_key", "token", "password", "secret", "app_password"}

_CONFIG_META: dict[str, tuple[str, str]] = {
    "database_url":                         ("database",    "PostgreSQL connection string"),
    "session_secret":                       ("auth",        "Secret key for signing sessions"),
    "session_max_age":                      ("auth",        "Session lifetime in seconds"),
    "csrf_secret":                          ("auth",        "Secret for CSRF token signing"),
    "cors_origins":                         ("app",         "Allowed CORS origins (comma-separated)"),
    "environment":                          ("app",         "Deployment environment (development / production)"),
    "rate_limit_login":                     ("rate_limits", "Max login attempts per window"),
    "rate_limit_admin_login":               ("rate_limits", "Max admin login attempts per window"),
    "rate_limit_signup":                    ("rate_limits", "Max signup attempts per window"),
    "rate_limit_window_seconds":            ("rate_limits", "Rate-limit window duration in seconds"),
    "anthropic_api_key":                    ("anthropic",   "Anthropic API key"),
    "anthropic_model":                      ("anthropic",   "Claude model ID"),
    "anthropic_max_tokens":                 ("anthropic",   "Default max output tokens"),
    "change_suggestions_extraction_max_tokens": ("anthropic", "Max tokens for change extraction"),
    "openrouter_api_key":                   ("openrouter",  "OpenRouter API key"),
    "openrouter_model":                     ("openrouter",  "Primary OpenRouter model"),
    "openrouter_fallback_model":            ("openrouter",  "Fallback OpenRouter model"),
    "openrouter_base_url":                  ("openrouter",  "OpenRouter API base URL"),
    "openrouter_http_referer":              ("openrouter",  "HTTP Referer sent to OpenRouter"),
    "openrouter_x_title":                   ("openrouter",  "App title sent to OpenRouter"),
    "website_scan_timeout_seconds":         ("website_scan","Website scan timeout in seconds"),
    "website_analysis_cache_days":          ("website_scan","Days to cache website analysis"),
    "wp_site_url":                          ("wordpress",   "WordPress site URL"),
    "wp_username":                          ("wordpress",   "WordPress username"),
    "wp_app_password":                      ("wordpress",   "WordPress application password"),
    "webflow_api_token":                    ("webflow",     "Webflow API token"),
    "webflow_site_id":                      ("webflow",     "Webflow site ID"),
    "wix_api_key":                          ("wix",         "Wix API key"),
    "wix_site_id":                          ("wix",         "Wix site ID"),
    "mailchimp_api_key":                    ("mailchimp",   "Mailchimp API key"),
    "mailchimp_server_prefix":              ("mailchimp",   "Mailchimp server prefix (e.g. us1)"),
    "mailchimp_from_name":                  ("mailchimp",   "Mailchimp campaign from-name"),
    "mailchimp_from_email":                 ("mailchimp",   "Mailchimp campaign reply-to email"),
}


def _is_secret(key: str) -> bool:
    lower = key.lower()
    return any(k in lower for k in _SECRET_KEYWORDS)


def _mask_value(key: str, value: str) -> str:
    if not value:
        return ""
    if _is_secret(key):
        return f"****{value[-4:]}" if len(value) > 4 else "****"
    return value


@router.get("/config", response_model=list[AdminConfigEntry])
async def get_config(request: Request):
    require_admin(request)
    from app.config import settings

    entries: list[AdminConfigEntry] = []
    for attr_key, (category, description) in _CONFIG_META.items():
        raw = getattr(settings, attr_key, None)
        value = str(raw) if raw is not None else ""
        entries.append(AdminConfigEntry(
            key=attr_key,
            display_key=attr_key.upper(),
            value=_mask_value(attr_key, value),
            is_secret=_is_secret(attr_key),
            category=category,
            description=description,
        ))
    return entries


@router.patch("/config")
async def update_config(body: AdminConfigPatch, request: Request):
    admin = require_admin(request)
    ip = get_client_ip(request)

    if body.key not in _CONFIG_META:
        raise AppError("UNKNOWN_CONFIG_KEY", f"Unknown config key: {body.key}", status_code=400)

    from app.config import settings

    old_raw = getattr(settings, body.key, None)
    old_masked = _mask_value(body.key, str(old_raw) if old_raw is not None else "")

    # Apply to running settings object
    field = settings.model_fields.get(body.key)
    target_type = str
    if field and field.annotation in (int, float):
        target_type = field.annotation  # type: ignore[assignment]
    try:
        setattr(settings, body.key, target_type(body.value))
    except (ValueError, TypeError) as exc:
        raise AppError("INVALID_VALUE", f"Cannot set {body.key}: {exc}", status_code=422)

    # Attempt to persist to .env file
    env_file = Path(__file__).resolve().parent.parent.parent / ".env"
    env_key = body.key.upper()
    if env_file.is_file():
        try:
            lines = env_file.read_text(encoding="utf-8").splitlines()
            updated = False
            new_lines = []
            for line in lines:
                if line.startswith(f"{env_key}=") or line.startswith(f"{env_key} ="):
                    new_lines.append(f"{env_key}={body.value}")
                    updated = True
                else:
                    new_lines.append(line)
            if not updated:
                new_lines.append(f"{env_key}={body.value}")
            env_file.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        except OSError:
            pass  # read-only filesystem (containerized deploy) — runtime update is still active

    pool = get_pool()
    async with pool.acquire() as conn:
        await log_activity(
            conn,
            user_id=admin.id,
            action="admin_config_update",
            metadata={
                "key": env_key,
                "old_value": old_masked,
                "new_value": _mask_value(body.key, body.value),
            },
            ip_address=ip,
        )

    return {"ok": True}
