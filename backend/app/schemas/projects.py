from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    project_name: str = Field(min_length=1, max_length=255)


class ProjectUpdate(BaseModel):
    project_name: str = Field(min_length=1, max_length=255)


class ProjectResponse(BaseModel):
    id: UUID
    project_name: str
    created_at: datetime
    updated_at: datetime
    output_count: int = 0


class WorkspaceSessionResponse(BaseModel):
    id: UUID
    plugin_id: UUID
    plugin_name: str | None = None
    inputs: dict
    schema_version: int
    notes: str
    updated_at: datetime


class OutputResponse(BaseModel):
    id: UUID
    project_id: UUID
    plugin_id: UUID
    plugin_name: str | None = None
    execution_id: UUID | None
    input_snapshot: dict
    schema_version: int
    generated_output: dict
    created_at: datetime
