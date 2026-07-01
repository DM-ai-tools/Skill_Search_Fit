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

