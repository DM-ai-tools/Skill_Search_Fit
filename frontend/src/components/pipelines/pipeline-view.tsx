"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { PluginReportOutput, toExecuteResponse } from "@/components/reports/plugin-report-output";
import { WorkspaceGenerationPanel } from "@/components/workspace/workspace-generation-panel";
import { WorkspaceTopProgress } from "@/components/workspace/workspace-top-progress";
import { api, ApiError } from "@/lib/api";
import { displayPluginName } from "@/lib/plugin-catalog";
import { fetchPipelines, getPipelineById, executePipelineSteps } from "@/lib/pipelines";
import { formatApiError } from "@/lib/format-api-error";
import type { Pipeline, PipelineExecuteResponse, PipelineStepResult, WebsiteAnalysis } from "@/lib/types";
import { useProjectStore } from "@/stores/project-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { BentoSectionHeader, BentoTile } from "@/components/bento";
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
  const [autofilling, setAutofilling] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState("");
  const [result, setResult] = useState<PipelineExecuteResponse | null>(null);
  const [completedSteps, setCompletedSteps] = useState<PipelineStepResult[]>([]);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [saving, setSaving] = useState(false);

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
      .then((list) => {
        const match = list.find((p) => p.id === pipelineId) ?? getPipelineById(pipelineId) ?? null;
        setPipeline(match);
        if (!match) setError("Pipeline not found.");
      })
      .catch(() => {
        const fallback = getPipelineById(pipelineId);
        setPipeline(fallback ?? null);
        if (!fallback) setError("Pipeline not found.");
      })
      .finally(() => setPipelineLoading(false));
  }, [pipelineId]);

  useEffect(() => {
    if (!effectiveProjectId || !pipeline) return;
    api
      .get<PipelineExecuteResponse>(
        `/pipelines/${pipelineId}/recent-results?project_id=${encodeURIComponent(effectiveProjectId)}`,
      )
      .then((res) => {
        setResult(res);
        setCompletedSteps(res.steps);
        setActiveStep(0);
      })
      .catch(() => {
        // No prior run for this project — expected on first visit.
      });
  }, [effectiveProjectId, pipeline, pipelineId]);

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
    setResult(null);
    setCompletedSteps([]);
    setActiveStep(0);

    try {
      const res = await executePipelineSteps(
        pipelineId,
        effectiveProjectId,
        {
          site_url: url,
          brand_name: derivedBrand,
          business_name: derivedBrand,
          competitors: competitors.trim(),
          seed_topic: seedTopic.trim(),
          target_audience: targetAudience.trim() || "General audience",
        },
        {
          onStepStart: (stepIndex) => setActiveStep(stepIndex),
          onStepComplete: (step) => {
            setCompletedSteps((prev) => [...prev, step]);
          },
        },
      );
      setResult(res);
      setCompletedSteps(res.steps);
      router.push(
        `/reports/pipeline-view?pipelineId=${encodeURIComponent(pipelineId)}&projectId=${encodeURIComponent(effectiveProjectId)}`,
      );
      return;
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? "Pipeline API is unavailable. Restart the backend (npm run dev:api) and try again."
          : formatApiError(err, "Pipeline execution failed");
      setError(message);
    } finally {
      setRunning(false);
    }
  }, [
    pipeline,
    effectiveProjectId,
    siteInput,
    competitors,
    seedTopic,
    targetAudience,
    pipelineId,
    router,
  ]);

  const displaySteps = result?.steps ?? completedSteps;
  const selectedStep = pipeline ? displaySteps[activeStep] : undefined;
  const activePluginName = pipeline?.steps[activeStep]?.plugin_name ?? "";

  const handleSaveStep = useCallback(async () => {
    const step = displaySteps[activeStep];
    if (!step || !effectiveProjectId) return;
    setSaving(true);
    try {
      const output = step.output ?? {
        markdown: step.output_markdown,
        structured: {},
      };
      await api.post("/outputs", {
        project_id: effectiveProjectId,
        plugin_id: step.plugin_id,
        execution_id: step.execution_id,
        input_snapshot: {},
        schema_version: step.schema_version ?? 1,
        generated_output: output,
      });
    } finally {
      setSaving(false);
    }
  }, [activeStep, displaySteps, effectiveProjectId]);

  const progressPct =
    !pipeline
      ? 0
      : result
        ? 100
        : running
          ? Math.min(94, ((activeStep + 1) / pipeline.step_count) * 100)
          : 0;

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
      {(running || !!result) && (
        <div className="shrink-0 px-2 pb-2 pt-1">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted">
              {result
                ? `Pipeline complete — ${result.steps.length} steps finished`
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
                {running && i === activeStep && !displaySteps[i] && (
                  <Badge className="ml-auto shrink-0 animate-pulse bg-primary/20 text-primary">Running</Badge>
                )}
                {displaySteps[i] && <Badge className="ml-auto shrink-0" variant="outline">Done</Badge>}
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleRun} disabled={running}>
            {running ? `Running step ${activeStep + 1} of ${pipeline.step_count}…` : "Run Pipeline"}
          </Button>
        </div>
      </BentoTile>

      {/* Right panel — plugin-style report output per step */}
      <BentoTile className="flex min-w-0 flex-1 flex-col overflow-hidden p-0">
        {!displaySteps.length && !running && (
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

        {running && !selectedStep && (
          <WorkspaceGenerationPanel
            embedded
            progress={progressPct}
            pluginName={activePluginName}
            label={`Running ${displayPluginName(activePluginName)}`}
          />
        )}

        {selectedStep && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            {result && (
              <div className="mb-4 flex shrink-0 items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-4 py-2.5 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Pipeline complete — {result.steps.length} steps finished
              </div>
            )}
            <div className="mb-3 shrink-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                Step {activeStep + 1} · {pipeline.steps[activeStep]?.label}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
                {displayPluginName(selectedStep.plugin_name)}
              </h2>
            </div>
            <PluginReportOutput
              result={toExecuteResponse(selectedStep)}
              pluginName={selectedStep.plugin_name}
              pluginId={selectedStep.plugin_id}
              onSave={handleSaveStep}
              saving={saving}
            />
          </div>
        )}
      </BentoTile>
      </div>{/* end two-panel layout */}
    </div>
  );
}
