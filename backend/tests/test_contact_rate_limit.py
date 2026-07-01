"""Contact form rate limiting tests."""

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_PAYLOAD = {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "message": "Hello, I would like a demo of SkillSearchFit.",
}


@patch("app.middleware.rate_limit.rate_limit_check", new_callable=AsyncMock)
def test_contact_form_rate_limited(mock_rate_limit):
    mock_rate_limit.return_value = 120
    response = client.post("/api/v1/contact", json=_PAYLOAD)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"


@patch("app.middleware.rate_limit.rate_limit_check", new_callable=AsyncMock)
def test_contact_form_allowed_when_not_rate_limited(mock_rate_limit):
    mock_rate_limit.return_value = None
    response = client.post("/api/v1/contact", json=_PAYLOAD)
    assert response.status_code == 201
