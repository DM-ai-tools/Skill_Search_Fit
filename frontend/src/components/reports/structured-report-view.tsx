"use client";

import Link from "next/link";
import { FileDown, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildReportJson,
  executiveSummaryFromReport,
  extractOverallScore,
  fallbackSectionsFromMarkdown,
  keyTakeawaysFromSections,
  mergeMetrics,
  scoreLabel,
  toStructuredSections,
  type PipelineStepReport,
  type PluginReportJson,
  type ReportBlock,
  type ReportMetric,
  type StructuredSection,
} from "@/lib/report-view-model";

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

export function renderReportBlocks(blocks: ReportBlock[]) {
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

function ReportSections({ sections }: { sections: StructuredSection[] }) {
  return (
    <>
      {sections.map((section, i) => (
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
          <div className="space-y-3">{renderReportBlocks(section.blocks)}</div>
        </section>
      ))}
    </>
  );
}

export function StructuredReportView({
  title,
  subtitle,
  reportJson,
  metrics,
  overallScore,
  structuredSections,
  pipelineSteps,
  fullMarkdown,
  suggestions = [],
  onDownloadPdf,
  onSave,
  saving,
  saveMessage,
  error,
  sidebarExtra,
  backHref = "/plugins",
  backLabel = "Back to plugins",
  footerAction,
}: {
  title: string;
  subtitle?: string;
  reportJson: PluginReportJson | null;
  metrics: ReportMetric | null;
  overallScore: number | null;
  structuredSections: StructuredSection[];
  pipelineSteps?: PipelineStepReport[];
  fullMarkdown?: string;
  suggestions?: string[];
  onDownloadPdf?: () => void;
  onSave?: () => void;
  saving?: boolean;
  saveMessage?: string;
  error?: string;
  sidebarExtra?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  footerAction?: React.ReactNode;
}) {
  const executiveSummary = reportJson ? executiveSummaryFromReport(reportJson) : "";
  const keyTakeaways = keyTakeawaysFromSections(structuredSections);
  const fallbackSections = fullMarkdown
    ? fallbackSectionsFromMarkdown(fullMarkdown, structuredSections)
    : [];
  const allSections = [...structuredSections, ...fallbackSections];
  const tocSections = pipelineSteps
    ? pipelineSteps.flatMap((step) =>
        step.structuredSections.map((section) => ({
          id: `step-${step.step}-${section.id}`,
          label: `${step.step}. ${step.label} — ${section.title}`,
        })),
      )
    : structuredSections.map((section, i) => ({
        id: section.id,
        label: `${section.sectionNumber ?? i + 1}. ${section.title}`,
      }));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card className="glass-panel-strong overflow-hidden border-border/70">
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Report</p>
                <CardTitle className="mt-1 text-xl tracking-tight text-foreground">{title}</CardTitle>
                {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onDownloadPdf && (
                  <Button type="button" variant="outline" className="gap-2" onClick={onDownloadPdf}>
                    <FileDown className="h-4 w-4" />
                    Download PDF
                  </Button>
                )}
                {onSave && (
                  <Button
                    type="button"
                    className="gap-2 shadow-[0_10px_22px_rgba(224,138,60,0.18)]"
                    onClick={onSave}
                    disabled={saving}
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Saving…" : "Save report"}
                  </Button>
                )}
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
          {metrics && (
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

              {executiveSummary && (
                <section className="bento-tile bento-wide border-border-strong bg-surface-elevated/50">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/80">
                    Executive Summary
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed text-foreground">{executiveSummary}</p>
                </section>
              )}

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

              {tocSections.length > 0 && (
                <section className="bento-tile bento-wide">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">Table of Contents</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tocSections.map((entry, i) => (
                      <a
                        key={`toc-${entry.id}-${i}`}
                        href={`#${entry.id}`}
                        className="surface-nested rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
                      >
                        {entry.label}
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {pipelineSteps ? (
            pipelineSteps.map((step) => (
              <div key={`pipeline-step-${step.step}`} className="space-y-4">
                <section
                  id={`step-${step.step}`}
                  className="bento-tile border-primary/20 bg-primary/6 p-4 sm:p-5"
                >
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">
                    Step {step.step}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{step.label}</h2>
                  <p className="mt-1 text-sm text-muted">{step.pluginName}</p>
                  {step.overallScore !== null && (
                    <p className="mt-2 text-sm font-medium text-foreground">
                      Score: <span className="text-primary">{step.overallScore}/100</span>
                    </p>
                  )}
                </section>
                {step.structuredSections.map((section, i) => (
                  <section
                    id={`step-${step.step}-${section.id}`}
                    key={`${step.step}-${section.title}-${i}`}
                    className="group bento-tile space-y-4 border-border-strong bg-surface-elevated/40 p-4 sm:p-5"
                  >
                    <div className="flex items-center gap-3 border-b border-border-strong pb-3">
                      <span className="h-7 w-1 rounded-full bg-primary transition-all duration-300 group-hover:bg-primary-hover" />
                      <h3 className="text-lg font-semibold tracking-tight text-foreground">
                        {section.sectionNumber ? `${section.sectionNumber}. ` : ""}
                        {section.title}
                      </h3>
                    </div>
                    <div className="space-y-3">{renderReportBlocks(section.blocks)}</div>
                  </section>
                ))}
              </div>
            ))
          ) : (
            <ReportSections sections={allSections} />
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
                Report: <span className="font-medium text-foreground">{title}</span>
              </p>
              <p>
                Generated:{" "}
                <span className="font-medium text-foreground">
                  {new Date(reportJson.generated_at).toLocaleString()}
                </span>
              </p>
              {pipelineSteps && (
                <p>
                  Skills run: <span className="font-medium text-foreground">{pipelineSteps.length}</span>
                </p>
              )}
              <p>
                Sections: <span className="font-medium text-foreground">{metrics?.total_sections ?? 0}</span>
              </p>
            </CardContent>
          </Card>
        )}

        {sidebarExtra}

        {suggestions.length > 0 && (
          <Card className="glass-panel border-border/70">
            <CardHeader>
              <CardTitle className="text-base tracking-tight">Suggested Next Steps</CardTitle>
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
        )}

        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Next Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {footerAction}
            <Link
              href={backHref}
              className="block rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-all duration-200 hover:bg-accent-soft/60 hover:underline"
            >
              {backLabel}
            </Link>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export function buildPipelineStepReports(
  steps: Array<{
    step: number;
    label: string;
    plugin_name: string;
    plugin_id: string;
    execution_id: string;
    output_markdown: string;
    output?: { markdown?: string; structured?: Record<string, unknown> };
  }>,
  getMarkdown: (step: (typeof steps)[number]) => string,
): PipelineStepReport[] {
  return steps.map((step) => {
    const markdown = getMarkdown(step);
    const reportJson = buildReportJson(step.plugin_name, step.execution_id, "completed", markdown);
    const structuredSections = toStructuredSections(reportJson).map((section) => ({
      ...section,
      id: `step-${step.step}-${section.id}`,
    }));
    const withFallback = [
      ...structuredSections,
      ...fallbackSectionsFromMarkdown(markdown, structuredSections),
    ];
    return {
      step: step.step,
      label: step.label,
      pluginName: reportJson.plugin_name,
      executionId: step.execution_id,
      pluginId: step.plugin_id,
      markdown,
      reportJson,
      structuredSections: withFallback,
      overallScore: extractOverallScore(
        reportJson,
        markdown,
        step.output?.structured ?? null,
      ),
    };
  });
}

export { mergeMetrics };
