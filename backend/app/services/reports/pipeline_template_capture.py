"""Capture live site HTML template and strip tracking for pipeline page generation."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

_TRACKING_PATTERNS = [
    re.compile(r"<script[^>]*google-analytics[^>]*>.*?</script>", re.I | re.S),
    re.compile(r"<script[^>]*googletagmanager[^>]*>.*?</script>", re.I | re.S),
    re.compile(r"<script[^>]*gtag[^>]*>.*?</script>", re.I | re.S),
    re.compile(r"<script[^>]*(intercom|drift|hubspot|hotjar|clarity)[^>]*>.*?</script>", re.I | re.S),
    re.compile(r"<noscript[^>]*>.*?</noscript>", re.I | re.S),
    re.compile(r'<img[^>]*tracking[^>]*>', re.I),
]

_CSS_VAR_RE = re.compile(r"--([a-z0-9-]+)\s*:\s*([^;}{]+)", re.I)
_FONT_LINK_RE = re.compile(
    r'<link[^>]+href=["\']([^"\']*fonts\.googleapis\.com[^"\']*)["\']',
    re.I,
)
_LOGO_RE = re.compile(
    r'<img[^>]+(?:class|id)=["\'][^"\']*logo[^"\']*["\'][^>]+src=["\']([^"\']+)["\']',
    re.I,
)


def strip_tracking_scripts(html: str) -> str:
    cleaned = html
    for pat in _TRACKING_PATTERNS:
        cleaned = pat.sub("", cleaned)
    return cleaned


async def fetch_live_html(url: str, *, timeout: float = 20.0) -> str:
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=timeout,
        headers={"User-Agent": "SearchFitSEO/1.0 (+pipeline-page-gen)"},
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text.replace("\x00", "")


def extract_branding_info(html: str, site_url: str) -> dict[str, Any]:
    """Extract CSS variables, logo, fonts, and nav links from live HTML."""
    colors: dict[str, str] = {}
    for match in _CSS_VAR_RE.finditer(html):
        name, val = match.group(1).strip(), match.group(2).strip()
        if any(k in name for k in ("color", "primary", "accent", "brand", "bg")):
            colors[name] = val

    fonts = list(dict.fromkeys(_FONT_LINK_RE.findall(html)))
    logo_match = _LOGO_RE.search(html)
    logo_url = urljoin(site_url, logo_match.group(1)) if logo_match else ""

    nav_links: list[dict[str, str]] = []
    for m in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>([^<]{1,80})</a>', html, re.I):
        href, text = m.group(1).strip(), re.sub(r"\s+", " ", m.group(2).strip())
        if href.startswith("#") or not text:
            continue
        nav_links.append({"href": urljoin(site_url, href), "text": text})
        if len(nav_links) >= 12:
            break

    return {
        "site_url": site_url,
        "colors": colors,
        "logo_url": logo_url,
        "google_fonts": fonts,
        "nav_links": nav_links[:8],
        "footer_links": nav_links[8:12],
    }


async def capture_template_html(site_url: str, template_url: str | None = None) -> str:
    """Fetch and clean HTML from the best available page URL."""
    base = site_url.rstrip("/")
    candidates = [template_url, base, f"{base}/"]
    seen: set[str] = set()
    for url in candidates:
        if not url or url in seen:
            continue
        seen.add(url)
        try:
            raw = await fetch_live_html(url)
            cleaned = strip_tracking_scripts(raw)
            if len(cleaned) > 500:
                return cleaned[:120_000]
        except Exception:
            continue
    return ""
