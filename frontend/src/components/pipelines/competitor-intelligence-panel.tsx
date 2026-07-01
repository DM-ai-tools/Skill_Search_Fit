"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PipelineRun } from "@/lib/types";

export function CompetitorIntelligencePanel({
  run,
  loading,
  defaultCollapsed = false,
}: {
  run: PipelineRun | null;
  loading?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (loading) {
    return (
      <div className="glass-panel mb-4 rounded-2xl border border-border/60 p-4">
        <p className="text-sm font-medium text-foreground">Analysing competitors for this pipeline…</p>
        <div className="mt-3 space-y-2">
          <div className="h-3 animate-pulse rounded bg-surface/60" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-surface/60" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-surface/60" />
        </div>
      </div>
    );
  }

  if (!run) return null;

  const data = run.competitor_data || {};
  const failed = run.competitor_failed || !Object.keys(data).length;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.10)] backdrop-blur-xl dark:bg-black/20">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">Competitor Intelligence</p>
          <p className="text-xs text-muted">
            Collected before this pipeline ran — used to make every step more competitive
          </p>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronUp className="h-4 w-4 text-muted" />}
      </button>

      {!collapsed && (
        <div className="border-t border-white/10 px-4 py-3 text-sm">
          {failed ? (
            <p className="text-xs text-amber-200/90">
              Competitor analysis unavailable — pipeline will run without competitor context.
            </p>
          ) : (
            <div className="space-y-3">
              {run.pipeline_id === "full-content-page-pipeline" ||
              run.pipeline_id === "content-production-pipeline" ? (
                <>
                  <p className="text-xs text-muted">
                    Competitors found: {(data.competitor_urls as string[] | undefined)?.length ?? 0} pages analysed
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {((data.competitor_urls as string[]) || []).slice(0, 5).map((url, i) => (
                      <div key={url} className="rounded-xl border border-border/50 bg-surface/40 p-2 text-xs">
                        <p className="truncate font-medium text-foreground">
                          {(data.competitor_titles as string[])?.[i] || url}
                        </p>
                        <p className="truncate text-muted">{url}</p>
                        <p className="mt-1 text-muted">
                          ~{(data.competitor_word_counts as number[])?.[i] ?? "—"} words
                        </p>
                      </div>
                    ))}
                  </div>
                  {Array.isArray(data.competitor_gaps) && data.competitor_gaps.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted">Content gaps</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(data.competitor_gaps as string[]).map((g) => (
                          <span key={g} className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.positioning_opportunity && (
                    <div className="rounded-xl border border-primary/25 bg-primary/10 p-3 text-xs text-foreground">
                      <p className="font-medium text-primary">Positioning opportunity</p>
                      <p className="mt-1">{String(data.positioning_opportunity)}</p>
                    </div>
                  )}
                  {data.minimum_competitive_word_count != null && (
                    <p className="text-xs">
                      Minimum competitive word count:{" "}
                      <span className="font-semibold tabular-nums">{String(data.minimum_competitive_word_count)}</span>
                    </p>
                  )}
                </>
              ) : run.pipeline_id === "audit-fix-verify" ? (
                <div className="space-y-2 text-xs">
                  {data.priority_technical_fix != null && (
                    <p>
                      <span className="font-medium">Priority fix:</span> {String(data.priority_technical_fix)}
                    </p>
                  )}
                  {Array.isArray(data.technical_gaps_to_close) &&
                    (data.technical_gaps_to_close as string[]).map((g) => (
                      <p key={g} className="text-muted">
                        • {g}
                      </p>
                    ))}
                </div>
              ) : run.pipeline_id === "ai-visibility-flywheel" ? (
                <div className="space-y-2 text-xs">
                  {Array.isArray(data.ai_recommended_competitors) && (
                    <p>
                      <span className="font-medium">Brands winning prompts:</span>{" "}
                      {(data.ai_recommended_competitors as string[]).join(", ")}
                    </p>
                  )}
                  {data.entity_gap != null && (
                    <p className="text-muted">{String(data.entity_gap)}</p>
                  )}
                </div>
              ) : (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-muted">
                  {JSON.stringify(data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
