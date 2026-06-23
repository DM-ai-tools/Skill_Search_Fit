"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Copy, FileDown, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseBlocksFromBody } from "@/lib/report-view-model";
import { renderReportBlocks } from "@/components/reports/structured-report-view";
import type { UnifiedPipelineReport, UnifiedPipelineSection } from "@/lib/types";

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ section }: { section: UnifiedPipelineSection }) {
  const [expanded, setExpanded] = useState(!section.expandable);
  const blocks = parseBlocksFromBody(section.combined_markdown);

  return (
    <section
      id={`section-${section.id}`}
      className="group bento-tile space-y-0 border-border-strong bg-surface-elevated/40 p-0 overflow-hidden"
    >
      {/* Section header */}
      <div className="flex items-center gap-3 border-b border-border-strong px-5 py-4">
        <span className="h-7 w-1 shrink-0 rounded-full bg-primary transition-all duration-300 group-hover:bg-primary-hover" />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {section.title}
          </h2>
          {section.source_step_labels.length > 0 && (
            <p className="mt-0.5 text-[11px] text-muted truncate">
              {section.source_step_labels.join(" · ")}
            </p>
          )}
        </div>

        {/* Inline metrics */}
        {Object.keys(section.metrics).length > 0 && (
          <div className="hidden sm:flex items-center gap-4 shrink-0">
            {Object.entries(section.metrics).map(([key, val]) => (
              <div key={key} className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {key.replace(/_/g, " ")}
                </p>
                <p className="text-sm font-bold tabular-nums text-foreground">{String(val)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Expand toggle */}
        {section.expandable && (
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="ml-2 shrink-0 flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-surface/60 text-muted transition-colors hover:border-primary/30 hover:text-primary"
            aria-label={expanded ? "Collapse section" : "Expand section"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Section body */}
      {expanded && (
        <div className="space-y-3 px-5 py-4">
          {blocks.length > 0 ? (
            renderReportBlocks(blocks)
          ) : (
            <p className="text-sm text-muted italic">No content generated for this section.</p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Final deliverable card ────────────────────────────────────────────────────

function FinalDeliverableCard({
  deliverable,
}: {
  deliverable: NonNullable<UnifiedPipelineReport["final_deliverable"]>;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(deliverable.article_body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="bento-tile border-primary/20 bg-primary/4 space-y-0 p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-primary/15 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">
            Final Deliverable
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground">
            Your Publish-Ready Page
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0 border-primary/30 text-primary hover:border-primary/60 hover:bg-primary/8"
          onClick={handleCopy}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied!" : "Copy Article"}
        </Button>
      </div>

      {/* Meta fields */}
      <div className="space-y-4 px-5 py-4">
        {deliverable.title_tag && (
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Title Tag</p>
            <p className="rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm font-medium text-foreground">
              {deliverable.title_tag}
            </p>
          </div>
        )}

        {deliverable.meta_description && (
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Meta Description
            </p>
            <p className="rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm text-foreground">
              {deliverable.meta_description}
            </p>
          </div>
        )}

        {deliverable.h1 && (
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">H1</p>
            <p className="rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm font-semibold text-foreground">
              {deliverable.h1}
            </p>
          </div>
        )}

        {/* Article body preview */}
        {deliverable.article_body && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Article Body
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-surface/80 px-3 py-2 space-y-2 text-sm">
              {renderReportBlocks(parseBlocksFromBody(deliverable.article_body))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Metrics strip ─────────────────────────────────────────────────────────────

function MetricsStrip({ report }: { report: UnifiedPipelineReport }) {
  const steps = report.headline_summary.key_metrics.steps_completed as number | undefined;

  // Pull the first score we can find across sections
  const firstScore = report.sections
    .map((s) => s.metrics.score as number | undefined)
    .find((s) => s !== undefined);

  const totalWords = report.sections
    .map((s) => s.metrics.words_written as number | undefined)
    .find((w) => w !== undefined);

  const tiles = [
    steps !== undefined && { label: "Skills Run", value: String(steps) },
    firstScore !== undefined && { label: "Score", value: `${firstScore}/100` },
    totalWords !== undefined && { label: "Words", value: String(totalWords) },
    report.sections.length > 0 && { label: "Sections", value: String(report.sections.length) },
  ].filter(Boolean) as { label: string; value: string }[];

  if (tiles.length === 0) return null;

  return (
    <div className="bento-grid-4">
      {tiles.map(({ label, value }) => (
        <div key={label} className="bento-tile">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UnifiedPipelineReportView({
  report,
  onSave,
  saving,
  saveMessage,
  error,
  pdfDownloading,
  onDownloadPdf,
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
}: {
  report: UnifiedPipelineReport;
  onSave?: () => void;
  saving?: boolean;
  saveMessage?: string;
  error?: string;
  pdfDownloading?: boolean;
  onDownloadPdf?: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── Main column ── */}
      <div className="space-y-5">
        {/* Header card */}
        <Card className="glass-panel-strong overflow-hidden border-border/70">
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  Pipeline Report
                </p>
                <CardTitle className="mt-1 text-xl tracking-tight text-foreground">
                  {report.pipeline_name}
                </CardTitle>
                {report.pipeline_purpose && (
                  <p className="mt-1 text-xs text-muted max-w-xl">{report.pipeline_purpose}</p>
                )}
                {report.domain && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-[11px] text-muted">
                    {report.domain}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onDownloadPdf && (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={onDownloadPdf}
                    disabled={pdfDownloading}
                  >
                    <FileDown className="h-4 w-4" />
                    {pdfDownloading ? "Generating…" : "Download PDF"}
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
                    {saving ? "Saving…" : "Save all reports"}
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

        {/* Report body */}
        <article className="glass-panel-strong space-y-6 rounded-2xl border-border/70 p-4 sm:p-6 lg:p-7">
          {/* Metrics strip */}
          <MetricsStrip report={report} />

          {/* Narrative block */}
          {report.narrative && (
            <section className="bento-tile bento-wide border-border-strong bg-surface-elevated/50">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/80">
                Executive Summary
              </p>
              <div className="mt-3 space-y-3">
                {report.narrative.split(/\n{2,}/).map((para, i) => (
                  <p
                    key={`para-${i}`}
                    className="text-[15px] leading-relaxed text-foreground"
                  >
                    {para.trim()}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Outcome line */}
          {report.headline_summary.outcome && (
            <p className="text-sm text-muted">{report.headline_summary.outcome}</p>
          )}

          {/* Sections */}
          <div className="space-y-4">
            {report.sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>

          {/* Final deliverable */}
          {report.final_deliverable && (
            <FinalDeliverableCard deliverable={report.final_deliverable} />
          )}
        </article>
      </div>

      {/* ── Sidebar ── */}
      <aside className="order-first space-y-5 xl:order-none xl:sticky xl:top-6 xl:self-start">
        {/* Pipeline overview */}
        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Pipeline Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted leading-relaxed">{report.pipeline_purpose}</p>
            <div className="space-y-1.5">
              {report.sections.map((section, i) => (
                <a
                  key={section.id}
                  href={`#section-${section.id}`}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm text-foreground hover:border-primary/30 hover:text-primary transition-colors"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="truncate">{section.title}</span>
                </a>
              ))}
              {report.final_deliverable && (
                <a
                  href="#section-final-deliverable"
                  className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/12 transition-colors"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                    ★
                  </span>
                  <span>Final Deliverable</span>
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Next Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href={`/pipeline/${report.pipeline_id}`}
              className="block rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/15"
            >
              Re-run Pipeline
            </Link>
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
