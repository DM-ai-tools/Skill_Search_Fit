"""Validate pipeline step inputs against plugin required fields."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

import asyncpg

from app.data.pipelines import PIPELINES, build_step_inputs
from app.services.validation import collect_plugin_input_errors


async def main() -> int:
    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
    failed = False
    base = {
        "site_url": "https://trafficradius.com.au/",
        "brand_name": "Traffic Radius",
        "business_name": "Traffic Radius",
        "competitors": "https://webprofits.com.au\nhttps://digitalnext.com.au",
        "seed_topic": "digital marketing australia",
        "target_audience": "SMBs",
        "analysis_depth": "standard",
        "topic_count": 10,
        "market_category": "Digital Marketing",
        "value_proposition": "Data-driven growth",
        "tech_stack": "wordpress",
    }

    async with pool.acquire() as conn:
        for pipeline in PIPELINES:
            print(f"\n{pipeline['id']}")
            prior: list[str] = []
            for step in pipeline["steps"]:
                plugin_name = step["plugin_name"]
                row = await conn.fetchrow(
                    "SELECT input_fields FROM plugins WHERE plugin_name = $1 AND status = 'enabled'",
                    plugin_name,
                )
                if not row:
                    print(f"  FAIL missing plugin: {plugin_name}")
                    failed = True
                    continue
                fields = row["input_fields"]
                if isinstance(fields, str):
                    fields = json.loads(fields)
                inputs = build_step_inputs(plugin_name, base, prior)
                errors = collect_plugin_input_errors(fields, inputs)
                if errors:
                    failed = True
                    print(f"  FAIL {plugin_name}:")
                    for err in errors:
                        print(f"    - {err['field']}: {err['message']}")
                else:
                    print(f"  OK {plugin_name}")
                prior.append(f"### Step output\n\nSample markdown for {plugin_name}")
    await pool.close()
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
