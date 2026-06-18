import asyncio
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.config import settings
from app.services.password import verify_password
import asyncpg

async def main():
    conn = await asyncpg.connect(settings.database_url)
    row = await conn.fetchrow(
        "SELECT id, email, password_hash, role::text, deleted_at FROM users WHERE email = $1",
        "admin@skillsearchfit.local"
    )
    print("Row found:", row is not None)
    if row:
        print("email:", row["email"])
        print("role:", row["role"])
        print("deleted_at:", row["deleted_at"])
        ok = verify_password("Admin123!", row["password_hash"])
        print("password ok:", ok)
    await conn.close()

asyncio.run(main())
