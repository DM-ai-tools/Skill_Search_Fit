"""OpenAI chat completions for optional fallback tasks."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


def openai_configured() -> bool:
    return bool(settings.openai_api_key and settings.openai_api_key.strip())


async def openai_chat_text(
    *,
    system: str,
    user: str,
    max_tokens: int | None = None,
) -> tuple[str, dict[str, int]]:
    if not openai_configured():
        raise RuntimeError("OPENAI_API_KEY not configured")

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=max_tokens or settings.openai_max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    choice = response.choices[0].message.content or ""
    usage = response.usage
    usage_dict = {
        "input_tokens": usage.prompt_tokens if usage else 0,
        "output_tokens": usage.completion_tokens if usage else 0,
    }
    return choice.strip(), usage_dict


async def openai_chat_json(
    *,
    system: str,
    user: str,
    max_tokens: int | None = None,
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    """JSON-mode chat; used as OpenRouter fallback for website analysis tasks."""
    if not openai_configured():
        raise RuntimeError("OPENAI_API_KEY not configured")

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=timeout_seconds)
    response = await client.chat.completions.create(
        model=settings.openai_model,
        max_tokens=max_tokens or settings.openai_max_tokens,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    raw = (response.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)
