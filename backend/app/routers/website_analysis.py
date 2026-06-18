import json
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.db.pool import get_pool
from app.exceptions import not_found, validation_error
from app.middleware.session import require_user
from app.schemas.website_analysis import (
    AutofillRequest,
    AutofillResponse,
    FieldConfidence,
    ScanWebsiteRequest,
    SuggestionsResponse,
    WebsiteAnalysisResponse,
)
from app.services.website_analysis import (
    generate_field_suggestions,
    generate_plugin_autofill,
    get_cached_analysis,
)
from app.services.website_analysis.background import get_analysis_record, start_background_website_analysis
from app.services.website_analysis.cache import run_website_analysis
from app.services.website_analysis.plugin_prefill import get_plugin_prefill
from app.services.website_analysis.url_utils import validate_website_url

router = APIRouter(prefix="/website-analysis", tags=["website-analysis"])


def _to_response(data: dict) -> WebsiteAnalysisResponse:
    analysis_block = data.get("analysis")
    if analysis_block is None and "analysis" not in data:
        analysis_block = data.get("analysis_json")
    return WebsiteAnalysisResponse(
        id=data.get("id", ""),
        url=data.get("url", ""),
        scan_status=data.get("scan_status", "completed"),
        prefill_status=data.get("prefill_status"),
        cached=data.get("cached", False),
        error_message=data.get("error_message"),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
        expires_at=data.get("expires_at"),
        analysis=analysis_block if isinstance(analysis_block, dict) else data.get("analysis"),
        competitors=data.get("competitors") or [],
        competitor_discovery_status=data.get("competitor_discovery_status"),
        crawl=data.get("crawl"),
        analyzed_at=data.get("analyzed_at"),
    )


def _fields_from_prefill(cached_prefill: dict) -> dict[str, FieldConfidence]:
    fields_typed: dict[str, FieldConfidence] = {}
    for key, value in (cached_prefill.get("fields") or {}).items():
        if not isinstance(value, dict):
            continue
        suggestions = value.get("suggestions")
        fields_typed[key] = FieldConfidence(
            value=value.get("value"),
            confidence=float(value.get("confidence", 0.5)),
            suggestions=suggestions[:3] if isinstance(suggestions, list) else [],
        )
    return fields_typed


@router.post("/scan", response_model=WebsiteAnalysisResponse)
async def scan_website(body: ScanWebsiteRequest, request: Request):
    """Start website analysis in background; returns immediately."""
    user = require_user(request)
    try:
        validate_website_url(body.url)
    except ValueError as exc:
        raise validation_error(str(exc))

    pool = get_pool()
    async with pool.acquire() as conn:
        result = await start_background_website_analysis(
            conn,
            body.url,
            user_id=user.id,
            force=body.force,
        )
    return _to_response(result)


@router.post("/scan/sync", response_model=WebsiteAnalysisResponse)
async def scan_website_sync(body: ScanWebsiteRequest, request: Request):
    """Blocking scan (legacy / admin)."""
    user = require_user(request)
    try:
        validate_website_url(body.url)
    except ValueError as exc:
        raise validation_error(str(exc))

    pool = get_pool()
    async with pool.acquire() as conn:
        result = await run_website_analysis(conn, body.url, user_id=user.id)
    return _to_response(result)


@router.get("", response_model=WebsiteAnalysisResponse)
async def get_website_analysis(
    request: Request,
    url: str = Query(..., min_length=3),
):
    require_user(request)
    try:
        normalized = validate_website_url(url)
    except ValueError as exc:
        raise validation_error(str(exc))

    pool = get_pool()
    async with pool.acquire() as conn:
        record = await get_analysis_record(conn, normalized)

    if not record:
        raise not_found("No analysis found for this URL. Start a scan first.")

    return _to_response(record)


@router.post("/plugins/{plugin_id}/autofill", response_model=AutofillResponse)
async def autofill_plugin(plugin_id: UUID, body: AutofillRequest, request: Request):
    user = require_user(request)
    try:
        normalized = validate_website_url(body.url)
    except ValueError as exc:
        raise validation_error(str(exc))

    pool = get_pool()
    async with pool.acquire() as conn:
        analysis = await get_analysis_record(conn, normalized) or await get_cached_analysis(conn, normalized)

        cached_prefill = get_plugin_prefill(analysis or {}, plugin_id)
        if cached_prefill and cached_prefill.get("fields"):
            fields_typed = _fields_from_prefill(cached_prefill)
            return AutofillResponse(
                recommended_values=cached_prefill.get("recommended_values", {}),
                confidence_scores=cached_prefill.get("confidence_scores", {}),
                reasoning=cached_prefill.get("reasoning", {}),
                fields=fields_typed,
            )

        if not analysis:
            from app.services.website_analysis.cache import run_website_analysis as run_sync

            analysis = await run_sync(conn, normalized, user_id=user.id)

        plugin = await conn.fetchrow(
            """
            SELECT id, plugin_name, category, description, input_fields, status::text
            FROM plugins WHERE id = $1
            """,
            plugin_id,
        )
        if not plugin or plugin["status"] != "enabled":
            raise not_found("Plugin not found")

        fields = plugin["input_fields"]
        if isinstance(fields, str):
            fields = json.loads(fields)

        result = await generate_plugin_autofill(
            input_fields=fields,
            website_analysis=analysis,
            plugin_name=plugin["plugin_name"],
            plugin_category=plugin.get("category") or "",
            plugin_description=plugin.get("description") or "",
            site_url=normalized,
        )

    fields_typed = {
        k: FieldConfidence(
            value=v["value"],
            confidence=v["confidence"],
            suggestions=v.get("suggestions", [])[:3] if isinstance(v.get("suggestions"), list) else [],
        )
        for k, v in result.get("fields", {}).items()
    }

    return AutofillResponse(
        recommended_values=result["recommended_values"],
        confidence_scores=result["confidence_scores"],
        reasoning=result.get("reasoning", {}),
        fields=fields_typed,
    )


@router.get("/plugins/{plugin_id}/prefill", response_model=AutofillResponse)
async def get_plugin_prefill_cached(
    plugin_id: UUID,
    request: Request,
    url: str = Query(..., min_length=3),
):
    require_user(request)
    try:
        normalized = validate_website_url(url)
    except ValueError as exc:
        raise validation_error(str(exc))

    pool = get_pool()
    async with pool.acquire() as conn:
        analysis = await get_analysis_record(conn, normalized)

    if not analysis:
        raise not_found("Analysis not started for this URL")

    cached_prefill = get_plugin_prefill(analysis, plugin_id)
    if not cached_prefill or not cached_prefill.get("fields"):
        raise not_found("Plugin recommendations are still being prepared")

    return AutofillResponse(
        recommended_values=cached_prefill.get("recommended_values", {}),
        confidence_scores=cached_prefill.get("confidence_scores", {}),
        reasoning=cached_prefill.get("reasoning", {}),
        fields=_fields_from_prefill(cached_prefill),
    )


@router.get("/plugins/{plugin_id}/suggestions/{field_name}", response_model=SuggestionsResponse)
async def field_suggestions(
    plugin_id: UUID,
    field_name: str,
    request: Request,
    url: str = Query(..., min_length=3),
):
    require_user(request)
    try:
        normalized = validate_website_url(url)
    except ValueError as exc:
        raise validation_error(str(exc))

    pool = get_pool()
    async with pool.acquire() as conn:
        analysis = await get_analysis_record(conn, normalized) or await get_cached_analysis(conn, normalized)

        cached_prefill = get_plugin_prefill(analysis or {}, plugin_id)
        if cached_prefill:
            field_entry = (cached_prefill.get("fields") or {}).get(field_name)
            if isinstance(field_entry, dict):
                suggestions = field_entry.get("suggestions", [])
                if isinstance(suggestions, list) and suggestions:
                    normalized: list[str] = []
                    for item in suggestions:
                        s = str(item).strip()
                        if s and s not in normalized:
                            normalized.append(s)
                    if normalized:
                        return SuggestionsResponse(field=field_name, suggestions=normalized[:3])

        plugin = await conn.fetchrow(
            "SELECT plugin_name, category, description, input_fields FROM plugins WHERE id = $1 AND status = 'enabled'",
            plugin_id,
        )
        if not plugin:
            raise not_found("Plugin not found")

        fields = plugin["input_fields"]
        if isinstance(fields, str):
            fields = json.loads(fields)

        field = next((f for f in fields if f.get("name") == field_name), None)
        if not field:
            return SuggestionsResponse(field=field_name, suggestions=[])

        suggestions = await generate_field_suggestions(
            field=field,
            website_analysis=analysis or {},
            plugin_name=plugin["plugin_name"],
            plugin_category=plugin.get("category") or "",
            plugin_description=plugin.get("description") or "",
        )

    return SuggestionsResponse(field=field_name, suggestions=suggestions[:3])
