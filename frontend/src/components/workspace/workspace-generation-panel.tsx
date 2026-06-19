"use client";

import { ReportGenerationStream } from "@/components/workspace/report-generation-stream";
import { WorkspaceTopProgress } from "@/components/workspace/workspace-top-progress";
import { cn } from "@/lib/utils";

export function WorkspaceGenerationPanel({
  progress,
  pluginName,
  markdown,
  onComplete,
  label = "Generating report",
  embedded = false,
  className,
}: {
  progress: number;
  pluginName: string;
  markdown?: string;
  onComplete?: () => void;
  label?: string;
  embedded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        embedded
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : "glass-panel overflow-hidden rounded-2xl",
        className,
      )}
    >
      <WorkspaceTopProgress progress={progress} className="rounded-none" />
      <div className="flex min-h-0 flex-1 flex-col border-t border-border/30 bg-background/40 px-4 py-3">
        <div className="mb-2 flex shrink-0 items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/80">
            {label}
          </span>
        </div>
        <ReportGenerationStream
          compact
          fill={embedded}
          variant="plugin"
          pluginName={pluginName}
          markdown={markdown}
          onComplete={onComplete}
        />
      </div>
    </div>
  );
}

export function SiteAnalysisGenerationPanel({
  progress,
  active,
  statusLabel,
}: {
  progress: number;
  active: boolean;
  statusLabel: string;
}) {
  if (!active) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-primary/10 bg-background/30">
      <WorkspaceTopProgress progress={progress} className="rounded-none" />
      <div className="px-3 py-2.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-secondary/90">
            {statusLabel}
          </span>
        </div>
        <ReportGenerationStream compact variant="site-analysis" pluginName="Site Analysis" active={active} />
      </div>
    </div>
  );
}
