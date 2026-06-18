from typing import Any

from pydantic import BaseModel, Field


class ScanWebsiteRequest(BaseModel):
    url: str = Field(min_length=3, max_length=2048)
    force: bool = False


class WebsiteAnalysisResponse(BaseModel):
    id: str
    url: str
    scan_status: str
    prefill_status: str | None = None
    cached: bool = False
    error_message: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    expires_at: str | None = None
    analysis: dict[str, Any] | None = None
    competitors: list[dict[str, Any]] = Field(default_factory=list)
    competitor_discovery_status: str | None = None
    crawl: dict[str, Any] | None = None
    analyzed_at: str | None = None


class AutofillRequest(BaseModel):
    url: str = Field(min_length=3, max_length=2048)


class FieldConfidence(BaseModel):
    value: Any
    confidence: float
    suggestions: list[str] = Field(default_factory=list)


class AutofillResponse(BaseModel):
    recommended_values: dict[str, Any]
    confidence_scores: dict[str, float]
    reasoning: dict[str, str] = Field(default_factory=dict)
    fields: dict[str, FieldConfidence] = Field(default_factory=dict)


class SuggestionsResponse(BaseModel):
    field: str
    suggestions: list[str]
