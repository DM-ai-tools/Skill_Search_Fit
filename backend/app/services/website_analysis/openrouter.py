"""OpenRouter API client (Perplexity Sonar Pro)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 2


def _parse_json_content(content: str) -> Any:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Recovery path: extract the largest JSON object and remove trailing commas.
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = text[start : end + 1]
            candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
            return json.loads(candidate)
        raise


async def _openrouter_request(
    *,
    system: str,
    user: str,
    json_mode: bool,
    timeout_seconds: int,
    model: str | None = None,
) -> str:
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_http_referer,
        "X-Title": settings.openrouter_x_title,
    }
    active_model = (model or settings.openrouter_model).strip()
    body: dict[str, Any] = {
        "model": active_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
    }
    requested_json_mode = json_mode
    if requested_json_mode:
        body["response_format"] = {"type": "json_object"}

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(
                    f"{settings.openrouter_base_url}/chat/completions",
                    headers=headers,
                    json=body,
                )
                if response.status_code == 400 and requested_json_mode and "response_format" in body:
                    # Some providers/models reject strict json_object mode; retry once without it.
                    logger.warning("OpenRouter rejected json_object mode; retrying without response_format")
                    body.pop("response_format", None)
                    continue
                if response.status_code in (402, 429):
                    fallback = settings.openrouter_fallback_model.strip()
                    if active_model != fallback and fallback:
                        active_model = fallback
                        body["model"] = active_model
                        logger.warning(
                            "OpenRouter quota/rate limit on %s; retrying with fallback %s",
                            (model or settings.openrouter_model),
                            fallback,
                        )
                        continue
                    logger.warning("OpenRouter rate limited, attempt %s", attempt + 1)
                    last_error = RuntimeError("Rate limited")
                    continue
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except Exception as exc:
            last_error = exc
            logger.warning("OpenRouter request failed (attempt %s): %s", attempt + 1, exc)

    raise RuntimeError(f"OpenRouter failed: {last_error}")


async def openrouter_chat(
    *,
    system: str,
    user: str,
    json_mode: bool = True,
    timeout_seconds: int = 30,
    model: str | None = None,
) -> dict[str, Any]:
    try:
        content = await _openrouter_request(
            system=system,
            user=user,
            json_mode=json_mode,
            timeout_seconds=timeout_seconds,
            model=model,
        )
    except Exception as exc:
        from app.services.llm.openai_client import openai_chat_json, openai_chat_text, openai_configured

        if not openai_configured():
            raise
        logger.warning("OpenRouter unavailable (%s); falling back to OpenAI", exc)
        if json_mode:
            return await openai_chat_json(
                system=system,
                user=user,
                timeout_seconds=timeout_seconds,
            )
        text, _ = await openai_chat_text(system=system, user=user)
        return {"text": text}

    if json_mode:
        parsed = _parse_json_content(content)
        if not isinstance(parsed, dict):
            raise RuntimeError("Expected JSON object response")
        return parsed
    return {"text": content}


async def openrouter_chat_array(
    *,
    system: str,
    user: str,
    timeout_seconds: int = 20,
    model: str | None = None,
) -> list[Any]:
    """Request JSON array output (competitor discovery). Uses raw mode — no json_object constraint."""
    try:
        content = await _openrouter_request(
            system=system,
            user=user,
            json_mode=False,
            timeout_seconds=timeout_seconds,
            model=model,
        )
    except Exception as exc:
        from app.services.llm.openai_client import openai_chat_text, openai_configured

        if not openai_configured():
            raise
        logger.warning("OpenRouter unavailable (%s); falling back to OpenAI for array response", exc)
        text, _ = await openai_chat_text(
            system=f"{system}\n\nRespond with a JSON array only.",
            user=user,
        )
        content = text

    parsed = _parse_json_content(content)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("competitors", "results", "data"):
            if isinstance(parsed.get(key), list):
                return parsed[key]
    raise RuntimeError("Expected JSON array response from competitor discovery")
