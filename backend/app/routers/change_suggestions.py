"""Change Suggestions & Auto-Publish Pipeline router."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Request

from app.db.pool import get_pool
from app.exceptions import AppError, not_found
from app.middleware.session import require_user
from app.schemas.change_suggestions import (
    ChangePatchRequest,
    ChangeResponse,
    ChangeSuggestionCreateRequest,
    ChangeSuggestionResponse,
    ChangeSuggestionWithChanges,
    PayloadRequest,
    PayloadResponse,
    PublishRequest,
    PublishResponse,
)
from app.services.change_suggestions.extractor import extract_changes
from app.services.change_suggestions.generators import generate_html_payload, generate_mailchimp_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/change-suggestions", tags=["change-suggestions"])


# ── helpers ────────────────────────────────────────────────────────────────────

def _row_to_suggestion(row: dict) -> ChangeSuggestionResponse:
    return ChangeSuggestionResponse(**dict(row))


def _row_to_change(row: dict) -> ChangeResponse:
    return ChangeResponse(**dict(row))


async def _get_suggestion_for_user(conn, suggestion_id: UUID, user_id: UUID) -> dict:
    row = await conn.fetchrow(
        "SELECT id, user_id, filename, status, raw_content, extract_error, created_at, updated_at "
        "FROM change_suggestions WHERE id = $1 AND user_id = $2",
        suggestion_id,
        user_id,
    )
    if not row:
        raise not_found("Change suggestion not found")
    return dict(row)


async def _get_approved_changes(conn, suggestion_id: UUID) -> list[ChangeResponse]:
    rows = await conn.fetch(
        "SELECT * FROM suggestion_changes WHERE suggestion_id = $1 AND approval_status = 'approved' ORDER BY created_at",
        suggestion_id,
    )
    return [_row_to_change(dict(r)) for r in rows]


async def _dispatch_publish(destination: str, changes: list[ChangeResponse], dry_run: bool):
    if destination == "WordPress":
        from app.services.change_suggestions.publishers.wordpress import publish
    elif destination == "Webflow":
        from app.services.change_suggestions.publishers.webflow import publish
    elif destination == "Wix":
        from app.services.change_suggestions.publishers.wix import publish
    elif destination == "Mailchimp":
        from app.services.change_suggestions.publishers.mailchimp import publish
    else:
        raise AppError("INVALID_DESTINATION", f"Unknown destination: {destination}", 400)
    return await publish(changes, dry_run=dry_run)


# ── routes ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=ChangeSuggestionResponse, status_code=201)
async def create_change_suggestion(body: ChangeSuggestionCreateRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO change_suggestions (user_id, filename, raw_content, status)
            VALUES ($1, $2, $3, 'uploaded')
            RETURNING id, user_id, filename, status, extract_error, created_at, updated_at
            """,
            user.id,
            body.filename,
            body.raw_content,
        )
    return _row_to_suggestion(dict(row))


@router.get("", response_model=list[ChangeSuggestionResponse])
async def list_change_suggestions(request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, user_id, filename, status, extract_error, created_at, updated_at "
            "FROM change_suggestions WHERE user_id = $1 ORDER BY created_at DESC",
            user.id,
        )
    return [_row_to_suggestion(dict(r)) for r in rows]


@router.get("/{suggestion_id}", response_model=ChangeSuggestionWithChanges)
async def get_change_suggestion(suggestion_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        suggestion_row = await _get_suggestion_for_user(conn, suggestion_id, user.id)
        change_rows = await conn.fetch(
            "SELECT * FROM suggestion_changes WHERE suggestion_id = $1 ORDER BY created_at",
            suggestion_id,
        )
    return ChangeSuggestionWithChanges(
        suggestion=_row_to_suggestion(suggestion_row),
        changes=[_row_to_change(dict(r)) for r in change_rows],
    )


@router.post("/{suggestion_id}/extract", response_model=ChangeSuggestionWithChanges)
async def extract_change_suggestion(suggestion_id: UUID, request: Request):
    user = require_user(request)
    pool = get_pool()

    async with pool.acquire() as conn:
        suggestion_row = await _get_suggestion_for_user(conn, suggestion_id, user.id)
        raw_content = suggestion_row.get("raw_content", "")

        await conn.execute(
            "UPDATE change_suggestions SET status = 'extracting' WHERE id = $1",
            suggestion_id,
        )

    try:
        changes = await extract_changes(raw_content)
    except ValueError as exc:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE change_suggestions SET status = 'failed', extract_error = $2 WHERE id = $1",
                suggestion_id,
                str(exc),
            )
        raise AppError("EXTRACTION_FAILED", str(exc), 422)

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM suggestion_changes WHERE suggestion_id = $1",
            suggestion_id,
        )
        for c in changes:
            await conn.execute(
                """
                INSERT INTO suggestion_changes
                  (suggestion_id, page_url, change_type, priority, impact_score,
                   destination, field_label, current_state, proposed_content, source_excerpt)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                """,
                suggestion_id,
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
            "UPDATE change_suggestions SET status = 'ready', extract_error = NULL WHERE id = $1",
            suggestion_id,
        )

        suggestion_row = await _get_suggestion_for_user(conn, suggestion_id, user.id)
        change_rows = await conn.fetch(
            "SELECT * FROM suggestion_changes WHERE suggestion_id = $1 ORDER BY created_at",
            suggestion_id,
        )

    return ChangeSuggestionWithChanges(
        suggestion=_row_to_suggestion(suggestion_row),
        changes=[_row_to_change(dict(r)) for r in change_rows],
    )


@router.patch("/{suggestion_id}/changes/{change_id}", response_model=ChangeResponse)
async def patch_change(
    suggestion_id: UUID,
    change_id: UUID,
    body: ChangePatchRequest,
    request: Request,
):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _get_suggestion_for_user(conn, suggestion_id, user.id)

        row = await conn.fetchrow(
            "SELECT id FROM suggestion_changes WHERE id = $1 AND suggestion_id = $2",
            change_id,
            suggestion_id,
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
                f"UPDATE suggestion_changes SET {', '.join(updates)} WHERE id = $1",
                *params,
            )

        updated = await conn.fetchrow(
            "SELECT * FROM suggestion_changes WHERE id = $1",
            change_id,
        )
    return _row_to_change(dict(updated))


@router.post("/{suggestion_id}/payload", response_model=PayloadResponse)
async def generate_suggestion_payload(suggestion_id: UUID, body: PayloadRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _get_suggestion_for_user(conn, suggestion_id, user.id)
        rows = await conn.fetch(
            "SELECT * FROM suggestion_changes WHERE suggestion_id = $1 AND approval_status = 'approved' "
            "AND destination = $2 ORDER BY created_at",
            suggestion_id,
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


@router.post("/{suggestion_id}/publish", response_model=PublishResponse)
async def publish_suggestion(suggestion_id: UUID, body: PublishRequest, request: Request):
    user = require_user(request)
    pool = get_pool()
    async with pool.acquire() as conn:
        await _get_suggestion_for_user(conn, suggestion_id, user.id)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM suggestion_changes WHERE suggestion_id = $1 AND approval_status = 'approved' "
            "AND destination = $2 ORDER BY created_at",
            suggestion_id,
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
              (user_id, suggestion_id, destination, dry_run, items_submitted, result)
            VALUES ($1, $2, $3::change_destination, $4, $5, $6::jsonb)
            RETURNING id
            """,
            user.id,
            suggestion_id,
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
