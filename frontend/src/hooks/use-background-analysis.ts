"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import type { WebsiteAnalysis } from "@/lib/types";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useSiteStore } from "@/stores/site-store";

const POLL_MS = 2500;

function mapPhase(scanStatus?: string, prefillStatus?: string) {
  if (scanStatus === "failed") return "failed" as const;
  if (prefillStatus === "generating") return "generating" as const;
  if (scanStatus === "scanning") return "scanning" as const;
  if (prefillStatus === "completed" && (scanStatus === "completed" || scanStatus === "partial")) {
    return "completed" as const;
  }
  if (scanStatus === "completed" || scanStatus === "partial") return "analyzing" as const;
  return "idle" as const;
}

export function useBackgroundAnalysis() {
  const { siteUrl, setSiteUrl } = useSiteStore();
  const {
    phase,
    setPhase,
    setAnalysis,
    setCompetitors,
    setPrefillStatus,
    setError,
    reset,
  } = useAnalysisStore();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    if (!siteUrl) return;
    try {
      const res = await api.get<WebsiteAnalysis>(
        `/website-analysis?url=${encodeURIComponent(siteUrl)}`
      );
      if (res.analysis) setAnalysis(res.analysis);
      if (res.competitors?.length) setCompetitors(res.competitors);
      setPrefillStatus(res.prefill_status || null);
      const nextPhase = mapPhase(res.scan_status, res.prefill_status || undefined);
      setPhase(nextPhase);
      if (nextPhase === "completed" || nextPhase === "failed") {
        stopPolling();
        if (nextPhase === "completed") {
          window.setTimeout(() => setPhase("idle"), 2500);
        }
      }
    } catch {
      // scan may not exist yet
    }
  }, [siteUrl, setAnalysis, setCompetitors, setPrefillStatus, setPhase, stopPolling]);

  const startScan = useCallback(
    async (url: string, force = false) => {
      const normalized = url.trim();
      if (!normalized) return;
      reset();
      setSiteUrl(normalized);
      setPhase("scanning");
      setError(null);
      try {
        await api.post<WebsiteAnalysis>("/website-analysis/scan", { url: normalized, force });
        stopPolling();
        pollRef.current = setInterval(() => {
          pollStatus().catch(() => undefined);
        }, POLL_MS);
        await pollStatus();
      } catch {
        setError("Could not start background analysis");
        setPhase("failed");
      }
    },
    [pollStatus, reset, setError, setPhase, setSiteUrl, stopPolling]
  );

  useEffect(() => {
    if (!siteUrl) return;
    let cancelled = false;

    const checkAndPoll = async () => {
      try {
        const res = await api.get<WebsiteAnalysis>(
          `/website-analysis?url=${encodeURIComponent(siteUrl)}`
        );
        if (cancelled) return;
        const nextPhase = mapPhase(res.scan_status, res.prefill_status || undefined);
        if (nextPhase === "scanning" || nextPhase === "analyzing" || nextPhase === "generating") {
          stopPolling();
          pollRef.current = setInterval(() => {
            pollStatus().catch(() => undefined);
          }, POLL_MS);
        }
        await pollStatus();
      } catch {
        // no scan yet
      }
    };

    checkAndPoll().catch(() => undefined);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [siteUrl, pollStatus, stopPolling]);

  return { siteUrl, phase, startScan, pollStatus };
}
