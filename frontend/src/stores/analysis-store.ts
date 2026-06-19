"use client";

import { create } from "zustand";
import type { CompetitorDiscovery } from "@/lib/types";

export type ScanPhase =
  | "idle"
  | "scanning"
  | "analyzing"
  | "discovering_competitors"
  | "generating"
  | "completed"
  | "failed";

interface AnalysisState {
  phase: ScanPhase;
  analysis: Record<string, unknown> | null;
  competitors: CompetitorDiscovery[];
  prefillStatus: string | null;
  error: string | null;
  setPhase: (phase: ScanPhase) => void;
  setAnalysis: (analysis: Record<string, unknown> | null) => void;
  setCompetitors: (competitors: CompetitorDiscovery[]) => void;
  setPrefillStatus: (status: string | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  phase: "idle",
  analysis: null,
  competitors: [],
  prefillStatus: null,
  error: null,
  setPhase: (phase) => set({ phase }),
  setAnalysis: (analysis) => set({ analysis }),
  setCompetitors: (competitors) => set({ competitors }),
  setPrefillStatus: (prefillStatus) => set({ prefillStatus }),
  setError: (error) => set({ error, phase: error ? "failed" : "idle" }),
  reset: () => set({ phase: "idle", analysis: null, competitors: [], prefillStatus: null, error: null }),
}));

export const SCAN_STATUS_LABELS: Record<ScanPhase, string> = {
  idle: "",
  scanning: "Scanning Website...",
  analyzing: "Analyzing Business...",
  discovering_competitors: "Discovering Competitors...",
  generating: "Generating Recommendations...",
  completed: "Completed",
  failed: "Analysis failed",
};

export function scanPhaseProgress(phase: ScanPhase): number {
  if (phase === "scanning") return 25;
  if (phase === "analyzing") return 50;
  if (phase === "discovering_competitors") return 75;
  if (phase === "generating") return 90;
  if (phase === "completed") return 100;
  return 0;
}
