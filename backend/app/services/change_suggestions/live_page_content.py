"""Fetch live page HTML for plugin audits and change-suggestion validation."""

from __future__ import annotations

import re
from typing import Any

from app.services.website_analysis.crawler import fetch_pages_content, site_base_url

_LIVE_AUDIT_TYPES = frozenset({"live_website", "hybrid"})
_CONTENT_FIELDS = frozenset({
    "codebase_content",
    "page_content",
    "page_source",
    "html_content",
})


def _parse_url_lines(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        lines = [str(v).strip() for v in value if str(v).strip()]
    else:
        lines = [line.strip() for line in str(value).splitlines() if line.strip()]
    urls: list[str] = []
    for line in lines:
        if line.startswith(("http://", "https://")):
            urls.append(line)
    return urls


def _resolve_site_url(inputs: dict[str, Any]) -> str:
    for key in ("site_url", "website_url", "page_url"):
        value = inputs.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def format_snapshot_for_prompt(snapshot: dict[str, Any]) -> str:
    meta = snapshot.get("meta") or {}
    lines = [
        f"### {snapshot.get('url', '')}",
        f"HTTP status: {snapshot.get('status', 'unknown')}",
        f"Title: {snapshot.get('title') or meta.get('title', '')}",
        f"Meta description: {snapshot.get('meta_description') or meta.get('description', '')}",
        f"H1: {snapshot.get('h1') or meta.get('h1', '')}",
    ]
    json_ld = snapshot.get("json_ld") or []
    if json_ld:
        lines.append("JSON-LD samples:")
        for block in json_ld[:2]:
            lines.append(str(block)[:1500])
    snippet = str(snapshot.get("snippet", "")).strip()
    if snippet:
        lines.append("Visible text excerpt:")
        lines.append(snippet[:4000])
    return "\n".join(lines)


def format_snapshots_block(snapshots: dict[str, dict[str, Any]]) -> str:
    if not snapshots:
        return ""
    parts = ["## Live page content (fetched from site)", ""]
    for snapshot in snapshots.values():
        parts.append(format_snapshot_for_prompt(snapshot))
        parts.append("")
    return "\n".join(parts).strip()


async def enrich_live_audit_inputs(
    inputs: dict[str, Any],
    input_fields: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    For live website audits, HTTP-fetch listed pages and inject real HTML/text
    into codebase_content (or page_content) when the user left those fields empty.
    """
    enriched = dict(inputs)
    field_names = {str(f.get("name", "")) for f in input_fields}
    audit_type = str(enriched.get("audit_type", "live_website")).strip().lower()

    if audit_type not in _LIVE_AUDIT_TYPES and "pages_to_audit" not in field_names:
        return enriched

    site_url = _resolve_site_url(enriched)
    page_urls = _parse_url_lines(enriched.get("pages_to_audit"))
    if not page_urls and site_url:
        page_urls = [site_url]

    if not page_urls:
        return enriched

    target_field = next((name for name in _CONTENT_FIELDS if name in field_names), None)
    if not target_field:
        return enriched

    existing = str(enriched.get(target_field) or "").strip()
    if existing and len(existing) > 200:
        return enriched

    try:
        max_pages = int(enriched.get("max_pages") or 8)
    except (TypeError, ValueError):
        max_pages = 8
    max_pages = max(1, min(max_pages, 12))

    snapshots = await fetch_pages_content(page_urls, limit=max_pages)
    block = format_snapshots_block(snapshots)
    if not block:
        return enriched

    enriched[target_field] = block
    enriched["_live_page_fetch"] = {
        "urls": list(snapshots.keys()),
        "count": len(snapshots),
    }
    return enriched


def snapshot_lookup(snapshots: dict[str, dict[str, Any]], page_url: str) -> dict[str, Any] | None:
    if not page_url or not snapshots:
        return None
    key = page_url.rstrip("/")
    if key in snapshots:
        return snapshots[key]
    for url, snap in snapshots.items():
        if url.rstrip("/") == key:
            return snap
    return None


def snapshot_haystack(snapshot: dict[str, Any]) -> str:
    parts = [
        snapshot.get("title", ""),
        snapshot.get("meta_description", ""),
        snapshot.get("h1", ""),
        snapshot.get("snippet", ""),
    ]
    meta = snapshot.get("meta") or {}
    for key in ("title", "description", "h1", "og:title", "og:description"):
        parts.append(str(meta.get(key, "")))
    return re.sub(r"\s+", " ", " ".join(parts)).strip().lower()


def live_value_for_field(snapshot: dict[str, Any], field_label: str) -> str | None:
    label = field_label.lower()
    if "meta description" in label:
        return snapshot.get("meta_description") or (snapshot.get("meta") or {}).get("description")
    if "title" in label:
        return snapshot.get("title") or (snapshot.get("meta") or {}).get("title")
    if label in {"h1", "heading"} or label.startswith("h1"):
        return snapshot.get("h1") or (snapshot.get("meta") or {}).get("h1")
    return None


def verify_current_state_against_snapshot(
    current_state: str,
    field_label: str,
    snapshot: dict[str, Any] | None,
) -> tuple[str, bool, str | None]:
    """
    Compare reported currentState to live page content.
    Returns (current_state, verified, review_reason_if_any).
    """
    if not snapshot or not snapshot.get("snippet") and not snapshot.get("title"):
        return current_state, False, "Live page could not be fetched for verification"

    normalized = (current_state or "").strip()
    if not normalized or normalized.lower().startswith("(none"):
        live = live_value_for_field(snapshot, field_label)
        if live and str(live).strip():
            return str(live).strip(), True, None
        return current_state, False, "Element not found on live page — marked as missing"

    haystack = snapshot_haystack(snapshot)
    needle = re.sub(r"\s+", " ", normalized).strip().lower()
    if len(needle) >= 8 and needle in haystack:
        return normalized, True, None

    live = live_value_for_field(snapshot, field_label)
    if live and str(live).strip():
        live_text = str(live).strip()
        if re.sub(r"\s+", " ", live_text).lower() == needle:
            return live_text, True, None
        return (
            live_text,
            False,
            "Current state updated from live page — differed from report",
        )

    return (
        normalized,
        False,
        "Current state not found on live page — verify before publishing",
    )


async def fetch_snapshots_for_changes(
    changes: list[dict[str, Any]],
    *,
    base_url: str | None = None,
) -> dict[str, dict[str, Any]]:
    urls: list[str] = []
    if base_url:
        urls.append(site_base_url(base_url))
    for change in changes:
        page_url = str(change.get("pageUrl") or change.get("page_url") or "").strip()
        if page_url.startswith("http"):
            urls.append(page_url)
    return await fetch_pages_content(urls, limit=12)
