from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


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
    status: str
    steps: list[PipelineStepResult]
    combined_markdown: str
    workflow_steps: list[dict[str, Any]]


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
