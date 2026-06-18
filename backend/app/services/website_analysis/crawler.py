"""Website crawler for full internal page discovery + metadata extraction."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)

SEED_PATHS = (
    "/",
    "/about",
    "/about-us",
    "/company",
    "/products",
    "/services",
    "/pricing",
    "/contact",
    "/contact-us",
    "/faq",
    "/faqs",
)

META_TAG_RE = re.compile(
    r'<meta[^>]+(?:name|property)=["\']([^"\']+)["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
TITLE_RE = re.compile(r"<title[^>]*>([^<]+)</title>", re.IGNORECASE)
H1_RE = re.compile(r"<h1[^>]*>([^<]+)</h1>", re.IGNORECASE)
JSON_LD_RE = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)
LINK_RE = re.compile(r'<a[^>]+href=["\']([^"\']+)["\']', re.IGNORECASE)


def _extract_meta(html: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    for match in META_TAG_RE.finditer(html):
        key = match.group(1).lower()
        meta[key] = match.group(2).strip()
    title = TITLE_RE.search(html)
    if title:
        meta["title"] = title.group(1).strip()
    h1 = H1_RE.search(html)
    if h1:
        meta["h1"] = h1.group(1).strip()
    return meta


def _extract_json_ld(html: str) -> list[Any]:
    blocks: list[Any] = []
    for match in JSON_LD_RE.finditer(html):
        blocks.append(match.group(1).strip()[:4000])
    return blocks[:5]


def _extract_internal_links(html: str, base_url: str) -> list[str]:
    base = urlparse(base_url)
    links: list[str] = []
    for match in LINK_RE.finditer(html):
        href = match.group(1).strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.netloc.replace("www.", "") == base.netloc.replace("www.", ""):
            links.append(absolute.split("#")[0].rstrip("/"))
    return list(dict.fromkeys(links))[:40]


async def _fetch_page(client: httpx.AsyncClient, url: str) -> dict[str, Any]:
    try:
        response = await client.get(url, follow_redirects=True)
        content_type = response.headers.get("content-type", "")
        if response.status_code >= 400 or "text/html" not in content_type:
            return {"url": url, "status": response.status_code, "html": "", "error": "unavailable"}
        html = response.text[:120_000]
        return {
            "url": str(response.url),
            "status": response.status_code,
            "html": html,
            "meta": _extract_meta(html),
            "json_ld": _extract_json_ld(html),
            "internal_links": _extract_internal_links(html, str(response.url)),
        }
    except Exception as exc:
        logger.warning("Crawl failed for %s: %s", url, exc)
        return {"url": url, "status": 0, "html": "", "error": str(exc)}


async def _discover_from_sitemap(client: httpx.AsyncClient, base_url: str) -> list[str]:
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    candidates = (
        f"{origin}/sitemap.xml",
        f"{origin}/sitemap_index.xml",
    )
    discovered: list[str] = []
    for sm in candidates:
        try:
            res = await client.get(sm, follow_redirects=True)
            if res.status_code >= 400:
                continue
            xml = res.text[:500_000]
            urls = re.findall(r"<loc>\s*(.*?)\s*</loc>", xml, flags=re.IGNORECASE)
            for u in urls:
                p = urlparse(u.strip())
                if p.netloc.replace("www.", "") == parsed.netloc.replace("www.", ""):
                    discovered.append(u.strip().split("#")[0].rstrip("/"))
        except Exception:
            continue
    return list(dict.fromkeys(discovered))[:200]


async def crawl_website(base_url: str, timeout_seconds: int = 30) -> dict[str, Any]:
    """Best-effort full crawl of discoverable internal pages within timeout budget."""
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    seed_targets = list(
        dict.fromkeys(urljoin(origin, p) if p != "/" else origin.rstrip("/") + "/" for p in SEED_PATHS)
    )
    pages: list[dict[str, Any]] = []
    all_links: list[str] = []
    combined_meta: dict[str, str] = {}
    discovered_set: set[str] = set()
    visited: set[str] = set()
    queue: list[str] = []
    deadline = time.monotonic() + timeout_seconds
    max_pages = 120

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(8.0, connect=5.0),
        headers={"User-Agent": "SkillSearchFit-Analyzer/1.0"},
        limits=httpx.Limits(max_connections=10),
    ) as client:
        sitemap_urls = await _discover_from_sitemap(client, base_url)
        queue.extend(seed_targets + sitemap_urls)

        while queue and len(visited) < max_pages and time.monotonic() < deadline:
            batch: list[str] = []
            while queue and len(batch) < 8 and len(visited) + len(batch) < max_pages:
                u = queue.pop(0)
                norm = u.rstrip("/")
                if norm in visited:
                    continue
                visited.add(norm)
                batch.append(u)
            if not batch:
                continue

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                results = await asyncio.wait_for(asyncio.gather(*[_fetch_page(client, u) for u in batch]), timeout=remaining)
            except asyncio.TimeoutError:
                logger.warning("Website crawl timed out for %s", base_url)
                break

            for page in results:
                if not page.get("html"):
                    continue
                pages.append(
                    {
                        "url": page["url"],
                        "status": page["status"],
                        "meta": page.get("meta", {}),
                        "json_ld": page.get("json_ld", []),
                        "snippet": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", page["html"]))[:3000],
                    }
                )
                combined_meta.update(page.get("meta", {}))
                links = page.get("internal_links", [])
                all_links.extend(links)
                for link in links:
                    norm = link.rstrip("/")
                    if norm not in discovered_set and norm not in visited:
                        discovered_set.add(norm)
                        queue.append(link)

    return {
        "base_url": base_url,
        "pages_crawled": len(pages),
        "pages": pages,
        "metadata": combined_meta,
        "structured_data": [ld for p in pages for ld in p.get("json_ld", [])],
        "internal_links": list(dict.fromkeys(all_links))[:300],
        "partial": len(pages) == 0 or bool(queue),
    }
