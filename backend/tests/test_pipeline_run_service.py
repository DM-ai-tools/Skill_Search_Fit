"""Unit tests for pipeline_run_service helpers."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from app.services.execution.pipeline_run_service import _json_safe, _truncate_error


def test_json_safe_converts_uuid():
    uid = uuid4()
    assert _json_safe(uid) == str(uid)


def test_json_safe_converts_datetime():
    ts = datetime(2026, 6, 23, 12, 0, tzinfo=timezone.utc)
    assert _json_safe(ts) == ts.isoformat()


def test_json_safe_converts_decimal():
    assert _json_safe(Decimal("1.25")) == 1.25


def test_json_safe_recurses_nested_structures():
    uid = uuid4()
    payload = {
        "ids": [uid],
        "meta": {"execution_id": uid, "score": Decimal("9.5")},
        "tags": {"a", "b"},
    }
    result = _json_safe(payload)
    assert result["ids"] == [str(uid)]
    assert result["meta"]["execution_id"] == str(uid)
    assert result["meta"]["score"] == 9.5
    assert sorted(result["tags"]) == ["a", "b"]


def test_truncate_error_caps_length():
    assert len(_truncate_error(RuntimeError("x" * 3000))) == 2000
