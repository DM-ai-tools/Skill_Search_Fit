"""Change suggestions publish routing tests."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.routers.change_suggestions import _dispatch_publish
from app.schemas.change_suggestions import ChangeResponse


def _sample_change() -> ChangeResponse:
    now = datetime.now(timezone.utc)
    return ChangeResponse(
        id=uuid4(),
        suggestion_id=uuid4(),
        page_url="https://example.com/page",
        change_type="content",
        priority="High",
        impact_score=80,
        destination="WordPress",
        field_label="Title",
        current_state="Old",
        proposed_content="New",
        edited_content=None,
        source_excerpt="",
        approval_status="approved",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
@patch("app.services.integrations.wordpress_agent.publish", new_callable=AsyncMock)
async def test_dispatch_publish_wordpress_uses_integration_agent(mock_publish):
    mock_publish.return_value = ([], None)
    user_id = uuid4()
    changes = [_sample_change()]

    await _dispatch_publish(user_id, "WordPress", changes, dry_run=True)

    mock_publish.assert_awaited_once_with(user_id, changes, dry_run=True)
