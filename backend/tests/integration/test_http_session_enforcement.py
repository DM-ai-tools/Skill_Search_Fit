"""Integration-level HTTP checks for session middleware behavior."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_public_auth_login_route_remains_accessible_without_session():
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@example.com", "password": "wrong-password"},
    )
    # Should not be blocked by middleware session guard.
    assert response.status_code != 401


def test_protected_get_requires_session():
    response = client.get("/api/v1/system/capabilities")
    assert response.status_code == 401


def test_protected_post_requires_session():
    response = client.post(
        "/api/v1/plugins/run",
        json={"project_id": "00000000-0000-0000-0000-000000000001", "plugin_id": "unknown", "inputs": {}},
    )
    assert response.status_code == 401
