"""Tests for implementation changes report parser."""

from app.services.change_suggestions.report_parser import parse_implementation_changes

SAMPLE = """
## SEO Audit Report

Some analysis here.

## Implementation Changes

### Home Page — robots.txt
- **Page URL:** https://example.com/robots.txt
- **Change Type:** technical
- **Priority:** High
- **Impact Score:** 85
- **Current State:** User-agent: *
Disallow: /
- **Proposed Change:** User-agent: *
Allow: /
Disallow: /wp-admin/
Sitemap: https://example.com/sitemap.xml
- **Destination:** WordPress

### Services — Meta Description
- **Page URL:** https://example.com/services
- **Change Type:** metadata
- **Priority:** Medium
- **Impact Score:** 60
- **Current State:** (none — this element does not currently exist)
- **Proposed Change:** Expert SEO services in Melbourne. Grow organic traffic with data-driven audits and content strategy. Book a free consult today.
- **Destination:** WordPress

### About — H1
- **Page URL:** https://example.com/about
- **Change Type:** content
- **Priority:** Low
- **Impact Score:** 30
- **Current State:** About Us
- **Proposed Change:** Melbourne Digital Marketing Experts Since 2012
- **Destination:** WordPress
"""


def test_parses_implementation_changes_section():
    changes = parse_implementation_changes(SAMPLE)
    assert len(changes) == 3
    robots = next(c for c in changes if c["fieldLabel"] == "robots.txt")
    assert "Sitemap: https://example.com/sitemap.xml" in robots["proposedContent"]
    assert "Disallow: /" in robots["currentState"]
    meta = next(c for c in changes if "Meta" in c["fieldLabel"])
    assert meta["proposedContent"].startswith("Expert SEO services")
    assert "instruction" not in meta["proposedContent"].lower()
