"""Parse JSON from LLM responses with light recovery for common formatting issues."""

from __future__ import annotations

import json
import re
from typing import Any


def strip_json_fences(text: str) -> str:
    text = text.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def parse_json_object(text: str) -> dict[str, Any]:
    """
    Parse a JSON object from model output.
    Tries strict parse first, then common recovery (fences, brace slice, trailing commas).
    """
    cleaned = strip_json_fences(text)
    errors: list[str] = []

    for candidate in _candidates(cleaned):
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            errors.append(str(exc))
            continue
        if isinstance(parsed, dict):
            return parsed
        errors.append("Top-level JSON value is not an object")

    preview = cleaned[:400]
    detail = errors[0] if errors else "unknown parse error"
    raise ValueError(f"Model returned non-JSON output: {detail}\n\nRaw:\n{preview}")


def _candidates(text: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        value = value.strip()
        if value and value not in seen:
            seen.add(value)
            out.append(value)

    add(text)
    if text.startswith("{") and not text.endswith("}"):
        add(text + "}")

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        add(text[start : end + 1])
        add(re.sub(r",\s*([}\]])", r"\1", text[start : end + 1]))

    return out
