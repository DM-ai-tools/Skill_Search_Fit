"""Tests for pipeline page generation sanitization."""

from app.services.reports.pipeline_page_generation import _sanitize_for_postgres


def test_sanitize_for_postgres_strips_nul_bytes():
    dirty = "hello\x00world"
    assert _sanitize_for_postgres(dirty) == "helloworld"


def test_sanitize_for_postgres_nested_structures():
    data = {"html": "a\x00b", "items": ["x\x00y", {"z": "1\x002"}]}
    cleaned = _sanitize_for_postgres(data)
    assert cleaned == {"html": "ab", "items": ["xy", {"z": "12"}]}
