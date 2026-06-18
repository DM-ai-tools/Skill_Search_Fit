import json
from uuid import UUID

from fastapi import APIRouter, Request

from app.db.pool import get_pool
from app.exceptions import not_found
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import require_user
from app.schemas.plugins import PluginDetail, PluginListItem
from app.services.activity import log_activity

router = APIRouter(prefix="/plugins", tags=["plugins"])


@router.get("", response_model=list[PluginListItem])
async def list_plugins(request: Request):
    require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, plugin_name, description, category, icon, schema_version, status::text
            FROM plugins WHERE status = 'enabled'
            ORDER BY category, plugin_name
            """
        )
    return [PluginListItem(**dict(r)) for r in rows]


@router.get("/{plugin_id}", response_model=PluginDetail)
async def get_plugin(plugin_id: UUID, request: Request):
    user = require_user(request)
    ip = get_client_ip(request)
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
            WHERE pl.id = $1 AND pl.status = 'enabled'
            GROUP BY pl.id
            """,
            plugin_id,
        )
        if not row:
            raise not_found("Plugin not found")

        await log_activity(
            conn,
            user_id=user.id,
            action="plugin_launch",
            metadata={"plugin_id": str(plugin_id)},
            ip_address=ip,
        )

    d = dict(row)
    if isinstance(d["input_fields"], str):
        d["input_fields"] = json.loads(d["input_fields"])
    if isinstance(d["prompts"], str):
        d["prompts"] = json.loads(d["prompts"])
    return PluginDetail(**d)
