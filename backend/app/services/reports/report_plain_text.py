"""Strip markdown/formatting for client-facing report and article previews."""

from __future__ import annotations

import re


def plain_text(text: str) -> str:
    """Return readable prose without markdown symbols."""
    if not text:
        return ""
    s = str(text)
    s = re.sub(r"```[^\n]*\n.*?```", "", s, flags=re.S)
    s = re.sub(r"^#{1,6}\s+", "", s, flags=re.M)
    s = re.sub(r"\*\*\*([^*]+)\*\*\*", r"\1", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
    s = re.sub(r"\*([^*]+)\*", r"\1", s)
    s = re.sub(r"__([^_]+)__", r"\1", s)
    s = re.sub(r"_([^_]+)_", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"^>\s?", "", s, flags=re.M)
    s = re.sub(r"^(?:[-*_]){3,}\s*$", "", s, flags=re.M)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()
