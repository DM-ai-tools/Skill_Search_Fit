from fastapi import APIRouter, Request, Response

from app.db.pool import get_pool
from app.exceptions import AppError, unauthorized
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import (
    clear_session_cookies,
    create_session,
    delete_session,
    require_user,
    set_session_cookies,
)
from app.schemas.auth import LoginRequest, SignupRequest, UserResponse
from app.services.activity import log_activity
from app.services.password import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _invalid_credentials() -> AppError:
    return AppError("INVALID_CREDENTIALS", "Invalid email or password", status_code=401)


@router.post("/signup", response_model=UserResponse)
async def signup(body: SignupRequest, request: Request, response: Response):
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL",
            body.email,
        )
        if existing:
            raise AppError("EMAIL_EXISTS", "An account with this email already exists", status_code=409)

        row = await conn.fetchrow(
            """
            INSERT INTO users (name, email, password_hash, role)
            VALUES ($1, $2, $3, 'user')
            RETURNING id, name, email, role::text, created_at
            """,
            body.name,
            body.email,
            hash_password(body.password),
        )

        session_id, csrf = await create_session(
            conn,
            user_id=row["id"],
            role="user",
            ip_address=ip,
            user_agent=request.headers.get("user-agent"),
        )
        await log_activity(conn, user_id=row["id"], action="user_signup", ip_address=ip)

    set_session_cookies(response, session_id, csrf)
    return UserResponse(**dict(row))


@router.post("/login", response_model=UserResponse)
async def login(body: LoginRequest, request: Request, response: Response):
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, name, email, password_hash, role::text, created_at
            FROM users WHERE email = $1 AND deleted_at IS NULL
            """,
            body.email,
        )
        if not row or not verify_password(body.password, row["password_hash"]):
            raise _invalid_credentials()

        session_id, csrf = await create_session(
            conn,
            user_id=row["id"],
            role=row["role"],
            ip_address=ip,
            user_agent=request.headers.get("user-agent"),
            remember=body.remember,
        )
        await log_activity(
            conn,
            user_id=row["id"],
            action="user_login",
            metadata={"role": row["role"]},
            ip_address=ip,
        )

    set_session_cookies(response, session_id, csrf, remember=body.remember)
    return UserResponse(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        created_at=row["created_at"],
    )


@router.post("/admin/login", response_model=UserResponse)
async def admin_login(body: LoginRequest, request: Request, response: Response):
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, name, email, password_hash, role::text, created_at
            FROM users WHERE email = $1 AND deleted_at IS NULL
            """,
            body.email,
        )
        if not row or not verify_password(body.password, row["password_hash"]) or row["role"] != "admin":
            raise _invalid_credentials()

        session_id, csrf = await create_session(
            conn,
            user_id=row["id"],
            role="admin",
            ip_address=ip,
            user_agent=request.headers.get("user-agent"),
        )
        await log_activity(
            conn,
            user_id=row["id"],
            action="user_login",
            metadata={"role": "admin"},
            ip_address=ip,
        )

    set_session_cookies(response, session_id, csrf)
    return UserResponse(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        created_at=row["created_at"],
    )


@router.post("/logout")
async def logout(request: Request, response: Response):
    session = request.state.session
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        if session:
            await delete_session(conn, session.session_id)
            await log_activity(conn, user_id=session.user.id, action="user_logout", ip_address=ip)
    clear_session_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, email, role::text, created_at FROM users WHERE id = $1 AND deleted_at IS NULL",
            user.id,
        )
    if not row:
        raise unauthorized()
    return UserResponse(**dict(row))
