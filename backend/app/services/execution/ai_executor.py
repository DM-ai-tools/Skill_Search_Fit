import asyncio
import json

from app.config import settings


class StubAIExecutor:
    async def execute(
        self,
        system_prompt: str,
        user_prompt: str,
        inputs: dict,
        plugin_name: str,
        *,
        max_tokens: int | None = None,
    ) -> dict:
        await asyncio.sleep(1.5)
        markdown = (
            f"## {plugin_name}\n\n"
            f"*Preview mode — add `ANTHROPIC_API_KEY` to `.env` for live Claude analysis*\n\n"
            f"This plugin received your inputs. Once Claude is configured, "
            f"it will run the full **system** and **primary** prompts from the plugin definition.\n\n"
            f"### Inputs received\n```json\n{json.dumps(inputs, indent=2)}\n```"
        )
        return {
            "markdown": markdown,
            "structured": {"preview": True, "ai_mode": "preview", "plugin": plugin_name},
        }


class ClaudeAIExecutor:
    async def execute(
        self,
        system_prompt: str,
        user_prompt: str,
        inputs: dict,
        plugin_name: str,
        *,
        max_tokens: int | None = None,
    ) -> dict:
        from anthropic import AsyncAnthropic

        if not system_prompt.strip():
            system_prompt = "You are a helpful SEO assistant powered by SearchFit.ai."

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        token_limit = max_tokens or settings.anthropic_max_tokens
        configured = (settings.anthropic_model or "").strip()
        primary = configured if configured.startswith("claude-sonnet-") else "claude-sonnet-4-6"
        candidates = []
        for m in [primary, "claude-sonnet-4-6", "claude-sonnet-4-5-20250929"]:
            if m and m not in candidates:
                candidates.append(m)

        last_error: Exception | None = None
        for model in candidates:
            try:
                message = await client.messages.create(
                    model=model,
                    max_tokens=token_limit,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                )

                text_blocks = [block.text for block in message.content if block.type == "text"]
                markdown = "\n".join(text_blocks)
                return {
                    "markdown": markdown,
                    "structured": {
                        "preview": False,
                        "ai_mode": "claude",
                        "model": model,
                        "plugin": plugin_name,
                        "usage": {
                            "input_tokens": message.usage.input_tokens,
                            "output_tokens": message.usage.output_tokens,
                        },
                    },
                }
            except Exception as exc:
                last_error = exc
                continue

        # Keep execution flow alive, but do not switch providers.
        preview = await StubAIExecutor().execute(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            inputs=inputs,
            plugin_name=plugin_name,
            max_tokens=max_tokens,
        )
        preview["structured"] = {
            **preview.get("structured", {}),
            "ai_mode": "preview_fallback",
            "claude_error": str(last_error) if last_error else "Unknown Claude error",
            "claude_model": primary,
            "models_tried": candidates,
        }
        return preview


def get_ai_executor():
    if settings.anthropic_api_key and settings.anthropic_api_key.strip():
        return ClaudeAIExecutor()
    return StubAIExecutor()
