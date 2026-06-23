from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.data.pipelines import PIPELINES
from app.db.pool import get_pool
from app.exceptions import not_found
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import require_user
from app.schemas.pipelines import (
    PipelineExecuteRequest,
    PipelineExecuteResponse,
    PipelineListItem,
    PipelineStep,
    PipelineStepExecuteRequest,
    PipelineStepResult,
    UnifiedPipelineReport,
)
from app.services.execution.pipeline_runner import (
    get_pipeline_recent_results,
    run_pipeline,
    run_pipeline_step,
)

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


@router.post("/{pipeline_id}/execute-step", response_model=PipelineStepResult)
async def execute_pipeline_step(
    pipeline_id: str,
    body: PipelineStepExecuteRequest,
    request: Request,
):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    result = await run_pipeline_step(
        pool,
        pipeline_id=pipeline_id,
        step_index=body.step_index,
        project_id=body.project_id,
        base_inputs=body.inputs,
        prior_markdown=body.prior_markdown,
        user_id=user.id,
        ip_address=ip,
    )
    return PipelineStepResult(**result)


@router.post("/{pipeline_id}/execute", response_model=PipelineExecuteResponse)
async def execute_pipeline(
    pipeline_id: str,
    body: PipelineExecuteRequest,
    request: Request,
):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    result = await run_pipeline(
        pool,
        pipeline_id=pipeline_id,
        project_id=body.project_id,
        base_inputs=body.inputs,
        user_id=user.id,
        ip_address=ip,
    )
    return PipelineExecuteResponse(
        pipeline_id=result["pipeline_id"],
        pipeline_name=result["pipeline_name"],
        status=result["status"],
        steps=[PipelineStepResult(**s) for s in result["steps"]],
        combined_markdown=result["combined_markdown"],
        workflow_steps=result["workflow_steps"],
    )
