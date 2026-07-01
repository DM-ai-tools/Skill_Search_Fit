from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PipelineStep(BaseModel):
    plugin_name: str
    label: str


class PipelineListItem(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    impact: int
    steps: list[PipelineStep]
    step_count: int


class PipelineExecuteRequest(BaseModel):
    project_id: UUID
    inputs: dict[str, Any] = Field(default_factory=dict)


class PipelineStepExecuteRequest(BaseModel):
    project_id: UUID
    inputs: dict[str, Any] = Field(default_factory=dict)
    step_index: int = Field(ge=1, description="1-based step index in the pipeline")
    prior_markdown: list[str] = Field(default_factory=list)


class PipelineStepResult(BaseModel):
    step: int
    plugin_id: UUID
    plugin_name: str
    label: str
    execution_id: UUID
    status: str
    output_markdown: str
    output: dict[str, Any] = Field(default_factory=dict)
    schema_version: int = 1


class PipelineExecuteResponse(BaseModel):
    pipeline_id: str
    pipeline_name: str
    pipeline_run_id: str | None = None
    status: str
    steps: list[PipelineStepResult]
    combined_markdown: str
    workflow_steps: list[dict[str, Any]]


class PipelineRunResponse(BaseModel):
    id: str
    pipeline_id: str
    project_id: str
    status: str
    current_skill_index: int
    base_inputs: dict[str, Any] = Field(default_factory=dict)
    competitor_data: dict[str, Any] = Field(default_factory=dict)
    competitor_failed: bool = False
    prior_markdown: list[str] = Field(default_factory=list)
    step_results: list[dict[str, Any]] = Field(default_factory=list)
    pending_inputs: dict[str, Any] | None = None
    edited_inputs_count: int = 0
    expires_at: str | None = None
    error_message: str | None = None
    suggestion_audit_log: list[dict[str, Any]] = Field(default_factory=list)


class PipelineInputFieldDef(BaseModel):
    key: str
    label: str
    description: str | None = None
    type: str
    edit_note: str | None = Field(default=None, alias="editNote")
    editable: bool | None = True
    required: bool = False
    value: Any = None

    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)


class PipelineChangeSuggestion(BaseModel):
    id: str
    field_key: str
    field_label: str
    field_type: str = "string"
    current_content: Any = None
    proposed_content: Any = None
    edited_content: Any | None = None
    approval_status: Literal["pending", "approved", "rejected"] = "pending"


class PipelineSuggestionUpdate(BaseModel):
    id: str
    approval_status: Literal["pending", "approved", "rejected"] | None = None
    edited_content: Any | None = None


class PipelinePendingInputsResponse(BaseModel):
    step_index: int
    plugin_name: str
    skill_name: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    field_definitions: list[PipelineInputFieldDef] = Field(default_factory=list)
    change_suggestions: list[PipelineChangeSuggestion] = Field(default_factory=list)
    is_final_review: bool = False


class PipelinePendingSuggestionsPatch(BaseModel):
    suggestions: list[PipelineSuggestionUpdate]


class PipelineContinueRequest(BaseModel):
    edited_inputs: dict[str, Any] = Field(default_factory=dict)
    suggestion_updates: list[PipelineSuggestionUpdate] | None = None
    approve_all_pending: bool = False


class PipelinePageGenerationResponse(BaseModel):
    id: str
    pipeline_run_id: str
    status: str
    regeneration_count: int = 0
    html: str | None = None
    page_title: str | None = None
    meta_description: str | None = None
    slug: str | None = None
    full_url: str | None = None
    approved: bool = False
    deployed: bool = False
    wordpress_draft_url: str | None = None
    error_message: str | None = None
    h1: str = ""
    verification: dict[str, Any] = Field(default_factory=dict)
    redis_key: str = ""


class PipelinePageRegenerateRequest(BaseModel):
    feedback: str = Field(default="", max_length=4000)


class PipelinePageGenerateRequest(BaseModel):
    force: bool = False


class UnifiedPipelineSection(BaseModel):
    id: str
    title: str
    source_step_labels: list[str] = Field(default_factory=list)
    source_step_numbers: list[int] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
    combined_markdown: str = ""
    expandable: bool = False


class UnifiedHeadlineSummary(BaseModel):
    outcome: str = ""
    key_metrics: dict[str, Any] = Field(default_factory=dict)


class UnifiedFinalDeliverable(BaseModel):
    title_tag: str = ""
    meta_description: str = ""
    h1: str = ""
    article_body: str = ""


class UnifiedPipelineReport(BaseModel):
    pipeline_id: str
    pipeline_name: str
    pipeline_purpose: str = ""
    domain: str = ""
    headline_summary: UnifiedHeadlineSummary = Field(default_factory=UnifiedHeadlineSummary)
    narrative: str = ""
    sections: list[UnifiedPipelineSection] = Field(default_factory=list)
    final_deliverable: UnifiedFinalDeliverable | None = None


class PublishReadyPageResponse(BaseModel):
    """Loosely typed response for the assembled page — all blocks are dicts
    because the assembler returns deeply nested structures that vary by pipeline."""

    pipeline_run_id: str = ""
    assembled_at: str = ""
    domain: str = ""
    slug: str = ""
    full_url: str = ""
    validation: dict[str, Any] = Field(default_factory=dict)
    blocks: dict[str, Any] = Field(default_factory=dict)
    downloads: dict[str, Any] = Field(default_factory=dict)
