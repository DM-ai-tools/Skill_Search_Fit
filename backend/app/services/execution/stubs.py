import json
from uuid import UUID

import asyncpg

from app.services.execution.prompt_loader import load_prompt, load_rendered_prompt


class PromptLoaderService:
    async def load_system(self, conn: asyncpg.Connection, plugin_id: UUID) -> str:
        return await load_prompt(conn, plugin_id, "system")

    async def load_user_message(
        self, conn: asyncpg.Connection, plugin_id: UUID, inputs: dict
    ) -> str:
        primary = await load_rendered_prompt(conn, plugin_id, "primary", inputs)
        if primary:
            return primary
        return (
            "Analyze the following inputs and produce a structured report.\n\n"
            f"```json\n{json.dumps(inputs, indent=2)}\n```"
        )


prompt_loader = PromptLoaderService()


class ResponseProcessor:
    def process(self, raw: dict, output_template: dict | None) -> dict:
        markdown = raw.get("markdown", "")
        structured = raw.get("structured", {})
        output = {"markdown": markdown, "structured": structured}
        if output_template:
            output["template"] = output_template
        return output


response_processor = ResponseProcessor()
