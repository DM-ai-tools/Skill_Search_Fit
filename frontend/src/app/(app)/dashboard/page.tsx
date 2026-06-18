"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { STATIC_PIPELINES } from "@/lib/pipelines";
import type { Plugin, Project, Pipeline } from "@/lib/types";
import { BentoGrid, BentoSectionHeader } from "@/components/bento";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectStore } from "@/stores/project-store";
import { useSiteStore } from "@/stores/site-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { PipelineCard } from "@/components/pipelines/pipeline-card";
import { PipelineDetailDialog } from "@/components/pipelines/pipeline-detail-dialog";
import { AnalysisStatusBanner } from "@/components/analysis/analysis-status-banner";
import { SiteUrlControl } from "@/components/site-url-control";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  FolderKanban, Puzzle, FileText,
  TrendingUp, Zap, ArrowRight,
} from "lucide-react";

type QuickAudit = {
  summary?: string;
  overall_score?: number;
  strengths?: string[];
  quick_wins?: string[];
  priority_actions_30_days?: string[];
};

function extractQuickAudit(analysis: Record<string, unknown> | null): QuickAudit | null {
  if (!analysis) return null;
  const candidate = analysis.quick_audit;
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as QuickAudit;
}

function phaseProgress(phase: string): number {
  if (phase === "scanning") return 25;
  if (phase === "analyzing") return 50;
  if (phase === "discovering_competitors") return 75;
  if (phase === "generating") return 90;
  if (phase === "completed") return 100;
  return 0;
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { projects, activeProjectId } = useProjectStore();
  const { siteUrl, hydrate } = useSiteStore();
  const { phase, error } = useAnalysisStore();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>(STATIC_PIPELINES);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const quickAudit = extractQuickAudit(useAnalysisStore((s) => s.analysis));

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => {
    api.get<Plugin[]>("/plugins").then(setPlugins).catch(() => setPlugins([]));
    api
      .get<Pipeline[]>("/pipelines")
      .then((data) => setPipelines(data.length > 0 ? data : STATIC_PIPELINES))
      .catch(() => setPipelines(STATIC_PIPELINES));
  }, []);

  const savedOutputs = projects.reduce((sum, p) => sum + (p.output_count || 0), 0);
  const score = quickAudit?.overall_score ?? null;

  return (
    <div className="space-y-6">
      {/* ── Site URL sticky bar ── */}
      <section className="glass-panel rounded-2xl p-4">
        <SiteUrlControl showRerun />
        {phase !== "idle" && (
          <div className="mt-3 space-y-2">
            <AnalysisStatusBanner phase={phase} />
            <Progress value={phaseProgress(phase)} />
          </div>
        )}
        {error && phase === "failed" && <p className="mt-2 text-sm text-muted">{error}</p>}
      </section>

      {/* ── Welcome ── */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Good day, {user?.name?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted">Your SEO AI workspace overview</p>
      </div>

      {/* ── Bento stats grid ── */}
      <div className="bento-grid-4">
        {/* Hero: site score (largest dark tile) */}
        <div className="bento-tile bento-hero flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                Site Score
              </p>
              <p className="mt-2 text-5xl font-bold text-primary tabular-nums">
                {score !== null ? score : "—"}
                <span className="text-xl text-muted">/100</span>
              </p>
              <p className={cn(
                "mt-1 text-sm font-medium",
                score === null ? "text-muted" :
                score >= 67 ? "text-success" :
                score >= 34 ? "text-warning" : "text-destructive",
              )}>
                {score === null ? "No analysis yet"
                  : score >= 67 ? "Strong Visibility"
                  : score >= 34 ? "Moderate Visibility"
                  : "Low Visibility"}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft ring-1 ring-primary/25">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          </div>
          {score !== null && (
            <Progress value={score} color={score >= 67 ? "success" : score >= 34 ? "warning" : undefined} />
          )}
          {quickAudit?.summary && (
            <p className="text-xs leading-relaxed text-muted line-clamp-3">{quickAudit.summary}</p>
          )}
        </div>

        <div className="bento-tile flex flex-col gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary-soft ring-1 ring-secondary/25">
            <FolderKanban className="h-4 w-4 text-secondary" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-foreground">{projects.length}</p>
          <p className="text-xs text-muted">Projects</p>
        </div>

        <div className="bento-tile flex flex-col gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft ring-1 ring-primary/25">
            <Puzzle className="h-4 w-4 text-primary" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-foreground">{plugins.length}</p>
          <p className="text-xs text-muted">Plugins</p>
        </div>

        <div className="bento-tile col-span-2 flex items-center justify-between gap-4">
          <div>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-elevated ring-1 ring-border-strong">
              <FileText className="h-4 w-4 text-muted" />
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{savedOutputs}</p>
            <p className="text-xs text-muted">Saved outputs</p>
          </div>
          {projects.length > 0 && (
            <Link href="/projects" className="text-xs text-secondary hover:underline">
              View all →
            </Link>
          )}
        </div>
      </div>

      {/* ── Quick wins — spotlight on #1 recommendation only ── */}
      {quickAudit?.quick_wins && quickAudit.quick_wins.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Quick wins</h2>
            <span className="font-mono text-[10px] text-muted uppercase tracking-widest">
              From site analysis
            </span>
          </div>
          <div className="bento-grid-3">
            <div className="bento-spotlight sm:col-span-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                Top recommendation
              </p>
              <p className="mt-2 text-sm leading-relaxed">{quickAudit.quick_wins[0]}</p>
            </div>
            {quickAudit.quick_wins.slice(1, 3).map((item) => (
              <div key={item} className="bento-tile flex gap-3">
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                <p className="text-sm leading-relaxed text-muted">{item}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Recent projects ── */}
      {projects.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Recent projects</h2>
            <Link href="/projects" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <BentoGrid columns={2}>
            {projects.slice(0, 4).map((p: Project) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="bento-tile block transition-all duration-200 hover:border-primary/25"
              >
                <p className="font-medium text-foreground">{p.project_name}</p>
                <p className="mt-1 text-xs text-muted">{p.output_count} saved outputs</p>
              </Link>
            ))}
          </BentoGrid>
        </section>
      )}

      {/* ── Pipeline highlights ── */}
      <section>
        <BentoSectionHeader
          title="Pipeline highlights"
          description={
            <span>
              High-value SearchFit combinations — click for details, then launch.
            </span>
          }
          actions={<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
            <Zap className="h-4 w-4 text-primary" />
          </div>}
          className="mb-4"
        />
        <BentoGrid columns={3}>
          {pipelines.slice(0, 3).map((pipeline) => (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              onSelect={() => setSelectedPipeline(pipeline)}
            />
          ))}
        </BentoGrid>
        <Link
          href="/plugins"
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2.5 transition-all duration-150"
        >
          Browse all plugins <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <PipelineDetailDialog
        pipeline={selectedPipeline}
        open={Boolean(selectedPipeline)}
        onClose={() => setSelectedPipeline(null)}
        projectId={activeProjectId || undefined}
        siteUrl={siteUrl || undefined}
      />
    </div>
  );
}
