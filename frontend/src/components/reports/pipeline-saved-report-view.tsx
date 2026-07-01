"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { downloadReportPdf } from "@/lib/report-pdf";
import { getExecutionMarkdown, getOutputMarkdown } from "@/lib/report-utils";
import {
  fetchPipelines,
  getPipelineById,
  FULL_CONTENT_PAGE_PIPELINE_ID,
  isFullContentPagePipeline,
} from "@/lib/pipelines";
import { savePipelineReportToProject } from "@/lib/save-pipeline-report";
import { pluginSuggestions } from "@/lib/plugin-report-presenters";
import { mergeMetrics } from "@/lib/report-view-model";
import {
  StructuredReportView,
  buildPipelineStepReports,
} from "@/components/reports/structured-report-view";
import { UnifiedPipelineReportView } from "@/components/reports/unified-pipeline-report";
import { PublishReadyPageView } from "@/components/reports/publish-ready-page";
import { ReportAppearanceReviewPanel } from "@/components/reports/report-appearance-review";
import { manifestFromUnifiedReport } from "@/lib/report-appearance-manifest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Output, PipelineExecuteResponse, PublishReadyPage, UnifiedPipelineReport } from "@/lib/types";
import { presentedReportToPdfDocument } from "@/lib/presented-report-pdf";
import type { PresentedReport } from "@/components/reports/report-presentation-view";
import { unifiedReportToPdfDocument } from "@/lib/unified-report-pdf";
import { AiSetupBanner } from "@/components/system/ai-setup-banner";
import { PipelinePagePreviewPanel } from "@/components/pipelines/pipeline-page-preview";
import { getPipelineSavedMeta } from "@/lib/saved-output";

function savedStepsToPipelineResponse(
  output: Output,
  meta: NonNullable<ReturnType<typeof getPipelineSavedMeta>>,
): PipelineExecuteResponse {
  return {
    pipeline_id: meta.pipelineId,
    pipeline_name: meta.pipelineName,
    pipeline_run_id: meta.pipelineRunId,
    status: "completed",
    steps: meta.steps.map((step) => ({
      step: step.step,
      plugin_id: step.plugin_id,
      plugin_name: step.plugin_name,
      label: step.label,
      execution_id: step.execution_id,
      status: "completed",
      output_markdown: step.output_markdown ?? "",
      output: step.output,
      schema_version: 1,
    })),
    combined_markdown: getOutputMarkdown(output, meta.pipelineName),
    workflow_steps: meta.steps.map((step) => ({
      step: step.step,
      label: step.label,
      status: "completed",
    })),
  };
}

export function PipelineSavedReportView({
  output,
  projectId,
  siteUrl = "",
  backHref = "/projects",
  backLabel = "Back to project",
  showSave = false,
}: {
  output: Output;
  projectId: string;
  siteUrl?: string;
  backHref?: string;
  backLabel?: string;
  showSave?: boolean;
}) {
  const meta = getPipelineSavedMeta(output);
  const pipelineId = meta?.pipelineId ?? "";
  const pipelineName = meta?.pipelineName ?? output.plugin_name ?? "Pipeline Report";
  const savedRunId = meta?.pipelineRunId ?? null;

  const [unifiedReport, setUnifiedReport] = useState<UnifiedPipelineReport | null>(null);
  const [unifiedLoading, setUnifiedLoading] = useState(true);
  const [assembledPage, setAssembledPage] = useState<PublishReadyPage | null>(null);
  const [presentedReport, setPresentedReport] = useState<PresentedReport | null>(null);
  const [legacyResult, setLegacyResult] = useState<PipelineExecuteResponse | null>(null);
  const [recentResults, setRecentResults] = useState<PipelineExecuteResponse | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [error, setError] = useState("");

  const domain = useMemo(() => {
    if (!siteUrl) return "";
    try {
      return new URL(siteUrl).hostname.replace(/^www\./, "");
    } catch {
      return siteUrl;
    }
  }, [siteUrl]);

  const effectiveRunId = savedRunId || recentResults?.pipeline_run_id || "";

  const appearanceManifest = useMemo(
    () => (unifiedReport ? manifestFromUnifiedReport(unifiedReport) : null),
    [unifiedReport],
  );

  useEffect(() => {
    setPresentedReport(null);
  }, [unifiedReport]);

  useEffect(() => {
    if (!pipelineId || !projectId) {
      setError("Missing pipeline or project.");
      setUnifiedLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { pipelines } = await fetchPipelines();
        const pipeline =
          pipelines.find((p) => p.id === pipelineId) ?? getPipelineById(pipelineId);
        if (pipeline && !cancelled) {
          // pipeline name from saved meta is already set
        }
      } catch {
        // non-critical
      }

      try {
        const domainParam = domain ? `&domain=${encodeURIComponent(domain)}` : "";
        const siteParam = siteUrl ? `&site_url=${encodeURIComponent(siteUrl)}` : "";

        const [unifiedData, assembledData, recentData] = await Promise.allSettled([
          api.get<UnifiedPipelineReport>(
            `/pipelines/${pipelineId}/unified-report?project_id=${encodeURIComponent(projectId)}${domainParam}`,
          ),
          pipelineId === FULL_CONTENT_PAGE_PIPELINE_ID
            ? api.get<PublishReadyPage>(
                `/pipelines/${pipelineId}/assembled-page?project_id=${encodeURIComponent(projectId)}${siteParam}`,
              )
            : Promise.resolve(null),
          api.get<PipelineExecuteResponse>(
            `/pipelines/${pipelineId}/recent-results?project_id=${encodeURIComponent(projectId)}`,
          ),
        ]);

        if (!cancelled) {
          if (unifiedData.status === "fulfilled") {
            setUnifiedReport(unifiedData.value);
          } else {
            throw unifiedData.reason;
          }
          if (assembledData.status === "fulfilled" && assembledData.value) {
            setAssembledPage(assembledData.value);
          }
          if (recentData.status === "fulfilled") setRecentResults(recentData.value);
          setUnifiedLoading(false);
        }
        return;
      } catch {
        // fall through to saved snapshot / legacy API
      }

      try {
        const data = await api.get<PipelineExecuteResponse>(
          `/pipelines/${pipelineId}/recent-results?project_id=${encodeURIComponent(projectId)}`,
        );
        if (!cancelled) {
          setLegacyResult(data);
          setUseFallback(true);
        }
      } catch {
        if (!cancelled && meta?.steps.length) {
          setLegacyResult(savedStepsToPipelineResponse(output, meta));
          setUseFallback(true);
        } else if (!cancelled) {
          setError("No pipeline report found.");
        }
      } finally {
        if (!cancelled) setUnifiedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pipelineId, projectId, domain, siteUrl, output.id]);

  const stepReports = useMemo(() => {
    const source = useFallback ? legacyResult : recentResults;
    if (!source?.steps.length) return [];
    return buildPipelineStepReports(source.steps, (step) =>
      getExecutionMarkdown(
        step.output ?? { markdown: step.output_markdown, structured: {} },
        step.plugin_name,
      ),
    );
  }, [legacyResult, recentResults, useFallback]);

  const combinedMarkdown = useMemo(() => {
    const source = useFallback ? legacyResult : recentResults;
    if (!source) return getOutputMarkdown(output, pipelineName);
    return stepReports
      .map((step) => `## Step ${step.step}: ${step.label}\n\n${step.markdown}`)
      .join("\n\n---\n\n");
  }, [legacyResult, recentResults, useFallback, stepReports, output, pipelineName]);

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
    const source = useFallback ? legacyResult : recentResults;
    if (!source || !stepReports[0]) return null;
    return {
      ...stepReports[0].reportJson,
      plugin_name: pipelineName,
      execution_id: source.steps.map((s) => s.execution_id).join(","),
    };
  }, [legacyResult, recentResults, useFallback, stepReports, pipelineName]);

  const suggestions = useMemo(() => {
    const source = useFallback ? legacyResult : recentResults;
    const names = source?.steps.map((s) => s.plugin_name) ?? [];
    const unique = [...new Set(names)];
    return unique.flatMap((name) => pluginSuggestions(name)).slice(0, 5);
  }, [legacyResult, recentResults, useFallback]);

  const executionIds = useMemo(() => {
    const source = recentResults ?? legacyResult;
    return source?.steps.map((s) => s.execution_id).join(", ") ?? "";
  }, [recentResults, legacyResult]);

  const handleSave = async () => {
    const steps = (recentResults ?? legacyResult)?.steps ?? [];
    if (!steps.length) return;
    const pipeline =
      getPipelineById(pipelineId) ?? {
        id: pipelineId,
        name: pipelineName,
        description: "",
        icon: "",
        impact: 0,
        steps: [],
        step_count: steps.length,
      };
    setSaving(true);
    setSaveMessage("");
    try {
      await savePipelineReportToProject({
        projectId,
        pipeline,
        steps,
        pipelineRunId: effectiveRunId || null,
      });
      setSaveMessage(`Saved "${pipeline.name}" to project.`);
    } catch {
      setError("Failed to save pipeline report.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfDownloading(true);
    setError("");
    try {
      if (unifiedReport && !useFallback) {
        if (presentedReport) {
          await downloadReportPdf(
            presentedReportToPdfDocument(presentedReport, {
              pipelineName,
              siteUrl,
              executionId: executionIds,
              deliverable: unifiedReport.final_deliverable,
            }),
          );
        } else {
          await downloadReportPdf(
            unifiedReportToPdfDocument(unifiedReport, {
              pipelineName,
              siteUrl,
              executionId: executionIds,
            }),
          );
        }
        return;
      }
      if (!stepReports.length) return;
      await downloadReportPdf({
        pluginName: pipelineName,
        title: pipelineName,
        executionId: executionIds,
        generatedAt: output.created_at,
        overallScore,
        sections: [],
        pipelineSteps: stepReports,
        metrics: metrics ?? undefined,
        suggestions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate PDF.");
    } finally {
      setPdfDownloading(false);
    }
  };

  if (unifiedLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface/50" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface/80" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-surface/80" />
      </div>
    );
  }

  if (!unifiedReport && !legacyResult) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error || "No pipeline report available."}</p>
        <Link href={backHref} className="text-primary hover:underline">
          {backLabel}
        </Link>
      </div>
    );
  }

  if (unifiedReport && !useFallback) {
    return (
      <div className="space-y-6">
        <AiSetupBanner mode="presentation" />
        <UnifiedPipelineReportView
          report={unifiedReport}
          onSave={showSave && recentResults ? handleSave : undefined}
          saving={saving}
          saveMessage={saveMessage}
          error={error}
          onDownloadPdf={handleDownloadPdf}
          pdfDownloading={pdfDownloading}
          onPresentationReady={setPresentedReport}
          backHref={backHref}
          backLabel={backLabel}
        />
        {appearanceManifest && <ReportAppearanceReviewPanel manifest={appearanceManifest} />}
        {assembledPage && isFullContentPagePipeline(pipelineId) && (
          <PublishReadyPageView page={assembledPage} />
        )}
        {isFullContentPagePipeline(pipelineId) && effectiveRunId && (
          <section className="space-y-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Website preview</h2>
              <p className="text-sm text-muted">Live preview from your pipeline run.</p>
            </div>
            <PipelinePagePreviewPanel pipelineRunId={effectiveRunId} />
          </section>
        )}
      </div>
    );
  }

  return (
    <StructuredReportView
      title={pipelineName}
      subtitle={`${legacyResult!.steps.length} skills • Prepared by SkillSearchFit • ${new Date(output.created_at).toLocaleDateString()}`}
      reportJson={pipelineReportJson}
      metrics={metrics}
      overallScore={overallScore}
      structuredSections={[]}
      pipelineSteps={stepReports}
      fullMarkdown={combinedMarkdown}
      suggestions={suggestions}
      onDownloadPdf={handleDownloadPdf}
      pdfDownloading={pdfDownloading}
      onSave={showSave ? handleSave : undefined}
      saving={saving}
      saveMessage={saveMessage}
      error={error}
      backHref={backHref}
      backLabel={backLabel}
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
                <span className="font-medium">
                  {step.step}. {step.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {displayPluginName(step.pluginName)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      }
    />
  );
}
