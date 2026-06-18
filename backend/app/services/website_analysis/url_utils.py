"""URL normalization for website analysis cache keys."""

from urllib.parse import urlparse, urlunparse


def normalize_website_url(url: str) -> str:
    raw = url.strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    if not parsed.netloc:
        return ""
    scheme = parsed.scheme.lower() or "https"
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = parsed.path.rstrip("/") or ""
    return urlunparse((scheme, netloc, path, "", "", ""))


def validate_website_url(url: str) -> str:
    normalized = normalize_website_url(url)
    if not normalized:
        raise ValueError("Invalid URL")
    parsed = urlparse(normalized)
    if not parsed.netloc or "." not in parsed.netloc:
        raise ValueError("Invalid URL")
    return normalized
