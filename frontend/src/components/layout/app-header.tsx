"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { HeaderProjectControls } from "@/components/layout/header-project-controls";
import { SiteUrlControl } from "@/components/site-url-control";
import { SiteAnalysisGenerationPanel } from "@/components/workspace/workspace-generation-panel";
import { Button } from "@/components/ui/button";
import { useAnalysisStore, SCAN_STATUS_LABELS, scanPhaseProgress } from "@/stores/analysis-store";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

export function AppHeader({
  title,
  compact = false,
  hideSiteUrl = false,
}: {
  title?: string;
  compact?: boolean;
  hideSiteUrl?: boolean;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const phase = useAnalysisStore((s) => s.phase);
  const error = useAnalysisStore((s) => s.error);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const busy = phase === "scanning" || phase === "analyzing" || phase === "generating";
  const isAnalyzing =
    phase !== "idle" && phase !== "completed" && phase !== "failed";

  return (
    <header
      className={cn(
        "glass-panel-strong flex flex-col gap-2 rounded-2xl px-4 py-2.5 sm:px-5",
        compact ? "mx-0 mt-0 rounded-none border-x-0 border-t-0" : "mx-3 mt-3",
      )}
    >
      <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {title && (
            <>
              <h1 className="shrink-0 text-sm font-semibold text-foreground">{title}</h1>
              <div className="hidden h-4 w-px bg-border/60 sm:block" />
            </>
          )}

          {!hideSiteUrl && (
            <>
              <SiteUrlControl compact disabled={busy} className="sm:max-w-sm" />
              {busy && (
                <span className="flex items-center gap-1.5 text-xs text-ai-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai-accent" />
                  {SCAN_STATUS_LABELS[phase]}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {hideSiteUrl && busy && (
            <span className="hidden items-center gap-1.5 text-xs text-ai-accent sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai-accent" />
              {SCAN_STATUS_LABELS[phase]}
            </span>
          )}
          <HeaderProjectControls />

          <span className="hidden text-xs text-muted sm:block">{user?.name}</span>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Log out"
            className="h-8 w-8 text-muted hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isAnalyzing && (
        <SiteAnalysisGenerationPanel
          active={isAnalyzing}
          progress={scanPhaseProgress(phase)}
          statusLabel={SCAN_STATUS_LABELS[phase] || "Analyzing"}
        />
      )}

      {phase === "failed" && error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </header>
  );
}
