import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import settings
from app.db.pool import get_pool
from app.exceptions import forbidden, unauthorized

SESSION_COOKIE = "ssf_session"
CSRF_COOKIE = "ssf_csrf"

PUBLIC_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/admin/login",
    "/api/v1/auth/signup",
    "/health",
    "/health/ready",
    "/docs",
    "/openapi.json",
    "/redoc",
}


class CurrentUser:
    def __init__(self, id: UUID, name: str, email: str, role: str):
        self.id = id
        self.name = name
        self.email = email
        self.role = role

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


class SessionData:
    def __init__(self, session_id: UUID, user: CurrentUser, csrf_token: str):
        self.session_id = session_id
        self.user = user
        self.csrf_token = csrf_token


def _generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


async def create_session(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    role: str,
    ip_address: str | None,
    user_agent: str | None,
) -> tuple[UUID, str]:
    session_id = uuid4()
    csrf_token = _generate_csrf_token()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.session_max_age)
    data = json.dumps({"login_status": True, "role": role})

    await conn.execute(
        """
        INSERT INTO sessions (id, user_id, data, csrf_token, expires_at, ip_address, user_agent)
        VALUES ($1::uuid, $2, $3::jsonb, $4, $5, $6::inet, $7)
        """,
        session_id,
        user_id,
        data,
        csrf_token,
        expires_at,
        ip_address,
        user_agent,
    )
    return session_id, csrf_token


async def delete_session(conn: asyncpg.Connection, session_id: UUID) -> None:
    await conn.execute("DELETE FROM sessions WHERE id = $1", session_id)


async def load_session(conn: asyncpg.Connection, session_id: UUID) -> SessionData | None:
    row = await conn.fetchrow(
        """
        SELECT s.id, s.csrf_token, s.expires_at, u.id AS user_id, u.name, u.email, u.role::text
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND u.deleted_at IS NULL
        """,
        session_id,
    )
    if not row:
        return None

    expires_at = row["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await delete_session(conn, session_id)
        return None

    user = CurrentUser(row["user_id"], row["name"], row["email"], row["role"])
    return SessionData(row["id"], user, row["csrf_token"])


def set_session_cookies(response, session_id: UUID, csrf_token: str) -> None:
    secure = settings.is_production
    max_age = settings.session_max_age
    response.set_cookie(
        key=SESSION_COOKIE,
        value=str(session_id),
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=csrf_token,
        httponly=False,
        secure=secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def clear_session_cookies(response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


class SessionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.session = None
        request.state.current_user = None

        path = request.url.path
        if path.startswith("/api/v1"):
            session_id_raw = request.cookies.get(SESSION_COOKIE)
            if session_id_raw:
                try:
                    session_id = UUID(session_id_raw)
                    pool = get_pool()
                    async with pool.acquire() as conn:
                        session = await load_session(conn, session_id)
                    if session:
                        request.state.session = session
                        request.state.current_user = session.user
                except ValueError:
                    pass

            if request.method in {"POST", "PUT", "PATCH", "DELETE"} and path not in PUBLIC_PATHS:
                session: SessionData | None = request.state.session
                if not session:
                    return JSONResponse(
                        status_code=401,
                        content={"error": {"code": "UNAUTHORIZED", "message": "Unauthorized", "details": []}},
                    )
                csrf_header = request.headers.get("x-csrf-token")
                if not csrf_header or csrf_header != session.csrf_token:
                    return JSONResponse(
                        status_code=403,
                        content={"error": {"code": "CSRF_TOKEN_INVALID", "message": "Invalid or missing CSRF token", "details": []}},
                    )

        return await call_next(request)


def require_user(request: Request) -> CurrentUser:
    user = request.state.current_user
    if not user:
        raise unauthorized()
    return user


def require_admin(request: Request) -> CurrentUser:
    user = require_user(request)
    if not user.is_admin:
        from app.exceptions import forbidden

        raise forbidden("Admin access required")
    return user
