"use client";

import type { Output } from "@/lib/types";
import { isPipelineSavedOutput } from "@/lib/saved-output";
import { PluginSavedReportView } from "@/components/reports/plugin-saved-report-view";
import { PipelineSavedReportView } from "@/components/reports/pipeline-saved-report-view";

export function SavedReportViewer({
  output,
  projectId,
  siteUrl,
  backHref,
  backLabel,
  showSave,
}: {
  output: Output;
  projectId: string;
  siteUrl?: string;
  backHref?: string;
  backLabel?: string;
  showSave?: boolean;
}) {
  if (isPipelineSavedOutput(output)) {
    return (
      <PipelineSavedReportView
        output={output}
        projectId={projectId}
        siteUrl={siteUrl}
        backHref={backHref}
        backLabel={backLabel}
        showSave={showSave}
      />
    );
  }

  return (
    <PluginSavedReportView
      output={output}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
