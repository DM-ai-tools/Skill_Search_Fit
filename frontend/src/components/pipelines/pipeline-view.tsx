"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { PluginReportOutput, toExecuteResponse } from "@/components/reports/plugin-report-output";
import { WorkspaceGenerationPanel } from "@/components/workspace/workspace-generation-panel";
import { WorkspaceTopProgress } from "@/components/workspace/workspace-top-progress";
import { api, ApiError } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { fetchPipelines, getPipelineById, isFullContentPagePipeline, pipelineRunSessionKey, runToExecuteResponse, fetchPipelineRun, continuePipelineRun, normalizeContinuePayload, buildPipelineReportHref, type PipelineContinueOptions } from "@/lib/pipelines";
import { pollPipelineRun, runPipelineWithReview } from "@/lib/pipeline-run-orchestrator";
import { usePipelineReviewGate } from "@/hooks/use-pipeline-review-gate";
import { savePipelineReportToProject } from "@/lib/save-pipeline-report";
import { formatApiError } from "@/lib/format-api-error";
import type { Pipeline, PipelineExecuteResponse, PipelinePendingInputs, PipelineRun, PipelineStepResult, WebsiteAnalysis } from "@/lib/types";
import { CompetitorIntelligencePanel } from "@/components/pipelines/competitor-intelligence-panel";
import { PipelineInputReview } from "@/components/pipelines/pipeline-input-review";
import { useProjectStore } from "@/stores/project-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { BentoSectionHeader, BentoTile } from "@/components/bento";
import { AiSetupBanner } from "@/components/system/ai-setup-banner";
import { ProjectGatePanel } from "@/components/projects/project-gate-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function brandFromSiteUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    const slug = host.split(".")[0] || host;
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  } catch {
    return "Your site";
  }
}

export function PipelineView({
  pipelineId,
  projectId,
  siteUrl,
}: {
  pipelineId: string;
  projectId?: string;
  siteUrl?: string;
}) {
  const router = useRouter();
  const { activeProjectId, setActiveProject } = useProjectStore();
  const { analysis, competitors: storedCompetitors, phase: analysisPhase } = useAnalysisStore();
  const [pipeline, setPipeline] = useState<Pipeline | null>(() => getPipelineById(pipelineId) ?? null);
  const [pipelineLoading, setPipelineLoading] = useState(true);
  const [siteInput, setSiteInput] = useState(siteUrl || "");
  const [competitors, setCompetitors] = useState("");
  const [seedTopic, setSeedTopic] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [running, setRunning] = useState(false);
  const [analyzingCompetitors, setAnalyzingCompetitors] = useState(false);
  const orchestratingRef = useRef(false);
  const {
    pendingReview,
    reviewRun,
    continuingReview,
    waitForReview,
    handleReviewContinue,
    handleReviewSkip,
    clearReview,
    showPendingReview,
    endContinuingReview,
  } = usePipelineReviewGate();
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [runExpired, setRunExpired] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState("");
  const [result, setResult] = useState<PipelineExecuteResponse | null>(null);
  const [completedSteps, setCompletedSteps] = useState<PipelineStepResult[]>([]);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const handleAutofill = useCallback(async () => {
    const url = normalizeUrl(siteInput);
    if (!url) {
      setAutofillMsg("Enter a site URL first.");
      return;
    }

    setAutofilling(true);
    setAutofillMsg("");
    let filled = false;

    try {
      const intel = await api.get<WebsiteAnalysis>(`/website-analysis?url=${encodeURIComponent(url)}`);
      const profile = intel.analysis || {};
      const competitorLines = (intel.competitors || [])
        .map((c) => c.domain || c.name)
        .filter(Boolean)
        .join("\n");
      if (competitorLines) {
        setCompetitors(competitorLines);
        filled = true;
      }

      const keywords = profile.seo_keywords as string[] | undefined;
      const topicSuggestion =
        keywords?.[0] ||
        (profile.products_services as string[] | undefined)?.[0] ||
        profile.industry;
      if (topicSuggestion && !seedTopic) {
        setSeedTopic(String(topicSuggestion).slice(0, 120));
        filled = true;
      }

      const audience = profile.target_audience;
      if (Array.isArray(audience) && audience.length > 0 && !targetAudience) {
        setTargetAudience(audience.slice(0, 3).join(", "));
        filled = true;
      }
    } catch {
      // Fall back to in-memory analysis store below.
    }

    if (storedCompetitors.length > 0) {
      setCompetitors(storedCompetitors.map((c) => c.domain).join("\n"));
      filled = true;
    }

    const quickAudit = analysis?.quick_audit as Record<string, unknown> | undefined;
    const wins = quickAudit?.quick_wins as string[] | undefined;
    const actions = quickAudit?.priority_actions_30_days as string[] | undefined;
    const topicSuggestion = wins?.[0] ?? actions?.[0] ?? "";
    if (topicSuggestion && !seedTopic) {
      setSeedTopic(topicSuggestion.slice(0, 120));
      filled = true;
    }

    setAutofillMsg(
      filled
        ? "Fields filled from your site analysis."
        : "No analysis data found. Run a site scan from the dashboard first.",
    );
    setAutofilling(false);
  }, [analysis, siteInput, storedCompetitors, seedTopic, targetAudience]);

  const isContentProduction = pipelineId === "content-production-pipeline";
  const showCompetitorsField = !isContentProduction;
  const effectiveProjectId = projectId || activeProjectId;

  useEffect(() => {
    setPipelineLoading(true);
    fetchPipelines()
      .then(({ pipelines: list, error }) => {
        const match = list.find((p) => p.id === pipelineId) ?? getPipelineById(pipelineId) ?? null;
        setPipeline(match);
        if (!match) setError("Pipeline not found.");
        if (error) setError((prev) => (prev ? `${prev} ${error}` : error));
      })
      .catch(() => {
        const fallback = getPipelineById(pipelineId);
        setPipeline(fallback ?? null);
        if (!fallback) setError("Pipeline not found.");
      })
      .finally(() => setPipelineLoading(false));
  }, [pipelineId]);

  const navigateToReport = useCallback(
    (runId: string) => {
      if (!effectiveProjectId) return;
      sessionStorage.removeItem(pipelineRunSessionKey(pipelineId, effectiveProjectId));
      const site = normalizeUrl(siteInput) || siteInput.trim();
      router.push(
        buildPipelineReportHref(pipelineId, effectiveProjectId, {
          runId,
          siteUrl: site || undefined,
        }),
      );
    },
    [effectiveProjectId, pipelineId, router, siteInput],
  );

  const applyRunState = useCallback(
    (run: PipelineRun) => {
      setPipelineRun(run);
      const steps = (run.step_results || []) as PipelineStepResult[];
      setCompletedSteps(steps);
      if (run.status === "paused_for_review" && run.pending_inputs) {
        endContinuingReview();
        if (!orchestratingRef.current) {
          showPendingReview(run.pending_inputs as PipelinePendingInputs, run);
        }
        setActiveStep(Math.max(0, steps.length - 1));
        setRunning(false);
        setAnalyzingCompetitors(false);
      } else if (run.status === "completed") {
        clearReview();
        setRunning(false);
        setAnalyzingCompetitors(false);
        if (pipeline) {
          setResult(runToExecuteResponse(run, pipeline));
          setActiveStep(Math.max(0, steps.length - 1));
        }
        if (effectiveProjectId) {
          const key = pipelineRunSessionKey(pipelineId, effectiveProjectId);
          const shouldOpenReport =
            isFullContentPagePipeline(pipelineId) || sessionStorage.getItem(key);
          sessionStorage.removeItem(key);
          if (shouldOpenReport) {
            navigateToReport(run.id);
          }
        }
      } else if (run.status === "expired") {
        setRunExpired(true);
        setRunning(false);
        endContinuingReview();
        setAnalyzingCompetitors(false);
      } else if (run.status === "analyzing_competitors") {
        setAnalyzingCompetitors(true);
        setRunning(true);
        clearReview();
      } else if (run.status === "running") {
        setAnalyzingCompetitors(false);
        setRunning(true);
        clearReview();
        setActiveStep(Math.max(0, run.current_skill_index - 1));
      } else if (run.status === "failed") {
        setRunning(false);
        endContinuingReview();
        setAnalyzingCompetitors(false);
        clearReview();
        setError(run.error_message || "Pipeline run failed. Try again.");
      }
    },
    [pipeline, clearReview, showPendingReview, endContinuingReview, effectiveProjectId, pipelineId, navigateToReport],
  );

  const restoreActiveRun = useCallback(async () => {
    if (!effectiveProjectId || !pipeline) return;
    const key = pipelineRunSessionKey(pipelineId, effectiveProjectId);
    const storedRunId = typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
    if (!storedRunId) return;
    try {
      const run = await fetchPipelineRun(storedRunId);
      if (run.status === "completed") {
        sessionStorage.removeItem(key);
        return;
      }
      applyRunState(run);
      if (run.status === "running" || run.status === "analyzing_competitors") {
        void pollPipelineRun(run.id, applyRunState).catch(() => undefined);
      }
    } catch (err) {
      sessionStorage.removeItem(key);
      if (err instanceof ApiError && err.status === 400) {
        setRunExpired(true);
      }
    }
  }, [applyRunState, effectiveProjectId, pipeline, pipelineId]);

  useEffect(() => {
    setResult(null);
    setCompletedSteps([]);
    setActiveStep(0);
    setPipelineRun(null);
    setRunning(false);
    setAnalyzingCompetitors(false);
    setError("");
    setRunExpired(false);
    clearReview();
  }, [pipelineId, clearReview]);

  useEffect(() => {
    restoreActiveRun();
  }, [restoreActiveRun]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  useEffect(() => {
    if (siteUrl) setSiteInput(siteUrl);
  }, [siteUrl]);

  const handleRun = useCallback(async () => {
    if (!pipeline || !effectiveProjectId) return;
    const url = normalizeUrl(siteInput);
    if (!url) {
      setError("Site URL is required.");
      return;
    }
    const derivedBrand = brandFromSiteUrl(url);
    setError("");
    setRunning(true);
    setAnalyzingCompetitors(true);
    setResult(null);
    setCompletedSteps([]);
    setActiveStep(0);
    clearReview();
    setRunExpired(false);
    setPipelineRun(null);

    const inputs = {
      site_url: url,
      brand_name: derivedBrand,
      business_name: derivedBrand,
      competitors: competitors.trim(),
      seed_topic: seedTopic.trim(),
      target_audience: targetAudience.trim() || "General audience",
    };

    try {
      orchestratingRef.current = true;
      const run = await runPipelineWithReview({
        pipelineId,
        projectId: effectiveProjectId,
        inputs,
        onRunUpdate: applyRunState,
        waitForReview,
      });
      sessionStorage.setItem(
        pipelineRunSessionKey(pipelineId, effectiveProjectId),
        run.id,
      );
      applyRunState(run);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Your session expired. Log in again to run pipelines."
          : err instanceof ApiError && err.status === 404
          ? "Pipeline API is unavailable. Restart the backend (npm run dev:api) and try again."
          : formatApiError(err, "Pipeline execution failed");
      setError(message);
      setRunning(false);
      setAnalyzingCompetitors(false);
      endContinuingReview();
    } finally {
      orchestratingRef.current = false;
      clearReview();
    }
  }, [
    pipeline,
    effectiveProjectId,
    siteInput,
    competitors,
    seedTopic,
    targetAudience,
      pipelineId,
      applyRunState,
      waitForReview,
    clearReview,
    endContinuingReview,
  ]);

  const handleContinue = useCallback(
    async (payload: PipelineContinueOptions | Record<string, unknown>) => {
      const activeRun = pipelineRun ?? reviewRun;
      if (!activeRun) return;
      const options = normalizeContinuePayload(payload);
      if (orchestratingRef.current) {
        setRunning(true);
        setError("");
        handleReviewContinue(options);
        return;
      }
      setError("");
      setRunning(true);
      try {
        const run = await continuePipelineRun(activeRun.id, options);
        if (run.status === "completed" && effectiveProjectId) {
          sessionStorage.setItem(pipelineRunSessionKey(pipelineId, effectiveProjectId), run.id);
        }
        applyRunState(run);
        if (run.status === "running" || run.status === "analyzing_competitors") {
          void pollPipelineRun(run.id, applyRunState).catch(() => undefined);
        }
      } catch (err) {
        setRunning(false);
        endContinuingReview();
        setError(formatApiError(err, "Could not continue pipeline"));
      }
    },
    [
      pipelineRun,
      reviewRun,
      applyRunState,
      pipelineId,
      effectiveProjectId,
      handleReviewContinue,
      endContinuingReview,
    ],
  );

  const handleSkipReview = useCallback(() => {
    if (orchestratingRef.current) {
      handleReviewSkip();
      return;
    }
    if (pendingReview?.change_suggestions?.length) {
      void handleContinue({ approveAllPending: true, suggestionUpdates: pendingReview.change_suggestions.map((s) => ({ id: s.id, approval_status: s.approval_status })) });
      return;
    }
    void handleContinue({ editedInputs: {} });
  }, [handleContinue, handleReviewSkip, pendingReview]);

  const displaySteps = result?.steps ?? completedSteps;
  const selectedStep = pipeline ? displaySteps[activeStep] : undefined;
  const activePluginName = pipeline?.steps[activeStep]?.plugin_name ?? "";

  const handleSavePipeline = useCallback(async () => {
    if (!pipeline || !effectiveProjectId || !displaySteps.length) return;
    setSaving(true);
    setSaveMessage("");
    try {
      await savePipelineReportToProject({
        projectId: effectiveProjectId,
        pipeline,
        steps: displaySteps,
        pipelineRunId: pipelineRun?.id ?? result?.pipeline_run_id ?? null,
      });
      setSaveMessage(`Saved "${pipeline.name}" to project.`);
    } catch (err) {
      setSaveMessage(formatApiError(err, "Could not save pipeline report."));
    } finally {
      setSaving(false);
    }
  }, [pipeline, effectiveProjectId, displaySteps, pipelineRun?.id, result?.pipeline_run_id]);

  const progressPct =
    !pipeline
      ? 0
      : result
        ? 100
        : running || pendingReview
          ? Math.min(
              94,
              ((completedSteps.length + (pendingReview ? 0.25 : 0.5)) / pipeline.step_count) * 100,
            )
          : 0;

  const competitorPanelCollapsed = completedSteps.length > 0;

  if (!effectiveProjectId) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <ProjectGatePanel
          title="Select a project"
          description="Pipelines save every generated output to a project."
        />
      </div>
    );
  }

  if (pipelineLoading) {
    return <p className="p-8 text-muted">Loading pipeline…</p>;
  }

  if (!pipeline) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8">
        <h1 className="text-xl font-semibold">Pipeline unavailable</h1>
        <p className="text-sm text-muted">
          {error || "This pipeline could not be loaded."}
        </p>
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const pluginSearchHref = (pluginName: string) =>
    `/plugins?q=${encodeURIComponent(pluginName)}`;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top progress bar */}
      {(running || !!result || !!pendingReview) && (
        <div className="shrink-0 px-2 pb-2 pt-1">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted">
              {result
                ? `Pipeline complete — ${result.steps.length} steps finished`
                : analyzingCompetitors
                  ? "Analysing competitors…"
                  : pendingReview
                    ? pendingReview.is_final_review
                      ? "Final change review"
                      : `Review inputs for step ${pendingReview.step_index}`
                    : running
                      ? `Step ${activeStep + 1} of ${pipeline.step_count}: ${pipeline.steps[activeStep]?.label}`
                      : `Step ${activeStep + 1} of ${pipeline.step_count}: ${pipeline.steps[activeStep]?.label}`}
            </p>
            <span className="text-[11px] font-semibold tabular-nums text-primary">
              {Math.round(progressPct)}%
            </span>
          </div>
          <WorkspaceTopProgress progress={progressPct} />
        </div>
      )}

      {/* Main two-panel layout */}
      <div className="flex min-h-0 flex-1 gap-4 lg:flex-row">
      {/* Left panel — scrollable content + sticky run button */}
      <BentoTile variant="strong" className="flex w-full shrink-0 flex-col overflow-hidden p-0 lg:w-80">
        {/* Scrollable area */}
        <div className="flex-1 overflow-y-auto p-4">
          <Link href="/dashboard" className="text-sm text-primary hover:underline">
            ← Back to dashboard
          </Link>
          <BentoSectionHeader
            eyebrow="Pipeline"
            title={pipeline.name}
            description={pipeline.description}
            className="mt-3"
          />

          <div className="mt-4 space-y-1">
            {pipeline.steps.map((step, i) => (
              <div
                key={step.plugin_name}
                role="button"
                tabIndex={displaySteps[i] ? 0 : -1}
                onClick={() => displaySteps[i] && setActiveStep(i)}
                onKeyDown={(e) => e.key === "Enter" && displaySteps[i] && setActiveStep(i)}
                className={`group flex w-full cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors ${
                  displaySteps[i] ? "cursor-pointer" : ""
                } ${
                  activeStep === i && (running || displaySteps.length > 0)
                    ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_rgba(224,138,60,0.18)]"
                    : "text-muted hover:bg-surface/60 hover:text-foreground"
                }`}
              >
                <span className="font-medium">{i + 1}.</span>
                <span className="flex-1 truncate">{step.label}</span>
                {running && i === activeStep && !displaySteps[i] && !pendingReview && (
                  <Badge className="ml-auto shrink-0 animate-pulse bg-primary/20 text-primary">Running</Badge>
                )}
                {pendingReview && i === pendingReview.step_index - 1 && (
                  <Badge className="ml-auto shrink-0 bg-amber-500/20 text-amber-200">Review</Badge>
                )}
                {displaySteps[i] && (!pendingReview || i < pendingReview.step_index - 1) && (
                  <Badge className="ml-auto shrink-0" variant="outline">Done</Badge>
                )}
                {pipelineRun && pipelineRun.edited_inputs_count > 0 && i === pipelineRun.current_skill_index - 1 && (
                  <Badge className="ml-auto shrink-0 text-[10px]" variant="outline">
                    {pipelineRun.edited_inputs_count} edited
                  </Badge>
                )}
                <Link
                  href={pluginSearchHref(step.plugin_name)}
                  onClick={(e) => e.stopPropagation()}
                  title={`View ${step.plugin_name} plugin`}
                  className="ml-1 shrink-0 text-muted/30 opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-1.5 border-primary/30 text-primary hover:border-primary/60 hover:bg-primary/8"
              onClick={handleAutofill}
              disabled={running || autofilling || analysisPhase === "scanning" || analysisPhase === "analyzing"}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {autofilling ? "Filling…" : "Generate by AI"}
            </Button>
            {autofillMsg && (
              <p className="text-[11px] text-muted">{autofillMsg}</p>
            )}
            <div>
              <Label htmlFor="site_url">Site URL</Label>
              <Input
                id="site_url"
                value={siteInput}
                onChange={(e) => setSiteInput(e.target.value)}
                placeholder="https://example.com"
                disabled={running}
              />
            </div>
            {showCompetitorsField && (
              <div>
                <Label htmlFor="competitors">Competitors (one per line)</Label>
                <Textarea
                  id="competitors"
                  value={competitors}
                  onChange={(e) => setCompetitors(e.target.value)}
                  rows={3}
                  placeholder="Leave blank to use competitors from earlier pipeline steps"
                  disabled={running}
                />
              </div>
            )}
            {isContentProduction && (
              <p className="text-xs text-muted">
                Competitors are auto-discovered in step 1 (Competitor gap analysis) from your site URL.
              </p>
            )}
            <div>
              <Label htmlFor="seed">Seed topic / keyword</Label>
              <Input
                id="seed"
                value={seedTopic}
                onChange={(e) => setSeedTopic(e.target.value)}
                placeholder="e.g. best seo tools"
                disabled={running}
              />
            </div>
            <div>
              <Label htmlFor="audience">Target audience</Label>
              <Input
                id="audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Optional"
                disabled={running}
              />
            </div>
          </div>
        </div>

        {/* Sticky footer — always visible */}
        <div className="shrink-0 border-t border-border/30 bg-surface/40 p-4 space-y-2">
          <AiSetupBanner mode="execution" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleRun} disabled={running || !!pendingReview}>
            {analyzingCompetitors
              ? "Analysing competitors…"
              : running
                ? `Running step ${activeStep + 1} of ${pipeline.step_count}…`
                : pendingReview
                  ? "Waiting for review…"
                  : "Run Pipeline"}
          </Button>
        </div>
      </BentoTile>

      {/* Right panel — plugin-style report output per step */}
      <BentoTile className="flex min-w-0 flex-1 flex-col overflow-hidden p-0">
        {runExpired && (
          <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            This pipeline run expired — restart the pipeline to continue.
          </div>
        )}

        {(analyzingCompetitors || pipelineRun) && (
          <div className="shrink-0 px-4 pt-4">
            <CompetitorIntelligencePanel
              run={pipelineRun}
              loading={analyzingCompetitors && !pipelineRun?.competitor_data}
              defaultCollapsed={competitorPanelCollapsed}
            />
          </div>
        )}

        {!displaySteps.length && !running && !analyzingCompetitors && (
          <div className="flex h-full items-center justify-center p-6 text-center text-muted">
            <div>
              <p className="text-lg font-medium text-foreground">Ready to run {pipeline.step_count} skills in sequence</p>
              <p className="mt-2 max-w-md text-sm">
                {isContentProduction
                  ? "Step 1 discovers competitors automatically from your site URL. Each step produces the same report format as running the plugin on its own."
                  : "Each step uses the output from prior steps and renders the same report UI as individual plugins."}
              </p>
            </div>
          </div>
        )}

        {running && !selectedStep && !analyzingCompetitors && (
          <WorkspaceGenerationPanel
            embedded
            progress={progressPct}
            pluginName={activePluginName}
            label={`Running ${displayPluginName(activePluginName)}`}
          />
        )}

        {analyzingCompetitors && !displaySteps.length && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-muted">
            <p className="text-sm">Analysing competitors for this pipeline…</p>
          </div>
        )}

        {selectedStep && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            {result && !pendingReview && (
              <div className="mb-4 flex shrink-0 items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-4 py-2.5 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Pipeline complete — {result.steps.length} steps finished
              </div>
            )}

            {saveMessage && (
              <p className="mb-3 shrink-0 rounded-xl border border-success/25 bg-success-soft/20 px-4 py-2 text-sm text-success">
                {saveMessage}
              </p>
            )}

            {pendingReview ? (
              <>
                <div className="mb-3 shrink-0 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-700/90 dark:text-amber-300/90">
                    Action required before step {pendingReview.step_index}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Step {activeStep + 1} ({pipeline.steps[activeStep]?.label}) is done — review the handoff below, then continue.
                  </p>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  <PipelineInputReview
                    featured
                    pending={pendingReview}
                    runId={(reviewRun ?? pipelineRun)?.id}
                    competitorData={(reviewRun ?? pipelineRun)?.competitor_data ?? {}}
                    continuing={continuingReview}
                    onContinue={handleContinue}
                    onSkip={handleSkipReview}
                  />
                </div>
                <details className="mt-4 shrink-0 rounded-xl border border-border/40 bg-surface/30">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted hover:text-foreground">
                    Show output from step {activeStep + 1}: {displayPluginName(selectedStep.plugin_name)}
                  </summary>
                  <div className="max-h-[32vh] overflow-y-auto border-t border-border/30 p-4">
                    <PluginReportOutput
                      result={toExecuteResponse(selectedStep)}
                      pluginName={selectedStep.plugin_name}
                      pluginId={selectedStep.plugin_id}
                      onSave={effectiveProjectId && displaySteps.length ? handleSavePipeline : undefined}
                      saving={saving}
                      saveLabel={pipeline ? `Save "${pipeline.name}" to project` : "Save pipeline report to project"}
                    />
                  </div>
                </details>
              </>
            ) : (
              <>
                <div className="mb-3 shrink-0">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Step {activeStep + 1} · {pipeline.steps[activeStep]?.label}
                  </p>
                  <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
                    {displayPluginName(selectedStep.plugin_name)}
                  </h2>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <PluginReportOutput
                    result={toExecuteResponse(selectedStep)}
                    pluginName={selectedStep.plugin_name}
                    pluginId={selectedStep.plugin_id}
                    onSave={effectiveProjectId && displaySteps.length ? handleSavePipeline : undefined}
                    saving={saving}
                    saveLabel={pipeline ? `Save "${pipeline.name}" to project` : "Save pipeline report to project"}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {pendingReview && !selectedStep && (
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <PipelineInputReview
              featured
              pending={pendingReview}
              runId={(reviewRun ?? pipelineRun)?.id}
              competitorData={(reviewRun ?? pipelineRun)?.competitor_data ?? {}}
              continuing={continuingReview}
              onContinue={handleContinue}
              onSkip={handleSkipReview}
            />
          </div>
        )}
      </BentoTile>
      </div>{/* end two-panel layout */}
    </div>
  );
}
