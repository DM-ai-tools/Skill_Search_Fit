"""Parse structured Implementation Changes blocks from plugin report markdown."""

from __future__ import annotations

import re
import uuid
from typing import Any, Optional

def _field_block(text: str, label: str) -> Optional[str]:
    pattern = re.compile(
        rf"^\s*[-*]?\s*\*?\*?{label}:?\*?\*?\s*([\s\S]*?)"
        r"(?=^\s*[-*]\s*\*?\*?(?:Page URL|Change Type|Priority|Impact Score|Current State|Proposed Change|Destination):|\Z)",
        re.I | re.M,
    )
    match = pattern.search(text)
    if not match:
        return None
    return match.group(1).strip()


def _parse_title(line: str) -> tuple[str, str]:
    """### Home Page — Meta Description → (location, fieldLabel)"""
    cleaned = re.sub(r"^#+\s*", "", line).strip()
    if "—" in cleaned:
        left, right = cleaned.split("—", 1)
        return left.strip(), right.strip()
    if " - " in cleaned:
        left, right = cleaned.split(" - ", 1)
        return left.strip(), right.strip()
    return cleaned, cleaned


def parse_implementation_changes(raw_content: str) -> list[dict[str, Any]]:
    """
    Extract changes from ## Implementation Changes section when plugins follow
    the structured output format. Returns camelCase dicts ready for validation.
    """
    section_match = re.search(
        r"##\s*Implementation Changes\s*(.*?)(?=\n##\s+|\Z)",
        raw_content,
        re.DOTALL | re.IGNORECASE,
    )
    if not section_match:
        return []

    section = section_match.group(1)
    blocks = re.split(r"\n(?=###\s+)", section)
    changes: list[dict[str, Any]] = []

    for block in blocks:
        block = block.strip()
        if not block or not block.startswith("###"):
            continue

        lines = block.splitlines()
        title_line = lines[0]
        body = "\n".join(lines[1:])
        location, field_label = _parse_title(title_line)

        proposed = _field_block(body, "Proposed Change")
        if not proposed:
            continue

        impact_raw = _field_block(body, "Impact Score")
        change_type = (_field_block(body, "Change Type") or "content").lower()
        if change_type not in {"metadata", "schema", "content", "technical", "capture-form"}:
            change_type = "content"

        priority = _field_block(body, "Priority") or "Medium"
        if priority not in {"High", "Medium", "Low"}:
            priority = "Medium"

        destination = _field_block(body, "Destination") or "WordPress"
        if destination not in {"WordPress", "Webflow", "Wix"}:
            destination = "WordPress"

        changes.append({
            "id": str(uuid.uuid4()),
            "location": location,
            "pageUrl": _field_block(body, "Page URL") or "",
            "changeType": change_type,
            "priority": priority,
            "impactScore": int(impact_raw) if impact_raw and impact_raw.isdigit() else None,
            "destination": destination,
            "fieldLabel": field_label,
            "currentState": _field_block(body, "Current State") or "",
            "proposedContent": proposed,
            "sourceExcerpt": f"From Implementation Changes: {field_label}",
            "needsReview": False,
            "reviewReason": None,
        })

    return changes
