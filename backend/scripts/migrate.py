"""Run SQL migrations in order."""
import os
import sys
from pathlib import Path

import psycopg

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def main() -> None:
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://skillsearchfit:skillsearchfit@localhost:5432/skillsearchfit",
    )

    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print("No migration files found")
        sys.exit(1)

    with psycopg.connect(database_url) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.commit()

        for path in files:
            applied = conn.execute(
                "SELECT 1 FROM schema_migrations WHERE filename = %s",
                (path.name,),
            ).fetchone()
            if applied:
                print(f"Skip {path.name}")
                continue

            sql = path.read_text(encoding="utf-8")
            print(f"Apply {path.name}")
            conn.execute(sql)
            conn.execute(
                "INSERT INTO schema_migrations (filename) VALUES (%s)",
                (path.name,),
            )
            conn.commit()

    print("Migrations complete")


if __name__ == "__main__":
    main()
