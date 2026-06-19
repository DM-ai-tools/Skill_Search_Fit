"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { downloadReportPdf } from "@/lib/report-pdf";
import { getExecutionMarkdown } from "@/lib/report-utils";
import { fetchPipelines, getPipelineById } from "@/lib/pipelines";
import { pluginSuggestions } from "@/lib/plugin-report-presenters";
import { mergeMetrics } from "@/lib/report-view-model";
import {
  StructuredReportView,
  buildPipelineStepReports,
} from "@/components/reports/structured-report-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PipelineExecuteResponse } from "@/lib/types";
import { useProjectStore } from "@/stores/project-store";

export default function PipelineReportViewPage() {
  const params = useSearchParams();
  const pipelineId = params.get("pipelineId") || "";
  const projectId = params.get("projectId") || "";
  const { activeProjectId } = useProjectStore();
  const effectiveProjectId = projectId || activeProjectId || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PipelineExecuteResponse | null>(null);
  const [pipelineName, setPipelineName] = useState("Pipeline Report");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!pipelineId || !effectiveProjectId) {
      setError(!pipelineId ? "Missing pipelineId." : "Select a project to view this pipeline report.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const pipelines = await fetchPipelines();
        const pipeline = pipelines.find((p) => p.id === pipelineId) ?? getPipelineById(pipelineId);
        if (pipeline) setPipelineName(pipeline.name);

        const data = await api.get<PipelineExecuteResponse>(
          `/pipelines/${pipelineId}/recent-results?project_id=${encodeURIComponent(effectiveProjectId)}`,
        );
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setError("No pipeline report found. Run the pipeline first.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pipelineId, effectiveProjectId]);

  const stepReports = useMemo(() => {
    if (!result?.steps.length) return [];
    return buildPipelineStepReports(result.steps, (step) =>
      getExecutionMarkdown(
        step.output ?? { markdown: step.output_markdown, structured: {} },
        step.plugin_name,
      ),
    );
  }, [result]);

  const combinedMarkdown = useMemo(() => {
    if (!result) return "";
    return stepReports
      .map((step) => `## Step ${step.step}: ${step.label}\n\n${step.markdown}`)
      .join("\n\n---\n\n");
  }, [result, stepReports]);

  const metrics = useMemo(
    () => (stepReports.length ? mergeMetrics(stepReports.map((s) => s.reportJson)) : null),
    [stepReports],
  );

  const overallScore = useMemo(() => {
    const scores = stepReports
      .map((s) => s.overallScore)
      .filter((s): s is number => s !== null);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [stepReports]);

  const pipelineReportJson = useMemo(() => {
    if (!result || !stepReports[0]) return null;
    return {
      ...stepReports[0].reportJson,
      plugin_name: pipelineName,
      execution_id: result.steps.map((s) => s.execution_id).join(","),
    };
  }, [result, stepReports, pipelineName]);

  const suggestions = useMemo(() => {
    const names = result?.steps.map((s) => s.plugin_name) ?? [];
    const unique = [...new Set(names)];
    return unique.flatMap((name) => pluginSuggestions(name)).slice(0, 5);
  }, [result]);

  const handleDownloadPdf = () => {
    if (!combinedMarkdown) return;
    downloadReportPdf(pipelineName, combinedMarkdown);
  };

  const handleSaveAll = async () => {
    if (!result || !effectiveProjectId) return;
    setSaving(true);
    setSaveMessage("");
    try {
      for (const step of result.steps) {
        const output = step.output ?? { markdown: step.output_markdown, structured: {} };
        await api.post("/outputs", {
          project_id: effectiveProjectId,
          plugin_id: step.plugin_id,
          execution_id: step.execution_id,
          input_snapshot: {},
          schema_version: step.schema_version ?? 1,
          generated_output: output,
        });
      }
      setSaveMessage(`Saved ${result.steps.length} reports to project.`);
    } catch {
      setError("Failed to save one or more reports.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface/50" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface/80" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-surface/80" />
      </div>
    );
  }

  if (!result || stepReports.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error || "No pipeline report available."}</p>
        {pipelineId && (
          <Link
            href={`/pipeline/${pipelineId}${effectiveProjectId ? `?project=${effectiveProjectId}` : ""}`}
            className="text-primary hover:underline"
          >
            Run pipeline
          </Link>
        )}
      </div>
    );
  }

  return (
    <StructuredReportView
      title={pipelineName}
      subtitle={`${result.steps.length} skills • Prepared by SkillSearchFit • ${new Date().toLocaleDateString()}`}
      reportJson={pipelineReportJson}
      metrics={metrics}
      overallScore={overallScore}
      structuredSections={[]}
      pipelineSteps={stepReports}
      fullMarkdown={combinedMarkdown}
      suggestions={suggestions}
      onDownloadPdf={handleDownloadPdf}
      onSave={handleSaveAll}
      saving={saving}
      saveMessage={saveMessage}
      error={error}
      backHref="/dashboard"
      backLabel="Back to dashboard"
      sidebarExtra={
        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Pipeline Skills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stepReports.map((step) => (
              <Link
                key={step.executionId}
                href={`/reports/view?executionId=${step.executionId}&pluginId=${step.pluginId}`}
                className="block rounded-lg border border-border/60 bg-surface/80 px-3 py-2 text-sm text-foreground hover:border-primary/30 hover:text-primary"
              >
                <span className="font-medium">{step.step}. {step.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{displayPluginName(step.pluginName)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      }
    />
  );
}
