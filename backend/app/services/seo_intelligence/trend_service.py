"""SEO intelligence keyword snapshot ingestion and trend queries."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

import asyncpg

from app.exceptions import not_found, validation_error


async def ensure_project_owned(conn: asyncpg.Connection, *, project_id: UUID, user_id: UUID) -> None:
    owned = await conn.fetchval(
        """
        SELECT 1 FROM projects
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        """,
        project_id,
        user_id,
    )
    if not owned:
        raise not_found("Project not found")


async def ingest_keyword_snapshots(
    conn: asyncpg.Connection,
    *,
    project_id: UUID,
    user_id: UUID,
    snapshot_date: date,
    items: list[dict[str, Any]],
    source: str = "manual",
) -> dict[str, int]:
    await ensure_project_owned(conn, project_id=project_id, user_id=user_id)
    inserted = 0
    updated = 0

    for item in items:
        keyword = str(item.get("keyword") or "").strip()
        if not keyword:
            continue
        intent = str(item.get("intent") or "").strip() or None
        rank_position = item.get("rank_position")
        search_volume = item.get("search_volume")
        difficulty = item.get("difficulty")
        serp_features = item.get("serp_features") or []

        if rank_position is not None and (int(rank_position) < 1 or int(rank_position) > 100):
            raise validation_error("rank_position must be between 1 and 100", [])

        keyword_id = await conn.fetchval(
            """
            INSERT INTO seo_keywords (user_id, project_id, keyword, intent)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, project_id, keyword)
            DO UPDATE SET intent = EXCLUDED.intent, updated_at = NOW()
            RETURNING id
            """,
            user_id,
            project_id,
            keyword,
            intent,
        )

        existing = await conn.fetchval(
            """
            SELECT 1 FROM seo_rank_snapshots
            WHERE keyword_id = $1 AND snapshot_date = $2
            """,
            keyword_id,
            snapshot_date,
        )

        await conn.execute(
            """
            INSERT INTO seo_rank_snapshots (
                keyword_id, snapshot_date, rank_position, search_volume, difficulty, serp_features, source
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
            ON CONFLICT (keyword_id, snapshot_date)
            DO UPDATE SET
                rank_position = EXCLUDED.rank_position,
                search_volume = EXCLUDED.search_volume,
                difficulty = EXCLUDED.difficulty,
                serp_features = EXCLUDED.serp_features,
                source = EXCLUDED.source
            """,
            keyword_id,
            snapshot_date,
            rank_position,
            search_volume,
            difficulty,
            serp_features,
            source,
        )
        if existing:
            updated += 1
        else:
            inserted += 1

    return {"inserted": inserted, "updated": updated}


async def project_trends(
    conn: asyncpg.Connection,
    *,
    project_id: UUID,
    user_id: UUID,
    days: int,
) -> dict[str, Any]:
    await ensure_project_owned(conn, project_id=project_id, user_id=user_id)
    days = max(7, min(days, 365))
    since = date.today() - timedelta(days=days)

    rows = await conn.fetch(
        """
        SELECT k.keyword,
               s.snapshot_date,
               s.rank_position,
               s.search_volume,
               s.difficulty
        FROM seo_keywords k
        JOIN seo_rank_snapshots s ON s.keyword_id = k.id
        WHERE k.user_id = $1
          AND k.project_id = $2
          AND s.snapshot_date >= $3
        ORDER BY k.keyword, s.snapshot_date
        """,
        user_id,
        project_id,
        since,
    )

    by_keyword: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_keyword.setdefault(row["keyword"], []).append(
            {
                "date": row["snapshot_date"].isoformat(),
                "rank_position": row["rank_position"],
                "search_volume": row["search_volume"],
                "difficulty": row["difficulty"],
            }
        )

    improved = 0
    declined = 0
    stable = 0
    top10 = 0
    top3 = 0
    for _, points in by_keyword.items():
        if not points:
            continue
        first = next((p["rank_position"] for p in points if p["rank_position"] is not None), None)
        last = next((p["rank_position"] for p in reversed(points) if p["rank_position"] is not None), None)
        if last is not None:
            if last <= 10:
                top10 += 1
            if last <= 3:
                top3 += 1
        if first is None or last is None:
            continue
        delta = first - last
        if delta >= 2:
            improved += 1
        elif delta <= -2:
            declined += 1
        else:
            stable += 1

    return {
        "days": days,
        "keywords_tracked": len(by_keyword),
        "improved_keywords": improved,
        "declined_keywords": declined,
        "stable_keywords": stable,
        "top10_keywords": top10,
        "top3_keywords": top3,
        "trends": [{"keyword": k, "points": pts} for k, pts in by_keyword.items()],
    }
