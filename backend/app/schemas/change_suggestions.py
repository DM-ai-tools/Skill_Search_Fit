from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── enums (as literals for pydantic) ──────────────────────────────────────────

ChangeType = Literal["metadata", "schema", "content", "technical", "capture-form"]
ChangePriority = Literal["High", "Medium", "Low"]
ChangeDestination = Literal["WordPress", "Webflow", "Wix"]
ApprovalStatus = Literal["pending", "approved", "rejected"]
SuggestionStatus = Literal["uploaded", "extracting", "ready", "failed"]


# ── create ────────────────────────────────────────────────────────────────────

class ChangeSuggestionCreateRequest(BaseModel):
    raw_content: str = Field(..., min_length=10)
    filename: str = Field(default="pasted-report", max_length=500)
    base_url: Optional[str] = Field(default=None, max_length=2000)
    plugin_slug: Optional[str] = Field(default=None, max_length=100)
    plugin_name: Optional[str] = Field(default=None, max_length=200)


class ChangeSuggestionResponse(BaseModel):
    id: UUID
    filename: str
    status: SuggestionStatus
    extract_error: Optional[str]
    created_at: datetime
    updated_at: datetime


# ── extracted change (Claude output shape + DB row) ───────────────────────────

class ChangeSchema(BaseModel):
    """Shape Claude must return for each change item."""
    id: str
    location: str = ""
    pageUrl: str
    changeType: ChangeType
    priority: ChangePriority
    impactScore: Optional[int] = Field(default=None, ge=1, le=100)
    destination: ChangeDestination
    fieldLabel: str
    currentState: str
    proposedContent: str
    sourceExcerpt: Optional[str] = None
    needsReview: bool = False
    reviewReason: Optional[str] = None


class ExtractedChangesEnvelope(BaseModel):
    """Wrapper Claude returns."""
    changes: list[ChangeSchema]


class ChangeResponse(BaseModel):
    id: UUID
    suggestion_id: UUID
    location: Optional[str] = None
    page_url: str
    change_type: ChangeType
    priority: ChangePriority
    impact_score: Optional[int]
    destination: ChangeDestination
    field_label: str
    current_state: str
    proposed_content: str
    edited_content: Optional[str]
    source_excerpt: Optional[str]
    needs_review: bool = False
    review_reason: Optional[str] = None
    approval_status: ApprovalStatus
    created_at: datetime
    updated_at: datetime

    @property
    def effective_content(self) -> str:
        return self.edited_content if self.edited_content is not None else self.proposed_content


class ChangeSuggestionWithChanges(BaseModel):
    suggestion: ChangeSuggestionResponse
    changes: list[ChangeResponse]


# ── approval patch ────────────────────────────────────────────────────────────

class ChangePatchRequest(BaseModel):
    approval_status: Optional[ApprovalStatus] = None
    edited_content: Optional[str] = None


# ── payload generation ────────────────────────────────────────────────────────

class PayloadRequest(BaseModel):
    destination: ChangeDestination


class PayloadResponse(BaseModel):
    destination: ChangeDestination
    content: str  # HTML payload string
    change_ids: list[UUID]


# ── publish ───────────────────────────────────────────────────────────────────

class PublishRequest(BaseModel):
    destination: ChangeDestination
    dry_run: bool = True


class PublishItemResult(BaseModel):
    change_id: str
    field_label: str
    page_url: str
    success: bool
    error: Optional[str] = None
    widget_id: Optional[str] = None
    widget_type: Optional[str] = None


class PublishResponse(BaseModel):
    destination: ChangeDestination
    dry_run: bool
    results: list[PublishItemResult]
    audit_log_id: Optional[UUID] = None
