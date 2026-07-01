"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/format-api-error";
import { parseBlocksFromBody } from "@/lib/report-view-model";
import { renderReportBlocks } from "@/components/reports/structured-report-view";
import type { UnifiedPipelineReport } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PresentedHighlight = { label: string; value: string };

export type PresentedSection = {
  id: string;
  display_title: string;
  kicker: string;
  layout: "standard" | "featured" | "compact";
  presentation_markdown: string;
  source_step_labels: string[];
  metrics: Record<string, string | number>;
};

export type PresentedReport = {
  cover_title: string;
  cover_subtitle: string;
  cover_badge: string;
  highlights: PresentedHighlight[];
  executive_markdown: string;
  sections: PresentedSection[];
  deliverable_headline: string;
  deliverable_subheadline: string;
  presentation_model?: string;
};

const LAYOUT_STYLES: Record<string, string> = {
  featured: "border-primary/25 bg-primary/6 shadow-[0_12px_40px_rgba(224,138,60,0.08)]",
  compact: "border-border/60 bg-surface/50",
  standard: "border-border-strong bg-surface-elevated/40",
};

function PresentedSectionCard({ section }: { section: PresentedSection }) {
  const blocks = parseBlocksFromBody(section.presentation_markdown);
  return (
    <section
      id={`section-${section.id}`}
      className={cn(
        "group bento-tile space-y-0 overflow-hidden p-0",
        LAYOUT_STYLES[section.layout] ?? LAYOUT_STYLES.standard,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border-strong/80 px-5 py-4">
        <span className="mt-1 h-8 w-1 shrink-0 rounded-full bg-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {section.display_title}
          </h2>
          {section.kicker && (
            <p className="mt-1 text-sm text-muted">{section.kicker}</p>
          )}
          {section.source_step_labels.length > 0 && (
            <p className="mt-1 text-[11px] text-muted/80">
              {section.source_step_labels.join(" · ")}
            </p>
          )}
        </div>
        {Object.keys(section.metrics).length > 0 && (
          <div className="hidden shrink-0 gap-3 sm:flex">
            {Object.entries(section.metrics).slice(0, 2).map(([k, v]) => (
              <div key={k} className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted">
                  {k.replace(/_/g, " ")}
                </p>
                <p className="text-sm font-bold tabular-nums">{String(v)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-3 px-5 py-5">
        {blocks.length > 0 ? (
          renderReportBlocks(blocks)
        ) : (
          <p className="text-sm italic text-muted">No content for this section.</p>
        )}
      </div>
    </section>
  );
}

export function ReportPresentationView({
  report,
  deliverable,
  className,
  onPresentationReady,
}: {
  report: UnifiedPipelineReport;
  deliverable?: UnifiedPipelineReport["final_deliverable"];
  className?: string;
  onPresentationReady?: (presented: PresentedReport) => void;
}) {
  const [presented, setPresented] = useState<PresentedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reportKey = useMemo(() => JSON.stringify(report), [report]);

  const fetchPresentation = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.post<PresentedReport>("/reports/present-appearance", report);
      setPresented(data);
      onPresentationReady?.(data);
    } catch (err) {
      setError(formatApiError(err, "Could not generate presentation layout."));
      setPresented(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPresentation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  if (loading && !presented) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="h-40 animate-pulse rounded-2xl bg-surface/60" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface/60" />
      </div>
    );
  }

  if (error && !presented) {
    return (
      <div className={cn("space-y-3", className)}>
        <p className="rounded-xl border border-destructive/20 bg-destructive-soft/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void fetchPresentation()}
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <RefreshCw className="h-4 w-4" />
          Retry presentation
        </button>
      </div>
    );
  }

  if (!presented) return null;

  const execBlocks = parseBlocksFromBody(presented.executive_markdown);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Cover band */}
      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-surface-elevated/80 to-surface/40">
        <div className="border-b border-primary/15 px-6 py-5 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                {presented.cover_badge}
              </p>
              <h1 className="mt-2 font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {presented.cover_title}
              </h1>
              {presented.cover_subtitle && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  {presented.cover_subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void fetchPresentation()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/80 px-3 py-1.5 text-xs font-medium text-muted hover:text-primary"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Redesign layout
            </button>
          </div>
        </div>

        {presented.highlights.length > 0 && (
          <div className="grid gap-px bg-border/40 sm:grid-cols-2 lg:grid-cols-4">
            {presented.highlights.map((h) => (
              <div key={h.label} className="bg-surface/90 px-5 py-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{h.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{h.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Executive */}
      {execBlocks.length > 0 && (
        <section className="bento-tile border-border-strong bg-surface-elevated/50 px-6 py-5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/80">
            Executive Overview
          </p>
          <div className="mt-4 space-y-3">{renderReportBlocks(execBlocks)}</div>
        </section>
      )}

      {/* Presented sections */}
      <div className="space-y-4">
        {presented.sections.map((section) => (
          <PresentedSectionCard key={section.id} section={section} />
        ))}
      </div>

      {/* Deliverable frame */}
      {deliverable && (
        <section className="bento-tile border-primary/25 bg-primary/5 p-0 overflow-hidden">
          <div className="border-b border-primary/15 px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
              {presented.deliverable_headline || "Final Deliverable"}
            </p>
            {presented.deliverable_subheadline && (
              <p className="mt-1 text-sm text-muted">{presented.deliverable_subheadline}</p>
            )}
          </div>
          <div className="space-y-3 px-5 py-4 text-sm">
            {deliverable.title_tag && (
              <p>
                <span className="font-medium text-muted">Title: </span>
                {deliverable.title_tag}
              </p>
            )}
            {deliverable.h1 && (
              <p>
                <span className="font-medium text-muted">H1: </span>
                {deliverable.h1}
              </p>
            )}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 bg-surface/80 p-3">
              {renderReportBlocks(parseBlocksFromBody(deliverable.article_body))}
            </div>
          </div>
        </section>
      )}

      {presented.presentation_model && (
        <p className="text-center text-[10px] text-muted">
          Presentation designed with {presented.presentation_model} · content unchanged
        </p>
      )}
    </div>
  );
}
