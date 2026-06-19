"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileDown, Save } from "lucide-react";
import { api } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { changeSuggestionsApi } from "@/lib/change-suggestions-api";
import { formatApiError } from "@/lib/format-api-error";
import { downloadReportPdf } from "@/lib/report-pdf";
import { getExecutionMarkdown } from "@/lib/report-utils";
import { parseMarkdownSections, pluginSuggestions } from "@/lib/plugin-report-presenters";
import { fallbackSectionsFromMarkdown } from "@/lib/report-view-model";
import { useProjectStore } from "@/stores/project-store";
import {
  cleanReportLine,
  isTableSeparator,
  parseTableRow,
  stripFrontmatter,
  stripMarkdown,
} from "@/lib/report-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChangeSuggestionsPanel } from "@/components/change-suggestions/change-suggestions-panel";

type ExecutionRecord = {
  id: string;
  plugin_id: string;
  project_id?: string | null;
  status: string;
  inputs?: Record<string, unknown>;
  schema_version?: number;
  result: { markdown?: string; structured?: Record<string, unknown> } | null;
  error_message?: string | null;
};
type PluginLite = { id: string; plugin_name: string };
type ReportBlockType = "paragraph" | "bullet" | "numbered" | "table";
type ReportBlock = { type: ReportBlockType; text: string; index?: number; rows?: string[][] };
type ReportSectionJson = { title: string; level: number; blocks: ReportBlock[] };
type PluginReportJson = {
  plugin_name: string;
  execution_id: string;
  status: string;
  generated_at: string;
  sections: ReportSectionJson[];
};

type ReportMetric = {
  total_sections: number;
  total_bullets: number;
  total_numbered: number;
  total_paragraphs: number;
};

type StructuredSection = {
  id: string;
  title: string;
  level: number;
  blocks: ReportBlock[];
  isNumbered: boolean;
  sectionNumber?: number;
};

function parseBlocksFromBody(body: string): ReportBlock[] {
  const lines = body.split(/\r?\n/);
  const blocks: ReportBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        i += 1;
      }
      if (i < lines.length) i += 1;
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

function buildReportJson(
  pluginName: string,
  execution: ExecutionRecord,
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
    execution_id: execution.id,
    status: execution.status,
    generated_at: new Date().toISOString(),
    sections,
  };
}

function summarizeMetrics(report: PluginReportJson): ReportMetric {
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

function toStructuredSections(report: PluginReportJson): StructuredSection[] {
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
    /^score[:\s]+(\d{1,3})\s*(?:\/\s*100|out\s+of\s+100)?/i,
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

function extractOverallScore(
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

function scoreLabel(score: number | null): string {
  if (score == null) return "Pending";
  if (score < 34) return "Low Visibility";
  if (score < 67) return "Moderate Visibility";
  return "Strong Visibility";
}

function renderTable(rows: string[][]) {
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  return (
    <div className="report-table-wrap surface-nested overflow-x-auto rounded-xl border border-border-strong bg-surface shadow-[inset_0_1px_0_rgba(244,241,236,0.06)]">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-primary/25 bg-primary/12">
            {header.map((cell, i) => (
              <th
                key={`${cell}-${i}`}
                className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIdx) => (
            <tr
              key={`row-${rowIdx}`}
              className={cn(
                "border-b border-border/50 last:border-0 transition-colors hover:bg-primary/6",
                rowIdx % 2 === 0 ? "bg-surface-elevated/80" : "bg-surface/60",
              )}
            >
              {row.map((cell, cellIdx) => (
                <td
                  key={`${rowIdx}-${cellIdx}`}
                  className={cn(
                    "px-4 py-3.5 align-top text-[14px] leading-relaxed",
                    cellIdx === 0 ? "font-medium text-foreground" : "text-foreground/85",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderBlocks(blocks: ReportBlock[]) {
  return blocks.map((block, idx) => {
    if (block.type === "table" && block.rows) {
      return <div key={`table-${idx}`} className="my-1">{renderTable(block.rows)}</div>;
    }
    if (block.type === "bullet") {
      return (
        <div
          key={`${block.type}-${idx}`}
          className="surface-nested flex items-start gap-3 rounded-lg border border-border-strong bg-surface-elevated/90 px-4 py-3"
        >
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <p className="text-[15px] leading-relaxed text-foreground">{block.text}</p>
        </div>
      );
    }
    if (block.type === "numbered") {
      return (
        <div
          key={`${block.type}-${idx}`}
          className="surface-nested flex items-start gap-3 rounded-lg border border-border-strong bg-surface px-4 py-3"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/18 text-xs font-bold tabular-nums text-primary">
            {block.index ?? idx + 1}
          </span>
          <p className="text-[15px] leading-relaxed text-foreground">{block.text}</p>
        </div>
      );
    }
    return (
      <p key={`${block.type}-${idx}`} className="text-[15px] leading-relaxed text-foreground/90">
        {block.text}
      </p>
    );
  });
}

export default function ReportViewPage() {
  const params = useSearchParams();
  const { activeProjectId } = useProjectStore();
  const executionId = params.get("executionId");
  const pluginId = params.get("pluginId");

  const [execution, setExecution] = useState<ExecutionRecord | null>(null);
  const [pluginName, setPluginName] = useState("Plugin");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSuggestionId, setPanelSuggestionId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!executionId) {
      setError("Missing executionId.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [exec, plugin] = await Promise.all([
          api.get<ExecutionRecord>(`/executions/${executionId}`),
          pluginId ? api.get<PluginLite>(`/plugins/${pluginId}`) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setExecution(exec);
        if (plugin?.plugin_name) setPluginName(plugin.plugin_name);
      } catch {
        if (!cancelled) setError("Failed to load report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [executionId, pluginId]);

  const markdown = useMemo(
    () => getExecutionMarkdown(execution?.result ?? null, pluginName),
    [execution, pluginName],
  );
  const suggestions = useMemo(() => pluginSuggestions(pluginName), [pluginName]);
  const reportJson = useMemo(
    () => (execution && markdown ? buildReportJson(pluginName, execution, markdown) : null),
    [pluginName, execution, markdown],
  );
  const structuredSections = useMemo(() => {
    if (!reportJson) return [];
    const base = toStructuredSections(reportJson);
    if (!markdown) return base;
    return [...base, ...fallbackSectionsFromMarkdown(markdown, base)];
  }, [reportJson, markdown]);
  const overallScore = useMemo(() => {
    if (!reportJson) return null;
    return extractOverallScore(
      reportJson,
      markdown,
      execution?.result?.structured ?? null,
    );
  }, [reportJson, markdown, execution]);
  const metrics = useMemo(() => (reportJson ? summarizeMetrics(reportJson) : null), [reportJson]);
  const executiveSummary = useMemo(() => {
    if (!reportJson) return "No summary available.";
    for (const section of reportJson.sections) {
      const firstParagraph = section.blocks.find((b) => b.type === "paragraph" && b.text.length > 30);
      if (firstParagraph) return firstParagraph.text;
    }
    return reportJson.sections[0]?.blocks[0]?.text || "No summary available.";
  }, [reportJson]);
  const keyTakeaways = useMemo(() => {
    const section = structuredSections.find((s) => /takeaways|summary|insights/i.test(s.title));
    if (!section) return [];
    return section.blocks
      .filter((b) => b.type === "bullet" || b.type === "numbered" || b.type === "paragraph")
      .map((b) => b.text)
      .filter((t) => t.length > 20)
      .slice(0, 4);
  }, [structuredSections]);

  const sendToReview = async () => {
    if (!markdown) return;
    setSending(true);
    setError("");
    try {
      const suggestion = await changeSuggestionsApi.upload(
        markdown,
        `${displayPluginName(pluginName)}-${new Date().toISOString()}.md`,
      );
      await changeSuggestionsApi.extract(suggestion.id);
      setPanelSuggestionId(suggestion.id);
      setPanelOpen(true);
    } catch (err) {
      setError(formatApiError(err, "Could not send this report to Change Suggestions."));
    } finally {
      setSending(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!markdown) return;
    downloadReportPdf(pluginName, markdown);
  };

  const handleSaveReport = async () => {
    if (!execution?.result) return;
    const projectId = execution.project_id || activeProjectId;
    if (!projectId) {
      setError("Select a project before saving this report.");
      return;
    }
    setSaving(true);
    setError("");
    setSaveMessage("");
    try {
      await api.post("/outputs", {
        project_id: projectId,
        plugin_id: execution.plugin_id,
        execution_id: execution.id,
        input_snapshot: execution.inputs || {},
        schema_version: execution.schema_version ?? 1,
        generated_output: execution.result,
      });
      setSaveMessage("Report saved to project.");
    } catch {
      setError("Failed to save report.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface/50" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface/80" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-surface/80" />
      </div>
    );
  }

  if (!execution || !markdown) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error || "No markdown report found for this execution."}</p>
        <Link href="/plugins" className="text-primary hover:underline">
          Back to plugins
        </Link>
      </div>
    );
  }

  return (
    <>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card className="glass-panel-strong overflow-hidden border-border/70">
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Report</p>
                <CardTitle className="mt-1 text-xl tracking-tight text-foreground">
                  {displayPluginName(pluginName)}
                </CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Prepared by SkillSearchFit • {new Date().toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={handleDownloadPdf}
                >
                  <FileDown className="h-4 w-4" />
                  Download PDF
                </Button>
                <Button
                  type="button"
                  className="gap-2 shadow-[0_10px_22px_rgba(224,138,60,0.18)]"
                  onClick={handleSaveReport}
                  disabled={saving}
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save report"}
                </Button>
              </div>
            </div>
          </CardHeader>
          {(saveMessage || error) && (
            <CardContent className="pt-4">
              {saveMessage && (
                <p className="rounded-xl border border-success/25 bg-success-soft/20 px-4 py-2 text-sm text-success">
                  {saveMessage}
                </p>
              )}
              {error && (
                <p className="mt-2 rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </CardContent>
          )}
        </Card>
        <article className="glass-panel-strong space-y-6 rounded-2xl border-border/70 p-4 sm:p-6 lg:p-7">
          {reportJson && metrics && (
            <>
              <div className="bento-grid-4">
                {overallScore !== null && (
                  <div className="bento-tile bento-hero flex flex-col justify-between">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Overall Score
                    </p>
                    <p className="mt-2 text-5xl font-bold tabular-nums text-primary">
                      {overallScore}
                      <span className="text-xl text-muted">/100</span>
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">{scoreLabel(overallScore)}</p>
                  </div>
                )}
                <div className="bento-tile">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Sections</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.total_sections}</p>
                </div>
                <div className="bento-tile">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Highlights</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.total_bullets}</p>
                </div>
                <div className="bento-tile">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Action Items</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.total_numbered}</p>
                </div>
                <div className="bento-tile">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Narrative</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{metrics.total_paragraphs}</p>
                </div>
              </div>

              <section className="bento-tile bento-wide border-border-strong bg-surface-elevated/50">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/80">
                  Executive Summary
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-foreground">{executiveSummary}</p>
              </section>

              {keyTakeaways.length > 0 && (
                <section className="bento-tile bento-wide border-border-strong">
                  <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/80">
                    Key Takeaways
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {keyTakeaways.map((item) => (
                      <div
                        key={item}
                        className="surface-nested flex items-start gap-3 rounded-lg border border-border-strong bg-surface px-3 py-2.5"
                      >
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                        <p className="text-sm leading-relaxed text-foreground">{item}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="bento-tile bento-wide">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">Table of Contents</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {structuredSections.map((section, i) => (
                    <a
                      key={`toc-${section.title}-${i}`}
                      href={`#${section.id}`}
                      className="surface-nested rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
                    >
                      {(section.sectionNumber ?? i + 1)}. {section.title}
                    </a>
                  ))}
                </div>
              </section>
            </>
          )}

          {structuredSections.map((section, i) => (
            <section
              id={section.id}
              key={`${section.title}-${i}`}
              className="group bento-tile space-y-4 border-border-strong bg-surface-elevated/40 p-4 sm:p-5"
            >
              <div className="flex items-center gap-3 border-b border-border-strong pb-3">
                <span className="h-7 w-1 rounded-full bg-primary transition-all duration-300 group-hover:bg-primary-hover" />
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {section.sectionNumber ? `${section.sectionNumber}. ` : ""}
                  {section.title}
                </h2>
              </div>
              <div className="space-y-3">{renderBlocks(section.blocks)}</div>
            </section>
          ))}
        </article>
      </div>

      <aside className="order-first space-y-5 xl:order-none xl:sticky xl:top-6 xl:self-start">
        {reportJson && (
          <Card className="glass-panel border-border/70">
            <CardHeader>
              <CardTitle className="text-base tracking-tight">Document Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted">
              <p>
                Plugin: <span className="font-medium text-foreground">{reportJson.plugin_name}</span>
              </p>
              <p>
                Generated:{" "}
                <span className="font-medium text-foreground">
                  {new Date(reportJson.generated_at).toLocaleString()}
                </span>
              </p>
              <p>
                Sections: <span className="font-medium text-foreground">{reportJson.sections.length}</span>
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Plugin-Specific Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  className="surface-nested rounded-xl border border-border/70 bg-surface/80 p-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="leading-6 text-foreground/90">{s}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Next Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full shadow-[0_10px_22px_rgba(224,138,60,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(224,138,60,0.24)]"
              onClick={sendToReview}
              disabled={sending}
            >
              {sending ? "Preparing..." : "Open in Change Suggestions"}
            </Button>
            <Link
              href="/plugins"
              className="block rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-all duration-200 hover:bg-accent-soft/60 hover:underline"
            >
              Back to plugins
            </Link>
            {error && !saveMessage && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>

    <ChangeSuggestionsPanel
      open={panelOpen}
      suggestionId={panelSuggestionId}
      onClose={() => setPanelOpen(false)}
    />
    </>
  );
}

