"""Elementor page builder support — read/write _elementor_data JSON structures.

All functions are pure (no HTTP, no DB). The wordpress_agent calls these after
fetching _elementor_data from the WordPress REST API with context=edit.
"""

from __future__ import annotations

import difflib
import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.schemas.change_suggestions import ChangeResponse
from app.services.change_suggestions.wp_publish_core import (
    final_content,
    merge_schema_into_content,
    validate_schema_content,
    yoast_meta_fields,
)

# ── Widget type → content field path ─────────────────────────────────────────

WIDGET_TEXT_FIELDS: dict[str, tuple[str, ...]] = {
    "heading":       ("settings", "title"),
    "text-editor":   ("settings", "editor"),
    "button":        ("settings", "text"),
    "icon-box":      ("settings", "title_text"),
    "image-box":     ("settings", "title_text"),
    "html":          ("settings", "html"),
    "image":         ("settings", "image", "alt"),
    "testimonial":   ("settings", "testimonial_content"),
    "alert":         ("settings", "alert_title"),
    "counter":       ("settings", "title"),
    "menu-anchor":   ("settings", "anchor_name"),
    "shortcode":     ("settings", "shortcode"),
}

ELEMENTOR_DYNAMIC_TOKEN_RE = re.compile(r"\{\{[^}]+\}\}")
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# ── Container element types (recurse into "elements") ─────────────────────────

_CONTAINER_TYPES = {"section", "column", "container"}

# ── mu-plugin PHP for enabling _elementor_data in REST API ───────────────────

MU_PLUGIN_PHP = """<?php
/**
 * SkillSearchFit — register Elementor meta fields for WordPress REST API.
 * Place this file at: /wp-content/mu-plugins/elementor-rest-meta.php
 */
add_action('init', function () {
    $meta_keys = [
        '_elementor_data',
        '_elementor_edit_mode',
        '_elementor_version',
        '_elementor_template_type',
        '_elementor_page_settings',
    ];
    foreach ($meta_keys as $key) {
        foreach (['page', 'post'] as $post_type) {
            register_post_meta($post_type, $key, [
                'show_in_rest'  => true,
                'single'        => true,
                'type'          => 'string',
                'auth_callback' => function () {
                    return current_user_can('edit_posts');
                },
            ]);
        }
    }
});"""

# ── Result types ─────────────────────────────────────────────────────────────

@dataclass
class FindResult:
    widget: dict[str, Any]
    path: list[int]
    match_type: str   # "exact" | "contains" | "fuzzy"


@dataclass
class ApplyResult:
    success: bool
    method: str       # "elementor_widget" | "elementor_html" | "meta_fields" | "skipped" | "not_found"
    widget_id: str | None = None
    widget_type: str | None = None
    meta_payload: dict[str, Any] | None = None
    reason: str | None = None


# ── Text utilities ────────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    return _HTML_TAG_RE.sub("", text).strip()


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


# ── Widget field access ───────────────────────────────────────────────────────

def _extract_widget_text(widget: dict[str, Any]) -> str | None:
    widget_type = widget.get("widgetType", "")
    path = WIDGET_TEXT_FIELDS.get(widget_type)
    if not path:
        return None
    node: Any = widget
    for key in path:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
    return str(node) if node is not None else None


def _set_widget_text(widget: dict[str, Any], value: str) -> None:
    """In-place update of the widget's primary content field."""
    widget_type = widget.get("widgetType", "")
    path = WIDGET_TEXT_FIELDS.get(widget_type)
    if not path:
        return
    node: Any = widget
    for key in path[:-1]:
        if not isinstance(node, dict):
            return
        node = node.setdefault(key, {})
    if isinstance(node, dict):
        node[path[-1]] = value


def _has_dynamic_content(widget: dict[str, Any]) -> bool:
    settings = widget.get("settings", {})
    for v in settings.values():
        if isinstance(v, str) and ELEMENTOR_DYNAMIC_TOKEN_RE.search(v):
            return True
    return False


def _has_global_reference(widget: dict[str, Any]) -> bool:
    settings = widget.get("settings", {})
    if settings.get("__globals__"):
        return True
    if widget.get("templateID"):
        return True
    return False


# ── Recursive widget search ───────────────────────────────────────────────────

def find_widget(
    elements: list[dict[str, Any]],
    search_text: str,
    widget_types: list[str] | None = None,
    threshold: float = 0.70,
    _path: list[int] | None = None,
) -> FindResult | None:
    """Search Elementor elements tree for a widget matching search_text.

    Handles arbitrary nesting depth and both classic (section/column) and
    Flexbox container layouts. Returns the first match found.
    """
    if _path is None:
        _path = []
    if not search_text:
        return None

    clean_search = strip_html(search_text).lower()

    for idx, element in enumerate(elements):
        current_path = _path + [idx]
        el_type = element.get("elType", "")

        if el_type in _CONTAINER_TYPES:
            result = find_widget(
                element.get("elements", []),
                search_text,
                widget_types,
                threshold,
                current_path,
            )
            if result:
                return result
            continue

        if el_type != "widget":
            continue

        widget_type = element.get("widgetType", "")
        if widget_types and widget_type not in widget_types:
            continue

        text = _extract_widget_text(element)
        if text is None:
            continue

        # 1. Exact match
        if text == search_text:
            return FindResult(widget=element, path=current_path, match_type="exact")

        # 2. Exact after stripping HTML
        clean_text = strip_html(text)
        clean_s = strip_html(search_text)
        if clean_text == clean_s:
            return FindResult(widget=element, path=current_path, match_type="exact")

        # 3. Contains match (cleaned)
        if clean_s and (clean_s in clean_text.lower() or clean_text.lower() in clean_s):
            return FindResult(widget=element, path=current_path, match_type="contains")

        # 4. Fuzzy match
        if clean_search and similarity(clean_text, clean_search) >= threshold:
            return FindResult(widget=element, path=current_path, match_type="fuzzy")

    return None


# ── Widget counting (for elementor-check) ─────────────────────────────────────

def count_widgets(elements: list[dict[str, Any]]) -> int:
    total = 0
    for element in elements:
        el_type = element.get("elType", "")
        if el_type == "widget":
            total += 1
        if el_type in _CONTAINER_TYPES or element.get("elements"):
            total += count_widgets(element.get("elements", []))
    return total


# ── Append new HTML widget to end of Elementor data ──────────────────────────

def _append_html_widget(elementor_data: list[dict[str, Any]], html_content: str) -> str:
    """Add a new HTML widget to the last section's first column. Returns new widget id."""
    new_id = uuid.uuid4().hex[:7]
    new_widget: dict[str, Any] = {
        "id": new_id,
        "elType": "widget",
        "widgetType": "html",
        "settings": {"html": html_content},
        "elements": [],
    }

    if not elementor_data:
        # Fallback: create a minimal section → column → widget structure
        col_id = uuid.uuid4().hex[:7]
        sec_id = uuid.uuid4().hex[:7]
        elementor_data.append({
            "id": sec_id,
            "elType": "section",
            "settings": {},
            "elements": [{
                "id": col_id,
                "elType": "column",
                "settings": {},
                "elements": [new_widget],
            }],
        })
        return new_id

    last_section = elementor_data[-1]
    # Try to find first column/container in last section
    columns = last_section.get("elements", [])
    if columns:
        columns[0].setdefault("elements", []).append(new_widget)
    else:
        # Section has no columns (Flexbox container) — append directly
        last_section.setdefault("elements", []).append(new_widget)

    return new_id


# ── Main apply function ───────────────────────────────────────────────────────

def apply_change(
    elementor_data: list[dict[str, Any]],
    change: ChangeResponse,
) -> ApplyResult:
    """Apply a single ChangeResponse to the Elementor data tree in-place.

    Returns an ApplyResult describing what happened. The caller is responsible
    for saving _elementor_data back to WordPress only if at least one change
    with method != "meta_fields" succeeded.
    """
    content = final_content(change)

    # ── Metadata: route to Yoast/RankMath meta fields, never touch Elementor ──
    if change.change_type == "metadata":
        meta = yoast_meta_fields(change, content)
        if not meta:
            # Generic fallback — use the standard title/excerpt fields; wordpress_agent
            # will merge these into the REST PATCH body rather than _elementor_data.
            label = change.field_label.lower()
            if "title" in label:
                meta = {"title": content}
            else:
                meta = {"excerpt": content}
        return ApplyResult(success=True, method="meta_fields", meta_payload=meta)

    # ── Schema: find HTML widget with LD+JSON or create one ─────────────────
    if change.change_type == "schema":
        ok, err = validate_schema_content(content)
        if not ok:
            return ApplyResult(
                success=False,
                method="not_found",
                reason=f"Invalid schema JSON-LD: {err}",
            )

        # Wrap bare JSON in <script> if needed
        if "<script" not in content.lower():
            schema_html = f'<script type="application/ld+json">{content}</script>'
        else:
            schema_html = content

        # Search for an existing HTML widget containing LD+JSON
        result = find_widget(elementor_data, "application/ld+json", widget_types=["html"])
        if result:
            existing_html = result.widget.get("settings", {}).get("html", "")
            merged = merge_schema_into_content(existing_html, schema_html)
            result.widget["settings"]["html"] = merged
            return ApplyResult(
                success=True,
                method="elementor_html",
                widget_id=result.widget.get("id"),
                widget_type="html",
            )

        # No existing schema widget — append a new HTML widget
        new_widget_id = _append_html_widget(elementor_data, schema_html)
        return ApplyResult(
            success=True,
            method="elementor_html",
            widget_id=new_widget_id,
            widget_type="html",
        )

    # ── Content / technical / capture-form: find widget by current_state ─────
    search_text = (change.current_state or "").strip()
    if not search_text:
        return ApplyResult(
            success=False,
            method="not_found",
            reason="No current_state provided — cannot locate widget in Elementor data.",
        )

    found = find_widget(elementor_data, search_text)

    if not found:
        return ApplyResult(
            success=False,
            method="not_found",
            reason=(
                "Content not found in Elementor data. The page may have been rebuilt "
                "since the audit, or the widget uses a different text field. "
                f"Manual update required. Content to paste: {content}"
            ),
        )

    widget = found.widget
    widget_type = widget.get("widgetType", "")

    if _has_global_reference(widget):
        return ApplyResult(
            success=False,
            method="skipped",
            reason=(
                "Widget uses Elementor global content — edit it from "
                "Elementor → My Templates to apply this change globally."
            ),
        )

    if _has_dynamic_content(widget):
        return ApplyResult(
            success=False,
            method="skipped",
            reason="Widget uses Elementor dynamic content — manual update required.",
        )

    # Apply the content in-place
    # For heading widgets: strip HTML (Elementor stores headings as plain text)
    if widget_type == "heading":
        _set_widget_text(widget, strip_html(content))
    else:
        _set_widget_text(widget, content)

    return ApplyResult(
        success=True,
        method="elementor_widget",
        widget_id=widget.get("id"),
        widget_type=widget_type,
    )
