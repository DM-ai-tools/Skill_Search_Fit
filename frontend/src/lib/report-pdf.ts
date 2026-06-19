import { displayPluginName } from "@/lib/plugin-catalog";
import { normalizeReportMarkdown } from "@/lib/report-normalizer";
import { stripFrontmatter } from "@/lib/report-text";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToPrintHtml(markdown: string): string {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const parts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      parts.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      parts.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeList();
      parts.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      parts.push(`<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      closeList();
      parts.push(`<p class="numbered">${escapeHtml(line)}</p>`);
    } else if (line.startsWith("|")) {
      closeList();
      parts.push(`<p class="table-row">${escapeHtml(line)}</p>`);
    } else {
      closeList();
      parts.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  closeList();
  return parts.join("\n");
}

export function downloadReportPdf(pluginName: string, markdown: string) {
  const title = displayPluginName(pluginName);
  const normalized = normalizeReportMarkdown({ markdown, structured: null }, pluginName);
  const content = markdownToPrintHtml(normalized);
  const generated = new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #111;
      line-height: 1.55;
      max-width: 780px;
      margin: 0 auto;
      padding: 40px 48px;
    }
    header {
      border-bottom: 2px solid #c9772e;
      margin-bottom: 28px;
      padding-bottom: 16px;
    }
    header h1 { font-size: 26px; margin: 0 0 6px; }
    header p { margin: 0; color: #555; font-size: 13px; font-family: system-ui, sans-serif; }
    h2 { font-size: 18px; margin: 28px 0 10px; color: #c9772e; page-break-after: avoid; }
    h3 { font-size: 15px; margin: 20px 0 8px; page-break-after: avoid; }
    p { margin: 0 0 10px; font-size: 13px; }
    ul { margin: 0 0 12px 20px; padding: 0; }
    li { margin-bottom: 6px; font-size: 13px; }
    .numbered { padding-left: 4px; }
    .table-row { font-family: monospace; font-size: 11px; color: #333; }
    @media print {
      body { padding: 24px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p>SkillSearchFit · Generated ${escapeHtml(generated)}</p>
  </header>
  <main>${content}</main>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}
