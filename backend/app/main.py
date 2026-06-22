import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.pool import close_pool, get_pool, init_pool
from app.exceptions import AppError
from app.middleware.rate_limit import rate_limit_middleware
from app.middleware.session import SessionMiddleware
from app.routers import admin, auth, change_suggestions, execute, integrations, pipelines, plugins, projects, users, website_analysis
from app.services.website_analysis.cache import purge_expired_analyses

logging.basicConfig(level=logging.DEBUG if not settings.is_production else logging.INFO)
logger = logging.getLogger(__name__)

EXPIRY_INTERVAL_SECONDS = 86_400


async def _run_expiry_purge() -> int:
    pool = get_pool()
    async with pool.acquire() as conn:
        return await purge_expired_analyses(conn)


async def _daily_expiry_job() -> None:
    while True:
        await asyncio.sleep(EXPIRY_INTERVAL_SECONDS)
        try:
            deleted = await _run_expiry_purge()
            if deleted:
                logger.info("Purged %d expired website analyses", deleted)
        except Exception as exc:
            logger.warning("Daily expiry job failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    logger.info("Database pool initialized")
    try:
        deleted = await _run_expiry_purge()
        if deleted:
            logger.info("Startup purge: removed %d expired website analyses", deleted)
    except Exception as exc:
        logger.warning("Startup expiry purge failed: %s", exc)
    expiry_task = asyncio.create_task(_daily_expiry_job())
    yield
    expiry_task.cancel()
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
        "features": [
            "website_analysis",
            "pipelines",
            "plugin_autofill",
            "competitor_discovery",
        ],
    }


@app.get("/health/ready")
async def health_ready():
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ready"}
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
app.include_router(integrations.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
