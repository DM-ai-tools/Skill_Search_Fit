import { displayPluginName } from "@/lib/plugin-catalog";
import { stripMarkdown } from "@/lib/report-text";
import { scoreLabel, type ReportBlock, type StructuredSection } from "@/lib/report-view-model";
import {
  formatReportDate,
  reportDisplayTitle,
  type PipelineStepReport,
  type ReportPdfDocument,
} from "@/lib/report-pdf-document";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clean(text: string): string {
  return esc(stripMarkdown(text));
}

function renderTable(rows: string[][]): string {
  if (!rows.length) return "";
  const [header, ...body] = rows;
  return `<table class="data-table">
    <thead><tr>${header.map((c) => `<th>${clean(c)}</th>`).join("")}</tr></thead>
    <tbody>${body
      .map(
        (row, i) =>
          `<tr class="${i % 2 ? "alt" : ""}">${row
            .map((c, j) => `<td class="${j === 0 ? "first" : ""}">${clean(c)}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function renderBlocks(blocks: ReportBlock[]): string {
  const parts: string[] = [];
  let bullets: string[] = [];
  let numbered: { index?: number; text: string }[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    parts.push(
      `<ul class="bullet-list">${bullets.map((t) => `<li><span class="dot"></span><span>${clean(t)}</span></li>`).join("")}</ul>`,
    );
    bullets = [];
  };
  const flushNumbered = () => {
    if (!numbered.length) return;
    parts.push(
      `<ol class="numbered-list">${numbered
        .map(
          (n) =>
            `<li><span class="num">${n.index ?? ""}</span><span>${clean(n.text)}</span></li>`,
        )
        .join("")}</ol>`,
    );
    numbered = [];
  };

  for (const block of blocks) {
    if (block.type === "bullet") {
      flushNumbered();
      bullets.push(block.text);
      continue;
    }
    if (block.type === "numbered") {
      flushBullets();
      numbered.push({ index: block.index, text: block.text });
      continue;
    }
    flushBullets();
    flushNumbered();
    if (block.type === "table" && block.rows?.length) {
      parts.push(renderTable(block.rows));
    } else if (block.text.trim()) {
      parts.push(`<p class="paragraph">${clean(block.text)}</p>`);
    }
  }
  flushBullets();
  flushNumbered();
  return parts.join("");
}

function renderSection(section: StructuredSection): string {
  const title = section.sectionNumber
    ? `${section.sectionNumber}. ${section.title}`
    : section.title;
  const badge =
    section.sectionNumber != null
      ? `<span class="section-badge">${section.sectionNumber}</span>`
      : "";
  return `<section class="report-section avoid-break">
    <header class="section-header">${badge}<h2>${clean(title.replace(/^\d+\.\s*/, ""))}</h2></header>
    <div class="section-body">${renderBlocks(section.blocks)}</div>
  </section>`;
}

function renderPipelineBanner(step: PipelineStepReport): string {
  const score =
    step.overallScore != null
      ? `<div class="step-score"><span class="score-val">${step.overallScore}</span><span class="score-of">/100</span></div>`
      : "";
  return `<div class="pipeline-banner page-break">
    <p class="step-kicker">Step ${step.step}</p>
    <h2>${clean(step.label)}</h2>
    <p class="step-plugin">${clean(displayPluginName(step.pluginName))}</p>
    ${score}
  </div>`;
}

const PDF_CSS = `
  @page { size: A4; margin: 14mm 14mm 18mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: "Segoe UI", Calibri, Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.55;
    color: #0f121c; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cover {
    min-height: 250mm; display: flex; flex-direction: column;
    page-break-after: always;
  }
  .cover-band {
    background: linear-gradient(135deg, #e08a3c 0%, #c9772e 100%);
    color: #fff; padding: 28px 0 22px; margin: -14mm -14mm 0;
    padding-left: 14mm; padding-right: 14mm;
  }
  .cover-band-top { display: flex; justify-content: space-between; align-items: center; }
  .brand { font-weight: 700; letter-spacing: 0.14em; font-size: 11pt; }
  .brand-sub { font-size: 8pt; opacity: 0.9; margin-top: 4px; letter-spacing: 0.08em; }
  .confidential {
    font-size: 7pt; font-weight: 700; letter-spacing: 0.1em;
    background: #fff; color: #c9772e; padding: 5px 12px; border-radius: 4px;
  }
  .cover-body { padding: 36px 0 24px; flex: 1; }
  .cover-kicker {
    color: #e08a3c; font-weight: 700; font-size: 9pt;
    letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 16px;
  }
  .cover-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 32pt; font-weight: 700; line-height: 1.15;
    margin: 0 0 12px; max-width: 85%;
  }
  .cover-subtitle { color: #5c6370; font-size: 12pt; margin: 0 0 28px; }
  .cover-meta-row {
    display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap;
  }
  .meta-card {
    flex: 1; min-width: 260px; border: 1px solid #e1dbd3;
    border-radius: 8px; padding: 16px 18px; background: #fff;
  }
  .meta-row {
    display: grid; grid-template-columns: 88px 1fr; gap: 8px;
    padding: 7px 0; border-bottom: 1px solid #f0ebe4; font-size: 10pt;
  }
  .meta-row:last-child { border-bottom: none; }
  .meta-label { color: #5c6370; font-weight: 700; font-size: 8pt; text-transform: uppercase; }
  .meta-value { word-break: break-word; }
  .score-card {
    width: 120px; border: 2px solid #e08a3c; border-radius: 10px;
    text-align: center; padding: 14px 10px; background: #fff;
  }
  .score-ring {
    width: 72px; height: 72px; margin: 0 auto 10px; border-radius: 50%;
    background: #e08a3c; color: #fff; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
  }
  .score-ring .val { font-size: 26pt; font-weight: 700; line-height: 1; }
  .score-ring .of { font-size: 9pt; opacity: 0.9; }
  .score-tier { font-size: 8pt; font-weight: 700; color: #c9772e; text-transform: uppercase; }
  .cover-footer {
    border-top: 2px solid #e08a3c; padding-top: 14px; margin-top: auto;
    display: flex; justify-content: space-between; font-size: 8pt; color: #8c92a0;
  }
  .callout {
    border: 1px solid #ecd9c8; border-left: 5px solid #e08a3c;
    background: #fdf8f3; border-radius: 0 8px 8px 0;
    padding: 16px 18px; margin-bottom: 20px;
  }
  .callout.muted { background: #f7f7f7; border-left-color: #bbb; border-color: #e0e0e0; }
  .callout h3 {
    margin: 0 0 10px; font-size: 9pt; letter-spacing: 0.08em;
    text-transform: uppercase; color: #c9772e;
  }
  .callout p { margin: 0; font-family: Georgia, serif; font-size: 10.5pt; }
  .takeaway {
    display: flex; gap: 12px; align-items: flex-start;
    background: #f7f3ec; border: 1px solid #e8e0d4; border-radius: 8px;
    padding: 12px 14px; margin-bottom: 8px;
  }
  .takeaway .dot {
    width: 8px; height: 8px; border-radius: 50%; background: #e08a3c;
    margin-top: 6px; flex-shrink: 0;
  }
  .toc {
    border: 1px solid #e8e0d4; border-radius: 8px; padding: 14px 16px;
    margin-bottom: 22px; background: #fcfaf7;
  }
  .toc h3 { margin: 0 0 10px; font-size: 9pt; text-transform: uppercase; color: #5c6370; letter-spacing: 0.08em; }
  .toc ol { margin: 0; padding-left: 20px; }
  .toc li { margin-bottom: 5px; font-size: 10pt; }
  .report-section { margin-bottom: 22px; }
  .section-header {
    display: flex; align-items: center; gap: 12px;
    background: #f1ece4; border: 1px solid #e1dbd3; border-left: 5px solid #e08a3c;
    border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;
  }
  .section-badge {
    width: 28px; height: 28px; border-radius: 50%; background: #e08a3c; color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 9pt; font-weight: 700; flex-shrink: 0;
  }
  .section-header h2 { margin: 0; font-size: 14pt; font-weight: 700; }
  .paragraph {
    margin: 0 0 12px; text-align: justify;
    font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt;
  }
  .bullet-list, .numbered-list { list-style: none; margin: 0 0 12px; padding: 0; }
  .bullet-list li, .numbered-list li {
    display: flex; gap: 10px; align-items: flex-start;
    background: #fff; border: 1px solid #ebe5dc; border-radius: 8px;
    padding: 10px 12px; margin-bottom: 7px;
  }
  .numbered-list li { background: #f7f3ec; }
  .bullet-list .dot {
    width: 7px; height: 7px; border-radius: 50%; background: #e08a3c;
    margin-top: 7px; flex-shrink: 0;
  }
  .numbered-list .num {
    width: 22px; height: 22px; border-radius: 50%; background: #e08a3c; color: #fff;
    font-size: 8pt; font-weight: 700; display: inline-flex; align-items: center;
    justify-content: center; flex-shrink: 0; margin-top: 2px;
  }
  .data-table {
    width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9pt;
  }
  .data-table th {
    background: #fcf4eb; color: #5c3d1e; font-size: 8pt; text-transform: uppercase;
    letter-spacing: 0.04em; text-align: left; padding: 9px 10px;
    border: 1px solid #e1dbd3;
  }
  .data-table td {
    padding: 8px 10px; border: 1px solid #e8e0d4; vertical-align: top;
  }
  .data-table td.first { font-weight: 600; }
  .data-table tr.alt td { background: #faf8f5; }
  .pipeline-banner {
    background: linear-gradient(135deg, #fdf3ea, #fff);
    border: 1px solid #ecd9c8; border-left: 6px solid #e08a3c;
    border-radius: 0 10px 10px 0; padding: 16px 18px; margin-bottom: 20px;
    position: relative;
  }
  .step-kicker {
    margin: 0; font-size: 8pt; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: #e08a3c;
  }
  .pipeline-banner h2 { margin: 6px 0 4px; font-size: 16pt; }
  .step-plugin { margin: 0; color: #5c6370; font-size: 10pt; }
  .step-score {
    position: absolute; right: 18px; top: 50%; transform: translateY(-50%);
    width: 56px; height: 56px; border-radius: 50%; background: #fff;
    border: 2px solid #e08a3c; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
  }
  .step-score .score-val { font-size: 14pt; font-weight: 700; color: #c9772e; line-height: 1; }
  .step-score .score-of { font-size: 7pt; color: #8c92a0; }
  .page-break { page-break-before: always; }
  .avoid-break { page-break-inside: avoid; }
  h3.block-title { font-size: 12pt; margin: 18px 0 10px; }
`;

export function buildReportPdfHtml(doc: ReportPdfDocument): string {
  const title = reportDisplayTitle(doc);
  const isPipeline = Boolean(doc.pipelineSteps?.length);

  const metaRows: [string, string][] = [];
  if (doc.siteUrl) metaRows.push(["Website", doc.siteUrl]);
  metaRows.push(["Generated", formatReportDate(doc.generatedAt)]);
  if (doc.executionId) metaRows.push(["Report ID", doc.executionId]);
  if (doc.status) metaRows.push(["Status", doc.status]);

  const scoreHtml =
    doc.overallScore != null
      ? `<div class="score-card">
          <div class="score-ring">
            <span class="val">${doc.overallScore}</span>
            <span class="of">/100</span>
          </div>
          <p class="score-tier">${clean(scoreLabel(doc.overallScore))}</p>
        </div>`
      : "";

  const summaryHtml = doc.executiveSummary?.trim()
    ? `<div class="callout avoid-break"><h3>Executive summary</h3><p>${clean(doc.executiveSummary)}</p></div>`
    : "";

  const takeawaysHtml = doc.keyTakeaways?.length
    ? `<div class="avoid-break"><h3 class="block-title">Key takeaways</h3>${doc.keyTakeaways
        .map((t) => `<div class="takeaway"><span class="dot"></span><span>${clean(t)}</span></div>`)
        .join("")}</div>`
    : "";

  const tocItems = isPipeline
    ? (doc.pipelineSteps ?? []).flatMap((step) =>
        step.structuredSections.map(
          (s) =>
            `Step ${step.step}: ${step.label} — ${s.sectionNumber ? `${s.sectionNumber}. ` : ""}${s.title}`,
        ),
      )
    : doc.sections.map((s) => `${s.sectionNumber ? `${s.sectionNumber}. ` : ""}${s.title}`);

  const tocHtml =
    tocItems.length > 1
      ? `<div class="toc avoid-break"><h3>Contents</h3><ol>${tocItems
          .map((item) => `<li>${clean(item)}</li>`)
          .join("")}</ol></div>`
      : "";

  const bodySections = isPipeline
    ? (doc.pipelineSteps ?? [])
        .map(
          (step) =>
            `${renderPipelineBanner(step)}${step.structuredSections.map((s) => renderSection(s)).join("")}`,
        )
        .join("")
    : doc.sections.map((s) => renderSection(s)).join("");

  const suggestionsHtml = doc.suggestions?.length
    ? `<section class="avoid-break"><div class="section-header"><h2>Recommended next steps</h2></div>${doc.suggestions
        .map((s) => `<div class="takeaway"><span class="dot"></span><span>${clean(s)}</span></div>`)
        .join("")}</section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <title>${clean(title)} — SkillSearchFit</title>
  <style>${PDF_CSS}</style>
</head>
<body>
  <div class="cover">
    <div class="cover-band">
      <div class="cover-band-top">
        <div>
          <div class="brand">SKILLSEARCHFIT</div>
          <div class="brand-sub">SEO INTELLIGENCE PLATFORM</div>
        </div>
        <span class="confidential">CONFIDENTIAL</span>
      </div>
    </div>
    <div class="cover-body">
      <p class="cover-kicker">SEO Intelligence Report</p>
      <h1 class="cover-title">${clean(title)}</h1>
      <p class="cover-subtitle">Prepared by SkillSearchFit AI · ${clean(
        isPipeline ? "Pipeline analysis" : displayPluginName(doc.pluginName),
      )}</p>
      <div class="cover-meta-row">
        <div class="meta-card">
          ${metaRows
            .map(
              ([label, value]) =>
                `<div class="meta-row"><span class="meta-label">${clean(label)}</span><span class="meta-value">${clean(value)}</span></div>`,
            )
            .join("")}
        </div>
        ${scoreHtml}
      </div>
    </div>
    <div class="cover-footer">
      <span>AI-generated analysis for internal use</span>
      <span>${clean(formatReportDate(doc.generatedAt))}</span>
    </div>
  </div>
  <main>
    ${summaryHtml}
    ${takeawaysHtml}
    ${tocHtml}
    ${bodySections}
    ${suggestionsHtml}
  </main>
</body>
</html>`;
}
