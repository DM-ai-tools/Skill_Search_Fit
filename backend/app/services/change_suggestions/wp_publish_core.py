"""Shared WordPress publish logic for SearchFit SEO change types."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional
from urllib.parse import urlparse

from app.schemas.change_suggestions import ChangeResponse

logger = logging.getLogger(__name__)

_LD_JSON_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def final_content(change: ChangeResponse) -> str:
    return change.edited_content if change.edited_content is not None else change.proposed_content


def is_new_page_creation(change: ChangeResponse) -> bool:
    state = (change.current_state or "").lower()
    return "page does not exist" in state or "new page to create" in state or "new article to create" in state


def is_find_replace(change: ChangeResponse) -> bool:
    if change.change_type not in ("content", "technical"):
        return False
    current = (change.current_state or "").strip()
    if not current or current.startswith("(none"):
        return False
    proposed = final_content(change)
    return current in proposed or "<a " in current or "<img" in current


def extract_json_ld_blocks(html: str) -> list[tuple[str, dict[str, Any]]]:
    blocks: list[tuple[str, dict[str, Any]]] = []
    for match in _LD_JSON_RE.finditer(html):
        raw = match.group(1).strip()
        try:
            blocks.append((raw, json.loads(raw)))
        except json.JSONDecodeError:
            continue
    return blocks


def validate_schema_content(content: str) -> tuple[bool, Optional[str]]:
    text = content.strip()
    if "<script" in text.lower():
        match = _LD_JSON_RE.search(text)
        if not match:
            return False, "No JSON-LD script block found"
        text = match.group(1).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        return False, str(exc)
    if not isinstance(parsed, dict):
        return False, "Schema must be a JSON object"
    if "@type" not in parsed and "@graph" not in parsed:
        return False, "Missing @type in schema"
    return True, None


def schema_type_from_content(content: str) -> Optional[str]:
    ok, _ = validate_schema_content(content)
    if not ok:
        return None
    match = _LD_JSON_RE.search(content)
    raw = match.group(1).strip() if match else content.strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict):
        return str(parsed.get("@type", "")) or None
    return None


def merge_schema_into_content(existing_html: str, proposed: str) -> str:
    new_type = schema_type_from_content(proposed)
    if not new_type:
        return existing_html + "\n" + proposed

    blocks = extract_json_ld_blocks(existing_html)
    for idx, (raw, parsed) in enumerate(blocks):
        if str(parsed.get("@type", "")).lower() == new_type.lower():
            replacement = proposed if "<script" in proposed.lower() else (
                f'<script type="application/ld+json">{proposed}</script>'
            )
            return existing_html.replace(
                f'<script type="application/ld+json">{raw}</script>',
                replacement,
                1,
            )

    script = proposed if "<script" in proposed.lower() else (
        f'<script type="application/ld+json">{proposed}</script>'
    )
    return existing_html.rstrip() + "\n" + script


def apply_find_replace(existing_html: str, current: str, proposed: str) -> Optional[str]:
    if current and current in existing_html:
        return existing_html.replace(current, proposed, 1)
    return None


def yoast_meta_fields(change: ChangeResponse, content: str) -> dict[str, str]:
    label = change.field_label.lower()
    meta: dict[str, str] = {}
    if "meta title" in label or label == "title tag" or label.endswith(" title"):
        meta["_yoast_wpseo_title"] = content
    elif "meta description" in label or "description" in label:
        meta["_yoast_wpseo_metadesc"] = content
    elif "og:title" in label or "open graph title" in label:
        meta["_yoast_wpseo_opengraph-title"] = content
    elif "og:description" in label or "open graph description" in label:
        meta["_yoast_wpseo_opengraph-description"] = content
    elif "twitter" in label:
        meta["_yoast_wpseo_twitter-title"] = content
    return meta


def build_wp_update(change: ChangeResponse, existing_post: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Build a WordPress REST PATCH/POST body for an existing page update."""
    content = final_content(change)
    label = change.field_label.lower()
    payload: dict[str, Any] = {}
    existing_html = (existing_post or {}).get("content", {}).get("rendered", "") or ""

    if change.change_type == "metadata":
        yoast = yoast_meta_fields(change, content)
        if yoast:
            payload["meta"] = yoast
        elif "title" in label and "meta" not in label and "og" not in label:
            payload["title"] = content
        elif "description" in label or "excerpt" in label:
            payload["excerpt"] = content
            payload.setdefault("meta", {})["_yoast_wpseo_metadesc"] = content
        else:
            payload.setdefault("meta", {})[change.field_label] = content

    elif change.change_type == "schema":
        ok, err = validate_schema_content(content)
        if not ok:
            raise ValueError(f"Invalid schema JSON-LD: {err}")
        if existing_html:
            payload["content"] = merge_schema_into_content(existing_html, content)
        else:
            script = content if "<script" in content.lower() else (
                f'<script type="application/ld+json">{content}</script>'
            )
            payload["meta"] = {"_schema_markup": script}

    elif change.change_type == "technical":
        if "robots.txt" in label:
            payload["_manual"] = {"file": "robots.txt", "content": content}
        elif "canonical" in label or "robots" in label or "<link" in content.lower():
            payload.setdefault("meta", {})["_head_injection"] = content
        elif is_find_replace(change) and existing_html:
            replaced = apply_find_replace(existing_html, change.current_state, content)
            if replaced:
                payload["content"] = replaced
            else:
                payload["content"] = content
        else:
            payload["content"] = content

    elif is_find_replace(change) and existing_html:
        replaced = apply_find_replace(existing_html, change.current_state, content)
        payload["content"] = replaced if replaced else content

    else:
        payload["content"] = content

    return payload


def build_new_page_payload(change: ChangeResponse) -> dict[str, Any]:
    """Create draft page/post — content-strategy, content-brief, keyword-clustering."""
    content = final_content(change)
    title = change.field_label or change.location or "Draft Page"
    slug = urlparse(change.page_url).path.strip("/").split("/")[-1] if change.page_url else ""
    is_blog = "/blog/" in (change.page_url or "").lower() or "article" in (change.field_label or "").lower()

    payload: dict[str, Any] = {
        "title": title,
        "content": content,
        "status": "draft",
    }
    if slug:
        payload["slug"] = slug
    payload["_post_type"] = "posts" if is_blog else "pages"
    return payload


def infer_post_type_from_url(page_url: str) -> str:
    path = urlparse(page_url).path.lower()
    if "/blog/" in path or path.startswith("/post"):
        return "posts"
    return "pages"
