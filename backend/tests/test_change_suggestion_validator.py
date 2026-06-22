"""Tests for change suggestion validation."""

from app.services.change_suggestions.validator import validate_and_correct_changes


def test_flags_instruction_proposed_content():
    changes = [
        {
            "id": "1",
            "location": "Home Page",
            "pageUrl": "https://example.com",
            "changeType": "metadata",
            "priority": "High",
            "impactScore": 90,
            "destination": "WordPress",
            "fieldLabel": "Meta Description",
            "currentState": "Old description",
            "proposedContent": "Add a meta description that includes your keywords",
            "sourceExcerpt": "Missing meta description",
        }
    ]
    corrected, summary = validate_and_correct_changes(changes, {"base_url": "https://example.com"})
    assert corrected[0]["needsReview"] is True
    assert summary.flagged_needs_review >= 1


def test_flags_empty_current_state():
    changes = [
        {
            "id": "1",
            "location": "Services Page",
            "pageUrl": "https://example.com/services",
            "changeType": "content",
            "priority": "Medium",
            "impactScore": 55,
            "destination": "WordPress",
            "fieldLabel": "H1",
            "currentState": "",
            "proposedContent": "Professional SEO Services for Growing Businesses",
            "sourceExcerpt": "Weak heading",
        }
    ]
    corrected, _ = validate_and_correct_changes(changes, {"base_url": "https://example.com"})
    assert corrected[0]["needsReview"] is True
    assert "does not currently exist" in corrected[0]["currentState"]


def test_removes_duplicate_targets():
    base = {
        "location": "Home Page",
        "pageUrl": "https://example.com",
        "changeType": "metadata",
        "priority": "High",
        "destination": "WordPress",
        "fieldLabel": "Title Tag",
        "currentState": "Old Title",
        "sourceExcerpt": "Title issue",
    }
    changes = [
        {**base, "id": "1", "impactScore": 40, "proposedContent": "Better Title A"},
        {**base, "id": "2", "impactScore": 80, "proposedContent": "Better Title B"},
    ]
    corrected, summary = validate_and_correct_changes(changes, {"base_url": "https://example.com"})
    assert len(corrected) == 1
    assert corrected[0]["proposedContent"] == "Better Title B"
    assert summary.removed_duplicates == 1


def test_downgrades_excess_high_priority():
    changes = [
        {
            "id": str(i),
            "location": "Home Page",
            "pageUrl": "https://example.com",
            "changeType": "content",
            "priority": "High",
            "impactScore": score,
            "destination": "WordPress",
            "fieldLabel": f"Field {i}",
            "currentState": f"Completely unique current state value number {i} here",
            "proposedContent": f"Proposed content number {i} for homepage with enough length",
            "sourceExcerpt": "Issue",
        }
        for i, score in enumerate([95, 90, 85, 80, 75], start=1)
    ]
    corrected, summary = validate_and_correct_changes(changes, {"base_url": "https://example.com"})
    high_count = sum(1 for c in corrected if c["priority"] == "High")
    assert high_count == 3
    assert summary.downgraded_priority == 2


def test_builds_full_url_from_relative_page_path():
    changes = [
        {
            "id": "1",
            "location": "Home Page",
            "pageUrl": "/blog/local-seo-guide/",
            "changeType": "content",
            "priority": "Medium",
            "impactScore": 60,
            "destination": "WordPress",
            "fieldLabel": "H1",
            "currentState": "Old heading",
            "proposedContent": "Local SEO Guide for Australian Tradies",
            "sourceExcerpt": "Weak heading",
        }
    ]
    corrected, summary = validate_and_correct_changes(
        changes,
        {"base_url": "https://trdemo.com.au"},
    )
    assert corrected[0]["pageUrl"] == "https://trdemo.com.au/blog/local-seo-guide"
    assert summary.fixed_urls >= 0


def test_prefers_explicit_page_path_over_location_slug():
    changes = [
        {
            "id": "1",
            "location": "Services Page",
            "pageUrl": "services/plumber-repairs",
            "changeType": "metadata",
            "priority": "High",
            "impactScore": 80,
            "destination": "WordPress",
            "fieldLabel": "Title Tag",
            "currentState": "Old title",
            "proposedContent": "Plumber Repairs Sydney | TR Demo",
            "sourceExcerpt": "Title issue",
        }
    ]
    corrected, _ = validate_and_correct_changes(
        changes,
        {"base_url": "https://trdemo.com.au"},
    )
    assert corrected[0]["pageUrl"] == "https://trdemo.com.au/services/plumber-repairs"


def test_preserves_subdirectory_site_base():
    changes = [
        {
            "id": "1",
            "location": "Home Page",
            "pageUrl": "",
            "changeType": "metadata",
            "priority": "High",
            "impactScore": 80,
            "destination": "WordPress",
            "fieldLabel": "Meta Description",
            "currentState": "Missing meta description on homepage",
            "proposedContent": "Professional trade services across Australia.",
            "sourceExcerpt": "Missing meta",
        }
    ]
    corrected, _ = validate_and_correct_changes(
        changes,
        {"base_url": "https://trdemo.com.au/testdomain1/"},
    )
    assert corrected[0]["pageUrl"] == "https://trdemo.com.au/testdomain1/"


def test_subdirectory_relative_path_join():
    changes = [
        {
            "id": "1",
            "location": "About Us",
            "pageUrl": "/about-us",
            "changeType": "content",
            "priority": "Medium",
            "impactScore": 60,
            "destination": "WordPress",
            "fieldLabel": "H1",
            "currentState": "Old about heading text here",
            "proposedContent": "About Click Trends Digital Marketing Agency",
            "sourceExcerpt": "Weak heading",
        }
    ]
    corrected, _ = validate_and_correct_changes(
        changes,
        {"base_url": "https://trdemo.com.au/testdomain1"},
    )
    assert corrected[0]["pageUrl"] == "https://trdemo.com.au/testdomain1/about-us"


def test_infers_subdirectory_from_report_site_label():
    changes = [
        {
            "id": "1",
            "location": "Home Page",
            "pageUrl": "",
            "changeType": "metadata",
            "priority": "High",
            "impactScore": 80,
            "destination": "WordPress",
            "fieldLabel": "Meta Description",
            "currentState": "Missing meta description on homepage",
            "proposedContent": "Professional trade services across Australia.",
            "sourceExcerpt": "Missing meta",
        }
    ]
    report = "## Audit Configuration\n\n- **Site URL:** https://trdemo.com.au/testdomain1/\n"
    corrected, _ = validate_and_correct_changes(changes, {"raw_content": report})
    assert corrected[0]["pageUrl"] == "https://trdemo.com.au/testdomain1/"

