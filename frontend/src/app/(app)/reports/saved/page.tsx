"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Output } from "@/lib/types";
import { SavedReportViewer } from "@/components/reports/saved-report-viewer";
import { useProjectStore } from "@/stores/project-store";

export default function SavedReportPage() {
  const params = useSearchParams();
  const projectId = params.get("projectId") || "";
  const outputId = params.get("outputId") || "";
  const { activeProjectId } = useProjectStore();
  const effectiveProjectId = projectId || activeProjectId || "";

  const [output, setOutput] = useState<Output | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!effectiveProjectId || !outputId) {
      setError("Missing project or report.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const outputs = await api.get<Output[]>(`/projects/${effectiveProjectId}/outputs`);
      const match = outputs.find((item) => item.id === outputId) ?? null;
      if (!match) {
        setError("Saved report not found.");
        setOutput(null);
        return;
      }
      setOutput(match);
    } catch {
      setError("Failed to load saved report.");
    } finally {
      setLoading(false);
    }
  }, [effectiveProjectId, outputId]);

  useEffect(() => {
    load().catch(() => setError("Failed to load saved report."));
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface/50" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-surface/80" />
      </div>
    );
  }

  if (!output) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error || "Saved report not found."}</p>
        <Link
          href={effectiveProjectId ? `/projects/${effectiveProjectId}` : "/projects"}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </Link>
      </div>
    );
  }

  return (
    <SavedReportViewer
      output={output}
      projectId={effectiveProjectId}
      backHref={effectiveProjectId ? `/projects/${effectiveProjectId}` : "/projects"}
      backLabel="Back to project"
    />
  );
}
