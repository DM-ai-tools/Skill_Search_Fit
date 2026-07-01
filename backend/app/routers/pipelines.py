from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.data.pipelines import PIPELINES
from app.db.pool import get_pool
from app.exceptions import AppError, not_found
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import require_user
from app.schemas.pipelines import (
    PipelineContinueRequest,
    PipelineExecuteRequest,
    PipelineExecuteResponse,
    PipelineListItem,
    PipelinePageGenerateRequest,
    PipelinePageGenerationResponse,
    PipelinePageRegenerateRequest,
    PipelinePendingInputsResponse,
    PipelinePendingSuggestionsPatch,
    PipelineRunResponse,
    PipelineStep,
    PipelineStepExecuteRequest,
    PipelineStepResult,
    PublishReadyPageResponse,
    UnifiedPipelineReport,
)
from app.services.execution.pipeline_constants import require_full_content_page_pipeline
from app.services.execution.pipeline_run_service import (
    continue_pipeline_run,
    get_pending_inputs,
    get_pipeline_run,
    start_pipeline_run,
    update_pending_suggestions,
)
from app.services.reports.pipeline_page_generation import (
    approve_pipeline_page,
    deploy_pipeline_page_to_wordpress,
    get_pipeline_page_generation,
    regenerate_pipeline_page,
    start_pipeline_page_generation,
)
from app.services.execution.pipeline_runner import get_pipeline_recent_results

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.get("", response_model=list[PipelineListItem])
async def list_pipelines(request: Request):
    require_user(request)
    return [
        PipelineListItem(
            id=p["id"],
            name=p["name"],
            description=p["description"],
            icon=p["icon"],
            impact=p["impact"],
            steps=[PipelineStep(**s) for s in p["steps"]],
            step_count=len(p["steps"]),
        )
        for p in PIPELINES
    ]


@router.get("/{pipeline_id}/recent-results", response_model=PipelineExecuteResponse)
async def recent_pipeline_results(
    request: Request,
    pipeline_id: str,
    project_id: UUID = Query(...),
):
    user = require_user(request)
    pool = get_pool()
    result = await get_pipeline_recent_results(
        pool,
        pipeline_id=pipeline_id,
        project_id=project_id,
        user_id=user.id,
    )
    if not result:
        raise not_found("No completed pipeline results found for this project")
    return PipelineExecuteResponse(**result)


@router.get("/{pipeline_id}/unified-report", response_model=UnifiedPipelineReport)
async def unified_pipeline_report(
    request: Request,
    pipeline_id: str,
    project_id: UUID = Query(...),
    domain: str = Query(default=""),
):
    """Return a synthesised unified pipeline report.

    Fetches the most recent completed step results for this pipeline and
    project, then calls the synthesiser to organise them by pipeline purpose
    and generate an AI executive narrative.
    """
    user = require_user(request)
    pool = get_pool()

    result = await get_pipeline_recent_results(
        pool,
        pipeline_id=pipeline_id,
        project_id=project_id,
        user_id=user.id,
    )
    if not result:
        raise not_found("No completed pipeline results found for this project")

    from app.services.reports.pipeline_synthesizer import synthesize_pipeline_report

    report = await synthesize_pipeline_report(
        pipeline_id=pipeline_id,
        pipeline_name=result["pipeline_name"],
        steps=result["steps"],
        domain=domain,
    )
    return report


@router.get("/{pipeline_id}/assembled-page", response_model=PublishReadyPageResponse)
async def assembled_pipeline_page(
    request: Request,
    pipeline_id: str,
    project_id: UUID = Query(...),
    site_url: str = Query(default=""),
):
    """Assemble a publish-ready page from pipeline step outputs.

    Fetches the most recent completed step results and runs them through
    the content page assembler to produce a structured, download-ready
    publish-ready page object.
    """
    require_full_content_page_pipeline(pipeline_id)
    user = require_user(request)
    pool = get_pool()

    result = await get_pipeline_recent_results(
        pool,
        pipeline_id=pipeline_id,
        project_id=project_id,
        user_id=user.id,
    )
    if not result:
        raise not_found("No completed pipeline results found for this project")

    # Sanitize site_url for prompt injection safety
    safe_site_url = site_url.replace("\n", " ").replace("\r", " ")[:253]

    from app.services.reports.content_page_assembler import assemble_publish_ready_page

    page = await assemble_publish_ready_page(
        pipeline_run_id=str(result.get("steps", [{}])[0].get("execution_id", "unknown"))
        if result.get("steps")
        else "unknown",
        steps=result["steps"],
        site_url=safe_site_url,
    )
    return page


# Legacy pipeline execution removed — use POST /pipelines/{id}/runs instead.


@router.post("/{pipeline_id}/execute-step", response_model=PipelineStepResult)
async def execute_pipeline_step(
    pipeline_id: str,
    body: PipelineStepExecuteRequest,
    request: Request,
):
    raise AppError(
        "PIPELINE_LEGACY_REMOVED",
        "Legacy execute-step was removed. Use POST /pipelines/{id}/runs for orchestrated runs with review gates.",
        410,
    )


@router.post("/{pipeline_id}/execute", response_model=PipelineExecuteResponse)
async def execute_pipeline(
    pipeline_id: str,
    body: PipelineExecuteRequest,
    request: Request,
):
    raise AppError(
        "PIPELINE_LEGACY_REMOVED",
        "Legacy execute was removed. Use POST /pipelines/{id}/runs for orchestrated runs with review gates.",
        410,
    )


@router.post("/{pipeline_id}/runs", response_model=PipelineRunResponse)
async def create_pipeline_run(
    pipeline_id: str,
    body: PipelineExecuteRequest,
    request: Request,
):
    """Start a pipeline run with competitor pre-analysis and inter-skill review."""
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    return await start_pipeline_run(
        pool,
        pipeline_id=pipeline_id,
        project_id=body.project_id,
        base_inputs=body.inputs,
        user_id=user.id,
        ip_address=ip,
    )


@router.get("/runs/{run_id}", response_model=PipelineRunResponse)
async def fetch_pipeline_run(run_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    return await get_pipeline_run(pool, run_id=run_id, user_id=user.id)


@router.get("/runs/{run_id}/pending-inputs", response_model=PipelinePendingInputsResponse)
async def fetch_pending_inputs(run_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    return await get_pending_inputs(pool, run_id=run_id, user_id=user.id)


@router.patch("/runs/{run_id}/pending-suggestions", response_model=PipelinePendingInputsResponse)
async def patch_pending_suggestions(
    run_id: UUID,
    body: PipelinePendingSuggestionsPatch,
    request: Request,
):
    """Persist accept/reject/edit decisions for inter-skill change suggestions."""
    user = require_user(request)
    pool = get_pool()
    return await update_pending_suggestions(
        pool,
        run_id=run_id,
        user_id=user.id,
        updates=[s.model_dump(exclude_none=True) for s in body.suggestions],
    )


@router.post("/runs/{run_id}/continue", response_model=PipelineRunResponse)
async def continue_pipeline(
    run_id: UUID,
    body: PipelineContinueRequest,
    request: Request,
):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    return await continue_pipeline_run(
        pool,
        run_id=run_id,
        user_id=user.id,
        edited_inputs=body.edited_inputs,
        suggestion_updates=(
            [s.model_dump(exclude_none=True) for s in body.suggestion_updates]
            if body.suggestion_updates
            else None
        ),
        approve_all_pending=body.approve_all_pending,
        ip_address=ip,
    )


@router.post("/runs/{run_id}/generate-page", response_model=PipelinePageGenerationResponse)
async def generate_pipeline_page(
    run_id: UUID,
    body: PipelinePageGenerateRequest,
    request: Request,
):
    """Start template-insertion page generation for a completed Full Content Page run."""
    user = require_user(request)
    pool = get_pool()
    return await start_pipeline_page_generation(
        pool,
        pipeline_run_id=run_id,
        user_id=user.id,
        force=body.force,
    )


@router.get("/runs/{run_id}/page-generation", response_model=PipelinePageGenerationResponse)
async def fetch_pipeline_page_generation(run_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    return await get_pipeline_page_generation(pool, pipeline_run_id=run_id, user_id=user.id)


@router.post("/runs/{run_id}/page-generation/approve", response_model=PipelinePageGenerationResponse)
async def approve_pipeline_page_route(run_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    return await approve_pipeline_page(pool, pipeline_run_id=run_id, user_id=user.id)


@router.post("/runs/{run_id}/page-generation/regenerate", response_model=PipelinePageGenerationResponse)
async def regenerate_pipeline_page_route(
    run_id: UUID,
    body: PipelinePageRegenerateRequest,
    request: Request,
):
    user = require_user(request)
    pool = get_pool()
    return await regenerate_pipeline_page(
        pool,
        pipeline_run_id=run_id,
        user_id=user.id,
        feedback=body.feedback,
    )


@router.post("/runs/{run_id}/page-generation/deploy", response_model=PipelinePageGenerationResponse)
async def deploy_pipeline_page_route(run_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    return await deploy_pipeline_page_to_wordpress(pool, pipeline_run_id=run_id, user_id=user.id)
