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


class PipelineStepResult(BaseModel):
    step: int
    plugin_id: UUID
    plugin_name: str
    label: str
    execution_id: UUID
    status: str
    output_markdown: str


class PipelineExecuteResponse(BaseModel):
    pipeline_id: str
    pipeline_name: str
    status: str
    steps: list[PipelineStepResult]
    combined_markdown: str
    workflow_steps: list[dict[str, Any]]
