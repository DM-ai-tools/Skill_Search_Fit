"""Test HTTP requests against running backend."""
import asyncio
import httpx

BASE = "http://localhost:8010/api/v1"

async def main():
    async with httpx.AsyncClient(timeout=10) as client:
        # Test login
        resp = await client.post(
            f"{BASE}/auth/login",
            json={"email": "admin@skillsearchfit.local", "password": "Admin123!"},
        )
        print(f"POST /auth/login: {resp.status_code}")
        print(f"  Body: {resp.text[:300]}")
        print(f"  Headers: {dict(resp.headers)}")

asyncio.run(main())
