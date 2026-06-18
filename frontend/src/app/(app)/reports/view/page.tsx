"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { reportReviewApi } from "@/lib/report-review-api";
import { parseMarkdownSections, pluginSuggestions } from "@/lib/plugin-report-presenters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ExecutionRecord = {
  id: string;
  plugin_id: string;
  status: string;
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

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:-]+\|[\s|:-]+\|?$/.test(line.trim());
}

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

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const current = lines[i].trim();
        if (!isTableSeparator(current)) rows.push(parseTableRow(current));
        i += 1;
      }
      if (rows.length > 0) {
        blocks.push({ type: "table", text: "table", rows });
        continue;
      }
    }

    if (/^[-*]\s+/.test(line)) {
      blocks.push({ type: "bullet", text: line.replace(/^[-*]\s+/, "") });
    } else if (/^\d+\.\s+/.test(line)) {
      const number = Number(line.match(/^(\d+)\./)?.[1] || blocks.length + 1);
      blocks.push({ type: "numbered", text: line.replace(/^\d+\.\s+/, ""), index: number });
    } else {
      blocks.push({ type: "paragraph", text: line });
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
  const parsed = parseMarkdownSections(markdown);
  const sections =
    parsed.length > 0
      ? parsed.map((s) => ({ title: s.title, level: s.level, blocks: parseBlocksFromBody(s.body) }))
      : [{ title: "Report", level: 2, blocks: parseBlocksFromBody(markdown) }];
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
      else totalParagraphs += 1;
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
  return report.sections.map((section, idx) => {
    const m = section.title.match(/^(\d+)\.\s+(.+)$/);
    return {
      id: `section-${idx}`,
      title: m?.[2] || section.title,
      level: section.level,
      blocks: section.blocks,
      isNumbered: Boolean(m),
      sectionNumber: m ? Number(m[1]) : undefined,
    };
  });
}

function extractOverallScore(report: PluginReportJson): number | null {
  for (const section of report.sections) {
    for (const block of section.blocks) {
      const m = block.text.match(/(\d{1,3})\s*\/\s*100/);
      if (m) {
        const score = Number(m[1]);
        if (!Number.isNaN(score) && score >= 0 && score <= 100) return score;
      }
    }
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
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-surface/40">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-surface-elevated/80">
            {header.map((cell) => (
              <th
                key={cell}
                className="px-4 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-muted"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIdx) => (
            <tr key={`row-${rowIdx}`} className="border-b border-border/30 last:border-0 hover:bg-surface/50">
              {row.map((cell, cellIdx) => (
                <td key={`${rowIdx}-${cellIdx}`} className="px-4 py-3 align-top text-[14px] leading-7 text-foreground/90">
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
      return <div key={`table-${idx}`}>{renderTable(block.rows)}</div>;
    }
    if (block.type === "bullet") {
      return (
        <div key={`${block.type}-${idx}`} className="flex items-start gap-3 rounded-xl border border-border/50 bg-surface/50 px-3 py-2.5">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <p className="text-[15px] leading-7 text-foreground/90">{block.text}</p>
        </div>
      );
    }
    if (block.type === "numbered") {
      return (
        <div key={`${block.type}-${idx}`} className="flex items-start gap-3 rounded-xl border border-border/50 bg-surface-elevated/60 px-3 py-2.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold tabular-nums text-primary">
            {block.index ?? idx + 1}
          </span>
          <p className="text-[15px] leading-7 text-foreground/90">{block.text}</p>
        </div>
      );
    }
    return (
      <p key={`${block.type}-${idx}`} className="text-[15px] leading-8 tracking-[0.01em] text-foreground/90">
        {block.text}
      </p>
    );
  });
}

export default function ReportViewPage() {
  const params = useSearchParams();
  const router = useRouter();
  const executionId = params.get("executionId");
  const pluginId = params.get("pluginId");

  const [execution, setExecution] = useState<ExecutionRecord | null>(null);
  const [pluginName, setPluginName] = useState("Plugin");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showJson, setShowJson] = useState(false);
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

  const markdown = execution?.result?.markdown?.trim() || "";
  const suggestions = useMemo(() => pluginSuggestions(pluginName), [pluginName]);
  const reportJson = useMemo(
    () => (execution && markdown ? buildReportJson(pluginName, execution, markdown) : null),
    [pluginName, execution, markdown],
  );
  const structuredSections = useMemo(
    () => (reportJson ? toStructuredSections(reportJson) : []),
    [reportJson],
  );
  const overallScore = useMemo(() => (reportJson ? extractOverallScore(reportJson) : null), [reportJson]);
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
    try {
      const report = await reportReviewApi.upload(
        markdown,
        `${displayPluginName(pluginName)}-${new Date().toISOString()}.md`,
      );
      await reportReviewApi.extract(report.id);
      router.push(`/reports/review?reportId=${report.id}`);
    } catch {
      setError("Could not send this report to Report Review.");
    } finally {
      setSending(false);
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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card className="glass-panel-strong overflow-hidden border-border/70">
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Report</p>
                <CardTitle className="mt-1 text-xl tracking-tight text-foreground">{displayPluginName(pluginName)}</CardTitle>
                <p className="mt-1 text-xs text-muted">Prepared by SkillSearchFit • {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 pt-4 text-sm text-muted">
            <span className="rounded-full border border-border bg-surface/80 px-3 py-1">
              Execution: <span className="font-medium text-foreground">{execution.id}</span>
            </span>
            <span className="rounded-full border border-border bg-surface/80 px-3 py-1">
              Status: <span className="font-medium text-foreground">{execution.status}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={() => setShowJson((v) => !v)}
            >
              {showJson ? "Show Styled Report" : "Show JSON"}
            </Button>
          </CardContent>
        </Card>

        <article className="glass-panel-strong space-y-6 rounded-2xl border-border/70 p-4 sm:p-6 lg:p-7">
          {reportJson && metrics && !showJson && (
            <>
              <div className="bento-grid-4">
                {overallScore !== null ? (
                  <div className="bento-spotlight bento-hero flex flex-col justify-between">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Overall Score
                    </p>
                    <p className="mt-2 text-5xl font-bold tabular-nums text-primary">
                      {overallScore}
                      <span className="text-xl text-muted">/100</span>
                    </p>
                    <p className="mt-1 text-sm font-medium">{scoreLabel(overallScore)}</p>
                  </div>
                ) : (
                  <div className="bento-tile bento-hero flex flex-col justify-center">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Overall Score
                    </p>
                    <p className="mt-2 text-4xl font-bold text-muted">—</p>
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

              <section className="bento-tile bento-wide">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Executive Summary</p>
                <p className="mt-2 text-[15px] leading-7 text-foreground/90">{executiveSummary}</p>
              </section>

              {keyTakeaways.length > 0 && (
                <section className="bento-tile bento-wide">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">Key Takeaways</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {keyTakeaways.map((item) => (
                      <div key={item} className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                        <p className="text-sm leading-7 text-muted">{item}</p>
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
                      className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground transition hover:border-border-strong hover:bg-surface"
                    >
                      {(section.sectionNumber ?? i + 1)}. {section.title}
                    </a>
                  ))}
                </div>
              </section>
            </>
          )}

          {showJson && reportJson ? (
            <section className="rounded-xl border border-border/70 bg-background/70 p-4">
              <h2 className="mb-3 text-base font-semibold">Converted JSON Output</h2>
              <pre className="max-h-[70vh] overflow-auto rounded-lg bg-surface p-4 text-xs leading-6 text-foreground/90">
                {JSON.stringify(reportJson, null, 2)}
              </pre>
            </section>
          ) : (
            structuredSections.map((section, i) => (
              <section
                id={section.id}
                key={`${section.title}-${i}`}
                className="group bento-tile space-y-4 p-4 sm:p-5"
              >
                <div className="flex items-center gap-3 border-b border-border/40 pb-3">
                  <span className="h-6 w-1.5 rounded-full bg-primary/70 transition-all duration-300 group-hover:h-7 group-hover:bg-primary" />
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {section.sectionNumber ? `${section.sectionNumber}. ` : ""}
                    {section.title}
                  </h2>
                </div>
                <div className="space-y-3">{renderBlocks(section.blocks)}</div>
              </section>
            ))
          )}
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
                  className="rounded-xl border border-border/70 bg-surface/80 p-3 transition-all duration-300 hover:border-border-strong hover:bg-surface"
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
              {sending ? "Preparing..." : "Open in Report Review"}
            </Button>
            <Link
              href="/plugins"
              className="block rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-all duration-200 hover:bg-accent-soft/60 hover:underline"
            >
              Back to plugins
            </Link>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

