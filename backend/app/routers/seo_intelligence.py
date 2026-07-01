"""SEO intelligence APIs: keyword snapshot ingestion + trends."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.db.pool import get_pool
from app.middleware.session import require_user
from app.services.seo_intelligence.trend_service import ingest_keyword_snapshots, project_trends

router = APIRouter(prefix="/seo-intelligence", tags=["seo-intelligence"])


class KeywordSnapshotItem(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=255)
    rank_position: int | None = Field(default=None, ge=1, le=100)
    search_volume: int | None = Field(default=None, ge=0)
    difficulty: int | None = Field(default=None, ge=0, le=100)
    intent: str | None = Field(default=None, max_length=100)
    serp_features: list[str] = Field(default_factory=list)


class KeywordSnapshotIngestRequest(BaseModel):
    project_id: UUID
    snapshot_date: date | None = None
    source: str = Field(default="manual", max_length=64)
    items: list[KeywordSnapshotItem]


@router.post("/keywords/snapshots")
async def create_keyword_snapshots(body: KeywordSnapshotIngestRequest, request: Request) -> dict[str, Any]:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await ingest_keyword_snapshots(
            conn,
            project_id=body.project_id,
            user_id=user.id,
            snapshot_date=body.snapshot_date or date.today(),
            source=body.source,
            items=[item.model_dump(mode="json") for item in body.items],
        )
    return result


@router.get("/projects/{project_id}/trends")
async def get_project_seo_trends(project_id: UUID, request: Request, days: int = 30) -> dict[str, Any]:
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        return await project_trends(conn, project_id=project_id, user_id=user.id, days=days)
