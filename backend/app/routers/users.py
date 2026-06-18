from fastapi import APIRouter, Request

from app.db.pool import get_pool
from app.exceptions import AppError, not_found
from app.middleware.session import require_user
from app.schemas.auth import ChangePasswordRequest, UpdateProfileRequest, UserResponse
from app.services.password import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_profile(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, email, role::text, created_at FROM users WHERE id = $1 AND deleted_at IS NULL",
            user.id,
        )
    if not row:
        raise not_found("User not found")
    return UserResponse(**dict(row))


@router.patch("/me", response_model=UserResponse)
async def update_profile(body: UpdateProfileRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        if body.email and body.email != user.email:
            dup = await conn.fetchrow(
                "SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL",
                body.email,
                user.id,
            )
            if dup:
                raise AppError("EMAIL_EXISTS", "Email already in use", status_code=409)

        row = await conn.fetchrow(
            """
            UPDATE users
            SET name = COALESCE($2, name),
                email = COALESCE($3, email)
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING id, name, email, role::text, created_at
            """,
            user.id,
            body.name,
            body.email,
        )
    return UserResponse(**dict(row))


@router.patch("/me/password")
async def change_password(body: ChangePasswordRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT password_hash FROM users WHERE id = $1", user.id)
        if not row or not verify_password(body.current_password, row["password_hash"]):
            raise AppError("INVALID_PASSWORD", "Current password is incorrect", status_code=400)

        await conn.execute(
            "UPDATE users SET password_hash = $2 WHERE id = $1",
            user.id,
            hash_password(body.new_password),
        )
    return {"ok": True}
