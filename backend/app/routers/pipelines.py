from fastapi import APIRouter, Request

from app.data.pipelines import PIPELINES
from app.db.pool import get_pool
from app.middleware.rate_limit import get_client_ip
from app.middleware.session import require_user
from app.schemas.pipelines import (
    PipelineExecuteRequest,
    PipelineExecuteResponse,
    PipelineListItem,
    PipelineStep,
    PipelineStepResult,
)
from app.services.execution.pipeline_runner import run_pipeline

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


@router.post("/{pipeline_id}/execute", response_model=PipelineExecuteResponse)
async def execute_pipeline(
    pipeline_id: str,
    body: PipelineExecuteRequest,
    request: Request,
):
    user = require_user(request)
    ip = get_client_ip(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await run_pipeline(
            conn,
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
