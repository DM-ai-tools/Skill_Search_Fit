"""Contact form endpoint tests."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_contact_form_accepts_valid_submission():
    response = client.post(
        "/api/v1/contact",
        json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "message": "Hello, I would like a demo of SkillSearchFit.",
        },
    )
    assert response.status_code == 201
    assert response.json()["success"] is True


def test_contact_form_rejects_short_message():
    response = client.post(
        "/api/v1/contact",
        json={"name": "Jane", "email": "jane@example.com", "message": "Hi"},
    )
    assert response.status_code == 422
