"""Shared pipeline identifiers and guards."""

FULL_CONTENT_PAGE_PIPELINE_ID = "full-content-page-pipeline"


def require_full_content_page_pipeline(pipeline_id: str) -> None:
    from app.exceptions import validation_error

    if pipeline_id != FULL_CONTENT_PAGE_PIPELINE_ID:
        raise validation_error(
            "Website preview is only available for the Full Content Page pipeline",
            [],
        )
