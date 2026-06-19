"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Flame, Globe, Search, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { getApiCapabilities } from "@/lib/api-capabilities";
import type { Plugin, WebsiteAnalysis } from "@/lib/types";
import { useProjectStore } from "@/stores/project-store";
import { useSiteStore } from "@/stores/site-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { GlassPluginCard } from "@/components/plugins/glass-plugin-card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { categoryLabel, categoryStyle } from "@/lib/design-tokens";
import {
  displayPluginName,
  normalizePluginList,
  PLUGIN_CATEGORY_ORDER,
} from "@/lib/plugin-catalog";

// ─── ProjectGlassCard ─────────────────────────────────────────────────────────

function ProjectGlassCard({
  siteUrl,
  phase,
  analysis,
  competitorCount,
  staleApi,
}: {
  siteUrl: string | null;
  phase: string;
  analysis: Record<string, unknown> | null;
  competitorCount: number;
  staleApi: boolean;
}) {
  const score =
    (analysis?.quick_audit as { overall_score?: number } | undefined)
      ?.overall_score ?? null;
  const companyName = analysis?.company_name as string | undefined;
  const isAnalyzing =
    phase !== "idle" && phase !== "completed" && phase !== "failed";

  if (!siteUrl) {
    return (
      <div className="dash-glass relative flex items-center gap-4 overflow-hidden rounded-2xl p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-border-strong/60 bg-surface/40">
          <Globe className="h-4 w-4 text-muted/40" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No target site connected</p>
          <p className="mt-0.5 text-xs text-muted">
            Set your website URL in the dashboard header to enable AI recommendations across all plugins.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-glass relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4 sm:flex-row sm:items-center">
      {/* Top shimmer */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {/* Ambient glow blob */}
      <div
        className="pointer-events-none absolute -top-10 right-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl"
        style={{ animation: "lp-glow-breathe 8s ease-in-out infinite" }}
      />

      {/* Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/12">
        <Globe className="h-5 w-5 text-primary" />
      </div>

      {/* Info */}
      <div className="relative min-w-0 flex-1">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-primary/60">
          Target project
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
          {companyName ?? siteUrl.replace(/^https?:\/\/(?:www\.)?/, "")}
        </p>
        {companyName && (
          <p className="truncate text-xs text-muted">{siteUrl}</p>
        )}
      </div>

      {/* Stats + status row */}
      <div className="relative flex items-center gap-3">
        {score !== null && (
          <div className="flex flex-col items-center gap-0.5">
            <p
              className={cn(
                "text-lg font-bold tabular-nums leading-none",
                score >= 67
                  ? "text-success"
                  : score >= 34
                  ? "text-warning"
                  : "text-destructive",
              )}
            >
              {score}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted">
              Score
            </p>
          </div>
        )}

        {competitorCount > 0 && (
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-lg font-bold tabular-nums leading-none text-secondary">
              {competitorCount}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted">
              Rivals
            </p>
          </div>
        )}

        {/* Status pill */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
            isAnalyzing
              ? "border-secondary/20 bg-secondary/10"
              : staleApi
              ? "border-destructive/20 bg-destructive/8"
              : "border-success/20 bg-success/10",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isAnalyzing
                ? "animate-pulse bg-secondary"
                : staleApi
                ? "bg-destructive"
                : "bg-success",
            )}
          />
          <span
            className={cn(
              "text-xs font-medium",
              isAnalyzing
                ? "text-secondary"
                : staleApi
                ? "text-destructive"
                : "text-success",
            )}
          >
            {isAnalyzing ? "Analyzing" : staleApi ? "API offline" : "AI ready"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── PluginsPage ──────────────────────────────────────────────────────────────

export default function PluginsPage() {
  const searchParams = useSearchParams();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const { activeProjectId } = useProjectStore();
  const { siteUrl, hydrate } = useSiteStore();
  const { analysis, competitors, phase, setAnalysis, setCompetitors } =
    useAnalysisStore();
  const [staleApi, setStaleApi] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    api
      .get<Plugin[]>("/plugins")
      .then((data) => setPlugins(normalizePluginList(data)));
  }, []);

  useEffect(() => {
    getApiCapabilities().then((caps) => setStaleApi(!caps.websiteAnalysis));
  }, []);

  useEffect(() => {
    if (!siteUrl || staleApi) return;
    api
      .get<WebsiteAnalysis>(`/website-analysis?url=${encodeURIComponent(siteUrl)}`)
      .then((res) => {
        if (res.analysis) setAnalysis(res.analysis);
        if (res.competitors?.length) setCompetitors(res.competitors);
      })
      .catch(() => {});
  }, [siteUrl, staleApi, setAnalysis, setCompetitors]);

  const categories = useMemo(
    () => PLUGIN_CATEGORY_ORDER.filter((cat) => plugins.some((p) => p.category === cat)),
    [plugins],
  );

  const visiblePlugins = useMemo(() => {
    let filtered = selectedCategory
      ? plugins.filter((p) => p.category === selectedCategory)
      : plugins;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          displayPluginName(p.plugin_name).toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [plugins, selectedCategory, searchQuery]);

  const competitorCount = competitors.length;

  return (
    <div className="space-y-5">
      {/* ══ Header row ══════════════════════════════════════════════════════ */}
      <div className="dash-enter flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Plugin Library</h1>
          <p className="mt-1 text-sm text-muted">
            Launch SEO, Research, Content, and Technical tools from one workspace.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted/50" />
            <Input
              type="search"
              placeholder="Search plugins…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>

          {/* Pipeline shortcut */}
          <Link
            href="/dashboard"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border/60 bg-surface/60 px-3 text-xs font-medium text-muted backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary"
          >
            <Zap className="h-3.5 w-3.5" />
            Pipelines
          </Link>
        </div>
      </div>

      {/* ══ Project glass card ═══════════════════════════════════════════════ */}
      <div className="dash-enter dash-enter-d1">
        <ProjectGlassCard
          siteUrl={siteUrl}
          phase={phase}
          analysis={analysis}
          competitorCount={competitorCount}
          staleApi={staleApi}
        />
      </div>

      {/* ══ Filter tabs + count ══════════════════════════════════════════════ */}
      <div className="dash-enter dash-enter-d2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* All tab */}
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200",
              selectedCategory === null
                ? "border-primary/40 bg-primary/12 text-primary"
                : "border-border/60 bg-surface/60 text-muted backdrop-blur-sm hover:border-border-strong hover:text-foreground",
            )}
          >
            All
            <span className="ml-1.5 tabular-nums opacity-60">{plugins.length}</span>
          </button>

          {/* Category tabs */}
          {categories.map((cat) => {
            const count = plugins.filter((p) => p.category === cat).length;
            const style = categoryStyle(cat);
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(isActive ? null : cat)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200",
                  isActive
                    ? style.badge
                    : "border-border/60 bg-surface/60 text-muted backdrop-blur-sm hover:border-border-strong hover:text-foreground",
                )}
              >
                {categoryLabel(cat)}
                <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        <p className="shrink-0 text-xs text-muted">
          {visiblePlugins.length} plugin{visiblePlugins.length !== 1 ? "s" : ""}
          {searchQuery.trim() ? " matching" : ""}
        </p>
      </div>

      {/* ══ Plugin grid ══════════════════════════════════════════════════════ */}
      <div className="dash-enter dash-enter-d3">
        {visiblePlugins.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visiblePlugins.map((plugin) => (
              <GlassPluginCard
                key={plugin.id}
                plugin={plugin}
                projectId={activeProjectId || undefined}
                siteUrl={siteUrl || undefined}
              />
            ))}
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Flame className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No plugins available</p>
              <p className="mt-1 text-sm text-muted">
                Contact your administrator to add plugins to the catalog.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium text-foreground">No plugins found</p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory(null);
                setSearchQuery("");
              }}
              className="text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
