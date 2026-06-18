"""Seed plugins from JSON definitions in backend/plugins/."""
import json
import os
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

PLUGINS_DIR = Path(__file__).resolve().parent.parent / "plugins"

# Legacy plugins from 002_seed_dev.sql — superseded by backend/plugins/*.json
LEGACY_PLUGINS_TO_DISABLE = [
    "Keyword Gap Analyzer",
    "Meta Description Generator",
    "Technical SEO Checklist",
    "Content Translation",
    "Generate Schema Markup",
    "Generate Schema",
    "Schema Markup Generator",
]


def upsert_plugin(conn, definition: dict) -> None:
    name = definition["plugin_name"]
    existing = conn.execute(
        "SELECT id FROM plugins WHERE plugin_name = %s",
        (name,),
    ).fetchone()

    input_fields = json.dumps(definition["input_fields"])

    if existing:
        plugin_id = existing[0]
        conn.execute(
            """
            UPDATE plugins
            SET description = %s,
                category = %s,
                icon = %s,
                input_fields = %s::jsonb,
                schema_version = schema_version + 1,
                status = 'enabled'
            WHERE id = %s
            """,
            (
                definition["description"],
                definition["category"],
                definition["icon"],
                input_fields,
                plugin_id,
            ),
        )
        print(f"Updated plugin: {name}")
    else:
        row = conn.execute(
            """
            INSERT INTO plugins (
                plugin_name, description, category, icon, input_fields, status
            )
            VALUES (%s, %s, %s, %s, %s::jsonb, 'enabled')
            RETURNING id
            """,
            (
                name,
                definition["description"],
                definition["category"],
                definition["icon"],
                input_fields,
            ),
        ).fetchone()
        plugin_id = row[0]
        print(f"Created plugin: {name}")

    for deprecated_name in definition.get("deprecated_names", []):
        result = conn.execute(
            """
            UPDATE plugins
            SET status = 'disabled'
            WHERE plugin_name = %s AND id != %s
            """,
            (deprecated_name, plugin_id),
        )
        if result.rowcount:
            print(f"  Disabled deprecated plugin: {deprecated_name}")

    prompts = definition.get("prompts", {})
    for prompt_type, content in prompts.items():
        conn.execute(
            """
            INSERT INTO prompts (plugin_id, prompt_type, prompt_content)
            VALUES (%s, %s::prompt_type, %s)
            ON CONFLICT (plugin_id, prompt_type)
            DO UPDATE SET prompt_content = EXCLUDED.prompt_content
            """,
            (plugin_id, prompt_type, content),
        )
    print(f"  Prompts synced: {', '.join(prompts.keys())}")


def main() -> None:
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://skillsearchfit:root@localhost:5432/skillsearchfit",
    )

    files = sorted(PLUGINS_DIR.glob("*.json"))
    if not files:
        print(f"No plugin JSON files in {PLUGINS_DIR}")
        sys.exit(1)

    with psycopg.connect(database_url) as conn:
        for path in files:
            definition = json.loads(path.read_text(encoding="utf-8"))
            upsert_plugin(conn, definition)
        for legacy_name in LEGACY_PLUGINS_TO_DISABLE:
            result = conn.execute(
                "UPDATE plugins SET status = 'disabled' WHERE plugin_name = %s",
                (legacy_name,),
            )
            if result.rowcount:
                print(f"Disabled legacy plugin: {legacy_name}")
        conn.commit()

    print("Plugin seed complete")


if __name__ == "__main__":
    main()
