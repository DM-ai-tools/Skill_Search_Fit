"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { downloadReportPdf } from "@/lib/report-pdf";
import { getExecutionMarkdown, getOutputMarkdown } from "@/lib/report-utils";
import { pluginSuggestions } from "@/lib/plugin-report-presenters";
import {
  StructuredReportView,
} from "@/components/reports/structured-report-view";
import {
  buildReportJson,
  extractOverallScore,
  fallbackSectionsFromMarkdown,
  summarizeMetrics,
  toStructuredSections,
} from "@/lib/report-view-model";
import { getSavedStructured } from "@/lib/saved-output";
import type { Output } from "@/lib/types";

type ExecutionRecord = {
  id: string;
  status: string;
  result: { markdown?: string; structured?: Record<string, unknown> } | null;
};

export function PluginSavedReportView({
  output,
  backHref = "/projects",
  backLabel = "Back to project",
}: {
  output: Output;
  backHref?: string;
  backLabel?: string;
}) {
  const pluginName = output.plugin_name || "Report";
  const [execution, setExecution] = useState<ExecutionRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(output.execution_id));
  const [error, setError] = useState("");
  const [pdfDownloading, setPdfDownloading] = useState(false);

  useEffect(() => {
    if (!output.execution_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const exec = await api.get<ExecutionRecord>(`/executions/${output.execution_id}`);
        if (!cancelled) setExecution(exec);
      } catch {
        // Fall back to saved snapshot below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [output.execution_id]);

  const markdown = useMemo(() => {
    if (execution?.result) {
      return getExecutionMarkdown(execution.result, pluginName);
    }
    return getOutputMarkdown(output, pluginName);
  }, [execution, output, pluginName]);

  const structured = useMemo(
    () => execution?.result?.structured ?? getSavedStructured(output),
    [execution, output],
  );

  const reportJson = useMemo(() => {
    if (!markdown) return null;
    return {
      ...buildReportJson(
        pluginName,
        output.execution_id || output.id,
        execution?.status || "completed",
        markdown,
      ),
      generated_at: output.created_at,
    };
  }, [markdown, pluginName, output, execution]);

  const structuredSections = useMemo(() => {
    if (!reportJson) return [];
    const base = toStructuredSections(reportJson);
    if (!markdown) return base;
    return [...base, ...fallbackSectionsFromMarkdown(markdown, base)];
  }, [reportJson, markdown]);

  const overallScore = useMemo(() => {
    if (!reportJson) return null;
    return extractOverallScore(reportJson, markdown, structured);
  }, [reportJson, markdown, structured]);

  const metrics = useMemo(
    () => (reportJson ? summarizeMetrics(reportJson) : null),
    [reportJson],
  );

  const suggestions = useMemo(() => pluginSuggestions(pluginName), [pluginName]);

  const handleDownloadPdf = async () => {
    if (!reportJson || structuredSections.length === 0) return;
    setPdfDownloading(true);
    setError("");
    try {
      await downloadReportPdf({
        pluginName: displayPluginName(pluginName),
        executionId: output.execution_id || output.id,
        generatedAt: output.created_at,
        status: execution?.status || "completed",
        overallScore,
        sections: structuredSections,
        metrics: metrics ?? undefined,
        suggestions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate PDF.");
    } finally {
      setPdfDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface/50" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-surface/80" />
      </div>
    );
  }

  if (!markdown || !reportJson) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error || "No report content found."}</p>
        <Link href={backHref} className="text-primary hover:underline">
          {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <StructuredReportView
      title={displayPluginName(pluginName)}
      subtitle={`Prepared by SkillSearchFit • ${new Date(output.created_at).toLocaleDateString()}`}
      reportJson={reportJson}
      metrics={metrics}
      overallScore={overallScore}
      structuredSections={structuredSections}
      suggestions={suggestions}
      onDownloadPdf={handleDownloadPdf}
      pdfDownloading={pdfDownloading}
      error={error}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
