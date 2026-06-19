"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Globe, Loader2, Plus, X, Zap, ArrowRight,
  FolderKanban, Puzzle, FileText, ChevronRight,
  BarChart3, Play, CheckCircle2, AlertCircle, Circle,
} from "lucide-react";
import { api } from "@/lib/api";
import { STATIC_PIPELINES, executePipelineSteps } from "@/lib/pipelines";
import type { Plugin, Project, Pipeline } from "@/lib/types";
import { BentoGrid, BentoSectionHeader } from "@/components/bento";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectStore } from "@/stores/project-store";
import { useSiteStore } from "@/stores/site-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useAnalysisActions } from "@/components/analysis/background-analysis-provider";
import { PipelineCard } from "@/components/pipelines/pipeline-card";
import { PipelineDetailDialog } from "@/components/pipelines/pipeline-detail-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { normalizePluginList } from "@/lib/plugin-catalog";

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalizeUrl(value: string): string {
  const t = value.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function isValidUrl(value: string): boolean {
  try {
    return Boolean(new URL(normalizeUrl(value)).hostname.includes("."));
  } catch {
    return false;
  }
}
type QuickAudit = {
  summary?: string;
  overall_score?: number;
  strengths?: string[];
  quick_wins?: string[];
  priority_actions_30_days?: string[];
};
function extractQuickAudit(analysis: Record<string, unknown> | null): QuickAudit | null {
  if (!analysis?.quick_audit || typeof analysis.quick_audit !== "object") return null;
  return analysis.quick_audit as QuickAudit;
}

function scoreLabel(s: number | null) {
  if (s === null) return "No analysis yet";
  if (s >= 67) return "Strong Visibility";
  if (s >= 34) return "Moderate Visibility";
  return "Low Visibility";
}
function scoreTextColor(s: number | null) {
  if (s === null) return "text-muted";
  if (s >= 67) return "text-success";
  if (s >= 34) return "text-warning";
  return "text-destructive";
}

// ─── ConnectUrlModal ────────────────────────────────────────────────────────

function ConnectUrlModal({
  open,
  initialUrl,
  onClose,
}: {
  open: boolean;
  initialUrl?: string;
  onClose: () => void;
}) {
  const { setSiteUrl } = useSiteStore();
  const { startScan } = useAnalysisActions();
  const { createProject } = useProjectStore();

  const [urlInput, setUrlInput] = useState(initialUrl || "");
  const [projectName, setProjectName] = useState("");
  const [urlError, setUrlError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUrlInput(initialUrl || "");
      setUrlError("");
      setProjectName("");
    }
  }, [open, initialUrl]);

  if (!open) return null;

  const handleConnect = async () => {
    if (!isValidUrl(urlInput)) {
      setUrlError("Please enter a valid website URL (e.g. example.com).");
      return;
    }
    const normalized = normalizeUrl(urlInput);
    setSaving(true);
    try {
      setSiteUrl(normalized);
      if (projectName.trim()) {
        await createProject(projectName.trim()).catch(() => undefined);
      }
      await startScan(normalized, normalized === initialUrl);
      onClose();
    } catch {
      setUrlError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-md"
        onClick={onClose}
        style={{ animation: "auth-fade-in 0.2s ease both" }}
      />

      {/* Modal */}
      <div
        className="dash-modal-glass relative w-full max-w-md rounded-3xl p-8"
        style={{ animation: "auth-slide-up 0.35s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-primary/18 blur-3xl"
          style={{ animation: "lp-glow-breathe 6s ease-in-out infinite" }}
        />
        {/* Shimmer top edge */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-3xl bg-gradient-to-r from-transparent via-white/12 to-transparent" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl border border-border/40 bg-surface/60 text-muted transition-colors hover:border-border/70 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Icon */}
        <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 ring-1 ring-primary/15">
          <Globe className="h-6 w-6 text-primary" />
        </div>

        {/* Heading */}
        <div className="relative mb-6">
          <h2 className="text-xl font-bold text-foreground">
            {initialUrl ? "Update project URL" : "Connect your website"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {initialUrl
              ? "Change the URL and trigger a fresh AI analysis"
              : "Enter your URL to begin AI analysis and unlock all 50+ workflows"}
          </p>
        </div>

        {/* Fields */}
        <div className="relative space-y-4">
          <div>
            <Label className="text-sm font-medium text-foreground">
              Website URL
            </Label>
            <div className="relative mt-1.5">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/50" />
              <Input
                type="url"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                className="auth-input pl-9"
                placeholder="https://yourcompany.com"
                autoFocus
                autoComplete="url"
              />
            </div>
            {urlError && (
              <p className="mt-1 text-xs text-destructive">{urlError}</p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium text-foreground">
              Project name{" "}
              <span className="font-normal text-muted/60">(optional)</span>
            </Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              className="auth-input mt-1.5"
              placeholder="e.g. Acme Corp SEO"
            />
          </div>

          {/* CTA */}
          <button
            onClick={handleConnect}
            disabled={saving}
            className="dash-glass-btn relative flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting analysis…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                {initialUrl ? "Re-analyse site" : "Start analysis"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RunAuditModal ──────────────────────────────────────────────────────────

type AuditStatus = "idle" | "running" | "done" | "error";

function RunAuditModal({
  open,
  onClose,
  siteUrl: initialSiteUrl,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  siteUrl?: string;
  projectId?: string;
}) {
  const pipelines = STATIC_PIPELINES.slice(0, 3);
  const [url, setUrl] = useState(initialSiteUrl || "");
  const [urlError, setUrlError] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AuditStatus>>({});
  const [lastSiteUrl, setLastSiteUrl] = useState("");
  const abortRef = useRef(false);

  useEffect(() => {
    if (open) {
      setUrl(initialSiteUrl || "");
      setUrlError("");
      setRunning(false);
      setDone(false);
      setStatuses({});
      setLastSiteUrl("");
      abortRef.current = false;
    }
  }, [open, initialSiteUrl]);

  const setStatus = (id: string, s: AuditStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: s }));

  const handleRun = async () => {
    if (!projectId) return;
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    try { new URL(normalized); } catch { setUrlError("Enter a valid URL."); return; }
    setUrlError("");

    const brand =
      normalized.replace(/^https?:\/\/(www\.)?/, "").split(".")[0] || "site";
    const inputs = { site_url: normalized, brand_name: brand, business_name: brand, target_audience: "General audience" };

    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setLastSiteUrl(normalized);
    const initial: Record<string, AuditStatus> = {};
    pipelines.forEach((p) => { initial[p.id] = "idle"; });
    setStatuses(initial);

    for (const pipeline of pipelines) {
      if (abortRef.current) break;
      setStatus(pipeline.id, "running");
      try {
        await executePipelineSteps(pipeline.id, projectId, inputs);
        setStatus(pipeline.id, "done");
      } catch {
        setStatus(pipeline.id, "error");
      }
    }

    setRunning(false);
    setDone(true);
  };

  const handleClose = () => {
    if (running) abortRef.current = true;
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-md"
        style={{ animation: "auth-fade-in 0.2s ease both" }}
        onClick={handleClose}
      />
      <div
        className="dash-modal-glass relative w-full max-w-lg rounded-3xl p-8"
        style={{ animation: "auth-slide-up 0.35s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-primary/18 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-3xl bg-gradient-to-r from-transparent via-white/12 to-transparent" />

        <button
          onClick={handleClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl border border-border/40 bg-surface/60 text-muted transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 ring-1 ring-primary/15">
          <Play className="h-5 w-5 text-primary" />
        </div>

        <div className="relative mb-6">
          <h2 className="text-xl font-bold text-foreground">Run Audit</h2>
          <p className="mt-1 text-sm text-muted">
            Runs all 3 pipeline workflows sequentially — each builds on the prior output.
          </p>
        </div>

        <div className="relative space-y-4">
          {/* Site URL */}
          <div>
            <label className="text-sm font-medium text-foreground">Site URL</label>
            <div className="relative mt-1.5">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/50" />
              <input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
                disabled={running}
                placeholder="https://yoursite.com"
                className="auth-input h-10 w-full rounded-xl border border-border/60 bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted/50 focus:outline-none disabled:opacity-60"
              />
            </div>
            {urlError && <p className="mt-1 text-xs text-destructive">{urlError}</p>}
            {!projectId && (
              <p className="mt-1 text-xs text-warning">Select a project first to save pipeline outputs.</p>
            )}
          </div>

          {/* Pipeline status rows */}
          <div className="space-y-2 rounded-2xl border border-border/40 bg-surface/40 p-3">
            {pipelines.map((p, i) => {
              const status = statuses[p.id] ?? "idle";
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-4 text-center text-[11px] font-semibold text-muted/60">{i + 1}</span>
                  {status === "idle" && <Circle className="h-4 w-4 shrink-0 text-muted/40" />}
                  {status === "running" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                  {status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                  {status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
                  <span className={cn(
                    "flex-1 truncate text-sm",
                    status === "running" ? "font-medium text-foreground" : "text-muted",
                    status === "done" && "text-success",
                    status === "error" && "text-destructive",
                  )}>
                    {p.name}
                  </span>
                  {status === "done" && (
                    <Link
                      href={`/reports/pipeline-view?pipelineId=${encodeURIComponent(p.id)}&projectId=${encodeURIComponent(projectId ?? "")}${lastSiteUrl || url ? `&site_url=${encodeURIComponent(lastSiteUrl || url)}` : ""}`}
                      className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                    >
                      View →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {done && (
            <p className="rounded-xl border border-success/25 bg-success-soft/20 px-4 py-2.5 text-sm text-success">
              All pipelines complete. Click &quot;View →&quot; next to each to see results.
            </p>
          )}

          <button
            onClick={handleRun}
            disabled={running || !projectId}
            className="dash-glass-btn relative flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary disabled:opacity-60"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running pipelines…
              </>
            ) : done ? (
              <>
                <Play className="h-4 w-4" />
                Run again
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run All Pipelines
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DashboardPage ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { projects, activeProjectId } = useProjectStore();
  const { siteUrl, hydrated } = useSiteStore();
  const { analysis } = useAnalysisStore();

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>(STATIC_PIPELINES);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [runAuditOpen, setRunAuditOpen] = useState(false);

  const quickAudit = extractQuickAudit(analysis);
  const score = quickAudit?.overall_score ?? null;
  const savedOutputs = projects.reduce((sum, p) => sum + (p.output_count || 0), 0);

  useEffect(() => {
    api.get<Plugin[]>("/plugins").then((data) => setPlugins(normalizePluginList(data))).catch(() => setPlugins([]));
    api
      .get<Pipeline[]>("/pipelines")
      .then((data) => setPipelines(data.length > 0 ? data : STATIC_PIPELINES))
      .catch(() => setPipelines(STATIC_PIPELINES));
  }, []);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <>
      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-primary/4 blur-[120px]"
          style={{ animation: "lp-blob-float 22s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-secondary/4 blur-[100px]"
          style={{ animation: "lp-blob-float-alt 26s ease-in-out infinite 4s" }}
        />
      </div>

      <div className="space-y-5">
        {hydrated && !siteUrl && (
          <div className="dash-enter">
            <button
              onClick={() => setModalOpen(true)}
              className="group glass-panel w-full rounded-2xl p-5 text-left transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_28px_rgba(224,138,60,0.07)]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/8 transition-transform duration-300 group-hover:scale-110 group-hover:border-primary/50">
                  <Plus className="h-5 w-5 text-primary/60 group-hover:text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-foreground">
                    Add your first project URL
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    Connect a website to begin AI analysis and unlock all 50+
                    workflows
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted/30 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </button>
          </div>
        )}

        {/* ══ 2. Welcome ══════════════════════════════════════════════════════ */}
        <div className="dash-enter dash-enter-d1">
          <h1 className="text-2xl font-semibold text-foreground">
            Good day,{" "}
            <span className="text-primary">{firstName}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Your SEO AI workspace overview
          </p>
        </div>

        {/* ══ 3. Stats strip ════════════════════════════════════════════════ */}
        <div className="dash-enter dash-enter-d2 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Projects */}
          <div className="bento-tile lp-card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-secondary/20 bg-secondary/10">
                <FolderKanban className="h-4 w-4 text-secondary" />
              </div>
              {projects.length > 0 && (
                <Link href="/projects" className="text-[10px] font-medium text-primary hover:underline">
                  View →
                </Link>
              )}
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {projects.length}
            </p>
            <div>
              <p className="text-sm font-medium text-foreground">Projects</p>
              <p className="text-xs text-muted">{savedOutputs} saved outputs</p>
            </div>
          </div>

          {/* Reports */}
          <div className="bento-tile lp-card flex flex-col gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {savedOutputs}
            </p>
            <div>
              <p className="text-sm font-medium text-foreground">Saved Reports</p>
              <p className="text-xs text-muted">Across all projects</p>
            </div>
          </div>

          {/* Plugin count */}
          <div className="bento-tile lp-card flex flex-col gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-category-technical/20 bg-category-technical/10">
              <Puzzle className="h-4 w-4 text-category-technical" />
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {plugins.length || "—"}
            </p>
            <div>
              <p className="text-sm font-medium text-foreground">Active Plugins</p>
              <p className="text-xs text-muted">Workflows ready</p>
            </div>
          </div>

          {/* Analysis activity */}
          <div className="bento-tile lp-card flex flex-col gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-category-content/20 bg-category-content/10">
              <BarChart3 className="h-4 w-4 text-category-content" />
            </div>
            <p className={cn(
              "text-3xl font-bold tabular-nums",
              score !== null ? scoreTextColor(score) : "text-foreground",
            )}>
              {score !== null ? score : "—"}
            </p>
            <div>
              <p className="text-sm font-medium text-foreground">SEO Score</p>
              <p className={cn("text-xs", scoreTextColor(score))}>
                {scoreLabel(score)}
              </p>
            </div>
          </div>
        </div>

        {/* ══ 5. Pipeline highlights ════════════════════════════════════════ */}
        <section className="dash-enter dash-enter-d3">
          <BentoSectionHeader
            title="Pipeline highlights"
            description="High-value AI workflow combinations — Generate by AI or run all at once."
            actions={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRunAuditOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  <Play className="h-3.5 w-3.5" />
                  Run Audit
                </button>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
              </div>
            }
            className="mb-4"
          />
          <BentoGrid columns={3}>
            {pipelines.slice(0, 3).map((pipeline) => (
              <PipelineCard
                key={pipeline.id}
                pipeline={pipeline}
                onSelect={() => setSelectedPipeline(pipeline)}
                siteUrl={siteUrl ?? undefined}
                projectId={activeProjectId ?? undefined}
              />
            ))}
          </BentoGrid>
          <Link
            href="/plugins"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-all duration-150 hover:gap-2.5"
          >
            Browse all plugins
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* ══ 6. Recent projects (when they exist) ══════════════════════════ */}
        {projects.length > 0 && (
          <section className="dash-enter dash-enter-d4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Recent projects
              </h2>
              <Link href="/projects" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <BentoGrid columns={2}>
              {projects.slice(0, 4).map((p: Project) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="bento-tile block transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-secondary/20 bg-secondary/10">
                      <FolderKanban className="h-4 w-4 text-secondary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {p.project_name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {p.output_count} saved outputs
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted/40" />
                  </div>
                </Link>
              ))}
            </BentoGrid>
          </section>
        )}
      </div>

      {/* ══ Modals ════════════════════════════════════════════════════════════ */}
      <ConnectUrlModal
        open={modalOpen}
        initialUrl={siteUrl ?? undefined}
        onClose={() => setModalOpen(false)}
      />

      <PipelineDetailDialog
        pipeline={selectedPipeline}
        open={Boolean(selectedPipeline)}
        onClose={() => setSelectedPipeline(null)}
        projectId={activeProjectId || undefined}
        siteUrl={siteUrl || undefined}
      />

      <RunAuditModal
        open={runAuditOpen}
        onClose={() => setRunAuditOpen(false)}
        siteUrl={siteUrl ?? undefined}
        projectId={activeProjectId ?? undefined}
      />
    </>
  );
}
