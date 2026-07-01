"""Block SSRF-prone URLs (private networks, metadata endpoints, non-http schemes)."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

_BLOCKED_HOSTS = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata.google",
    }
)
_METADATA_IP = ipaddress.ip_address("169.254.169.254")


class UnsafeUrlError(ValueError):
    """Raised when a URL must not be fetched server-side."""


def assert_safe_http_url(url: str) -> str:
    """Validate URL scheme/host and reject hosts that resolve to private addresses."""
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError("Only http and https URLs are allowed")
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        raise UnsafeUrlError("URL must include a hostname")
    if host in _BLOCKED_HOSTS or host.endswith(".local") or host.endswith(".internal"):
        raise UnsafeUrlError("URL host is not allowed")

    try:
        addr_infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Could not resolve host: {host}") from exc

    for info in addr_infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip == _METADATA_IP:
            raise UnsafeUrlError("URL is not allowed")
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise UnsafeUrlError("URL resolves to a private or local address")

    return raw
