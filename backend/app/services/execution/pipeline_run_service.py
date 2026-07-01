"""Orchestrated pipeline runs with competitor pre-analysis and inter-skill pauses."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from app.data.pipelines import get_pipeline
from app.exceptions import not_found, validation_error
from app.services.execution.pipeline_change_suggestions import (
    append_suggestion_audit_entry,
    apply_final_review_outputs,
    build_edited_inputs_from_suggestions,
    merge_suggestion_updates,
    validate_suggestions_resolved,
)
from app.services.execution.pipeline_competitor_analysis import run_pipeline_competitor_analysis
from app.services.execution.pipeline_constants import FULL_CONTENT_PAGE_PIPELINE_ID
from app.jobs.arq_queue import enqueue_job, pipeline_jobs_via_queue, schedule_background_task
from app.services.reports.pipeline_page_generation import trigger_page_generation_on_completion
from app.services.execution.pipeline_inter_skill import (
    build_pending_inputs,
    build_final_review_pending,
    get_transition_field_defs,
    merge_edited_inputs,
)
from app.services.execution.pipeline_runner import run_pipeline_step
from app.services.website_analysis.intelligence import enrich_inputs_from_cache

logger = logging.getLogger(__name__)

_MAX_ERROR_MESSAGE_LEN = 2000


def _json_safe(value: Any) -> Any:
    """Recursively convert non-JSON-native values for JSONB storage."""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, set):
        return [_json_safe(v) for v in value]
    return value


def _json_dumps(value: Any) -> str:
    return json.dumps(_json_safe(value))


def _truncate_error(exc: BaseException) -> str:
    return str(exc)[:_MAX_ERROR_MESSAGE_LEN]


def _serialize_run(row: asyncpg.Record) -> dict[str, Any]:
    def _json(val: Any, default: Any):
        if val is None:
            return default
        if isinstance(val, str):
            return json.loads(val)
        return val

    return {
        "id": str(row["id"]),
        "pipeline_id": row["pipeline_id"],
        "project_id": str(row["project_id"]),
        "status": row["status"],
        "current_skill_index": row["current_skill_index"],
        "base_inputs": _json(row["base_inputs"], {}),
        "competitor_data": _json(row["competitor_data"], {}),
        "competitor_failed": row["competitor_failed"],
        "prior_markdown": _json(row["prior_markdown"], []),
        "step_results": _json(row["step_results"], []),
        "pending_inputs": _json(row["pending_inputs"], None),
        "edited_inputs_count": row["edited_inputs_count"],
        "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
        "error_message": row.get("error_message"),
        "suggestion_audit_log": _json(row.get("suggestion_audit_log"), []),
    }


async def _load_run(pool: asyncpg.Pool, run_id: UUID, user_id: UUID) -> asyncpg.Record:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT * FROM pipeline_runs
            WHERE id = $1 AND user_id = $2
            """,
            run_id,
            user_id,
        )
    if not row:
        raise not_found("Pipeline run not found")
    if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE pipeline_runs SET status = 'expired', updated_at = NOW() WHERE id = $1",
                run_id,
            )
        raise validation_error("Pipeline run expired — restart the pipeline", [])
    return row


async def _save_run(
    conn: asyncpg.Connection,
    run_id: UUID,
    *,
    status: str | None = None,
    current_skill_index: int | None = None,
    competitor_data: dict | None = None,
    competitor_failed: bool | None = None,
    prior_markdown: list[str] | None = None,
    step_results: list[dict] | None = None,
    pending_inputs: dict | None = None,
    clear_pending: bool = False,
    edited_inputs_count: int | None = None,
    error_message: str | None = None,
    clear_error: bool = False,
    suggestion_audit_log: list[dict] | None = None,
) -> None:
    sets: list[str] = ["updated_at = NOW()"]
    params: list[Any] = []
    idx = 1

    def add(field: str, value: Any):
        nonlocal idx
        sets.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1

    if status is not None:
        add("status", status)
    if current_skill_index is not None:
        add("current_skill_index", current_skill_index)
    if competitor_data is not None:
        add("competitor_data", _json_dumps(competitor_data))
    if competitor_failed is not None:
        add("competitor_failed", competitor_failed)
    if prior_markdown is not None:
        add("prior_markdown", _json_dumps(prior_markdown))
    if step_results is not None:
        add("step_results", _json_dumps(step_results))
    if clear_pending:
        sets.append("pending_inputs = NULL")
    elif pending_inputs is not None:
        add("pending_inputs", _json_dumps(pending_inputs))
    if edited_inputs_count is not None:
        add("edited_inputs_count", edited_inputs_count)
    if clear_error:
        sets.append("error_message = NULL")
    elif error_message is not None:
        add("error_message", error_message)
    if suggestion_audit_log is not None:
        add("suggestion_audit_log", _json_dumps(suggestion_audit_log))

    params.append(run_id)
    await conn.execute(
        f"UPDATE pipeline_runs SET {', '.join(sets)} WHERE id = ${idx}",
        *params,
    )


async def _mark_run_failed(
    pool: asyncpg.Pool,
    run_id: UUID,
    user_id: UUID,
    exc: BaseException,
) -> dict[str, Any]:
    logger.exception("Pipeline run %s failed", run_id)
    async with pool.acquire() as conn:
        await _save_run(
            conn,
            run_id,
            status="failed",
            error_message=_truncate_error(exc),
        )
    updated = await _load_run(pool, run_id, user_id)
    return _serialize_run(updated)


async def _execute_step_on_run(
    pool: asyncpg.Pool,
    row: asyncpg.Record,
    *,
    step_index: int,
    step_input_overrides: dict | None,
    replace_step_inputs: bool = False,
    user_id: UUID,
    ip_address: str | None,
) -> dict[str, Any]:
    pipeline_id = row["pipeline_id"]
    pipeline = get_pipeline(pipeline_id)
    if not pipeline:
        raise not_found("Pipeline not found")

    prior_markdown = json.loads(row["prior_markdown"]) if isinstance(row["prior_markdown"], str) else row["prior_markdown"]
    step_results = json.loads(row["step_results"]) if isinstance(row["step_results"], str) else row["step_results"]
    base_inputs = json.loads(row["base_inputs"]) if isinstance(row["base_inputs"], str) else row["base_inputs"]
    competitor_data = json.loads(row["competitor_data"]) if isinstance(row["competitor_data"], str) else row["competitor_data"]

    try:
        step_result = await run_pipeline_step(
            pool,
            pipeline_id=pipeline_id,
            step_index=step_index,
            project_id=row["project_id"],
            base_inputs=base_inputs,
            prior_markdown=prior_markdown,
            user_id=user_id,
            ip_address=ip_address,
            competitor_data=competitor_data,
            step_input_overrides=step_input_overrides,
            replace_step_inputs=replace_step_inputs,
        )
    except Exception as exc:
        return await _mark_run_failed(pool, row["id"], user_id, exc)

    prior_markdown.append(
        f"### Step {step_result['step']}: {step_result['label']}\n\n{step_result['output_markdown']}"
    )
    step_results.append(step_result)

    is_last = step_index >= len(pipeline["steps"])
    pending = None
    new_status = "completed"
    if is_last:
        pending = build_final_review_pending(
            pipeline_id,
            base_inputs,
            step_results,
        )
        if pending:
            new_status = "paused_for_review"
    elif not is_last:
        pending = build_pending_inputs(
            pipeline_id,
            step_index - 1,
            base_inputs,
            prior_markdown,
            step_results=step_results,
            competitor_data=competitor_data,
        )
        new_status = "paused_for_review" if pending else "running"

    async with pool.acquire() as conn:
        await _save_run(
            conn,
            row["id"],
            status=new_status,
            current_skill_index=step_index,
            prior_markdown=prior_markdown,
            step_results=step_results,
            pending_inputs=pending,
            clear_pending=not pending,
            edited_inputs_count=0 if pending else row["edited_inputs_count"],
            clear_error=True,
        )

    updated = await _load_run(pool, row["id"], user_id)
    result = _serialize_run(updated)

    if new_status == "completed" and pipeline_id == FULL_CONTENT_PAGE_PIPELINE_ID:
        await trigger_page_generation_on_completion(
            pool,
            pipeline_run_id=row["id"],
            pipeline_id=pipeline_id,
            user_id=user_id,
        )

    return result


async def _bootstrap_pipeline_run(
    pool: asyncpg.Pool,
    *,
    run_id: UUID,
    pipeline_id: str,
    enriched_inputs: dict[str, Any],
    user_id: UUID,
    ip_address: str | None,
) -> None:
    try:
        competitor_data, failed = await run_pipeline_competitor_analysis(pipeline_id, enriched_inputs)

        async with pool.acquire() as conn:
            await _save_run(
                conn,
                run_id,
                status="running",
                competitor_data=competitor_data,
                competitor_failed=failed,
            )

        row = await _load_run(pool, run_id, user_id)
        await _execute_step_on_run(
            pool,
            row,
            step_index=1,
            step_input_overrides=None,
            replace_step_inputs=False,
            user_id=user_id,
            ip_address=ip_address,
        )
    except Exception as exc:
        logger.exception("Pipeline bootstrap failed for run %s", run_id)
        try:
            await _mark_run_failed(pool, run_id, user_id, exc)
        except Exception:
            logger.exception("Could not persist failed status for pipeline run %s", run_id)
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE pipeline_runs
                    SET status = 'failed',
                        error_message = $2,
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    run_id,
                    _truncate_error(exc),
                )


async def start_pipeline_run(
    pool: asyncpg.Pool,
    *,
    pipeline_id: str,
    project_id: UUID,
    base_inputs: dict,
    user_id: UUID,
    ip_address: str | None = None,
) -> dict[str, Any]:
    pipeline = get_pipeline(pipeline_id)
    if not pipeline:
        raise not_found("Pipeline not found")

    async with pool.acquire() as conn:
        owned = await conn.fetchval(
            """
            SELECT 1 FROM projects
            WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
            """,
            project_id,
            user_id,
        )
        if not owned:
            raise not_found("Project not found")

        enriched = await enrich_inputs_from_cache(conn, base_inputs)
        run_id = await conn.fetchval(
            """
            INSERT INTO pipeline_runs (
                pipeline_id, project_id, user_id, status, base_inputs
            ) VALUES ($1, $2, $3, 'analyzing_competitors', $4::jsonb)
            RETURNING id
            """,
            pipeline_id,
            project_id,
            user_id,
            json.dumps(_json_safe(enriched)),
        )

    if await pipeline_jobs_via_queue():
        job_id = await enqueue_job(
            job_name="job_pipeline_bootstrap",
            payload={
                "run_id": str(run_id),
                "pipeline_id": pipeline_id,
                "enriched_inputs": _json_safe(enriched),
                "user_id": str(user_id),
                "ip_address": ip_address,
            },
            max_tries=3,
        )
        if not job_id:
            logger.warning("Arq enqueue failed; executing pipeline bootstrap in-process")
            schedule_background_task(
                _bootstrap_pipeline_run(
                    pool,
                    run_id=run_id,
                    pipeline_id=pipeline_id,
                    enriched_inputs=enriched,
                    user_id=user_id,
                    ip_address=ip_address,
                )
            )
    else:
        logger.info("Pipeline bootstrap running in-process (PIPELINE_USE_ARQ disabled)")
        schedule_background_task(
            _bootstrap_pipeline_run(
                pool,
                run_id=run_id,
                pipeline_id=pipeline_id,
                enriched_inputs=enriched,
                user_id=user_id,
                ip_address=ip_address,
            )
        )

    row = await _load_run(pool, run_id, user_id)
    return _serialize_run(row)


async def get_pipeline_run(
    pool: asyncpg.Pool,
    *,
    run_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    row = await _load_run(pool, run_id, user_id)
    return _serialize_run(row)


async def get_pending_inputs(
    pool: asyncpg.Pool,
    *,
    run_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    row = await _load_run(pool, run_id, user_id)
    if row["status"] != "paused_for_review":
        raise validation_error("Pipeline is not paused for review", [])
    pending = row["pending_inputs"]
    if isinstance(pending, str):
        pending = json.loads(pending)
    if not pending:
        raise not_found("No pending inputs for this run")
    return pending


async def update_pending_suggestions(
    pool: asyncpg.Pool,
    *,
    run_id: UUID,
    user_id: UUID,
    updates: list[dict[str, Any]],
) -> dict[str, Any]:
    row = await _load_run(pool, run_id, user_id)
    if row["status"] != "paused_for_review":
        raise validation_error("Pipeline is not paused for review", [])

    pending = row["pending_inputs"]
    if isinstance(pending, str):
        pending = json.loads(pending)
    if not pending:
        raise not_found("No pending inputs for this run")

    suggestions = pending.get("change_suggestions") or []
    if not suggestions:
        raise validation_error("This review step has no change suggestions", [])

    merged = merge_suggestion_updates(suggestions, updates)
    pending["change_suggestions"] = merged

    async with pool.acquire() as conn:
        await _save_run(conn, run_id, pending_inputs=pending)

    return pending


async def continue_pipeline_run(
    pool: asyncpg.Pool,
    *,
    run_id: UUID,
    user_id: UUID,
    edited_inputs: dict[str, Any] | None = None,
    suggestion_updates: list[dict[str, Any]] | None = None,
    approve_all_pending: bool = False,
    ip_address: str | None = None,
) -> dict[str, Any]:
    row = await _load_run(pool, run_id, user_id)
    if row["status"] != "paused_for_review":
        raise validation_error("Pipeline is not paused for review", [])

    pending = row["pending_inputs"]
    if isinstance(pending, str):
        pending = json.loads(pending)
    if not pending:
        raise validation_error("No pending inputs to continue", [])

    is_final_review = bool(pending.get("is_final_review"))
    next_step_index = pending["step_index"]
    original_inputs = pending.get("inputs") or {}
    field_defs = pending.get("field_definitions") or get_transition_field_defs(
        row["pipeline_id"],
        next_step_index - 2,
    )

    suggestions = pending.get("change_suggestions") or []
    resolved_edited = dict(edited_inputs or {})
    audit_log = json.loads(row["suggestion_audit_log"]) if isinstance(row.get("suggestion_audit_log"), str) else (row.get("suggestion_audit_log") or [])

    if suggestions:
        merged_suggestions = merge_suggestion_updates(suggestions, suggestion_updates)
        validate_suggestions_resolved(
            merged_suggestions,
            approve_pending=approve_all_pending,
        )
        resolved_edited = {
            **build_edited_inputs_from_suggestions(
                merged_suggestions,
                approve_pending=approve_all_pending,
            ),
            **resolved_edited,
        }
        audit_log = append_suggestion_audit_entry(
            audit_log,
            step_index=pending["step_index"],
            plugin_name=pending.get("plugin_name", ""),
            suggestions=merged_suggestions,
        )

    overrides, edit_count = merge_edited_inputs(
        original_inputs,
        resolved_edited,
        field_defs,
    )

    if is_final_review:
        step_results = json.loads(row["step_results"]) if isinstance(row["step_results"], str) else row["step_results"]
        updated_steps = apply_final_review_outputs(row["pipeline_id"], step_results, overrides)
        async with pool.acquire() as conn:
            updated = await conn.execute(
                """
                UPDATE pipeline_runs
                SET status = 'completed',
                    pending_inputs = NULL,
                    step_results = $1::jsonb,
                    edited_inputs_count = $2,
                    suggestion_audit_log = $3::jsonb,
                    error_message = NULL,
                    updated_at = NOW()
                WHERE id = $4
                  AND user_id = $5
                  AND status = 'paused_for_review'
                """,
                _json_dumps(updated_steps),
                row["edited_inputs_count"] + edit_count,
                _json_dumps(audit_log),
                run_id,
                user_id,
            )
            if updated.split()[-1] == "0":
                raise validation_error("Pipeline is not paused for review", [])

        if row["pipeline_id"] == FULL_CONTENT_PAGE_PIPELINE_ID:
            await trigger_page_generation_on_completion(
                pool,
                pipeline_run_id=run_id,
                pipeline_id=row["pipeline_id"],
                user_id=user_id,
            )

        updated_row = await _load_run(pool, run_id, user_id)
        return _serialize_run(updated_row)

    async with pool.acquire() as conn:
        updated = await conn.execute(
            """
            UPDATE pipeline_runs
            SET status = 'running',
                pending_inputs = NULL,
                edited_inputs_count = $1,
                suggestion_audit_log = $2::jsonb,
                error_message = NULL,
                updated_at = NOW()
            WHERE id = $3
              AND user_id = $4
              AND status = 'paused_for_review'
            """,
            row["edited_inputs_count"] + edit_count,
            _json_dumps(audit_log),
            run_id,
            user_id,
        )
        if updated.split()[-1] == "0":
            raise validation_error("Pipeline is not paused for review", [])

    row = await _load_run(pool, run_id, user_id)
    return await _execute_step_on_run(
        pool,
        row,
        step_index=next_step_index,
        step_input_overrides=overrides,
        replace_step_inputs=False,
        user_id=user_id,
        ip_address=ip_address,
    )
