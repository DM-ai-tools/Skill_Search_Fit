"use client";

import type { ComponentType } from "react";
import { GitBranch, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CatalogTile } from "@/components/bento";
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
  className,
}: {
  pipeline: Pipeline;
  onSelect?: () => void;
  className?: string;
}) {
  const Icon = ICON_MAP[pipeline.icon] || GitBranch;

  return (
    <CatalogTile
      onClick={onSelect}
      title={pipeline.name}
      description={pipeline.description}
      icon={
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/25">
          <Icon className="h-6 w-6" />
        </div>
      }
      badge={<Badge variant="outline">{pipeline.step_count} skills</Badge>}
      meta={
        <ol className="space-y-1">
          {pipeline.steps.slice(0, 4).map((step, i) => (
            <li key={step.plugin_name} className="flex items-center gap-2 truncate">
              <span className="font-medium text-primary">{i + 1}.</span>
              <span className="truncate">{step.label}</span>
            </li>
          ))}
          {pipeline.steps.length > 4 && <li className="text-primary">+{pipeline.steps.length - 4} more steps</li>}
        </ol>
      }
      actionLabel="View details"
      className={cn("border-primary/15", className)}
    />
  );
}
