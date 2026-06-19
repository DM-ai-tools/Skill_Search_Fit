"use client";

import { useState } from "react";
import { ChevronDown, FolderKanban, RefreshCw } from "lucide-react";
import { useAnalysisActions } from "@/components/analysis/background-analysis-provider";
import { Button } from "@/components/ui/button";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useProjectStore } from "@/stores/project-store";
import { useSiteStore } from "@/stores/site-store";
import { cn } from "@/lib/utils";

export function HeaderProjectControls() {
  const { projects, activeProjectId, setActiveProject } = useProjectStore();
  const siteUrl = useSiteStore((s) => s.siteUrl);
  const phase = useAnalysisStore((s) => s.phase);
  const { startScan } = useAnalysisActions();
  const [rerunning, setRerunning] = useState(false);

  const isAnalyzing =
    phase !== "idle" && phase !== "completed" && phase !== "failed";
  const spinning = rerunning || isAnalyzing;

  const handleRescan = async () => {
    if (!siteUrl) return;
    setRerunning(true);
    try {
      await startScan(siteUrl, true);
    } finally {
      setRerunning(false);
    }
  };

  if (projects.length === 0 && !siteUrl) return null;

  if (projects.length === 0 && siteUrl) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleRescan}
        disabled={spinning}
        className="hidden h-8 gap-1.5 rounded-xl text-xs font-semibold sm:inline-flex"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
        Re-scan
      </Button>
    );
  }

  return (
    <div className="hidden min-w-0 items-center gap-1 rounded-xl border border-border/55 bg-surface/50 p-1 shadow-[inset_0_1px_0_rgba(244,241,236,0.04)] sm:flex">
      <div className="relative min-w-0">
        <div className="pointer-events-none absolute left-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-primary/15 bg-primary/10">
          <FolderKanban className="h-3 w-3 text-primary" />
        </div>
        <select
          className="h-8 max-w-[10.5rem] min-w-[8.5rem] cursor-pointer appearance-none truncate rounded-lg border-0 bg-transparent py-0 pl-10 pr-7 text-xs font-semibold text-foreground transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
          value={activeProjectId || ""}
          onChange={(e) => setActiveProject(e.target.value || null)}
          aria-label="Active project"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.project_name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
      </div>

      {siteUrl && (
        <>
          <div className="mx-0.5 h-5 w-px bg-border/50" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleRescan}
            disabled={spinning}
            className="h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-foreground/90 hover:bg-primary/10 hover:text-primary"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
            Re-scan
          </Button>
        </>
      )}
    </div>
  );
}
