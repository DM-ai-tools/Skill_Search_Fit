import logging

from fastapi import Request
from starlette.responses import JSONResponse

from app.cache.rate_limit_store import rate_limit_check
from app.config import settings

logger = logging.getLogger(__name__)

PUBLIC_AUTH_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/admin/login",
    "/api/v1/auth/signup",
    "/api/v1/contact",
}


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "POST" and path in PUBLIC_AUTH_PATHS:
        ip = get_client_ip(request) or "unknown"
        retry_after: int | None = None
        if path == "/api/v1/auth/login":
            retry_after = await rate_limit_check(
                f"login:{ip}",
                settings.rate_limit_login,
                settings.rate_limit_window_seconds,
            )
        elif path == "/api/v1/auth/admin/login":
            retry_after = await rate_limit_check(
                f"admin_login:{ip}",
                settings.rate_limit_admin_login,
                settings.rate_limit_window_seconds,
            )
        elif path == "/api/v1/auth/signup":
            retry_after = await rate_limit_check(
                f"signup:{ip}",
                settings.rate_limit_signup,
                settings.rate_limit_window_seconds,
            )
        elif path == "/api/v1/contact":
            retry_after = await rate_limit_check(
                f"contact:{ip}",
                settings.rate_limit_contact,
                settings.rate_limit_window_seconds,
            )

        if retry_after is not None:
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Too many requests. Please try again later.",
                        "details": [{"retry_after": retry_after}],
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )

    return await call_next(request)
