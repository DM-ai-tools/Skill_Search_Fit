"""Report Review & Auto-Publish Pipeline router."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Request

from app.db.pool import get_pool
from app.exceptions import AppError, not_found
from app.middleware.session import require_user
from app.schemas.reports import (
    ChangePatchRequest,
    ChangeResponse,
    PayloadRequest,
    PayloadResponse,
    PublishRequest,
    PublishResponse,
    ReportResponse,
    ReportUploadRequest,
    ReportWithChanges,
)
from app.services.reports.extractor import extract_changes
from app.services.reports.generators import generate_html_payload, generate_mailchimp_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])


# ── helpers ────────────────────────────────────────────────────────────────────

def _row_to_report(row: dict) -> ReportResponse:
    return ReportResponse(**dict(row))


def _row_to_change(row: dict) -> ChangeResponse:
    d = dict(row)
    return ChangeResponse(**d)


async def _get_report_for_user(conn, report_id: UUID, user_id: UUID) -> dict:
    row = await conn.fetchrow(
        "SELECT id, user_id, filename, status, raw_content, extract_error, created_at, updated_at "
        "FROM report_reviews WHERE id = $1 AND user_id = $2",
        report_id,
        user_id,
    )
    if not row:
        raise not_found("Report not found")
    return dict(row)


async def _get_approved_changes(conn, report_id: UUID) -> list[ChangeResponse]:
    rows = await conn.fetch(
        "SELECT * FROM report_changes WHERE report_id = $1 AND approval_status = 'approved' ORDER BY created_at",
        report_id,
    )
    return [_row_to_change(dict(r)) for r in rows]


async def _dispatch_publish(destination: str, changes: list[ChangeResponse], dry_run: bool):
    if destination == "WordPress":
        from app.services.reports.publishers.wordpress import publish
    elif destination == "Webflow":
        from app.services.reports.publishers.webflow import publish
    elif destination == "Wix":
        from app.services.reports.publishers.wix import publish
    elif destination == "Mailchimp":
        from app.services.reports.publishers.mailchimp import publish
    else:
        raise AppError("INVALID_DESTINATION", f"Unknown destination: {destination}", 400)
    return await publish(changes, dry_run=dry_run)


# ── routes ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=ReportResponse, status_code=201)
async def upload_report(body: ReportUploadRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO report_reviews (user_id, filename, raw_content, status)
            VALUES ($1, $2, $3, 'uploaded')
            RETURNING id, user_id, filename, status, extract_error, created_at, updated_at
            """,
            user.id,
            body.filename,
            body.raw_content,
        )
    return _row_to_report(dict(row))


@router.get("", response_model=list[ReportResponse])
async def list_reports(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, user_id, filename, status, extract_error, created_at, updated_at "
            "FROM report_reviews WHERE user_id = $1 ORDER BY created_at DESC",
            user.id,
        )
    return [_row_to_report(dict(r)) for r in rows]


@router.get("/{report_id}", response_model=ReportWithChanges)
async def get_report(report_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        report_row = await _get_report_for_user(conn, report_id, user.id)
        change_rows = await conn.fetch(
            "SELECT * FROM report_changes WHERE report_id = $1 ORDER BY created_at",
            report_id,
        )
    return ReportWithChanges(
        report=_row_to_report(report_row),
        changes=[_row_to_change(dict(r)) for r in change_rows],
    )


@router.post("/{report_id}/extract", response_model=ReportWithChanges)
async def extract_report(report_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()

    async with pool.acquire() as conn:
        report_row = await _get_report_for_user(conn, report_id, user.id)
        raw_content = report_row.get("raw_content", "")

        await conn.execute(
            "UPDATE report_reviews SET status = 'extracting' WHERE id = $1",
            report_id,
        )

    try:
        changes = await extract_changes(raw_content)
    except ValueError as exc:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE report_reviews SET status = 'failed', extract_error = $2 WHERE id = $1",
                report_id,
                str(exc),
            )
        raise AppError("EXTRACTION_FAILED", str(exc), 422)

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM report_changes WHERE report_id = $1",
            report_id,
        )
        for c in changes:
            await conn.execute(
                """
                INSERT INTO report_changes
                  (report_id, page_url, change_type, priority, impact_score,
                   destination, field_label, current_state, proposed_content, source_excerpt)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                """,
                report_id,
                c.pageUrl,
                c.changeType,
                c.priority,
                c.impactScore,
                c.destination,
                c.fieldLabel,
                c.currentState,
                c.proposedContent,
                c.sourceExcerpt,
            )

        await conn.execute(
            "UPDATE report_reviews SET status = 'ready', extract_error = NULL WHERE id = $1",
            report_id,
        )

        report_row = await _get_report_for_user(conn, report_id, user.id)
        change_rows = await conn.fetch(
            "SELECT * FROM report_changes WHERE report_id = $1 ORDER BY created_at",
            report_id,
        )

    return ReportWithChanges(
        report=_row_to_report(report_row),
        changes=[_row_to_change(dict(r)) for r in change_rows],
    )


@router.patch("/{report_id}/changes/{change_id}", response_model=ChangeResponse)
async def patch_change(
    report_id: UUID,
    change_id: UUID,
    body: ChangePatchRequest,
    request: Request,
):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _get_report_for_user(conn, report_id, user.id)

        row = await conn.fetchrow(
            "SELECT id FROM report_changes WHERE id = $1 AND report_id = $2",
            change_id,
            report_id,
        )
        if not row:
            raise not_found("Change not found")

        updates: list[str] = []
        params: list = [change_id]
        if body.approval_status is not None:
            params.append(body.approval_status)
            updates.append(f"approval_status = ${len(params)}::change_status")
        if body.edited_content is not None:
            params.append(body.edited_content)
            updates.append(f"edited_content = ${len(params)}")

        if updates:
            await conn.execute(
                f"UPDATE report_changes SET {', '.join(updates)} WHERE id = $1",
                *params,
            )

        updated = await conn.fetchrow(
            "SELECT * FROM report_changes WHERE id = $1",
            change_id,
        )
    return _row_to_change(dict(updated))


@router.post("/{report_id}/payload", response_model=PayloadResponse)
async def generate_payload(report_id: UUID, body: PayloadRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _get_report_for_user(conn, report_id, user.id)
        rows = await conn.fetch(
            "SELECT * FROM report_changes WHERE report_id = $1 AND approval_status = 'approved' "
            "AND destination = $2 ORDER BY created_at",
            report_id,
            body.destination,
        )

    approved = [_row_to_change(dict(r)) for r in rows]
    if not approved:
        raise AppError(
            "NO_APPROVED_CHANGES",
            f"No approved changes for destination {body.destination}",
            422,
        )

    if body.destination == "Mailchimp":
        payload_data = generate_mailchimp_payload(approved)
        content = json.dumps(payload_data, indent=2)
    else:
        content = generate_html_payload(approved)

    return PayloadResponse(
        destination=body.destination,
        content=content,
        change_ids=[c.id for c in approved],
    )


@router.post("/{report_id}/publish", response_model=PublishResponse)
async def publish_report(report_id: UUID, body: PublishRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _get_report_for_user(conn, report_id, user.id)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM report_changes WHERE report_id = $1 AND approval_status = 'approved' "
            "AND destination = $2 ORDER BY created_at",
            report_id,
            body.destination,
        )

    approved = [_row_to_change(dict(r)) for r in rows]
    if not approved:
        raise AppError(
            "NO_APPROVED_CHANGES",
            f"No approved changes for destination {body.destination}",
            422,
        )

    results = await _dispatch_publish(body.destination, approved, dry_run=body.dry_run)

    results_json = [r.model_dump() for r in results]
    async with pool.acquire() as conn:
        log_row = await conn.fetchrow(
            """
            INSERT INTO publish_audit_log
              (user_id, report_id, destination, dry_run, items_submitted, result)
            VALUES ($1, $2, $3::change_destination, $4, $5, $6::jsonb)
            RETURNING id
            """,
            user.id,
            report_id,
            body.destination,
            body.dry_run,
            len(approved),
            json.dumps(results_json),
        )

    return PublishResponse(
        destination=body.destination,
        dry_run=body.dry_run,
        results=results,
        audit_log_id=log_row["id"],
    )
