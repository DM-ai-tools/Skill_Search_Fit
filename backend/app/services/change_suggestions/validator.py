"""Validate and auto-correct extracted change suggestions before persistence."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Optional

from app.services.change_suggestions.plugin_specs import get_change_count_bounds
from app.services.change_suggestions.wp_publish_core import validate_schema_content
from app.services.change_suggestions.live_page_content import (
    snapshot_lookup,
    verify_current_state_against_snapshot,
)

VALID_CHANGE_TYPES = frozenset({"metadata", "schema", "content", "technical", "capture-form"})
VALID_PRIORITIES = frozenset({"High", "Medium", "Low"})

INSTRUCTION_PREFIXES = (
    "add ",
    "update ",
    "change ",
    "consider ",
    "improve ",
    "ensure ",
    "make sure ",
    "you should ",
    "try to ",
    "recommend ",
    "create ",
    "write ",
    "include ",
    "implement ",
    "optimize ",
    "rewrite ",
    "fix ",
    "use ",
)

EMPTY_CURRENT_MARKERS = frozenset({
    "",
    "unknown",
    "(unknown)",
    "n/a",
    "na",
    "not available",
    "not provided",
})

LOCATION_SLUGS: dict[str, str] = {
    "home": "",
    "home page": "",
    "homepage": "",
    "about": "about",
    "about us": "about",
    "services": "services",
    "contact": "contact",
    "contact us": "contact",
    "blog": "blog",
    "pricing": "pricing",
}


@dataclass
class ValidationSummary:
    flagged_needs_review: int = 0
    removed_duplicates: int = 0
    downgraded_priority: int = 0
    fixed_urls: int = 0
    inferred_change_types: int = 0
    rejected_invalid_schema: int = 0
    warnings: list[str] = field(default_factory=list)


logger = logging.getLogger(__name__)


def _normalize_text(value: Optional[str]) -> str:
    return (value or "").strip()


def looks_like_instruction(text: str) -> bool:
    lowered = text.strip().lower()
    if len(lowered) < 10:
        return True
    if any(lowered.startswith(prefix) for prefix in INSTRUCTION_PREFIXES):
        return True
    if re.search(r"\b(should|must|need to|needs to)\b", lowered[:80]):
        return True
    if "[" in text or "]" in text:
        return True
    if re.search(r"\byour\s+\w+\b", lowered) and not re.search(r"\b(your\s+\w+\s+){0,2}[\w.-]+\.(com|au|io|net|org)\b", lowered):
        return True
    return False


def _is_empty_current(value: Optional[str]) -> bool:
    normalized = _normalize_text(value).lower()
    return normalized in EMPTY_CURRENT_MARKERS


def _infer_change_type(change: dict[str, Any]) -> str:
    label = f"{change.get('fieldLabel', '')} {change.get('changeType', '')} {change.get('proposedContent', '')}".lower()
    if any(k in label for k in ("json-ld", "json ld", "schema", "structured data", "@type")):
        return "schema"
    if any(k in label for k in ("meta description", "title tag", "og:", "open graph", "twitter card")):
        return "metadata"
    if any(k in label for k in ("alt text", "alt=", "aria-", "canonical", "hreflang", "loading=")):
        return "technical"
    if any(k in label for k in ("form", "newsletter", "subscribe", "cta button", "capture")):
        return "capture-form"
    return "content"


def _slug_from_location(location: str) -> str:
    key = location.strip().lower()
    if key in LOCATION_SLUGS:
        return LOCATION_SLUGS[key]
    if key.endswith(" page"):
        key = key[:-5].strip()
        if key in LOCATION_SLUGS:
            return LOCATION_SLUGS[key]
    return re.sub(r"[^a-z0-9]+", "-", key).strip("-")


def _normalize_base_url(base_url: Optional[str]) -> Optional[str]:
    if not base_url:
        return None
    trimmed = base_url.strip().rstrip("/")
    if not trimmed:
        return None
    if not trimmed.startswith(("http://", "https://")):
        trimmed = f"https://{trimmed}"
    return trimmed


_SITE_URL_LABEL_RE = re.compile(
    r"(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?"
    r"(?:Site URL|Website URL|Your Site|Website|Site)"
    r"(?:\*\*)?:\s*"
    r"(https?://[^\s)>\"']+|[a-z0-9][\w.-]*\.[a-z]{2,}(?:/[^\s)>\"']*)?)",
    re.I,
)


def _base_url_from_url(url: str) -> Optional[str]:
    """Normalize a site URL, preserving subdirectory path prefixes."""
    return _normalize_base_url(url.rstrip(".,;)]"))


def _infer_base_url_from_content(raw_content: str) -> Optional[str]:
    label_match = _SITE_URL_LABEL_RE.search(raw_content)
    if label_match:
        base = _base_url_from_url(label_match.group(1))
        if base:
            return base

    match = re.search(r"https?://[^\s)>\"']+", raw_content)
    if not match:
        return None
    return _base_url_from_url(match.group(0))


def _looks_like_domain(value: str) -> bool:
    lowered = value.lower()
    return "." in lowered and " " not in lowered and not lowered.startswith("/")


def _construct_page_url(base_url: Optional[str], location: str, page_url: str) -> str:
    current = _normalize_text(page_url)
    if current.startswith(("http://", "https://")):
        return current

    base = _normalize_base_url(base_url)

    if current:
        if current.startswith("/"):
            if base:
                path = current.lstrip("/")
                return f"{base}/{path}" if path else f"{base}/"
            return current
        if base:
            path = current.strip("/")
            return f"{base}/{path}" if path else f"{base}/"
        if _looks_like_domain(current):
            normalized = _normalize_base_url(current)
            return normalized or current
        return current

    if not base:
        return location or ""

    slug = _slug_from_location(location) if location else ""
    if not slug:
        return f"{base}/"
    return f"{base}/{slug}"


def _string_similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def infer_base_url(base_url: Optional[str], raw_content: str = "") -> Optional[str]:
    """Resolve site base URL (includes subdirectory path) from input or report markdown."""
    return _normalize_base_url(base_url) or _infer_base_url_from_content(raw_content)


def validate_and_correct_changes(
    changes: list[dict[str, Any]],
    audit_context: Optional[dict[str, Any]] = None,
) -> tuple[list[dict[str, Any]], ValidationSummary]:
    """
    Validate and auto-correct a list of extracted change dicts (camelCase keys).
    Returns corrected changes and a summary of corrections for logging.
    """
    audit_context = audit_context or {}
    raw_content = str(audit_context.get("raw_content") or "")
    plugin_slug = audit_context.get("plugin_slug")
    _min_count, max_count = get_change_count_bounds(plugin_slug)
    base_url = infer_base_url(audit_context.get("base_url"), raw_content)
    page_snapshots = audit_context.get("page_snapshots") or {}

    summary = ValidationSummary()
    corrected: list[dict[str, Any]] = []

    for change in changes:
        item = dict(change)
        item.setdefault("needsReview", False)
        item.setdefault("reviewReason", None)
        item["location"] = _normalize_text(item.get("location")) or _normalize_text(item.get("fieldLabel"))
        item["pageUrl"] = _construct_page_url(base_url, item["location"], _normalize_text(item.get("pageUrl")))

        proposed = _normalize_text(item.get("proposedContent"))
        current = _normalize_text(item.get("currentState"))

        # CHECK 1 — publish-ready proposed content
        if looks_like_instruction(proposed):
            item["needsReview"] = True
            item["reviewReason"] = "Proposed content looks like an instruction, not publish-ready copy"
            summary.flagged_needs_review += 1
            summary.warnings.append(item["reviewReason"])

        # CHECK 2 — current state present
        if _is_empty_current(current):
            item["needsReview"] = True
            item["currentState"] = "(none — this element does not currently exist)"
            reason = "Current state unknown"
            item["reviewReason"] = reason if not item.get("reviewReason") else f"{item['reviewReason']}; {reason}"
            summary.flagged_needs_review += 1

        # CHECK 2b — verify against live page when snapshot available
        snapshot = snapshot_lookup(page_snapshots, item["pageUrl"])
        if snapshot:
            verified_current, live_ok, live_reason = verify_current_state_against_snapshot(
                item.get("currentState", ""),
                item.get("fieldLabel", ""),
                snapshot,
            )
            if verified_current and verified_current != item.get("currentState"):
                item["currentState"] = verified_current
                summary.warnings.append(f"Current state aligned to live page for {item['fieldLabel']}")
            if not live_ok and live_reason:
                item["needsReview"] = True
                item["reviewReason"] = (
                    live_reason
                    if not item.get("reviewReason")
                    else f"{item['reviewReason']}; {live_reason}"
                )
                summary.flagged_needs_review += 1

        # CHECK 3 — valid change type
        change_type = _normalize_text(item.get("changeType"))
        if change_type not in VALID_CHANGE_TYPES:
            inferred = _infer_change_type(item)
            item["changeType"] = inferred
            item["needsReview"] = True
            reason = f"Invalid changeType corrected to '{inferred}'"
            item["reviewReason"] = reason if not item.get("reviewReason") else f"{item['reviewReason']}; {reason}"
            summary.inferred_change_types += 1
            summary.flagged_needs_review += 1

        # CHECK 3b — schema JSON must parse
        if item.get("changeType") == "schema" and proposed:
            valid, schema_err = validate_schema_content(proposed)
            if not valid:
                item["needsReview"] = True
                reason = f"Invalid JSON-LD schema: {schema_err}"
                item["reviewReason"] = reason if not item.get("reviewReason") else f"{item['reviewReason']}; {reason}"
                summary.rejected_invalid_schema += 1
                summary.flagged_needs_review += 1

        # CHECK 4 — source URL present
        if not item["pageUrl"].startswith("http"):
            fixed = _construct_page_url(base_url, item["location"], item["pageUrl"])
            if fixed.startswith("http"):
                item["pageUrl"] = fixed
                summary.fixed_urls += 1
            else:
                item["needsReview"] = True
                reason = "Source URL missing or invalid"
                item["reviewReason"] = reason if not item.get("reviewReason") else f"{item['reviewReason']}; {reason}"
                summary.flagged_needs_review += 1

        # Normalize priority
        priority = _normalize_text(item.get("priority"))
        if priority not in VALID_PRIORITIES:
            item["priority"] = "Medium"
        corrected.append(item)

    # CHECK 5 — remove duplicate targets (keep higher impact)
    deduped: list[dict[str, Any]] = []
    for item in corrected:
        duplicate_idx = None
        for idx, kept in enumerate(deduped):
            if (
                kept.get("pageUrl") == item.get("pageUrl")
                and kept.get("changeType") == item.get("changeType")
                and kept.get("fieldLabel") == item.get("fieldLabel")
                and _string_similarity(
                    _normalize_text(kept.get("currentState")),
                    _normalize_text(item.get("currentState")),
                )
                > 0.7
            ):
                duplicate_idx = idx
                break
        if duplicate_idx is None:
            deduped.append(item)
            continue
        kept = deduped[duplicate_idx]
        kept_score = int(kept.get("impactScore") or 0)
        item_score = int(item.get("impactScore") or 0)
        if item_score > kept_score:
            deduped[duplicate_idx] = item
        summary.removed_duplicates += 1
    corrected = deduped

    # CHECK 6 — priority distribution (max 3 High)
    high_items = [c for c in corrected if c.get("priority") == "High"]
    if len(high_items) > 3:
        high_items.sort(key=lambda c: int(c.get("impactScore") or 0))
        for item in high_items[:-3]:
            item["priority"] = "Medium"
            summary.downgraded_priority += 1

    # Enforce focused set size — trim lowest impact if over plugin max
    if len(corrected) > max_count:
        corrected.sort(key=lambda c: int(c.get("impactScore") or 0), reverse=True)
        corrected = corrected[:max_count]
        summary.warnings.append(f"Trimmed change list to maximum of {max_count} items")

    logger.info(
        "validate_and_correct_changes: %d changes, flagged=%d, deduped=%d, downgraded=%d, fixed_urls=%d",
        len(corrected),
        summary.flagged_needs_review,
        summary.removed_duplicates,
        summary.downgraded_priority,
        summary.fixed_urls,
    )
    return corrected, summary
