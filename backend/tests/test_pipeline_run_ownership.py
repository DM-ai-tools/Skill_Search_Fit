"""Pipeline run ownership and maintenance tests."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.exceptions import AppError
from app.services.execution.pipeline_run_service import start_pipeline_run


@pytest.mark.asyncio
@patch("app.services.execution.pipeline_run_service.get_pipeline")
async def test_start_pipeline_run_rejects_foreign_project(mock_get_pipeline):
    mock_get_pipeline.return_value = {"id": "full-content-page-pipeline", "skills": []}
    user_id = uuid4()
    project_id = uuid4()
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__.return_value = conn
    conn.fetchval.return_value = None

    with pytest.raises(AppError) as exc:
        await start_pipeline_run(
            pool,
            pipeline_id="full-content-page-pipeline",
            project_id=project_id,
            base_inputs={"site_url": "https://example.com"},
            user_id=user_id,
        )

    assert exc.value.status_code == 404
