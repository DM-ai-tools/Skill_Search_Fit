"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutTemplate, RefreshCw, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/format-api-error";
import type { ReportAppearanceManifest } from "@/lib/report-appearance-manifest";
import { cn } from "@/lib/utils";

export type ReportAppearanceReview = {
  presentation_score: number;
  headline: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  layout_areas: {
    area: string;
    status: "excellent" | "good" | "fair" | "needs_work";
    observation: string;
    tip: string;
  }[];
  review_model?: string;
};

const STATUS_STYLES: Record<string, string> = {
  excellent: "border-success/30 bg-success-soft/15 text-success",
  good: "border-primary/25 bg-primary/8 text-primary",
  fair: "border-border-strong bg-surface-elevated/60 text-foreground",
  needs_work: "border-destructive/25 bg-destructive-soft/15 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  needs_work: "Needs work",
};

function ScoreRing({ score }: { score: number }) {
  const tier =
    score >= 85 ? "text-success" : score >= 70 ? "text-primary" : score >= 55 ? "text-foreground" : "text-destructive";
  return (
    <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-border-strong bg-surface-elevated/80">
      <span className={cn("text-2xl font-bold tabular-nums", tier)}>{score}</span>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">Layout</span>
    </div>
  );
}

export function ReportAppearanceReviewPanel({
  manifest,
  className,
}: {
  manifest: ReportAppearanceManifest | null;
  className?: string;
}) {
  const [review, setReview] = useState<ReportAppearanceReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const manifestKey = useMemo(() => (manifest ? JSON.stringify(manifest) : ""), [manifest]);

  const fetchReview = async () => {
    if (!manifest) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post<ReportAppearanceReview>("/reports/appearance-review", manifest);
      setReview(data);
    } catch (err) {
      setError(formatApiError(err, "Presentation review unavailable."));
      setReview(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!manifestKey) return;
    setReview(null);
    void fetchReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when manifest structure changes
  }, [manifestKey]);

  if (!manifest) return null;

  return (
    <section
      className={cn(
        "bento-tile overflow-hidden border-border-strong bg-gradient-to-br from-surface-elevated/80 via-surface/40 to-primary/5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-strong px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <LayoutTemplate className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/90">
              Presentation review
            </p>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              How this report looks
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              AI layout review only — not a critique of your SEO content or recommendations.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchReview()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/70 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="space-y-5 p-5">
        {loading && !review && (
          <div className="space-y-3 animate-pulse">
            <div className="h-24 rounded-xl bg-surface/60" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-20 rounded-xl bg-surface/60" />
              <div className="h-20 rounded-xl bg-surface/60" />
            </div>
          </div>
        )}

        {error && !review && (
          <p className="rounded-xl border border-destructive/20 bg-destructive-soft/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {review && (
          <>
            <div className="flex flex-wrap items-start gap-5">
              <ScoreRing score={review.presentation_score} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">
                    {review.headline}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{review.summary}</p>
                {review.review_model && (
                  <p className="text-[10px] text-muted">Reviewed with {review.review_model}</p>
                )}
              </div>
            </div>

            {review.layout_areas.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Layout areas
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {review.layout_areas.map((area) => (
                    <div
                      key={area.area}
                      className="rounded-xl border border-border-strong bg-surface/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{area.area}</h4>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            STATUS_STYLES[area.status] ?? STATUS_STYLES.good,
                          )}
                        >
                          {STATUS_LABEL[area.status] ?? area.status}
                        </span>
                      </div>
                      {area.observation && (
                        <p className="mt-2 text-xs leading-relaxed text-muted">{area.observation}</p>
                      )}
                      {area.tip && (
                        <p className="mt-2 text-xs leading-relaxed text-foreground/85">
                          <span className="font-medium text-primary">Tip: </span>
                          {area.tip}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {review.strengths.length > 0 && (
                <div className="rounded-xl border border-success/20 bg-success-soft/10 p-4">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-success">
                    Presentation strengths
                  </p>
                  <ul className="mt-3 space-y-2">
                    {review.strengths.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-foreground/90">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {review.improvements.length > 0 && (
                <div className="rounded-xl border border-primary/20 bg-primary/6 p-4">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">
                    Layout improvements
                  </p>
                  <ul className="mt-3 space-y-2">
                    {review.improvements.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-foreground/90">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
