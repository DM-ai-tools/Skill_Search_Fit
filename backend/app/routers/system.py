"""System status endpoints (authenticated capability flags)."""

from fastapi import APIRouter, Request

from app.config import settings
from app.jobs.arq_queue import pipeline_jobs_via_queue, queue_enabled, queue_stats
from app.middleware.session import require_admin, require_user
from app.services.llm.openai_client import openai_configured

router = APIRouter(tags=["system"])


@router.get("/system/capabilities")
async def system_capabilities(request: Request) -> dict:
    require_user(request)
    has_claude = bool(settings.anthropic_api_key and settings.anthropic_api_key.strip())
    has_openai = openai_configured()
    live_ai = has_claude or has_openai

    if has_claude:
        primary = "claude"
    elif has_openai:
        primary = "openai"
    else:
        primary = "preview"

    return {
        "live_ai": live_ai,
        "primary_executor": primary,
        "claude_configured": has_claude,
        "openai_configured": has_openai,
        "anthropic_model": settings.anthropic_model if has_claude else None,
        "openai_model": settings.openai_model if has_openai else None,
        "features": {
            "plugin_execution": live_ai,
            "pipeline_execution": live_ai,
            "report_presentation": has_openai,
            "article_preview_polish": has_openai,
            "pdf_enhance": has_openai,
            "change_suggestions_extraction": has_claude,
        },
    }


@router.get("/system/jobs")
async def system_job_stats(request: Request) -> dict:
    require_admin(request)
    stats = await queue_stats()
    return {
        "queue_enabled": await queue_enabled(),
        "pipeline_use_arq": settings.pipeline_use_arq,
        "pipeline_jobs_via_queue": await pipeline_jobs_via_queue(),
        "queued_jobs": stats["queued"],
        "dead_jobs": stats["dead"],
    }
