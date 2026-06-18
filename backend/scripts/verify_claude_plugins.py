"""Verify Claude integration for all enabled plugins using DB prompts."""
import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import UUID

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.services.execution.ai_executor import get_ai_executor
from app.services.execution.prompt_loader import load_prompt, load_rendered_prompt


def build_sample_inputs(fields: list[dict]) -> dict:
    inputs: dict = {}
    for field in fields:
        name = field["name"]
        ftype = field.get("type", "text")
        if ftype == "select" and field.get("options"):
            inputs[name] = field["options"][0]["value"]
        elif ftype == "number":
            inputs[name] = int(field.get("placeholder") or 10)
        elif ftype == "checkbox":
            inputs[name] = False
        elif ftype == "url":
            inputs[name] = "https://example.com"
        elif field.get("required"):
            inputs[name] = field.get("placeholder") or f"Sample {field.get('label', name)}"
    return inputs


async def verify_plugin(conn: asyncpg.Connection, plugin_id: UUID, plugin_name: str, category: str, fields: list) -> dict:
    inputs = build_sample_inputs(fields)
    system_prompt = await load_prompt(conn, plugin_id, "system")
    user_prompt = await load_rendered_prompt(conn, plugin_id, "primary", inputs)

    if not system_prompt:
        return {"plugin": plugin_name, "ok": False, "error": "Missing system prompt in DB"}
    if not user_prompt:
        return {"plugin": plugin_name, "ok": False, "error": "Missing primary prompt in DB"}

    max_tokens = max(settings.anthropic_max_tokens, 8192) if category == "content" else settings.anthropic_max_tokens
    executor = get_ai_executor()
    result = await executor.execute(system_prompt, user_prompt, inputs, plugin_name, max_tokens=max_tokens)

    markdown = result.get("markdown", "")
    structured = result.get("structured", {})
    return {
        "plugin": plugin_name,
        "ok": bool(markdown.strip()),
        "ai_mode": structured.get("ai_mode", "unknown"),
        "chars": len(markdown),
        "usage": structured.get("usage"),
        "preview": structured.get("preview", False),
    }


async def main(plugin_filter: str | None, execute: bool) -> None:
    if not execute:
        pass  # prompt-only mode — no API key required
    elif not settings.anthropic_api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set in backend/.env (save the file — key must be on the same line)")
        sys.exit(1)

    if execute:
        print(f"Model: {settings.anthropic_model}")
        print(f"Executor: {type(get_ai_executor()).__name__}\n")

    conn = await asyncpg.connect(settings.database_url)
    try:
        rows = await conn.fetch(
            """
            SELECT id, plugin_name, category, input_fields
            FROM plugins
            WHERE status = 'enabled'
            ORDER BY category, plugin_name
            """
        )

        if plugin_filter:
            rows = [r for r in rows if plugin_filter.lower() in r["plugin_name"].lower()]
            if not rows:
                print(f"No enabled plugin matching: {plugin_filter}")
                sys.exit(1)

        for row in rows:
            fields = json.loads(row["input_fields"]) if isinstance(row["input_fields"], str) else row["input_fields"]

            if not execute:
                system_prompt = await load_prompt(conn, row["id"], "system")
                user_prompt_template = await load_prompt(conn, row["id"], "primary")
                print(
                    f"[prompts] {row['plugin_name']}: "
                    f"system={len(system_prompt)} chars, primary={len(user_prompt_template)} chars"
                )
                continue

            print(f"Running {row['plugin_name']}...", flush=True)
            try:
                outcome = await verify_plugin(conn, row["id"], row["plugin_name"], row["category"], fields)
                usage = outcome.get("usage")
                usage_str = ""
                if usage:
                    usage_str = f" tokens in={usage['input_tokens']} out={usage['output_tokens']}"
                status = "OK" if outcome["ok"] else "FAIL"
                print(f"  [{status}] {outcome['ai_mode']} | {outcome['chars']} chars{usage_str}")
                if not outcome["ok"]:
                    print(f"  Error: {outcome.get('error', 'empty response')}")
            except Exception as e:
                print(f"  [FAIL] {e}")

    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify Claude plugin execution")
    parser.add_argument("--execute", action="store_true", help="Call Claude for each plugin (uses API credits)")
    parser.add_argument("--plugin", help="Filter by plugin name substring")
    args = parser.parse_args()
    asyncio.run(main(args.plugin, args.execute))
