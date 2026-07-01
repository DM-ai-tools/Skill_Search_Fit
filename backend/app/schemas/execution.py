from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ExecuteRequest(BaseModel):
    project_id: UUID
    inputs: dict
    schema_version: int


class WorkflowStep(BaseModel):
    step: int
    label: str
    status: str


class ExecuteResponse(BaseModel):
    execution_id: UUID
    status: str
    output: dict
    workflow_steps: list[WorkflowStep]


class SaveOutputRequest(BaseModel):
    project_id: UUID
    plugin_id: UUID
    execution_id: UUID | None = None
    input_snapshot: dict
    schema_version: int
    generated_output: dict
    pipeline_id: str | None = None
    report_title: str | None = None


class ExecutionRecord(BaseModel):
    id: UUID
    plugin_id: UUID
    project_id: UUID | None
    user_id: UUID
    inputs: dict
    schema_version: int
    status: str
    result: dict | None
    error_message: str | None
    started_at: datetime
    completed_at: datetime | None


class WorkspaceNotesRequest(BaseModel):
    project_id: UUID
    plugin_id: UUID
    notes: str
