"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { GitBranch, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import type { Pipeline } from "@/lib/types";
import { getPipelineDetail } from "@/lib/pipeline-details";

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  workflow: Workflow,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
};

export function PipelineDetailDialog({
  pipeline,
  open,
  onClose,
  projectId,
  siteUrl,
}: {
  pipeline: Pipeline | null;
  open: boolean;
  onClose: () => void;
  projectId?: string;
  siteUrl?: string;
}) {
  if (!pipeline) return null;

  const detail = getPipelineDetail(pipeline);
  const Icon = ICON_MAP[pipeline.icon] || GitBranch;
  const params = new URLSearchParams();
  if (projectId) params.set("project", projectId);
  if (siteUrl) params.set("site_url", siteUrl);
  const query = params.toString();
  const launchHref = `/pipeline/${pipeline.id}${query ? `?${query}` : ""}`;

  return (
    <Dialog open={open} onClose={onClose} title={pipeline.name} className="max-w-3xl">
      <div className="space-y-6 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted">{detail.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">Impact {detail.impact}/10</Badge>
              <Badge variant="outline">Ease {detail.ease}/10</Badge>
              <Badge variant="outline">Revenue {detail.revenue}/10</Badge>
              <Badge>{pipeline.step_count} skills</Badge>
            </div>
          </div>
        </div>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">What it does</h3>
          <p className="mt-2 text-sm leading-relaxed">{detail.outcome}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{detail.whyValuable}</p>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Workflow</h3>
          <ol className="mt-2 space-y-2">
            {detail.workflow.map((step) => (
              <li key={step} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Implementations</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.implementations.map((item) => (
              <Badge key={item} variant="outline" className="text-xs">
                {item}
              </Badge>
            ))}
          </div>
        </section>

        <Link
          href={launchHref}
          onClick={onClose}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary text-base font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Launch pipeline
        </Link>
      </div>
    </Dialog>
  );
}
