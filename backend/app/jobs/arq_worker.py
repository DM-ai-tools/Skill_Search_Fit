"""Arq worker settings and job handlers."""

from __future__ import annotations

from uuid import UUID

from arq.connections import RedisSettings

from app.config import settings
from app.db.pool import close_pool, get_pool, init_pool
from app.services.execution.pipeline_run_service import _bootstrap_pipeline_run
from app.services.reports.pipeline_page_generation import _execute_generation


async def startup(ctx: dict) -> None:
    await init_pool()


async def shutdown(ctx: dict) -> None:
    await close_pool()


async def job_pipeline_bootstrap(ctx: dict, payload: dict) -> None:
    pool = get_pool()
    await _bootstrap_pipeline_run(
        pool,
        run_id=UUID(str(payload["run_id"])),
        pipeline_id=str(payload["pipeline_id"]),
        enriched_inputs=dict(payload.get("enriched_inputs") or {}),
        user_id=UUID(str(payload["user_id"])),
        ip_address=payload.get("ip_address"),
    )


async def job_pipeline_page_generation_execute(ctx: dict, payload: dict) -> None:
    pool = get_pool()
    await _execute_generation(
        pool,
        UUID(str(payload["generation_id"])),
        dict(payload.get("job_data") or {}),
        user_feedback=payload.get("user_feedback"),
    )


class WorkerSettings:
    functions = [job_pipeline_bootstrap, job_pipeline_page_generation_execute]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    on_shutdown = shutdown
