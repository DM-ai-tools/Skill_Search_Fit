"use client";

import type { ComponentType } from "react";
import {
  Bot, ClipboardCheck, Code, Eye, FileText, Gauge, Layers, Lightbulb,
  Link2, Map, Network, PenLine, Puzzle, ScanSearch, Search, Wrench,
  Users, Languages, CircleCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CatalogTile } from "@/components/bento";
import type { Plugin } from "@/lib/types";
import { cn } from "@/lib/utils";
import { displayPluginName, getPluginCategory } from "@/lib/plugin-catalog";
import { categoryLabel, categoryStyle } from "@/lib/design-tokens";
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

function PluginIcon({ name, category }: { name: string; category: string }) {
  const Icon = ICON_MAP[name] || Puzzle;
  const colors = categoryStyle(category);
  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
        colors.bg,
        colors.border,
        "group-hover:scale-110",
      )}
    >
      <Icon className={cn("h-6 w-6 transition-colors", colors.text)} />
    </div>
  );
}

export function PluginCard({
  plugin,
  projectId,
  siteUrl,
  className,
  featured = false,
}: {
  plugin: Plugin;
  projectId?: string;
  siteUrl?: string;
  className?: string;
  featured?: boolean;
}) {
  const params = new URLSearchParams();
  if (projectId) params.set("project", projectId);
  if (siteUrl) params.set("site_url", siteUrl);
  const query = params.toString();
  const href = `/workspace/${plugin.id}${query ? `?${query}` : ""}`;
  const canonicalName = displayPluginName(plugin.plugin_name);
  const category = getPluginCategory(plugin.plugin_name, plugin.category);
  const badgeClass = categoryStyle(category).badge;

  return (
    <CatalogTile
      href={href}
      title={canonicalName}
      description={plugin.description}
      icon={<PluginIcon name={plugin.icon} category={category} />}
      badge={<Badge className={cn("font-mono text-[10px] uppercase tracking-wide", badgeClass)}>{categoryLabel(category)}</Badge>}
      actionLabel={getPluginActionLabel(category, canonicalName)}
      featured={featured}
      className={className}
    />
  );
}
