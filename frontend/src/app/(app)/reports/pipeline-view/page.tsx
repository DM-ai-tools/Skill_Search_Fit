"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { downloadReportPdf } from "@/lib/report-pdf";
import { getExecutionMarkdown } from "@/lib/report-utils";
import { fetchPipelines, getPipelineById, FULL_CONTENT_PAGE_PIPELINE_ID, isFullContentPagePipeline } from "@/lib/pipelines";
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
import type { PipelineExecuteResponse, PublishReadyPage, UnifiedPipelineReport } from "@/lib/types";
import { presentedReportToPdfDocument } from "@/lib/presented-report-pdf";
import type { PresentedReport } from "@/components/reports/report-presentation-view";
import { unifiedReportToPdfDocument } from "@/lib/unified-report-pdf";
import { AiSetupBanner } from "@/components/system/ai-setup-banner";
import { PipelinePagePreviewPanel } from "@/components/pipelines/pipeline-page-preview";
import { useProjectStore } from "@/stores/project-store";

export default function PipelineReportViewPage() {
  const params = useSearchParams();
  const pipelineId = params.get("pipelineId") || "";
  const projectId = params.get("projectId") || "";
  const runId = params.get("runId") || "";
  const siteUrlParam = params.get("site_url") || "";
  const { activeProjectId } = useProjectStore();
  const effectiveProjectId = projectId || activeProjectId || "";

  // Unified report state (primary path)
  const [unifiedReport, setUnifiedReport] = useState<UnifiedPipelineReport | null>(null);
  const [unifiedLoading, setUnifiedLoading] = useState(true);
  const [assembledPage, setAssembledPage] = useState<PublishReadyPage | null>(null);
  const [presentedReport, setPresentedReport] = useState<PresentedReport | null>(null);

  // Fallback (legacy stacked view) state
  const [legacyResult, setLegacyResult] = useState<PipelineExecuteResponse | null>(null);
  const [recentResults, setRecentResults] = useState<PipelineExecuteResponse | null>(null);
  const [pipelineName, setPipelineName] = useState("Pipeline Report");
  const [useFallback, setUseFallback] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [error, setError] = useState("");

  // Derive domain from site_url param
  const domain = useMemo(() => {
    if (!siteUrlParam) return "";
    try {
      return new URL(siteUrlParam).hostname.replace(/^www\./, "");
    } catch {
      return siteUrlParam;
    }
  }, [siteUrlParam]);

  const effectiveRunId = runId || recentResults?.pipeline_run_id || "";

  const appearanceManifest = useMemo(
    () => (unifiedReport ? manifestFromUnifiedReport(unifiedReport) : null),
    [unifiedReport],
  );

  useEffect(() => {
    setPresentedReport(null);
  }, [unifiedReport]);

  useEffect(() => {
    if (!pipelineId || !effectiveProjectId) {
      setError(
        !pipelineId
          ? "Missing pipelineId."
          : "Select a project to view this pipeline report.",
      );
      setUnifiedLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // Resolve pipeline name for PDF export / fallback label
      try {
        const { pipelines, error } = await fetchPipelines();
        const pipeline =
          pipelines.find((p) => p.id === pipelineId) ?? getPipelineById(pipelineId);
        if (pipeline) setPipelineName(pipeline.name);
        if (error) console.warn("[pipeline-view]", error);
      } catch {
        // Non-critical — pipeline name just shows as default
      }

      // ── Primary path: unified report + assembled page in parallel ────────
      try {
        const domainParam = domain ? `&domain=${encodeURIComponent(domain)}` : "";
        const siteParam = siteUrlParam ? `&site_url=${encodeURIComponent(siteUrlParam)}` : "";

        const [unifiedData, assembledData, recentData] = await Promise.allSettled([
          api.get<UnifiedPipelineReport>(
            `/pipelines/${pipelineId}/unified-report?project_id=${encodeURIComponent(effectiveProjectId)}${domainParam}`,
          ),
          pipelineId === FULL_CONTENT_PAGE_PIPELINE_ID
            ? api.get<PublishReadyPage>(
                `/pipelines/${pipelineId}/assembled-page?project_id=${encodeURIComponent(effectiveProjectId)}${siteParam}`,
              )
            : Promise.resolve(null),
          api.get<PipelineExecuteResponse>(
            `/pipelines/${pipelineId}/recent-results?project_id=${encodeURIComponent(effectiveProjectId)}`,
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
        return; // ← primary path done; skip fallback
      } catch {
        // Unified report unavailable — fall through to legacy view
      }

      // ── Fallback path: stacked per-skill view ─────────────────────────────
      try {
        const data = await api.get<PipelineExecuteResponse>(
          `/pipelines/${pipelineId}/recent-results?project_id=${encodeURIComponent(effectiveProjectId)}`,
        );
        if (!cancelled) {
          setLegacyResult(data);
          setUseFallback(true);
        }
      } catch {
        if (!cancelled) setError("No pipeline report found. Run the pipeline first.");
      } finally {
        if (!cancelled) setUnifiedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pipelineId, effectiveProjectId, domain, siteUrlParam]);

  // ── Legacy view helpers (only used when useFallback === true) ────────────

  const unifiedStepReports = useMemo(() => {
    if (!recentResults?.steps.length) return [];
    return buildPipelineStepReports(recentResults.steps, (step) =>
      getExecutionMarkdown(
        step.output ?? { markdown: step.output_markdown, structured: {} },
        step.plugin_name,
      ),
    );
  }, [recentResults]);

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
    if (!source) return "";
    return stepReports
      .map((step) => `## Step ${step.step}: ${step.label}\n\n${step.markdown}`)
      .join("\n\n---\n\n");
  }, [legacyResult, recentResults, useFallback, stepReports]);

  const metrics = useMemo(
    () =>
      stepReports.length ? mergeMetrics(stepReports.map((s) => s.reportJson)) : null,
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

  // ── Save handler (works for both views) ──────────────────────────────────

  const executionIds = useMemo(() => {
    const source = recentResults ?? legacyResult;
    return source?.steps.map((s) => s.execution_id).join(", ") ?? "";
  }, [recentResults, legacyResult]);

  const handleSaveAll = async () => {
    if (!effectiveProjectId || !pipelineId) return;
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
        projectId: effectiveProjectId,
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
              siteUrl: siteUrlParam,
              executionId: executionIds,
              deliverable: unifiedReport.final_deliverable,
            }),
          );
        } else {
          await downloadReportPdf(
            unifiedReportToPdfDocument(unifiedReport, {
              pipelineName,
              siteUrl: siteUrlParam,
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
        generatedAt: new Date().toISOString(),
        overallScore,
        sections: [],
        pipelineSteps: stepReports,
        metrics: metrics ?? undefined,
        suggestions,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not generate PDF. Please try again.",
      );
    } finally {
      setPdfDownloading(false);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (unifiedLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface/50" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface/80" />
        <div className="h-[420px] animate-pulse rounded-2xl bg-surface/80" />
      </div>
    );
  }

  // ── Error / empty state ───────────────────────────────────────────────────

  if (!unifiedReport && !legacyResult) {
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

  // ── Primary: unified report ───────────────────────────────────────────────

  if (unifiedReport && !useFallback) {
    return (
      <div className="space-y-6">
        <AiSetupBanner mode="presentation" />

        <UnifiedPipelineReportView
          report={unifiedReport}
          onSave={recentResults ? handleSaveAll : undefined}
          saving={saving}
          saveMessage={saveMessage}
          error={error}
          onDownloadPdf={handleDownloadPdf}
          pdfDownloading={pdfDownloading}
          onPresentationReady={setPresentedReport}
          backHref="/dashboard"
          backLabel="Back to dashboard"
        />

        {appearanceManifest && (
          <ReportAppearanceReviewPanel manifest={appearanceManifest} />
        )}

        {assembledPage && isFullContentPagePipeline(pipelineId) && (
          <PublishReadyPageView page={assembledPage} />
        )}

        {isFullContentPagePipeline(pipelineId) && effectiveRunId && (
          <section className="space-y-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Website preview</h2>
              <p className="text-sm text-muted">
                Your publish-ready page is being generated in the background while you review the report above.
              </p>
            </div>
            <PipelinePagePreviewPanel pipelineRunId={effectiveRunId} />
          </section>
        )}
      </div>
    );
  }

  // ── Fallback: legacy stacked view ────────────────────────────────────────

  return (
    <StructuredReportView
      title={pipelineName}
      subtitle={`${legacyResult!.steps.length} skills • Prepared by SkillSearchFit • ${new Date().toLocaleDateString()}`}
      reportJson={pipelineReportJson}
      metrics={metrics}
      overallScore={overallScore}
      structuredSections={[]}
      pipelineSteps={stepReports}
      fullMarkdown={combinedMarkdown}
      suggestions={suggestions}
      onDownloadPdf={handleDownloadPdf}
      pdfDownloading={pdfDownloading}
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
