"""Tests for WordPress publish core helpers."""

from app.services.change_suggestions.wp_publish_core import (
    apply_find_replace,
    is_new_page_creation,
    merge_schema_into_content,
    validate_schema_content,
)


def test_validate_schema_content_valid():
    content = """<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"TR Demo"}
</script>"""
    ok, err = validate_schema_content(content)
    assert ok is True
    assert err is None


def test_validate_schema_content_invalid():
    ok, err = validate_schema_content('{"@type": "Thing"')
    assert ok is False
    assert err


def test_is_new_page_creation():
    class FakeChange:
        current_state = "(page does not exist — new page to create)"
        edited_content = None
        proposed_content = "x"

    assert is_new_page_creation(FakeChange())  # type: ignore[arg-type]


def test_apply_find_replace():
    html = "<p>Hello world</p>"
    result = apply_find_replace(html, "Hello world", 'Hello <a href="/">world</a>')
    assert result and "<a href=" in result


def test_merge_schema_replaces_same_type():
    existing = '<script type="application/ld+json">{"@type":"Organization","name":"Old"}</script>'
    proposed = '<script type="application/ld+json">{"@type":"Organization","name":"New"}</script>'
    merged = merge_schema_into_content(existing, proposed)
    assert '"name":"New"' in merged
    assert '"name":"Old"' not in merged
