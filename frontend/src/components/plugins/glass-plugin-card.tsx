"use client";

import type { ComponentType, CSSProperties } from "react";
import Link from "next/link";
import {
  Bot, ClipboardCheck, Code, Eye, FileText, Gauge, Layers, Lightbulb,
  Link2, Map, Network, PenLine, Puzzle, ScanSearch, Search, Users,
  Languages, CircleCheck, Wrench, ArrowRight,
} from "lucide-react";
import type { Plugin } from "@/lib/types";
import { cn } from "@/lib/utils";
import { categoryLabel, categoryStyle } from "@/lib/design-tokens";
import {
  displayPluginName,
  getPluginCategory,
} from "@/lib/plugin-catalog";
import { getPluginActionLabel } from "@/lib/plugin-actions";

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  search: Search,
  "file-text": FileText,
  wrench: Wrench,
  puzzle: Puzzle,
  eye: Eye,
  bot: Bot,
  link: Link2,
  map: Map,
  network: Network,
  layers: Layers,
  "scan-search": ScanSearch,
  code: Code,
  "clipboard-check": ClipboardCheck,
  gauge: Gauge,
  "pen-line": PenLine,
  lightbulb: Lightbulb,
  users: Users,
  languages: Languages,
  "circle-check": CircleCheck,
};

const CAT_GLOW: Record<string, string> = {
  visibility: "107, 164, 248",
  research: "107, 164, 248",
  content: "74, 222, 128",
  technical: "255, 139, 61",
  "local-seo": "192, 132, 252",
  reporting: "184, 168, 161",
  analytics: "212, 90, 140",
};

function catGlow(category: string) {
  return CAT_GLOW[category] ?? "224, 138, 60";
}

export function GlassPluginCard({
  plugin,
  projectId,
  siteUrl,
  className,
}: {
  plugin: Plugin;
  projectId?: string;
  siteUrl?: string;
  className?: string;
}) {
  const params = new URLSearchParams();
  if (projectId) params.set("project", projectId);
  if (siteUrl) params.set("site_url", siteUrl);
  const query = params.toString();
  const href = `/workspace/${plugin.id}${query ? `?${query}` : ""}`;

  const name = displayPluginName(plugin.plugin_name);
  const category = getPluginCategory(plugin.plugin_name, plugin.category);
  const style = categoryStyle(category);
  const Icon = ICON_MAP[plugin.icon] ?? Puzzle;
  const glow = catGlow(category);
  const actionLabel = getPluginActionLabel(category, name);

  return (
    <Link href={href} className={cn("block h-full", className)}>
      <article
        className="plugin-glass-card group relative flex h-full flex-col overflow-hidden rounded-2xl"
        style={{ "--glow-rgb": glow } as CSSProperties}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: `rgba(${glow}, 0.22)` }}
        />

        <div className="relative z-[1] flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-300 group-hover:scale-105",
                style.bg,
                style.border,
              )}
            >
              <Icon className={cn("h-5 w-5", style.text)} />
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider",
                style.badge,
              )}
            >
              {categoryLabel(category)}
            </span>
          </div>

          <div className="min-w-0 space-y-1.5">
            <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
              {name}
            </h3>
            <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">
              {plugin.description || "AI-powered SEO workflow."}
            </p>
          </div>

          <div
            className={cn(
              "mt-auto flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all duration-200",
              "border-border/50 bg-surface/30 text-foreground/85",
              "group-hover:border-primary/35 group-hover:bg-primary/10 group-hover:text-primary",
              "group-hover:shadow-[0_0_20px_rgba(var(--glow-rgb),0.12)]",
            )}
          >
            <span>{actionLabel.replace(/\s*→\s*$/, "")}</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
        </div>
      </article>
    </Link>
  );
}
