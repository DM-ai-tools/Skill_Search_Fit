"""Webhook subscription management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.db.pool import get_pool
from app.middleware.session import require_user

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookCreateRequest(BaseModel):
    event_name: str = Field(..., min_length=3, max_length=80)
    target_url: str = Field(..., min_length=8, max_length=2048)
    secret: str | None = Field(default=None, max_length=255)


@router.get("")
async def list_webhooks(request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, event_name, target_url, is_active, created_at
            FROM user_webhooks
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            user.id,
        )
    return {"webhooks": [dict(r) for r in rows]}


@router.post("")
async def create_webhook(body: WebhookCreateRequest, request: Request) -> dict:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO user_webhooks (user_id, event_name, target_url, secret)
            VALUES ($1, $2, $3, $4)
            RETURNING id, event_name, target_url, is_active, created_at
            """,
            user.id,
            body.event_name,
            body.target_url,
            body.secret,
        )
    return {"webhook": dict(row)}
