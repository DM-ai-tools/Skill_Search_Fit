from __future__ import annotations

import base64
import json
from typing import Optional
from uuid import UUID

from asyncpg import Connection


async def get_integration(conn: Connection, user_id: UUID, platform: str) -> Optional[dict]:
    row = await conn.fetchrow(
        """
        SELECT id, platform, site_url, status, last_used_at, created_at, updated_at
        FROM user_integrations
        WHERE user_id = $1 AND platform = $2
        """,
        user_id, platform,
    )
    return dict(row) if row else None


async def get_all_integrations(conn: Connection, user_id: UUID) -> list[dict]:
    rows = await conn.fetch(
        """
        SELECT id, platform, site_url, status, last_used_at, created_at, updated_at
        FROM user_integrations
        WHERE user_id = $1
        ORDER BY platform
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def upsert_integration(
    conn: Connection,
    user_id: UUID,
    platform: str,
    site_url: str,
    access_token: str,
) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO user_integrations (user_id, platform, site_url, access_token, status)
        VALUES ($1, $2, $3, $4, 'connected')
        ON CONFLICT (user_id, platform) DO UPDATE
            SET site_url     = EXCLUDED.site_url,
                access_token = EXCLUDED.access_token,
                status       = 'connected',
                updated_at   = NOW()
        RETURNING id, platform, site_url, status, last_used_at, created_at, updated_at
        """,
        user_id, platform, site_url, access_token,
    )
    return dict(row)


async def upsert_wordpress_integration(
    conn: Connection,
    user_id: UUID,
    platform: str,
    site_url: str,
    username: str,
    app_password: str,
) -> dict:
    token = encode_credentials(platform, username=username, app_password=app_password)
    return await upsert_integration(conn, user_id, platform, site_url, token)


async def get_access_token(conn: Connection, user_id: UUID, platform: str) -> Optional[str]:
    """Return the raw base64 token. Only decoded server-side — never forwarded to the frontend."""
    return await conn.fetchval(
        "SELECT access_token FROM user_integrations WHERE user_id = $1 AND platform = $2",
        user_id, platform,
    )


async def set_integration_status(
    conn: Connection, user_id: UUID, platform: str, status: str
) -> None:
    await conn.execute(
        """
        UPDATE user_integrations SET status = $1, updated_at = NOW()
        WHERE user_id = $2 AND platform = $3
        """,
        status, user_id, platform,
    )


async def touch_integration(conn: Connection, user_id: UUID, platform: str) -> None:
    await conn.execute(
        """
        UPDATE user_integrations SET last_used_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND platform = $2
        """,
        user_id, platform,
    )


async def delete_integration(conn: Connection, user_id: UUID, platform: str) -> None:
    await conn.execute(
        "DELETE FROM user_integrations WHERE user_id = $1 AND platform = $2",
        user_id, platform,
    )


def encode_credentials(platform: str, **kwargs: str) -> str:
    """Encode platform credentials as base64 — never log the return value."""
    if platform == "WordPress":
        raw = f"{kwargs['username']}:{kwargs['app_password']}"
    elif platform == "Webflow":
        raw = f"{kwargs['site_id']}:{kwargs['api_token']}"
    elif platform == "Wix":
        raw = f"{kwargs['site_id']}:{kwargs['api_key']}"
    else:
        raise ValueError(f"Unsupported platform: {platform}")
    return base64.b64encode(raw.encode()).decode()


def decode_token(access_token: str) -> tuple[str, str]:
    """Decode WordPress base64 token → (username, app_password). Never pass this to logging."""
    decoded = base64.b64decode(access_token.encode()).decode()
    username, _, app_password = decoded.partition(":")
    return username, app_password


def decode_api_credentials(platform: str, access_token: str) -> dict[str, str]:
    """Decode stored credentials for any supported CMS platform."""
    decoded = base64.b64decode(access_token.encode()).decode()
    if platform == "WordPress":
        username, _, password = decoded.partition(":")
        return {"username": username, "app_password": password}
    site_id, _, secret = decoded.partition(":")
    if platform == "Webflow":
        return {"site_id": site_id, "api_token": secret}
    if platform == "Wix":
        return {"site_id": site_id, "api_key": secret}
    return {}


async def add_audit_log(
    conn: Connection,
    user_id: UUID,
    platform: str,
    action: str,
    status_before: Optional[str],
    status_after: Optional[str],
    metadata: Optional[dict] = None,
) -> None:
    metadata_json = json.dumps(metadata or {})
    await conn.execute(
        """
        INSERT INTO integration_audit_log
            (user_id, platform, action, status_before, status_after, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        user_id, platform, action, status_before, status_after,
        metadata_json,
    )
