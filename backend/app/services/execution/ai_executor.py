import asyncio
import json
import re

from app.config import settings


def _inputs_to_markdown(inputs: dict) -> str:
    lines = ["### Inputs received", ""]
    for key, value in inputs.items():
        label = key.replace("_", " ").strip().title()
        if value is None or value == "":
            continue
        if isinstance(value, str) and "\n" in value:
            lines.append(f"**{label}**")
            for part in value.splitlines():
                part = part.strip()
                if part:
                    lines.append(f"- {part}")
            lines.append("")
        elif isinstance(value, (list, tuple)):
            lines.append(f"**{label}**")
            for item in value:
                if item:
                    lines.append(f"- {item}")
            lines.append("")
        else:
            lines.append(f"**{label}:** {value}")
    return "\n".join(lines).strip()


def _quality_summary(markdown: str) -> dict:
    words = len(re.findall(r"\b\w+\b", markdown or ""))
    has_h1_or_h2 = bool(re.search(r"^##?\s+", markdown or "", flags=re.MULTILINE))
    return {
        "word_count": words,
        "has_heading": has_h1_or_h2,
        "passes_min_words": words >= settings.ai_quality_min_words,
        "quality_gate_passed": words >= settings.ai_quality_min_words and has_h1_or_h2,
    }


def _task_profile(plugin_name: str) -> str:
    name = (plugin_name or "").lower()
    if any(k in name for k in ("schema", "technical", "audit", "crawler")):
        return "precision"
    if any(k in name for k in ("content", "brief", "blog", "title", "meta")):
        return "creative"
    return "general"


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
            f"*Preview mode — add `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` to `.env` for live AI analysis*\n\n"
            f"This plugin received your inputs. Once an AI provider is configured, "
            f"it will run the full **system** and **primary** prompts from the plugin definition.\n\n"
            f"{_inputs_to_markdown(inputs)}"
        )
        return {
            "markdown": markdown,
            "structured": {
                "preview": True,
                "ai_mode": "preview",
                "plugin": plugin_name,
                "task_profile": _task_profile(plugin_name),
                "quality": _quality_summary(markdown),
                "explainability": {
                    "routing_reason": "No live provider configured",
                    "provider_policy": "preview_fallback",
                },
            },
        }


class OpenAIExecutor:
    async def execute(
        self,
        system_prompt: str,
        user_prompt: str,
        inputs: dict,
        plugin_name: str,
        *,
        max_tokens: int | None = None,
    ) -> dict:
        from app.services.llm.openai_client import openai_chat_text

        if not system_prompt.strip():
            system_prompt = "You are a helpful SEO assistant powered by SearchFit.ai."

        markdown, usage = await openai_chat_text(
            system=system_prompt,
            user=user_prompt,
            max_tokens=max_tokens,
        )
        return {
            "markdown": markdown,
            "structured": {
                "preview": False,
                "ai_mode": "openai",
                "model": settings.openai_model,
                "plugin": plugin_name,
                "usage": usage,
                "task_profile": _task_profile(plugin_name),
                "quality": _quality_summary(markdown),
                "explainability": {
                    "routing_reason": "OpenAI selected by policy fallback chain",
                    "provider_policy": "openai",
                },
            },
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
                        "task_profile": _task_profile(plugin_name),
                        "quality": _quality_summary(markdown),
                        "explainability": {
                            "routing_reason": "Claude selected by primary policy for advanced SEO tasks",
                            "provider_policy": "claude",
                        },
                    },
                }
            except Exception as exc:
                last_error = exc
                continue

        # Try OpenAI before preview stub when Claude is unavailable or errors.
        if settings.openai_api_key and settings.openai_api_key.strip():
            try:
                return await OpenAIExecutor().execute(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    inputs=inputs,
                    plugin_name=plugin_name,
                    max_tokens=max_tokens,
                )
            except Exception as openai_exc:
                last_error = openai_exc

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
    if settings.ai_policy_routing_enabled and settings.openai_api_key and settings.openai_api_key.strip() and not (settings.anthropic_api_key and settings.anthropic_api_key.strip()):
        return OpenAIExecutor()
    if settings.anthropic_api_key and settings.anthropic_api_key.strip():
        return ClaudeAIExecutor()
    if settings.openai_api_key and settings.openai_api_key.strip():
        return OpenAIExecutor()
    return StubAIExecutor()
