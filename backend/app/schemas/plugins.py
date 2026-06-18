from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PluginListItem(BaseModel):
    id: UUID
    plugin_name: str
    description: str
    category: str
    icon: str
    schema_version: int
    status: str


class PluginDetail(PluginListItem):
    input_fields: list
    output_template: dict | None = None
    prompts: list = []
    created_at: datetime
    updated_at: datetime
