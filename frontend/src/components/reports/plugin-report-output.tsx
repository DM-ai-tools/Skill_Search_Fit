"use client";

import { ReportDownloadPanel } from "@/components/reports/report-download-panel";
import { Badge } from "@/components/ui/badge";
import { displayPluginName } from "@/lib/plugin-catalog";
import { getExecutionMarkdown } from "@/lib/report-utils";
import type { ExecuteResponse } from "@/lib/types";

export function toExecuteResponse(step: {
  execution_id: string;
  status: string;
  output?: { markdown?: string; structured?: Record<string, unknown> };
  output_markdown?: string;
}): ExecuteResponse {
  const output = step.output ?? {
    markdown: step.output_markdown ?? "",
    structured: {},
  };
  return {
    execution_id: step.execution_id,
    status: step.status,
    output: {
      markdown: typeof output.markdown === "string" ? output.markdown : step.output_markdown ?? "",
      structured: (output.structured as Record<string, unknown> | undefined) ?? {},
      execution_id: step.execution_id,
    },
    workflow_steps: [],
  };
}

export function PluginReportOutput({
  result,
  pluginName,
  pluginId,
  onSave,
  saving,
  className,
  saveLabel,
}: {
  result: ExecuteResponse;
  pluginName: string;
  pluginId?: string;
  onSave?: () => void;
  saving?: boolean;
  className?: string;
  saveLabel?: string;
}) {
  const markdown = getExecutionMarkdown(result.output, pluginName);
  const structured = result.output?.structured;
  const isPreview =
    structured?.preview === true || structured?.ai_mode === "preview";
  const isClaude = structured?.ai_mode === "claude";

  return (
    <div className={className ?? "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {isPreview && <Badge variant="warning">Preview mode</Badge>}
        {isClaude && <Badge variant="default">Claude</Badge>}
      </div>

      <ReportDownloadPanel
        result={result}
        pluginName={pluginName}
        onSave={onSave}
        saving={saving}
        saveLabel={saveLabel}
      />

      {markdown ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/30 bg-background/60">
          <pre className="whitespace-pre-wrap p-4 font-[inherit] text-sm leading-relaxed text-foreground/85">
            {markdown}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-muted">
          No report content for {displayPluginName(pluginName)}.
        </p>
      )}
    </div>
  );
}
