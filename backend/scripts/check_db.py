import asyncio
import asyncpg
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.config import settings

async def main():
    conn = await asyncpg.connect(settings.database_url)
    tables = await conn.fetch(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    )
    print("Tables:", [r["tablename"] for r in tables])
    try:
        users = await conn.fetchval("SELECT COUNT(*) FROM users")
        print("User count:", users)
        admin = await conn.fetchrow("SELECT id, email, role FROM users WHERE role='admin'")
        print("Admin row:", dict(admin) if admin else "NONE")
    except Exception as e:
        print("Error querying users:", e)
    await conn.close()

asyncio.run(main())
