"""Fail-fast validation for insecure production configuration."""

from __future__ import annotations

from app.config import Settings

_INSECURE_SECRETS = frozenset(
    {
        "dev-session-secret-change-in-production-32b",
        "dev-csrf-secret-change-in-production-32b",
        "change-me-to-a-random-32-byte-string",
        "change-me-to-another-random-string",
    }
)

_INSECURE_ADMIN_PASSWORDS = frozenset({"Admin123!"})


def validate_production_settings(settings: Settings) -> None:
    """Raise RuntimeError when production uses documented dev defaults."""
    if not settings.is_production:
        return

    errors: list[str] = []

    if settings.session_secret.strip() in _INSECURE_SECRETS:
        errors.append("SESSION_SECRET must be set to a unique random value in production")
    if settings.csrf_secret.strip() in _INSECURE_SECRETS:
        errors.append("CSRF_SECRET must be set to a unique random value in production")
    if settings.admin_password in _INSECURE_ADMIN_PASSWORDS:
        errors.append("ADMIN_PASSWORD must be changed from the default in production")
    if not settings.redis_url.strip():
        errors.append("REDIS_URL must be set in production for cache and rate limiting")

    if errors:
        raise RuntimeError(
            "Insecure production configuration:\n- " + "\n- ".join(errors)
        )
