"""Pure payload generators — no network calls, fully unit-testable."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from typing import Any

from app.schemas.change_suggestions import ChangeResponse


def _slug(url: str) -> str:
    clean = re.sub(r"https?://[^/]+", "", url).strip("/")
    return re.sub(r"[^a-z0-9]+", "-", clean.lower()).strip("-") or "home"


def _effective(change: ChangeResponse) -> str:
    return change.edited_content if change.edited_content is not None else change.proposed_content


# ── HTML payload ───────────────────────────────────────────────────────────────

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publish Payload</title>
{meta_tags}
{schema_tags}
<style>
  *,*::before,*::after{{box-sizing:border-box}}
  body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:2rem;background:#f9fafb;color:#111}}
  article{{max-width:860px;margin:2rem auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:2rem}}
  article+article{{margin-top:2rem}}
  .page-slug{{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:1rem}}
  .field-group{{margin-bottom:1.5rem;padding-bottom:1.5rem;border-bottom:1px solid #f3f4f6}}
  .field-group:last-child{{border-bottom:none;margin-bottom:0;padding-bottom:0}}
  .field-label{{font-size:.8rem;font-weight:600;color:#374151;margin-bottom:.4rem}}
  .field-value{{font-size:.95rem;line-height:1.6;color:#111}}
  @media(max-width:600px){{body{{padding:1rem}}article{{padding:1rem}}}}
</style>
</head>
<body>
{articles}
</body>
</html>"""


def generate_html_payload(changes: list[ChangeResponse]) -> str:
    """
    Build a self-contained HTML file grouping approved changes by page.
    Metadata → <meta> in <head>; Schema → <script ld+json> in <head>;
    everything else → semantic article blocks.
    """
    by_page: dict[str, list[ChangeResponse]] = defaultdict(list)
    for c in changes:
        by_page[c.page_url].append(c)

    meta_tags: list[str] = []
    schema_tags: list[str] = []
    articles: list[str] = []

    for page_url, page_changes in by_page.items():
        slug = _slug(page_url)
        field_groups: list[str] = []

        for c in page_changes:
            content = _effective(c)

            if c.change_type == "metadata":
                label_lower = c.field_label.lower()
                if "title" in label_lower:
                    meta_tags.append(f'<title>{content}</title>')
                elif "description" in label_lower:
                    meta_tags.append(f'<meta name="description" content="{content}">')
                elif "canonical" in label_lower:
                    meta_tags.append(f'<link rel="canonical" href="{content}">')
                else:
                    meta_tags.append(f'<meta name="{c.field_label}" content="{content}">')
                field_groups.append(
                    f'<div class="field-group">'
                    f'<div class="field-label">{c.field_label}</div>'
                    f'<div class="field-value">{content}</div>'
                    f'</div>'
                )

            elif c.change_type == "schema":
                try:
                    parsed = json.loads(content)
                    formatted = json.dumps(parsed, indent=2)
                except (json.JSONDecodeError, ValueError):
                    formatted = content
                schema_tags.append(
                    f'<script type="application/ld+json">\n{formatted}\n</script>'
                )
                field_groups.append(
                    f'<div class="field-group">'
                    f'<div class="field-label">{c.field_label} (Schema)</div>'
                    f'<pre class="field-value" style="font-size:.8rem;overflow:auto">{formatted}</pre>'
                    f'</div>'
                )

            else:
                tag = "h1" if c.field_label.upper() in ("H1",) else \
                      "h2" if c.field_label.upper() in ("H2",) else \
                      "h3" if c.field_label.upper() in ("H3",) else "p"
                field_groups.append(
                    f'<div class="field-group">'
                    f'<div class="field-label">{c.field_label}</div>'
                    f'<{tag} class="field-value">{content}</{tag}>'
                    f'</div>'
                )

        articles.append(
            f'<article id="page-{slug}">'
            f'<div class="page-slug">{page_url}</div>'
            + "".join(field_groups)
            + "</article>"
        )

    return _HTML_TEMPLATE.format(
        meta_tags="\n".join(meta_tags),
        schema_tags="\n".join(schema_tags),
        articles="\n".join(articles),
    )


# ── Mailchimp payload ──────────────────────────────────────────────────────────

_EMAIL_BLOCK = """\
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">
  <tr>
    <td style="padding:24px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">{destination_label} · {change_type} · {priority}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#9ca3af">{page_url}</p>
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827">{field_label}</h2>
      <div style="background:#f9fafb;border-left:3px solid #e5e7eb;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#6b7280;line-height:1.5">
        <strong style="display:block;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:.04em">Current</strong>
        {current_state}
      </div>
      <div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:12px 16px;font-size:14px;color:#111827;line-height:1.5">
        <strong style="display:block;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#15803d">Proposed</strong>
        {proposed_content}
      </div>
    </td>
  </tr>
  <tr><td style="height:16px"></td></tr>
</table>"""


def generate_mailchimp_payload(changes: list[ChangeResponse]) -> dict[str, Any]:
    """
    Build a Mailchimp-ready payload dict with campaign metadata and an
    HTML email body composed of one table block per approved change.
    """
    if not changes:
        return {"html": "", "subject_line": "No approved changes", "preview_text": "", "blocks": []}

    blocks: list[dict[str, str]] = []
    html_parts: list[str] = []

    for c in changes:
        content = _effective(c)
        block_html = _EMAIL_BLOCK.format(
            destination_label=c.destination,
            change_type=c.change_type,
            priority=c.priority,
            page_url=c.page_url,
            field_label=c.field_label,
            current_state=c.current_state or "(none)",
            proposed_content=content,
        )
        html_parts.append(block_html)
        blocks.append({
            "change_id": str(c.id),
            "field_label": c.field_label,
            "page_url": c.page_url,
            "html": block_html,
        })

    subject_line = f"Content updates ready — {len(changes)} change(s)"
    preview_text = f"{changes[0].field_label} on {changes[0].page_url}" if changes else ""

    full_html = (
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head><body '
        'style="margin:0;padding:24px;background:#f3f4f6">'
        + "\n".join(html_parts)
        + "</body></html>"
    )

    return {
        "subject_line": subject_line,
        "preview_text": preview_text,
        "html": full_html,
        "blocks": blocks,
        "send_delay_hours": 0,
    }
