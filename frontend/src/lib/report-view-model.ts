import { displayPluginName } from "@/lib/plugin-catalog";
import { parseMarkdownSections } from "@/lib/plugin-report-presenters";
import {
  cleanReportLine,
  isTableSeparator,
  parseTableRow,
  stripFrontmatter,
  stripMarkdown,
} from "@/lib/report-text";

export type ReportBlockType = "paragraph" | "bullet" | "numbered" | "table";
export type ReportBlock = {
  type: ReportBlockType;
  text: string;
  index?: number;
  rows?: string[][];
};
export type ReportSectionJson = { title: string; level: number; blocks: ReportBlock[] };
export type PluginReportJson = {
  plugin_name: string;
  execution_id: string;
  status: string;
  generated_at: string;
  sections: ReportSectionJson[];
};

export type ReportMetric = {
  total_sections: number;
  total_bullets: number;
  total_numbered: number;
  total_paragraphs: number;
};

export type StructuredSection = {
  id: string;
  title: string;
  level: number;
  blocks: ReportBlock[];
  isNumbered: boolean;
  sectionNumber?: number;
};

export type PipelineStepReport = {
  step: number;
  label: string;
  pluginName: string;
  executionId: string;
  pluginId: string;
  markdown: string;
  reportJson: PluginReportJson;
  structuredSections: StructuredSection[];
  overallScore: number | null;
};

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

export function parseBlocksFromBody(body: string): ReportBlock[] {
  const normalizedBody = looksLikeHtmlDocument(body) ? htmlToReadableText(body) : body;
  const lines = normalizedBody.split(/\r?\n/);
  const blocks: ReportBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const fenceLang = line.replace(/^```/, "").trim().toLowerCase();
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      const codeBody = codeLines.join("\n").trim();
      if (codeBody) {
        if (fenceLang === "html" || looksLikeHtmlDocument(codeBody)) {
          const converted = htmlToReadableText(codeBody);
          if (converted) {
            blocks.push(...parseBlocksFromBody(converted));
          }
        } else {
          blocks.push({ type: "paragraph", text: codeBody });
        }
      }
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      const text = cleanReportLine(line.replace(/^#{1,6}\s+/, ""));
      if (text) blocks.push({ type: "paragraph", text });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const text = cleanReportLine(line.replace(/^>\s?/, ""));
      if (text) blocks.push({ type: "paragraph", text });
      i += 1;
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const current = lines[i].trim();
        if (!isTableSeparator(current)) {
          const row = parseTableRow(current).filter((cell) => cell.length > 0);
          if (row.some((cell) => cell.length > 0)) rows.push(row);
        }
        i += 1;
      }
      if (rows.length > 0) {
        blocks.push({ type: "table", text: "table", rows });
        continue;
      }
    }

    if (/^[-*]\s+/.test(line)) {
      const text = cleanReportLine(line.replace(/^[-*]\s+/, ""));
      if (text) blocks.push({ type: "bullet", text });
    } else if (/^\d+\.\s+/.test(line)) {
      const number = Number(line.match(/^(\d+)\./)?.[1] || blocks.length + 1);
      const text = cleanReportLine(line.replace(/^\d+\.\s+/, ""));
      if (text) blocks.push({ type: "numbered", text, index: number });
    } else {
      const text = cleanReportLine(line);
      if (text) blocks.push({ type: "paragraph", text });
    }
    i += 1;
  }

  return blocks;
}

/** Estimate how much of the source markdown made it into structured blocks. */
export function estimateParsedCoverage(markdown: string, sections: StructuredSection[]): number {
  const sourceLen = stripFrontmatter(markdown).replace(/\s+/g, "").length;
  if (sourceLen === 0) return 1;
  let parsedLen = 0;
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.type === "table" && block.rows) {
        parsedLen += block.rows.flat().join("").replace(/\s+/g, "").length;
      } else {
        parsedLen += block.text.replace(/\s+/g, "").length;
      }
    }
  }
  return Math.min(1, parsedLen / sourceLen);
}

export function fallbackSectionsFromMarkdown(
  markdown: string,
  existing: StructuredSection[],
): StructuredSection[] {
  const coverage = estimateParsedCoverage(markdown, existing);
  if (coverage >= 0.82) return [];

  const cleaned = stripFrontmatter(markdown).trim();
  if (!cleaned) return [];

  return [
    {
      id: "fallback-full-report",
      title: "Additional Report Content",
      level: 2,
      blocks: cleaned
        .split(/\n{2,}/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0)
        .map((chunk) => ({ type: "paragraph" as const, text: stripMarkdown(chunk) })),
      isNumbered: false,
    },
  ];
}

export function buildReportJson(
  pluginName: string,
  executionId: string,
  status: string,
  markdown: string,
): PluginReportJson {
  const cleaned = stripFrontmatter(markdown);
  const parsed = parseMarkdownSections(cleaned);
  const sections =
    parsed.length > 0
      ? parsed.map((s) => ({ title: s.title, level: s.level, blocks: parseBlocksFromBody(s.body) }))
      : [{ title: "Report", level: 2, blocks: parseBlocksFromBody(cleaned) }];
  return {
    plugin_name: displayPluginName(pluginName),
    execution_id: executionId,
    status,
    generated_at: new Date().toISOString(),
    sections,
  };
}

export function summarizeMetrics(report: PluginReportJson): ReportMetric {
  let totalBullets = 0;
  let totalNumbered = 0;
  let totalParagraphs = 0;
  for (const section of report.sections) {
    for (const block of section.blocks) {
      if (block.type === "bullet") totalBullets += 1;
      else if (block.type === "numbered") totalNumbered += 1;
      else if (block.type === "paragraph") totalParagraphs += 1;
    }
  }
  return {
    total_sections: report.sections.length,
    total_bullets: totalBullets,
    total_numbered: totalNumbered,
    total_paragraphs: totalParagraphs,
  };
}

export function mergeMetrics(reports: PluginReportJson[]): ReportMetric {
  return reports.reduce(
    (acc, report) => {
      const m = summarizeMetrics(report);
      return {
        total_sections: acc.total_sections + m.total_sections,
        total_bullets: acc.total_bullets + m.total_bullets,
        total_numbered: acc.total_numbered + m.total_numbered,
        total_paragraphs: acc.total_paragraphs + m.total_paragraphs,
      };
    },
    { total_sections: 0, total_bullets: 0, total_numbered: 0, total_paragraphs: 0 },
  );
}

export function toStructuredSections(report: PluginReportJson): StructuredSection[] {
  return report.sections
    .map((section, idx) => {
      const m = section.title.match(/^(\d+)\.\s+(.+)$/);
      const blocks = section.blocks.filter(
        (b) => b.type !== "paragraph" || b.text.length > 0,
      );
      if (blocks.length === 0) return null;
      return {
        id: `section-${idx}`,
        title: stripMarkdown(m?.[2] || section.title),
        level: section.level,
        blocks,
        isNumbered: Boolean(m),
        sectionNumber: m ? Number(m[1]) : undefined,
      };
    })
    .filter((s) => s !== null) as StructuredSection[];
}

function parseScoreValue(raw: string): number | null {
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0 || n > 100) return null;
  return n;
}

function parseScoreFromText(text: string): number | null {
  const cleaned = stripMarkdown(text);
  const overallPatterns = [
    /overall\s+score[^0-9]{0,24}(\d{1,3})\s*(?:\/\s*100|out\s+of\s+100)?/i,
    /(?:site|seo|visibility|audit|technical)\s+score[^0-9]{0,16}(\d{1,3})\s*(?:\/\s*100|out\s+of\s+100)?/i,
    /^score[:\s]+(\d{1,3})\s*(?:\/\s*100|out\s+of\s*100)?/i,
  ];
  for (const pattern of overallPatterns) {
    const m = cleaned.match(pattern);
    if (m) {
      const score = parseScoreValue(m[1]);
      if (score !== null) return score;
    }
  }
  if (/score|overall|rating|visibility/i.test(cleaned)) {
    const slash = cleaned.match(/(\d{1,3})\s*\/\s*100/);
    if (slash) {
      const score = parseScoreValue(slash[1]);
      if (score !== null) return score;
    }
  }
  return null;
}

export function extractOverallScore(
  report: PluginReportJson,
  markdown?: string,
  structured?: Record<string, unknown> | null,
): number | null {
  const structuredScore = structured?.overall_score ?? structured?.score;
  if (typeof structuredScore === "number") {
    const score = parseScoreValue(String(structuredScore));
    if (score !== null) return score;
  }

  for (const section of report.sections) {
    for (const block of section.blocks) {
      if (block.type === "table" && block.rows) {
        for (const row of block.rows) {
          const rowText = row.join(" ");
          if (/overall|total\s+score|^score$/i.test(rowText)) {
            for (const cell of row) {
              const fromCell = parseScoreFromText(cell);
              if (fromCell !== null) return fromCell;
            }
          }
          const fromRow = parseScoreFromText(rowText);
          if (fromRow !== null) return fromRow;
        }
        continue;
      }
      const fromBlock = parseScoreFromText(block.text);
      if (fromBlock !== null) return fromBlock;
    }
  }

  if (markdown) {
    const header = stripFrontmatter(markdown).slice(0, 2500);
    const fromMarkdown = parseScoreFromText(header);
    if (fromMarkdown !== null) return fromMarkdown;
  }

  return null;
}

export function scoreLabel(score: number | null): string {
  if (score == null) return "Pending";
  if (score < 34) return "Low Visibility";
  if (score < 67) return "Moderate Visibility";
  return "Strong Visibility";
}

export function executiveSummaryFromReport(report: PluginReportJson): string {
  for (const section of report.sections) {
    const firstParagraph = section.blocks.find((b) => b.type === "paragraph" && b.text.length > 30);
    if (firstParagraph) return firstParagraph.text;
  }
  return report.sections[0]?.blocks[0]?.text || "No summary available.";
}

export function keyTakeawaysFromSections(sections: StructuredSection[]): string[] {
  const section = sections.find((s) => /takeaways|summary|insights/i.test(s.title));
  if (!section) return [];
  return section.blocks
    .filter((b) => b.type === "bullet" || b.type === "numbered" || b.type === "paragraph")
    .map((b) => b.text)
    .filter((t) => t.length > 20)
    .slice(0, 4);
}
