"""Verify pipeline step plugin names exist and are enabled in DB."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

import asyncpg

from app.data.pipelines import PIPELINES, build_step_inputs


async def main() -> int:
    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT plugin_name, status::text FROM plugins ORDER BY plugin_name")
    db = {r["plugin_name"]: r["status"] for r in rows}

    failed = False
    for pipeline in PIPELINES:
        print(f"\n{pipeline['id']} — {pipeline['name']}")
        prior: list[str] = []
        base = {
            "site_url": "https://example.com",
            "brand_name": "Example",
            "business_name": "Example",
            "competitors": "https://competitor.com",
            "seed_topic": "seo tools",
            "target_audience": "marketers",
        }
        for step in pipeline["steps"]:
            name = step["plugin_name"]
            status = db.get(name, "MISSING")
            mark = "OK" if status == "enabled" else status
            if status != "enabled":
                failed = True
            inputs = build_step_inputs(name, base, prior)
            prior.append(f"mock output for {name}")
            print(f"  [{mark}] {name} -> {len(inputs)} inputs")
    await pool.close()
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
