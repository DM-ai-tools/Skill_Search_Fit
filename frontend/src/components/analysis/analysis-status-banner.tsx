"use client";

import { SCAN_STATUS_LABELS, type ScanPhase } from "@/stores/analysis-store";
import { cn } from "@/lib/utils";

export function AnalysisStatusBanner({ phase }: { phase: ScanPhase }) {
  if (phase === "idle") return null;

  const isError = phase === "failed";
  const isDone = phase === "completed";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        isError
          ? "border-destructive/25 bg-destructive-soft/20 text-destructive"
          : isDone
            ? "border-success/25 bg-success-soft/20 text-success"
            : "border-ai-accent/20 bg-ai-accent-soft/30 text-foreground",
      )}
    >
      <div className="flex items-center gap-2">
        {!isError && !isDone && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-ai-accent" />
        )}
        {isDone && <span className="text-success">✓</span>}
        <span className="font-medium">{SCAN_STATUS_LABELS[phase]}</span>
      </div>
    </div>
  );
}
