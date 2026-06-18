"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { AnalysisStatusBanner } from "@/components/analysis/analysis-status-banner";
import { useBackgroundAnalysis } from "@/hooks/use-background-analysis";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useSiteStore } from "@/stores/site-store";

type AnalysisActions = {
  startScan: (url: string, force?: boolean) => Promise<void>;
};

const AnalysisActionsContext = createContext<AnalysisActions | null>(null);

export function useAnalysisActions() {
  const ctx = useContext(AnalysisActionsContext);
  if (!ctx) {
    throw new Error("useAnalysisActions must be used within BackgroundAnalysisProvider");
  }
  return ctx;
}

export function BackgroundAnalysisProvider({ children }: { children: ReactNode }) {
  const hydrate = useSiteStore((s) => s.hydrate);
  const hydrated = useSiteStore((s) => s.hydrated);
  const siteUrl = useSiteStore((s) => s.siteUrl);
  const phase = useAnalysisStore((s) => s.phase);
  const { startScan, pollStatus } = useBackgroundAnalysis();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !siteUrl) return;
    pollStatus().catch(() => undefined);
  }, [hydrated, siteUrl, pollStatus]);

  const showBanner = phase !== "idle" && phase !== "completed";

  return (
    <AnalysisActionsContext.Provider value={{ startScan }}>
      {showBanner && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-full max-w-sm px-4">
          <AnalysisStatusBanner phase={phase} />
        </div>
      )}
      {children}
    </AnalysisActionsContext.Provider>
  );
}
