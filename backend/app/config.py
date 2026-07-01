from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
_MODEL_CONFIG: dict = {"extra": "ignore"}
if _ENV_FILE.is_file():
    _MODEL_CONFIG["env_file"] = str(_ENV_FILE)


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url.removeprefix("postgres://")
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(**_MODEL_CONFIG)

    database_url: str = "postgresql://skillsearchfit:skillsearchfit@localhost:5432/skillsearchfit"

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        if isinstance(value, str):
            return normalize_database_url(value)
        return value

    session_secret: str = "dev-session-secret-change-in-production-32b"
    session_max_age: int = 604800
    csrf_secret: str = "dev-csrf-secret-change-in-production-32b"
    cors_origins: str = "http://localhost:3000"
    environment: str = "development"
    rate_limit_login: int = 5
    rate_limit_admin_login: int = 5
    rate_limit_signup: int = 5
    rate_limit_contact: int = 5
    rate_limit_window_seconds: int = 900

    # Redis — temporary cache + distributed rate limiting
    redis_url: str = "redis://localhost:6379/0"
    redis_connect_timeout_seconds: int = 5
    redis_default_ttl_seconds: int = 3600

    # When false (default), pipeline bootstrap/page generation run in-process on the API.
    # Set true in production when the Arq worker service is deployed.
    pipeline_use_arq: bool = False

    admin_email: str = "admin@skillsearchfit.local"
    admin_password: str = "Admin123!"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_max_tokens: int = 16384
    change_suggestions_extraction_max_tokens: int = 16384
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_max_tokens: int = 16384
    openrouter_api_key: str = ""
    openrouter_model: str = "perplexity/sonar-pro"
    openrouter_fallback_model: str = "perplexity/sonar"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_http_referer: str = "https://clicktrends.com.au"
    openrouter_x_title: str = "ClickTrends AI Audit"
    ai_policy_routing_enabled: bool = True
    ai_quality_min_words: int = 120
    website_scan_timeout_seconds: int = 90
    website_analysis_cache_days: int = 7

    # WordPress
    wp_site_url: str = ""
    wp_username: str = ""
    wp_app_password: str = ""

    # Webflow
    webflow_api_token: str = ""
    webflow_site_id: str = ""

    # Wix
    wix_api_key: str = ""
    wix_site_id: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        if not self.is_production:
            for port in range(3000, 3010):
                origin = f"http://localhost:{port}"
                if origin not in origins:
                    origins.append(origin)
        return origins

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
