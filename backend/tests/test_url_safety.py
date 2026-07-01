"""URL safety helpers."""

import pytest

from app.services.url_safety import UnsafeUrlError, assert_safe_http_url


def test_assert_safe_http_url_accepts_public_https():
    url = assert_safe_http_url("https://example.com/about")
    assert url.startswith("https://")


def test_assert_safe_http_url_rejects_localhost():
    with pytest.raises(UnsafeUrlError):
        assert_safe_http_url("http://localhost/admin")


def test_assert_safe_http_url_rejects_private_ip_literal():
    with pytest.raises(UnsafeUrlError):
        assert_safe_http_url("http://127.0.0.1/secret")


def test_assert_safe_http_url_rejects_non_http_scheme():
    with pytest.raises(UnsafeUrlError):
        assert_safe_http_url("file:///etc/passwd")
