"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Globe, LayoutGrid } from "lucide-react";
import { api } from "@/lib/api";
import { getApiCapabilities } from "@/lib/api-capabilities";
import type { Plugin, WebsiteAnalysis } from "@/lib/types";
import { useProjectStore } from "@/stores/project-store";
import { useSiteStore } from "@/stores/site-store";
import { useAnalysisStore } from "@/stores/analysis-store";
import { PluginCard } from "@/components/plugins/plugin-card";
import { BentoGrid, BentoSectionHeader, BentoTile } from "@/components/bento";
import { cn } from "@/lib/utils";
import { categoryLabel, categoryStyle } from "@/lib/design-tokens";
import { normalizePluginList, PLUGIN_CATEGORY_ORDER } from "@/lib/plugin-catalog";

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { activeProjectId } = useProjectStore();
  const { siteUrl, hydrate } = useSiteStore();
  const { setAnalysis, setCompetitors } = useAnalysisStore();
  const [staleApi, setStaleApi] = useState(false);

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    api.get<Plugin[]>("/plugins").then((data) => setPlugins(normalizePluginList(data)));
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

  const categories = useMemo(() => {
    return PLUGIN_CATEGORY_ORDER.filter((cat) => plugins.some((p) => p.category === cat));
  }, [plugins]);

  const visiblePlugins = selectedCategory
    ? plugins.filter((p) => p.category === selectedCategory)
    : plugins;

  const groupedPlugins = useMemo(() => {
    if (selectedCategory) return [{ category: selectedCategory, items: visiblePlugins }];
    return PLUGIN_CATEGORY_ORDER.map((category) => ({
      category,
      items: plugins.filter((p) => p.category === category),
    })).filter((group) => group.items.length > 0);
  }, [plugins, selectedCategory, visiblePlugins]);

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <BentoSectionHeader
        eyebrow={plugins.length > 0 ? `${plugins.length} plugins available` : "Plugin Library"}
        title="Plugin Library"
        description="Choose an SEO skill to launch, or run a multi-skill pipeline from your dashboard."
        actions={
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong/50 bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/30 hover:text-primary"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Pipelines
          </Link>
        }
      />

      {/* ── Site banner ── */}
      {siteUrl ? (
        <BentoTile variant="strong" className="flex items-center gap-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft ring-1 ring-primary/25">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/70">
              Target site
            </p>
            <p className="truncate text-sm font-semibold text-foreground">{siteUrl}</p>
          </div>
          <p className="hidden shrink-0 text-xs text-muted sm:block">
            AI recommendations enabled
          </p>
        </BentoTile>
      ) : (
        <BentoTile className="flex items-center gap-3 border-dashed py-3">
          <Globe className="h-4 w-4 shrink-0 text-muted/40" />
          <p className="text-sm text-muted">
            Set your website URL in the header to enable AI recommendations across all plugins.
          </p>
        </BentoTile>
      )}

      {staleApi && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          Website analysis unavailable — restart the API with{" "}
          <code className="rounded-lg border border-border/40 bg-surface/50 px-1.5 py-0.5 text-xs">
            npm run dev:api
          </code>
        </div>
      )}

      {/* ── Category filter strip ── */}
      {categories.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
              selectedCategory === null
                ? "border-primary/40 bg-primary/12 text-primary"
                : "border-border-strong bg-surface text-muted hover:border-primary/25 hover:text-foreground",
            )}
          >
            All
            <span className="ml-1.5 tabular-nums opacity-60">{plugins.length}</span>
          </button>
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
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                  isActive
                    ? `${style.badge}`
                    : "border-border-strong bg-surface text-muted hover:border-primary/25 hover:text-foreground",
                )}
              >
                {categoryLabel(cat)}
                <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Plugin grids by category ── */}
      {groupedPlugins.length > 0 ? (
        <div className="space-y-8">
          {groupedPlugins.map(({ category, items }) => (
            <section key={category}>
              <div className="mb-4 flex items-center gap-3">
                <span className={cn("rounded-full border px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest", categoryStyle(category).badge)}>
                  {categoryLabel(category)}
                </span>
                <p className="text-sm text-muted">{items.length} plugin{items.length !== 1 ? "s" : ""}</p>
              </div>
              <BentoGrid columns={3}>
                {items.map((plugin, idx) => {
                  const isFeatured = idx === 0 && !selectedCategory && category === "content";
                  return (
                    <div key={plugin.id} className={cn(isFeatured && "sm:col-span-2 sm:row-span-1")}>
                      <PluginCard
                        plugin={plugin}
                        projectId={activeProjectId || undefined}
                        siteUrl={siteUrl || undefined}
                        featured={isFeatured}
                        className="h-full"
                      />
                    </div>
                  );
                })}
              </BentoGrid>
            </section>
          ))}
        </div>
      ) : plugins.length === 0 ? (
        <BentoTile className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
            <Flame className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No plugins available</p>
            <p className="mt-1 text-sm text-muted">
              Contact your administrator to add plugins to the catalog.
            </p>
          </div>
        </BentoTile>
      ) : (
        <BentoTile className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-medium text-foreground">No plugins in this category</p>
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className="text-sm text-primary hover:underline"
          >
            Clear filter
          </button>
        </BentoTile>
      )}
    </div>
  );
}
