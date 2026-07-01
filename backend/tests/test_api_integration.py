"""Lightweight API integration tests (no database required)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_system_capabilities_requires_auth():
    response = client.get("/api/v1/system/capabilities")
    assert response.status_code == 401


def test_projects_list_requires_auth():
    response = client.get("/api/v1/projects")
    assert response.status_code == 401


def test_plugins_list_requires_auth():
    response = client.get("/api/v1/plugins")
    assert response.status_code == 401


def test_system_jobs_requires_auth():
    response = client.get("/api/v1/system/jobs")
    assert response.status_code == 401


def test_seo_trends_requires_auth():
    response = client.get("/api/v1/seo-intelligence/projects/00000000-0000-0000-0000-000000000001/trends")
    assert response.status_code == 401


def test_legacy_pipeline_execute_returns_410_when_authenticated():
    """Legacy routes are removed; unauthenticated calls get 401 first."""
    response = client.post(
        "/api/v1/pipelines/content-production-pipeline/execute",
        json={"project_id": "00000000-0000-0000-0000-000000000001", "inputs": {}},
    )
    assert response.status_code == 401
