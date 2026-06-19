/**
 * Converts raw plugin execution output (markdown, JSON blobs, structured fields)
 * into display-ready markdown for the report UI, workspace, and PDF export.
 */

export type ReportOutputLike = {
  markdown?: string;
  structured?: Record<string, unknown> | null;
} | null | undefined;

const METADATA_KEYS = new Set([
  "preview",
  "ai_mode",
  "model",
  "plugin",
  "usage",
  "execution_id",
  "template",
  "claude_error",
  "claude_model",
  "models_tried",
]);

const REPORT_STRING_KEYS = [
  "report",
  "content",
  "body",
  "text",
  "analysis",
  "summary",
  "markdown",
  "narrative",
  "output",
];

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return String(value);
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function looksLikeJsonDocument(text: string): boolean {
  const t = text.trim();
  return (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOfObjectsToMarkdown(title: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]).filter((k) => rows.some((r) => r[k] != null && r[k] !== ""));
  if (keys.length === 0) return "";

  const header = `| ${keys.map(humanizeKey).join(" | ")} |`;
  const sep = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => {
    const cells = keys.map((k) => formatScalar(row[k]).replace(/\|/g, "\\|").replace(/\n/g, " "));
    return `| ${cells.join(" | ")} |`;
  });

  return [`## ${title}`, "", header, sep, ...body, ""].join("\n");
}

function jsonValueToMarkdown(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (looksLikeJsonDocument(trimmed)) {
      const parsed = tryParseJson(trimmed);
      if (parsed) return jsonValueToMarkdown(parsed, depth);
    }
    if (trimmed.includes("\n")) {
      return trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `- ${line}`)
        .join("\n");
    }
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return formatScalar(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return value.map((item) => `- ${formatScalar(item)}`).join("\n");
    }
    if (value.every(isPlainObject)) {
      return arrayOfObjectsToMarkdown("Details", value as Record<string, unknown>[]);
    }
    return value.map((item, i) => `### Item ${i + 1}\n\n${jsonValueToMarkdown(item, depth + 1)}`).join("\n\n");
  }
  if (isPlainObject(value)) {
    return jsonObjectToMarkdown(value, depth);
  }
  return String(value);
}

function jsonObjectToMarkdown(obj: Record<string, unknown>, depth = 0): string {
  const lines: string[] = [];
  const heading = depth === 0 ? "##" : "###";

  for (const [key, value] of Object.entries(obj)) {
    if (METADATA_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;

    const label = humanizeKey(key);

    if (typeof value === "string" && !value.includes("\n") && value.length < 120) {
      lines.push(`**${label}:** ${value.trim()}`);
      continue;
    }

    if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number")) {
      lines.push(`${heading} ${label}`, "");
      for (const item of value) {
        lines.push(`- ${formatScalar(item)}`);
      }
      lines.push("");
      continue;
    }

    if (Array.isArray(value) && value.every(isPlainObject)) {
      lines.push(arrayOfObjectsToMarkdown(label, value as Record<string, unknown>[]));
      continue;
    }

    if (isPlainObject(value)) {
      lines.push(`${heading} ${label}`, "", jsonObjectToMarkdown(value, depth + 1), "");
      continue;
    }

    const rendered = jsonValueToMarkdown(value, depth + 1);
    if (!rendered) continue;

    if (rendered.includes("\n")) {
      lines.push(`${heading} ${label}`, "", rendered, "");
    } else {
      lines.push(`**${label}:** ${rendered}`);
    }
  }

  return lines.join("\n").trim();
}

function expandCodeBlocks(markdown: string): string {
  return markdown.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_match, lang: string, body: string) => {
    const trimmed = body.trim();
    const language = (lang || "").toLowerCase();
    if (language === "html" || looksLikeHtmlDocument(trimmed)) {
      const converted = htmlToReadableText(trimmed);
      return converted ? `\n\n${converted}\n\n` : `\n\n${trimmed}\n\n`;
    }
    const parsed = tryParseJson(trimmed);
    if (parsed !== null) {
      const converted = jsonValueToMarkdown(parsed);
      return converted ? `\n\n${converted}\n\n` : `\n\n${trimmed}\n\n`;
    }
    return `\n\n${trimmed}\n\n`;
  });
}

function looksLikeHtmlDocument(text: string): boolean {
  return /<(?:html|body|div|table|thead|tbody|tr|td|th|h[1-6]|p|ul|ol|li|section|article|br)\b/i.test(
    text,
  );
}

function htmlToReadableText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function structuredSectionsToMarkdown(sections: unknown): string | null {
  if (!Array.isArray(sections) || sections.length === 0) return null;

  const parts: string[] = [];
  for (const section of sections) {
    if (!isPlainObject(section)) continue;
    const title = typeof section.title === "string" ? section.title.trim() : "";
    const body =
      typeof section.body === "string"
        ? section.body
        : typeof section.content === "string"
          ? section.content
          : typeof section.text === "string"
            ? section.text
            : "";

    if (title) parts.push(`## ${title}`);
    if (body.trim()) parts.push(body.trim());
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

function structuredToMarkdown(structured: Record<string, unknown>, pluginName?: string): string {
  for (const key of REPORT_STRING_KEYS) {
    const val = structured[key];
    if (typeof val === "string" && val.trim().length > 0) {
      const text = val.trim();
      if (looksLikeHtmlDocument(text)) {
        return normalizeReportMarkdown({ markdown: htmlToReadableText(text), structured: null });
      }
      return normalizeReportMarkdown({ markdown: text, structured: null });
    }
  }

  const fromSections = structuredSectionsToMarkdown(structured.sections);
  if (fromSections) return fromSections;

  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(structured)) {
    if (!METADATA_KEYS.has(key)) content[key] = value;
  }

  if (Object.keys(content).length === 0) return "";

  const title = pluginName ? `## ${pluginName}\n\n` : "";
  return `${title}${jsonObjectToMarkdown(content)}`.trim();
}

function previewNotice(structured?: Record<string, unknown> | null): string {
  if (!structured?.preview) return "";
  if (structured.ai_mode === "claude") return "";
  return (
    "> **Preview mode** — Add `ANTHROPIC_API_KEY` to your backend `.env` for full AI-generated reports.\n\n"
  );
}

/**
 * Normalize any plugin execution output into readable markdown.
 */
export function normalizeReportMarkdown(
  output: ReportOutputLike,
  pluginName?: string,
): string {
  if (!output) return "";

  let markdown = typeof output.markdown === "string" ? output.markdown.trim() : "";
  const structured = output.structured ?? null;

  if (!markdown && structured) {
    markdown = structuredToMarkdown(structured, pluginName);
  }

  if (markdown && looksLikeHtmlDocument(markdown)) {
    markdown = htmlToReadableText(markdown);
  }

  if (markdown && looksLikeJsonDocument(markdown)) {
    const parsed = tryParseJson(markdown);
    if (parsed !== null) {
      markdown = jsonValueToMarkdown(parsed);
    }
  }

  if (markdown) {
    markdown = expandCodeBlocks(markdown);
  }

  if ((!markdown || markdown.length < 40) && structured) {
    const fromStructured = structuredToMarkdown(structured, pluginName);
    if (fromStructured.length > markdown.length) {
      markdown = fromStructured;
    }
  }

  const notice = previewNotice(structured);
  if (notice && markdown && !/preview mode/i.test(markdown.slice(0, 400))) {
    markdown = notice + markdown;
  }

  const tail = markdown.trim().slice(-120);
  if (
    markdown &&
    (/\|\s*[^\n|]*$/.test(tail) || /```[^\n]*$/.test(tail)) &&
    !/report may have been cut off/i.test(markdown)
  ) {
    markdown +=
      "\n\n> **Note:** This report may have been cut off before completion. Re-run the analysis to generate the full report.\n";
  }

  return markdown.trim();
}

/** Strip lines that are only JSON syntax debris after partial streaming. */
export function normalizeStreamLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed === "{" || trimmed === "}" || trimmed === "[" || trimmed === "]") return "";
  if (/^"[\w_]+"\s*:\s*/.test(trimmed) && trimmed.endsWith(",")) {
    const withoutKey = trimmed.replace(/^"[\w_]+"\s*:\s*/, "").replace(/,\s*$/, "");
    return withoutKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim();
  }
  return trimmed;
}
