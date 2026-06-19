"""Seed default admin user from environment."""
import os
import sys

import psycopg

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import normalize_database_url
from app.services.password import hash_password


def main() -> None:
    database_url = normalize_database_url(
        os.environ.get(
            "DATABASE_URL",
            "postgresql://skillsearchfit:skillsearchfit@localhost:5432/skillsearchfit",
        )
    )
    email = os.environ.get("ADMIN_EMAIL", "admin@skillsearchfit.local")
    password = os.environ.get("ADMIN_PASSWORD", "Admin123!")
    name = os.environ.get("ADMIN_NAME", "Platform Admin")

    with psycopg.connect(database_url) as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = %s",
            (email,),
        ).fetchone()
        if existing:
            print(f"Admin already exists: {email}")
            return

        conn.execute(
            """
            INSERT INTO users (name, email, password_hash, role)
            VALUES (%s, %s, %s, 'admin')
            """,
            (name, email, hash_password(password)),
        )
        conn.commit()
        print(f"Admin created: {email}")


if __name__ == "__main__":
    main()
