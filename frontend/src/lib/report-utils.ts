import type { Output } from "@/lib/types";
import { normalizeReportMarkdown } from "@/lib/report-normalizer";

export function getOutputMarkdown(
  output: Output | { generated_output: Record<string, unknown> },
  pluginName?: string,
): string {
  const generated = output.generated_output;
  if (!generated || typeof generated !== "object") {
    return "";
  }
  const normalized = normalizeReportMarkdown(
    {
      markdown: typeof generated.markdown === "string" ? generated.markdown : undefined,
      structured: (generated.structured as Record<string, unknown> | undefined) ?? null,
    },
    pluginName,
  );
  if (normalized) return normalized;
  return JSON.stringify(generated, null, 2);
}

export function getExecutionMarkdown(
  result: { markdown?: string; structured?: Record<string, unknown> } | null | undefined,
  pluginName?: string,
): string {
  return normalizeReportMarkdown(result, pluginName);
}
