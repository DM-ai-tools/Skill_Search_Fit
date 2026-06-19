"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowRight, GitBranch, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Pipeline } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  workflow: Workflow,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
};

export function PipelineCard({
  pipeline,
  onSelect,
  siteUrl,
  projectId,
  className,
}: {
  pipeline: Pipeline;
  onSelect?: () => void;
  siteUrl?: string;
  projectId?: string;
  className?: string;
}) {
  const Icon = ICON_MAP[pipeline.icon] || GitBranch;

  const params = new URLSearchParams();
  if (projectId) params.set("project", projectId);
  if (siteUrl) params.set("site_url", siteUrl);
  const query = params.toString();
  const launchHref = `/pipeline/${pipeline.id}${query ? `?${query}` : ""}`;

  return (
    <div className={cn("bento-tile group flex h-full flex-col overflow-hidden border-primary/15 p-0", className)}>
      {/* Card body — click opens detail dialog */}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect?.()}
        className="flex flex-1 cursor-pointer flex-col gap-3 p-4 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/25">
            <Icon className="h-5 w-5" />
          </div>
          <Badge variant="outline" className="shrink-0 text-[11px]">{pipeline.step_count} skills</Badge>
        </div>

        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
            {pipeline.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
            {pipeline.description}
          </p>
        </div>

        <ol className="space-y-1">
          {pipeline.steps.slice(0, 4).map((step, i) => (
            <li key={step.plugin_name} className="group/step flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-primary">{i + 1}.</span>
              <Link
                href={`/plugins?q=${encodeURIComponent(step.plugin_name)}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-[11px] text-muted transition-colors hover:text-primary hover:underline"
              >
                {step.label}
              </Link>
            </li>
          ))}
          {pipeline.steps.length > 4 && (
            <li className="text-[11px] text-primary">+{pipeline.steps.length - 4} more steps</li>
          )}
        </ol>
      </div>

      {/* Action row */}
      <div className="flex shrink-0 gap-2 border-t border-border/30 bg-surface/40 p-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center justify-center gap-1 rounded-xl border border-border/50 bg-surface/30 px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:border-border/70 hover:text-foreground"
        >
          Details
        </button>
        <Link
          href={launchHref}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 py-2 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Launch Pipeline
        </Link>
      </div>
    </div>
  );
}
