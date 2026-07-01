"""Full Content Page Pipeline — template insertion page generation."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg
import httpx

from app.exceptions import not_found, validation_error
from app.jobs.arq_queue import enqueue_job, pipeline_jobs_via_queue, schedule_background_task
from app.services.execution.pipeline_constants import FULL_CONTENT_PAGE_PIPELINE_ID
from app.services.llm.openai_client import openai_chat_json, openai_configured
from app.services.reports.content_page_assembler import assemble_publish_ready_page
from app.services.reports.pipeline_template_capture import (
    capture_template_html,
    extract_branding_info,
)

logger = logging.getLogger(__name__)

MAX_REGENERATIONS = 3
GENERATION_TIMEOUT_SECONDS = 300
POLL_KEY_PREFIX = "content_pipeline_page_job"


def _sanitize_for_postgres(value: Any) -> Any:
    """Remove NUL bytes — PostgreSQL text/json cannot store \\x00."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, dict):
        return {k: _sanitize_for_postgres(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_for_postgres(v) for v in value]
    return value

PIPELINE_INSERT_SYSTEM = (
    "You are an expert web developer. You insert pre-written content into design templates. "
    "Return only valid JSON."
)

PIPELINE_INSERT_USER_TEMPLATE = """You are an expert web developer. You will receive:
1. A design template — the HTML structure, CSS classes, and branding of an existing website page.
2. Complete pre-written content — a fully written, SEO-optimized article that must be published exactly as provided.

YOUR ONLY JOB is to insert the pre-written content into the design template. You must NOT:
  - Rewrite any of the content
  - Paraphrase any sentences
  - Summarise any sections
  - Remove any paragraphs
  - Change any headings
  - Remove any internal links
  - Shorten the content in any way
  - Add new content that was not provided

You MUST:
  - Preserve every word of the provided content exactly
  - Maintain the template's CSS classes, structure, and layout
  - Replace the template's placeholder content with the provided content
  - Preserve all internal links as real HTML anchor tags
  - Inject the schema markup into the <head> section
  - Inject all meta tags into the <head> section
  - Set the canonical URL in <head>
  - Apply the site's branding (colors, fonts, logo) from the branding info provided
  - Ensure the heading hierarchy is correct:
      One <h1> matching the provided H1
      H2s matching the provided article sections
      H3s matching the provided subsections
  - Insert image placeholder blocks at the positions indicated in the image brief
  - Ensure the FAQ section uses the provided Q&As exactly
  - Ensure the CTA blocks appear at mid-article and end-of-article positions as provided
  - Ensure the page is mobile-responsive (preserve the template's responsive CSS)
  - Remove all tracking scripts, analytics, chat widgets, and cookie banners from the template

{feedback_block}

DESIGN TEMPLATE:
{html_template}

BRANDING INFO:
{branding_info}

PAGE META:
Title tag: {page_title}
Meta description: {meta_description}
Canonical URL: {full_url}
H1: {h1}

SCHEMA MARKUP (inject into <head>):
{schema_jsonld}

META TAGS (inject into <head>):
{head_html}

PRE-WRITTEN CONTENT (insert exactly as provided — do not change):
{full_body_html}

IMAGE BRIEF (insert placeholder images at these positions):
{image_brief}

USER CONTEXT (for understanding the business — do not use to rewrite content):
{user_context}

Return ONLY a valid JSON object with these exact fields:
{{
  "html": "the complete page HTML as a string",
  "pageTitle": "{page_title}",
  "metaDescription": "{meta_description}"
}}

The html field must be a complete, valid HTML5 document from <!DOCTYPE html> to </html>."""


def _markdown_to_html_body(markdown: str) -> str:
    """Lightweight markdown → HTML for pipeline body (headings, paragraphs, links)."""
    if not markdown.strip():
        return ""
    if "<p>" in markdown or "<h2" in markdown:
        return markdown

    lines = markdown.splitlines()
    parts: list[str] = []
    in_list = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_list:
                parts.append("</ul>")
                in_list = False
            continue
        if stripped.startswith("### "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h3>{stripped[4:]}</h3>")
        elif stripped.startswith("## "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h2>{stripped[3:]}</h2>")
        elif stripped.startswith("# "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h1>{stripped[2:]}</h1>")
        elif stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{stripped[2:]}</li>")
        else:
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<p>{stripped}</p>")
    if in_list:
        parts.append("</ul>")
    return "\n".join(parts)


def _build_user_context(assembled: dict[str, Any], base_inputs: dict[str, Any]) -> str:
    blocks = assembled.get("blocks") or {}
    head = blocks.get("head") or {}
    return "\n".join(
        filter(
            None,
            [
                f"Business site: {assembled.get('domain') or base_inputs.get('site_url', '')}",
                f"Target audience: {base_inputs.get('target_audience', '')}",
                f"Seed topic: {base_inputs.get('seed_topic', '')}",
                f"Primary keyword context: {head.get('title_tag', '')}",
            ],
        )
    )


def _build_job_data(
    *,
    pipeline_run_id: str,
    assembled: dict[str, Any],
    base_inputs: dict[str, Any],
    html_template: str,
    branding_info: dict[str, Any],
) -> dict[str, Any]:
    blocks = assembled.get("blocks") or {}
    head = blocks.get("head") or {}
    body = blocks.get("body") or {}
    url_slug = blocks.get("url_slug") or {}
    linking = blocks.get("internal_linking_instructions") or {}

    full_body_md = body.get("full_body_markdown") or ""
    full_body_html = _markdown_to_html_body(full_body_md)

    return {
        "jobType": "content_pipeline_page",
        "pipelineRunId": pipeline_run_id,
        "slug": url_slug.get("slug", assembled.get("slug", "")),
        "pageTitle": head.get("title_tag", ""),
        "metaDescription": head.get("meta_description", ""),
        "h1": body.get("h1", ""),
        "fullBodyHtml": full_body_html,
        "schemaJsonld": head.get("schema_jsonld", ""),
        "headHtml": head.get("full_head_html", ""),
        "primaryKeyword": assembled.get("slug", "").strip("/").replace("-", " "),
        "audience": base_inputs.get("target_audience", ""),
        "topicAngle": base_inputs.get("seed_topic", ""),
        "htmlTemplate": html_template[:80_000] if html_template else "",
        "brandingInfo": branding_info,
        "userContext": _build_user_context(assembled, base_inputs),
        "internalLinkingPlan": linking,
        "imageBrief": blocks.get("image_brief") or [],
        "fullUrl": assembled.get("full_url", ""),
    }


async def _run_claude_insert(job_data: dict[str, Any], user_feedback: str | None = None) -> dict[str, str]:
    feedback_block = ""
    if user_feedback:
        feedback_block = (
            f"REVISION FEEDBACK FROM USER:\n{user_feedback}\n"
            "Apply this feedback while still preserving all provided content exactly — "
            "only adjust layout, design, or formatting as the feedback requests."
        )

    user_prompt = PIPELINE_INSERT_USER_TEMPLATE.format(
        feedback_block=feedback_block,
        html_template=job_data.get("htmlTemplate") or job_data.get("fallbackHtml", ""),
        branding_info=json.dumps(job_data.get("brandingInfo") or {}, indent=2),
        page_title=job_data.get("pageTitle", ""),
        meta_description=job_data.get("metaDescription", ""),
        full_url=job_data.get("fullUrl", ""),
        h1=job_data.get("h1", ""),
        schema_jsonld=job_data.get("schemaJsonld", ""),
        head_html=job_data.get("headHtml", ""),
        full_body_html=job_data.get("fullBodyHtml", ""),
        image_brief=json.dumps(job_data.get("imageBrief") or [], indent=2),
        user_context=job_data.get("userContext", ""),
    )

    if not openai_configured():
        fallback = job_data.get("fallbackHtml") or ""
        return {
            "html": fallback,
            "pageTitle": job_data.get("pageTitle", ""),
            "metaDescription": job_data.get("metaDescription", ""),
            "used_fallback": True,
            "fallback_reason": "OpenAI is not configured — using assembled HTML without AI layout pass.",
        }

    result = await asyncio.wait_for(
        openai_chat_json(
            system=PIPELINE_INSERT_SYSTEM,
            user=user_prompt,
            max_tokens=16384,
            timeout_seconds=120,
        ),
        timeout=GENERATION_TIMEOUT_SECONDS,
    )
    html = str(result.get("html") or "")
    if not html.strip():
        html = job_data.get("fallbackHtml", "")
    return {
        "html": html,
        "pageTitle": str(result.get("pageTitle") or job_data.get("pageTitle", "")),
        "metaDescription": str(result.get("metaDescription") or job_data.get("metaDescription", "")),
        "used_fallback": False,
        "fallback_reason": None,
    }


async def _update_generation(
    conn: asyncpg.Connection,
    gen_id: UUID,
    **fields: Any,
) -> None:
    sets = ["updated_at = NOW()"]
    params: list[Any] = []
    idx = 1
    for key, val in fields.items():
        col = {
            "status": "status",
            "result_html": "result_html",
            "page_title": "page_title",
            "meta_description": "meta_description",
            "slug": "slug",
            "full_url": "full_url",
            "error_message": "error_message",
            "job_data": "job_data",
            "regeneration_count": "regeneration_count",
            "user_feedback": "user_feedback",
            "approved_at": "approved_at",
            "deployed_at": "deployed_at",
            "wordpress_draft_url": "wordpress_draft_url",
        }.get(key, key)
        if key == "job_data":
            safe_val = _sanitize_for_postgres(val)
            sets.append(f"{col} = ${idx}::jsonb")
            params.append(json.dumps(safe_val))
        else:
            sets.append(f"{col} = ${idx}")
            params.append(_sanitize_for_postgres(val))
        idx += 1
    params.append(gen_id)
    await conn.execute(
        f"UPDATE pipeline_page_generations SET {', '.join(sets)} WHERE id = ${idx}",
        *params,
    )


async def start_pipeline_page_generation(
    pool: asyncpg.Pool,
    *,
    pipeline_run_id: UUID,
    user_id: UUID,
    force: bool = False,
) -> dict[str, Any]:
    """Start page generation for a completed Full Content Page Pipeline run."""
    async with pool.acquire() as conn:
        run = await conn.fetchrow(
            """
            SELECT * FROM pipeline_runs
            WHERE id = $1 AND user_id = $2 AND pipeline_id = $3
            """,
            pipeline_run_id,
            user_id,
            FULL_CONTENT_PAGE_PIPELINE_ID,
        )
        if not run:
            raise not_found("Pipeline run not found")
        if run["status"] != "completed":
            raise validation_error("Pipeline run must be completed before page generation", [])

        existing = await conn.fetchrow(
            "SELECT * FROM pipeline_page_generations WHERE pipeline_run_id = $1",
            pipeline_run_id,
        )
        if existing and existing["status"] in ("generated", "fallback", "approved", "deployed"):
            return _serialize_generation(existing)
        if existing and existing["status"] == "generating" and not force:
            updated_at = existing["updated_at"]
            if updated_at:
                if updated_at.tzinfo is None:
                    updated_at = updated_at.replace(tzinfo=timezone.utc)
                age_seconds = (datetime.now(timezone.utc) - updated_at).total_seconds()
                if age_seconds < GENERATION_TIMEOUT_SECONDS + 120:
                    return _serialize_generation(existing)
            else:
                return _serialize_generation(existing)

        base_inputs = json.loads(run["base_inputs"]) if isinstance(run["base_inputs"], str) else run["base_inputs"]
        step_results = json.loads(run["step_results"]) if isinstance(run["step_results"], str) else run["step_results"]
        site_url = str(base_inputs.get("site_url") or "")

        assembled = await assemble_publish_ready_page(
            pipeline_run_id=str(pipeline_run_id),
            steps=step_results,
            site_url=site_url,
        )

        template_html = ""
        branding: dict[str, Any] = {}
        if site_url:
            try:
                template_html = await capture_template_html(site_url)
                if template_html:
                    branding = extract_branding_info(template_html, site_url)
            except Exception as exc:
                logger.warning("Template capture failed: %s", exc)

        fallback_html = assembled.get("downloads", {}).get("html_file", "")
        job_data = _build_job_data(
            pipeline_run_id=str(pipeline_run_id),
            assembled=assembled,
            base_inputs=base_inputs,
            html_template=template_html,
            branding_info=branding,
        )
        job_data["fallbackHtml"] = _sanitize_for_postgres(fallback_html)
        job_data = _sanitize_for_postgres(job_data)

        if existing:
            gen_id = existing["id"]
            await _update_generation(
                conn,
                gen_id,
                status="generating",
                job_data=job_data,
                error_message=None,
            )
        else:
            gen_id = await conn.fetchval(
                """
                INSERT INTO pipeline_page_generations (
                    pipeline_run_id, project_id, user_id, status, job_data,
                    slug, page_title, meta_description, full_url
                ) VALUES ($1, $2, $3, 'generating', $4::jsonb, $5, $6, $7, $8)
                RETURNING id
                """,
                pipeline_run_id,
                run["project_id"],
                user_id,
                json.dumps(job_data),
                job_data.get("slug"),
                job_data.get("pageTitle"),
                job_data.get("metaDescription"),
                job_data.get("fullUrl"),
            )

    await _dispatch_page_generation(
        pool,
        gen_id=gen_id,
        job_data=job_data,
        user_feedback=None,
    )
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM pipeline_page_generations WHERE id = $1",
            gen_id,
        )
    return _serialize_generation(row)


async def _dispatch_page_generation(
    pool: asyncpg.Pool,
    *,
    gen_id: UUID,
    job_data: dict[str, Any],
    user_feedback: str | None,
) -> None:
    if await pipeline_jobs_via_queue():
        job_id = await enqueue_job(
            job_name="job_pipeline_page_generation_execute",
            payload={
                "generation_id": str(gen_id),
                "job_data": _sanitize_for_postgres(job_data),
                "user_feedback": user_feedback,
            },
            max_tries=3,
        )
        if job_id:
            return
        logger.warning("Arq enqueue failed; running page generation in-process")

    schedule_background_task(
        _execute_generation(pool, gen_id, job_data, user_feedback=user_feedback)
    )


async def _execute_generation(
    pool: asyncpg.Pool,
    gen_id: UUID,
    job_data: dict[str, Any],
    *,
    user_feedback: str | None,
) -> None:
    try:
        result = await _run_claude_insert(job_data, user_feedback)
        status = "fallback" if result.get("used_fallback") else "generated"
        async with pool.acquire() as conn:
            await _update_generation(
                conn,
                gen_id,
                status=status,
                result_html=_sanitize_for_postgres(result["html"]),
                page_title=_sanitize_for_postgres(result["pageTitle"]),
                meta_description=_sanitize_for_postgres(result["metaDescription"]),
                error_message=_sanitize_for_postgres(result.get("fallback_reason"))
                if result.get("used_fallback")
                else None,
            )
    except Exception as exc:
        logger.error("Pipeline page generation failed: %s", exc)
        fallback = _sanitize_for_postgres(job_data.get("fallbackHtml", ""))
        async with pool.acquire() as conn:
            await _update_generation(
                conn,
                gen_id,
                status="failed",
                result_html=fallback or None,
                page_title=_sanitize_for_postgres(job_data.get("pageTitle")),
                meta_description=_sanitize_for_postgres(job_data.get("metaDescription")),
                error_message=_sanitize_for_postgres(str(exc)),
            )


def _serialize_generation(row: asyncpg.Record) -> dict[str, Any]:
    job_data = row["job_data"]
    if isinstance(job_data, str):
        job_data = json.loads(job_data)
    return {
        "id": str(row["id"]),
        "pipeline_run_id": str(row["pipeline_run_id"]),
        "status": row["status"],
        "regeneration_count": row["regeneration_count"],
        "html": row["result_html"],
        "page_title": row["page_title"],
        "meta_description": row["meta_description"],
        "slug": row["slug"],
        "full_url": row["full_url"],
        "approved": row["approved_at"] is not None,
        "deployed": row["deployed_at"] is not None,
        "wordpress_draft_url": row["wordpress_draft_url"],
        "error_message": row["error_message"],
        "h1": (job_data or {}).get("h1", ""),
        "verification": _verification_from_html(row["result_html"], job_data or {}),
        "redis_key": f"{POLL_KEY_PREFIX}:{row['pipeline_run_id']}",
    }


def _verification_from_html(html: str | None, job_data: dict[str, Any]) -> dict[str, Any]:
    text = html or ""
    h1 = job_data.get("h1", "")
    word_count = len(re.sub(r"<[^>]+>", " ", text).split()) if text else 0
    schema_type = "Article" if "schema.org" in text or "ld+json" in text else ""
    link_count = len(re.findall(r"<a\s", text, re.I))
    return {
        "h1_present": bool(h1 and h1.lower() in text.lower()),
        "h1": h1,
        "word_count": word_count,
        "schema_type": schema_type or ("missing" if not schema_type else schema_type),
        "internal_links": link_count,
        "meta_complete": "<title>" in text.lower() and 'name="description"' in text.lower(),
        "faq_present": "faq" in text.lower(),
        "cta_present": "cta" in text.lower() or "call to action" in text.lower(),
    }


async def get_pipeline_page_generation(
    pool: asyncpg.Pool,
    *,
    pipeline_run_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT g.* FROM pipeline_page_generations g
            JOIN pipeline_runs r ON r.id = g.pipeline_run_id
            WHERE g.pipeline_run_id = $1 AND r.user_id = $2
              AND r.pipeline_id = $3
            """,
            pipeline_run_id,
            user_id,
            FULL_CONTENT_PAGE_PIPELINE_ID,
        )
    if not row:
        raise not_found("No page generation found for this pipeline run")
    return _serialize_generation(row)


async def approve_pipeline_page(
    pool: asyncpg.Pool,
    *,
    pipeline_run_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT g.* FROM pipeline_page_generations g
            JOIN pipeline_runs r ON r.id = g.pipeline_run_id
            WHERE g.pipeline_run_id = $1 AND r.user_id = $2
              AND r.pipeline_id = $3
            """,
            pipeline_run_id,
            user_id,
            FULL_CONTENT_PAGE_PIPELINE_ID,
        )
        if not row:
            raise not_found("Page generation not found")
        if row["status"] not in ("generated", "fallback", "approved"):
            raise validation_error("Page is not ready for approval", [])
        await _update_generation(conn, row["id"], status="approved", approved_at=datetime.now(timezone.utc))
        row = await conn.fetchrow("SELECT * FROM pipeline_page_generations WHERE id = $1", row["id"])
    return _serialize_generation(row)


async def regenerate_pipeline_page(
    pool: asyncpg.Pool,
    *,
    pipeline_run_id: UUID,
    user_id: UUID,
    feedback: str,
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT g.* FROM pipeline_page_generations g
            JOIN pipeline_runs r ON r.id = g.pipeline_run_id
            WHERE g.pipeline_run_id = $1 AND r.user_id = $2
              AND r.pipeline_id = $3
            """,
            pipeline_run_id,
            user_id,
            FULL_CONTENT_PAGE_PIPELINE_ID,
        )
        if not row:
            raise not_found("Page generation not found")
        if row["regeneration_count"] >= MAX_REGENERATIONS:
            raise validation_error("Maximum regeneration attempts reached", [])

        job_data = row["job_data"]
        if isinstance(job_data, str):
            job_data = json.loads(job_data)

        await _update_generation(
            conn,
            row["id"],
            status="generating",
            regeneration_count=row["regeneration_count"] + 1,
            user_feedback=feedback,
            approved_at=None,
        )
        gen_id = row["id"]

    await _dispatch_page_generation(
        pool,
        gen_id=gen_id,
        job_data=job_data,
        user_feedback=feedback,
    )
    async with pool.acquire() as conn:
        updated = await conn.fetchrow("SELECT * FROM pipeline_page_generations WHERE id = $1", gen_id)
    return _serialize_generation(updated)


async def deploy_pipeline_page_to_wordpress(
    pool: asyncpg.Pool,
    *,
    pipeline_run_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    from app.db import integrations as db
    from app.db.integrations import decode_token, get_access_token

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT g.* FROM pipeline_page_generations g
            JOIN pipeline_runs r ON r.id = g.pipeline_run_id
            WHERE g.pipeline_run_id = $1 AND r.user_id = $2
              AND r.pipeline_id = $3
            """,
            pipeline_run_id,
            user_id,
            FULL_CONTENT_PAGE_PIPELINE_ID,
        )
        if not row:
            raise not_found("Page generation not found")
        if row["approved_at"] is None:
            raise validation_error("Approve the page before deploying", [])
        if not row["result_html"]:
            raise validation_error("No generated HTML to deploy", [])

        integration = await db.get_integration(conn, user_id, "WordPress")
        if not integration or integration["status"] != "connected":
            raise validation_error("WordPress is not connected", [])

        token = await get_access_token(conn, user_id, "WordPress")
        if not token:
            raise validation_error("WordPress credentials not found", [])

        username, app_password = decode_token(token)
        site_url = integration["site_url"].rstrip("/")
        auth = httpx.BasicAuth(username, app_password)

        slug = (row["slug"] or "/page").strip("/").split("/")[-1]
        payload = {
            "title": row["page_title"] or "Draft Page",
            "content": row["result_html"],
            "status": "draft",
            "slug": slug,
            "meta": {
                "_yoast_wpseo_title": row["page_title"] or "",
                "_yoast_wpseo_metadesc": row["meta_description"] or "",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(
                    f"{site_url}/wp-json/wp/v2/pages",
                    json=payload,
                    auth=auth,
                    headers={"Content-Type": "application/json"},
                )
                resp.raise_for_status()
                created = resp.json()
                draft_url = created.get("link", f"{site_url}/{slug}")
        except Exception as exc:
            raise validation_error(f"WordPress deploy failed: {exc}", []) from exc

        await _update_generation(
            conn,
            row["id"],
            status="deployed",
            deployed_at=datetime.now(timezone.utc),
            wordpress_draft_url=draft_url,
        )
        updated = await conn.fetchrow("SELECT * FROM pipeline_page_generations WHERE id = $1", row["id"])

    return _serialize_generation(updated)


async def trigger_page_generation_on_completion(
    pool: asyncpg.Pool,
    *,
    pipeline_run_id: UUID,
    pipeline_id: str,
    user_id: UUID,
) -> None:
    """Fire-and-forget page generation when Full Content Page Pipeline completes."""
    if pipeline_id != FULL_CONTENT_PAGE_PIPELINE_ID:
        return
    try:
        await start_pipeline_page_generation(
            pool,
            pipeline_run_id=pipeline_run_id,
            user_id=user_id,
        )
    except Exception as exc:
        logger.warning("Auto page generation trigger failed: %s", exc)
