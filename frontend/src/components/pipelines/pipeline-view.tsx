"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { fetchPipelines, getPipelineById } from "@/lib/pipelines";
import { formatApiError } from "@/lib/format-api-error";
import type { Pipeline, PipelineExecuteResponse } from "@/lib/types";
import { useProjectStore } from "@/stores/project-store";
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
  const { activeProjectId, setActiveProject } = useProjectStore();
  const [pipeline, setPipeline] = useState<Pipeline | null>(() => getPipelineById(pipelineId) ?? null);
  const [pipelineLoading, setPipelineLoading] = useState(true);
  const [siteInput, setSiteInput] = useState(siteUrl || "");
  const [competitors, setCompetitors] = useState("");
  const [seedTopic, setSeedTopic] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PipelineExecuteResponse | null>(null);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);

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
    setActiveStep(0);

    try {
      const res = await api.post<PipelineExecuteResponse>(`/pipelines/${pipelineId}/execute`, {
        project_id: effectiveProjectId,
        inputs: {
          site_url: url,
          brand_name: derivedBrand,
          business_name: derivedBrand,
          competitors: competitors.trim(),
          seed_topic: seedTopic.trim(),
          target_audience: targetAudience.trim() || "General audience",
        },
      });
      setResult(res);
      setActiveStep(res.steps.length);
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
  ]);

  useEffect(() => {
    if (!running || !pipeline) return;
    const timer = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, pipeline.step_count - 1));
    }, 4000);
    return () => clearInterval(timer);
  }, [running, pipeline]);

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

  const stepOutput = result?.steps[activeStep]?.output_markdown;
  const displayMarkdown = stepOutput || result?.combined_markdown;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 lg:flex-row">
      <BentoTile variant="strong" className="w-full shrink-0 overflow-auto p-4 lg:w-80">
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
            <button
              key={step.plugin_name}
              type="button"
              disabled={!result}
              onClick={() => setActiveStep(i)}
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors ${
                activeStep === i
                  ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_rgba(224,138,60,0.18)]"
                  : "text-muted hover:bg-surface/60 hover:text-foreground"
              }`}
            >
              <span className="font-medium">{i + 1}.</span>
              <span className="truncate">{step.label}</span>
              {running && i === activeStep && (
                <Badge className="ml-auto shrink-0 bg-primary/20 text-primary">Running</Badge>
              )}
              {result?.steps[i] && <Badge className="ml-auto shrink-0" variant="outline">Done</Badge>}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-3">
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
              <Label htmlFor="competitors">Competitors (one per line, optional)</Label>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleRun} disabled={running}>
            {running ? `Running step ${activeStep + 1} of ${pipeline.step_count}…` : "Run full pipeline"}
          </Button>
        </div>
      </BentoTile>

      <BentoTile className="min-w-0 flex-1 overflow-auto p-6">
        {!result && !running && (
          <div className="flex h-full items-center justify-center text-center text-muted">
            <div>
              <p className="text-lg font-medium text-foreground">Ready to run {pipeline.step_count} skills in sequence</p>
              <p className="mt-2 max-w-md text-sm">
                {isContentProduction
                  ? "Step 1 discovers competitors automatically from your site URL. Each later step builds on the prior output."
                  : "Each step uses the output from prior steps. Fill in the form and click Run full pipeline."}
              </p>
            </div>
          </div>
        )}
        {running && !result && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium">
                Step {activeStep + 1}: {pipeline.steps[activeStep]?.label}
              </p>
              <p className="mt-2 text-sm text-muted">This may take several minutes…</p>
            </div>
          </div>
        )}
        {displayMarkdown && (
          <article className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap rounded-xl border border-border/30 bg-background/60 p-4 font-sans text-sm leading-relaxed text-foreground/80">{displayMarkdown}</pre>
          </article>
        )}
      </BentoTile>
    </div>
  );
}
