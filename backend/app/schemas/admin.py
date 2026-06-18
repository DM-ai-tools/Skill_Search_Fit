from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class AdminUserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = "user"


class AdminUserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    role: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminUserResponse(BaseModel):
    id: UUID
    name: str
    email: str
    role: str
    created_at: datetime
    deleted_at: datetime | None = None


class PluginCreate(BaseModel):
    plugin_name: str
    description: str = ""
    category: str = "general"
    icon: str = "puzzle"
    input_fields: list = []
    output_template: dict | None = None
    status: str = "enabled"


class PluginUpdate(BaseModel):
    plugin_name: str | None = None
    description: str | None = None
    category: str | None = None
    icon: str | None = None
    input_fields: list | None = None
    output_template: dict | None = None
    status: str | None = None


class PluginStatusUpdate(BaseModel):
    status: str


class PromptUpsert(BaseModel):
    prompt_type: str
    prompt_content: str = ""


class PromptsUpsertRequest(BaseModel):
    prompts: list[PromptUpsert]


class ActivityLogItem(BaseModel):
    id: UUID
    action: str
    metadata: dict
    timestamp: datetime
    user_name: str | None = None
    user_email: str | None = None


class TopPluginStat(BaseModel):
    plugin_id: UUID
    plugin_name: str
    execution_count: int


class AdminDashboardStats(BaseModel):
    total_active_users: int
    total_projects: int
    executions_last_7_days: int
    new_signups_last_7_days: int
    total_saved_outputs: int
    top_plugins_last_30_days: list[TopPluginStat]
