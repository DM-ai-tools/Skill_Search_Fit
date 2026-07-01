"""Tests for production startup validation."""

from app.config import Settings
from app.startup_checks import validate_production_settings
import pytest


def test_validate_production_settings_allows_development_defaults():
    settings = Settings(environment="development")
    validate_production_settings(settings)


def test_validate_production_settings_rejects_insecure_secrets():
    settings = Settings(
        environment="production",
        session_secret="dev-session-secret-change-in-production-32b",
        csrf_secret="unique-csrf",
        admin_password="secure-password-xyz",
    )
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        validate_production_settings(settings)


def test_validate_production_settings_rejects_missing_redis():
    settings = Settings(
        environment="production",
        session_secret="unique-session-secret-value-here",
        csrf_secret="unique-csrf-secret-value-here",
        admin_password="secure-password-xyz",
        redis_url="",
    )
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        validate_production_settings(settings)


def test_validate_production_settings_rejects_default_admin_password():
    settings = Settings(
        environment="production",
        session_secret="unique-session-secret-value-here",
        csrf_secret="unique-csrf-secret-value-here",
        admin_password="Admin123!",
        redis_url="redis://localhost:6379/0",
    )
    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        validate_production_settings(settings)
