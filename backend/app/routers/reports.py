from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from app.exceptions import AppError
from app.middleware.session import require_user
from app.services.llm.openai_client import openai_configured
from app.services.reports.appearance_review import review_report_appearance
from app.services.reports.article_preview_polish import polish_article_preview
from app.services.reports.pdf_enhance import enhance_report_for_pdf
from app.services.reports.presentation_regenerate import regenerate_report_presentation

router = APIRouter(tags=["reports"])


class ReportAppearanceManifest(BaseModel):
    model_config = ConfigDict(extra="allow")

    report_type: str = "plugin"
    title: str = ""
    layout: dict[str, Any] = Field(default_factory=dict)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    totals: dict[str, Any] = Field(default_factory=dict)


@router.post("/reports/appearance-review")
async def appearance_review(body: ReportAppearanceManifest, request: Request) -> dict[str, Any]:
    """OpenAI review of report layout/presentation only (not content quality)."""
    require_user(request)
    if not openai_configured():
        raise AppError(
            "OPENAI_NOT_CONFIGURED",
            "OPENAI_API_KEY is not set on the backend. Add it to backend/.env and restart the API.",
            status_code=503,
        )
    try:
        return await review_report_appearance(body.model_dump(mode="json"))
    except ModuleNotFoundError:
        raise AppError(
            "OPENAI_PACKAGE_MISSING",
            "The openai Python package is not installed. Run: pip install openai",
            status_code=503,
        ) from None
    except RuntimeError as exc:
        raise AppError("APPEARANCE_REVIEW_FAILED", str(exc), status_code=502) from exc
    except Exception as exc:
        raise AppError(
            "APPEARANCE_REVIEW_FAILED",
            "Presentation review could not be completed. Try again in a moment.",
            status_code=502,
        ) from exc


class UnifiedPipelineReportBody(BaseModel):
    model_config = ConfigDict(extra="allow")

    pipeline_id: str = ""
    pipeline_name: str = ""
    pipeline_purpose: str = ""
    domain: str = ""
    narrative: str = ""
    headline_summary: dict[str, Any] = Field(default_factory=dict)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    final_deliverable: dict[str, Any] | None = None


@router.post("/reports/present-appearance")
async def present_appearance(body: UnifiedPipelineReportBody, request: Request) -> dict[str, Any]:
    """Regenerate report presentation layout via OpenAI (appearance only)."""
    require_user(request)
    if not openai_configured():
        raise AppError(
            "OPENAI_NOT_CONFIGURED",
            "OPENAI_API_KEY is not set on the backend. Add it to backend/.env and restart the API.",
            status_code=503,
        )
    try:
        return await regenerate_report_presentation(body.model_dump(mode="json"))
    except ModuleNotFoundError:
        raise AppError(
            "OPENAI_PACKAGE_MISSING",
            "The openai Python package is not installed. Run: pip install openai",
            status_code=503,
        ) from None
    except RuntimeError as exc:
        raise AppError("PRESENTATION_FAILED", str(exc), status_code=502) from exc
    except Exception as exc:
        raise AppError(
            "PRESENTATION_FAILED",
            "Presentation layout could not be generated. Try again in a moment.",
            status_code=502,
        ) from exc


class ArticlePreviewRequest(BaseModel):
    h1: str = ""
    title_tag: str = ""
    meta_description: str = ""
    full_body_markdown: str = ""
    full_url: str = ""
    word_count: int = 0


@router.post("/reports/preview-article")
async def preview_article(body: ArticlePreviewRequest, request: Request) -> dict[str, Any]:
    """Polish publish-ready article for Full Preview via OpenAI (formatting only)."""
    require_user(request)
    if not openai_configured():
        raise AppError(
            "OPENAI_NOT_CONFIGURED",
            "OPENAI_API_KEY is not set on the backend. Add it to backend/.env and restart the API.",
            status_code=503,
        )
    try:
        return await polish_article_preview(body.model_dump(mode="json"))
    except ModuleNotFoundError:
        raise AppError(
            "OPENAI_PACKAGE_MISSING",
            "The openai Python package is not installed. Run: pip install openai",
            status_code=503,
        ) from None
    except RuntimeError as exc:
        raise AppError("ARTICLE_PREVIEW_FAILED", str(exc), status_code=502) from exc
    except Exception as exc:
        raise AppError(
            "ARTICLE_PREVIEW_FAILED",
            "Article preview could not be generated. Try again in a moment.",
            status_code=502,
        ) from exc


class ReportPdfDocument(BaseModel):
    model_config = ConfigDict(extra="allow")

    pluginName: str
    title: str | None = None
    executionId: str | None = None
    siteUrl: str | None = None
    generatedAt: str | None = None
    status: str | None = None
    overallScore: int | None = None
    executiveSummary: str | None = None
    keyTakeaways: list[str] = Field(default_factory=list)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    metrics: dict[str, Any] | None = None
    pipelineSteps: list[dict[str, Any]] | None = None
    suggestions: list[str] | None = None


@router.post("/reports/pdf-enhance")
async def pdf_enhance(body: ReportPdfDocument, request: Request) -> dict[str, Any]:
    """Polish executive summary and key takeaways for PDF export (OpenAI when configured)."""
    require_user(request)
    doc = body.model_dump(mode="json")
    enhanced = await enhance_report_for_pdf(doc)
    return enhanced
