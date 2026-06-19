import time
from collections import defaultdict
from threading import Lock

from fastapi import Request
from starlette.responses import JSONResponse

from app.config import settings


class RateLimiter:
    """In-memory rate limiter for MVP (per IP, per endpoint key)."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str, limit: int, window: int) -> int | None:
        """Return retry_after seconds if rate-limited, else None."""
        now = time.time()
        with self._lock:
            hits = [t for t in self._hits[key] if now - t < window]
            if len(hits) >= limit:
                return int(window - (now - hits[0])) + 1
            hits.append(now)
            self._hits[key] = hits
            return None


rate_limiter = RateLimiter()

PUBLIC_AUTH_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/admin/login",
    "/api/v1/auth/signup",
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
        ip = get_client_ip(request)
        retry_after: int | None = None
        if path == "/api/v1/auth/login":
            retry_after = rate_limiter.check(f"login:{ip}", settings.rate_limit_login, settings.rate_limit_window_seconds)
        elif path == "/api/v1/auth/admin/login":
            retry_after = rate_limiter.check(
                f"admin_login:{ip}",
                settings.rate_limit_admin_login,
                settings.rate_limit_window_seconds,
            )
        elif path == "/api/v1/auth/signup":
            retry_after = rate_limiter.check(f"signup:{ip}", settings.rate_limit_signup, settings.rate_limit_window_seconds)

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
