"""Validate Generate-by-AI autofill coverage for all canonical plugins."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.validation import collect_plugin_input_errors
from app.services.website_analysis.autofill import generate_plugin_autofill, validate_autofill_fields

SITE_URL = "https://trafficradius.com.au/"
EXCLUDED = {"content_translation.json"}

MOCK_ANALYSIS = {
    "analysis": {
        "company_name": "Traffic Radius",
        "industry": "Digital Marketing",
        "business_type": "Marketing Agency",
        "description": "Full-service digital marketing agency helping Australian businesses grow online.",
        "value_proposition": "Data-driven SEO, PPC, and web solutions for measurable growth.",
        "target_audience": ["SMBs", "E-commerce brands", "Local service businesses"],
        "seo_keywords": ["seo services", "ppc management", "digital marketing australia"],
        "products_services": ["SEO", "PPC", "Web Design", "Content Marketing"],
    },
    "competitors": [
        {"name": "Web Profits", "domain": "webprofits.com.au"},
        {"name": "Digital Next", "domain": "digitalnext.com.au"},
        {"name": "Online Marketing Gurus", "domain": "onlinemarketinggurus.com.au"},
    ],
    "crawl": {
        "pages_crawled": 8,
        "pages": [
            {
                "url": "https://trafficradius.com.au/",
                "title": "Traffic Radius — Digital Marketing",
                "snippet": "Traffic Radius is a digital marketing agency offering SEO, PPC, and web design.",
            },
            {
                "url": "https://trafficradius.com.au/services/seo/",
                "title": "SEO Services",
                "snippet": "Professional SEO services to improve rankings and organic traffic.",
            },
            {
                "url": "https://trafficradius.com.au/services/ppc/",
                "title": "PPC Management",
                "snippet": "Google Ads and paid search management for lead generation.",
            },
        ],
        "internal_links": [
            "https://trafficradius.com.au/services/seo/",
            "https://trafficradius.com.au/services/ppc/",
            "https://trafficradius.com.au/contact/",
        ],
    },
    "quick_audit": {
        "suggested_plugin_inputs": {
            "keywords": ["seo services", "ppc management", "digital marketing"],
            "target_pages": [
                "https://trafficradius.com.au/",
                "https://trafficradius.com.au/services/seo/",
            ],
        }
    },
}


async def validate_plugin(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    plugin_name = data["plugin_name"]
    fields = data.get("input_fields") or []
    required = [f["name"] for f in fields if f.get("required")]

    result = await generate_plugin_autofill(
        input_fields=fields,
        website_analysis=MOCK_ANALYSIS,
        plugin_name=plugin_name,
        plugin_category=data.get("category") or "",
        plugin_description=data.get("description") or "",
        site_url=SITE_URL,
    )

    field_map = result.get("fields") or {}
    errors = validate_autofill_fields(fields, field_map)
    values = result.get("recommended_values") or {}
    populated_required = [
        name for name in required
        if name in values and values[name] not in (None, "")
        and not (isinstance(values[name], str) and not str(values[name]).strip())
    ]
    missing_required = [name for name in required if name not in populated_required]

    return {
        "plugin": plugin_name,
        "file": path.name,
        "required_fields": required,
        "populated_required": populated_required,
        "missing_required": missing_required,
        "validation_errors": errors,
        "status": "PASS" if not errors and not missing_required else "FAIL",
    }


async def main() -> int:
    plugins_dir = BACKEND_ROOT / "plugins"
    paths = sorted(p for p in plugins_dir.glob("*.json") if p.name not in EXCLUDED)
    results = await asyncio.gather(*(validate_plugin(p) for p in paths))

    print("\n=== Generate by AI — Autofill Validation Report ===\n")
    pass_count = 0
    for row in results:
        status = row["status"]
        if status == "PASS":
            pass_count += 1
        print(f"## {row['plugin']} — {status}")
        print(f"   Required ({len(row['required_fields'])}): {', '.join(row['required_fields']) or '—'}")
        print(f"   Populated: {', '.join(row['populated_required']) or '—'}")
        if row["missing_required"]:
            print(f"   Missing: {', '.join(row['missing_required'])}")
        if row["validation_errors"]:
            for err in row["validation_errors"]:
                print(f"   Error [{err['field']}]: {err['message']}")
        print()

    print(f"Summary: {pass_count}/{len(results)} plugins PASS")
    return 0 if pass_count == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
