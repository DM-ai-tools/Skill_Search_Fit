import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.pool import close_pool, get_pool, init_pool
from app.db.schema_checks import validate_database_schema
from app.exceptions import AppError
from app.startup_checks import validate_production_settings
from app.cache.redis_client import close_redis, init_redis, ping_redis, redis_available
from app.middleware.rate_limit import rate_limit_middleware
from app.middleware.session import SessionMiddleware
from app.routers import admin, auth, automation, change_suggestions, contact, execute, integrations, pipelines, plugins, projects, reports, seo_intelligence, system, tenancy, users, webhooks, website_analysis
from app.services.execution.pipeline_run_maintenance import recover_stale_pipeline_runs
from app.services.website_analysis.cache import purge_expired_analyses
from app.services.session_cleanup import purge_expired_sessions

logging.basicConfig(level=logging.DEBUG if not settings.is_production else logging.INFO)
logger = logging.getLogger(__name__)

EXPIRY_INTERVAL_SECONDS = 86_400


async def _run_startup_maintenance() -> tuple[int, int, int]:
    pool = get_pool()
    async with pool.acquire() as conn:
        analyses = await purge_expired_analyses(conn)
        sessions = await purge_expired_sessions(conn)
        await validate_database_schema(conn)
    stale_runs = await recover_stale_pipeline_runs(pool)
    return analyses, sessions, stale_runs


async def _run_expiry_purge() -> tuple[int, int, int]:
    pool = get_pool()
    async with pool.acquire() as conn:
        analyses = await purge_expired_analyses(conn)
        sessions = await purge_expired_sessions(conn)
    stale_runs = await recover_stale_pipeline_runs(pool)
    return analyses, sessions, stale_runs


async def _daily_expiry_job() -> None:
    while True:
        await asyncio.sleep(EXPIRY_INTERVAL_SECONDS)
        try:
            analyses, sessions, stale_runs = await _run_expiry_purge()
            if analyses:
                logger.info("Purged %d expired website analyses", analyses)
            if sessions:
                logger.info("Purged %d expired sessions", sessions)
            if stale_runs:
                logger.info("Recovered %d stale pipeline runs", stale_runs)
        except Exception as exc:
            logger.warning("Daily expiry job failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_production_settings(settings)
    await init_redis()
    await init_pool()
    logger.info("Database pool initialized")
    try:
        analyses, sessions, stale_runs = await _run_startup_maintenance()
        if analyses:
            logger.info("Startup purge: removed %d expired website analyses", analyses)
        if sessions:
            logger.info("Startup purge: removed %d expired sessions", sessions)
        if stale_runs:
            logger.info("Startup recovery: marked %d stale pipeline runs as failed", stale_runs)
    except Exception as exc:
        logger.warning("Startup expiry purge failed: %s", exc)
    expiry_task = asyncio.create_task(_daily_expiry_job())
    yield
    expiry_task.cancel()
    await close_redis()
    await close_pool()


app = FastAPI(title="SkillSearchFit API", version="2.0.0", lifespan=lifespan)

# Middleware order: last added runs first (outermost). CORS must be outermost so
# preflight OPTIONS is handled before SessionMiddleware (BaseHTTPMiddleware).
app.middleware("http")(rate_limit_middleware)
app.add_middleware(SessionMiddleware)

cors_origins = (
    settings.cors_origin_list
    if settings.is_production
    else [f"http://localhost:{port}" for port in range(3000, 3100)]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content=exc.detail)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": exc.errors(),
            }
        },
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "api_version": "2.0.0",
        "redis": "connected" if redis_available() else "unavailable",
        "features": [
            "website_analysis",
            "pipelines",
            "unified_reports",
            "publish_ready_page",
            "change_suggestions",
            "plugin_autofill",
            "competitor_discovery",
            "redis_cache",
        ],
    }


@app.get("/health/ready")
async def health_ready():
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        if settings.redis_url.strip() and not await ping_redis():
            return JSONResponse(
                status_code=503,
                content={"status": "not ready", "error": "Redis ping failed"},
            )
        return {"status": "ready", "redis": redis_available()}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "not ready", "error": str(e)})


app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(plugins.router, prefix="/api/v1")
app.include_router(pipelines.router, prefix="/api/v1")
app.include_router(execute.router, prefix="/api/v1")
app.include_router(website_analysis.router, prefix="/api/v1")
app.include_router(change_suggestions.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(automation.router, prefix="/api/v1")
app.include_router(system.router, prefix="/api/v1")
app.include_router(seo_intelligence.router, prefix="/api/v1")
app.include_router(tenancy.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")
app.include_router(integrations.router, prefix="/api/v1")
app.include_router(contact.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
