"""Website preview route guards."""

import pytest

from app.exceptions import AppError
from app.services.execution.pipeline_constants import require_full_content_page_pipeline


def test_require_full_content_page_pipeline_allows_full_content():
    require_full_content_page_pipeline("full-content-page-pipeline")


def test_require_full_content_page_pipeline_rejects_other_pipelines():
    with pytest.raises(AppError) as exc:
        require_full_content_page_pipeline("content-production-pipeline")
    assert exc.value.status_code == 422
