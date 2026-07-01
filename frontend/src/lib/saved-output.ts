import type { Output } from "@/lib/types";

export type SavedPipelineStepMeta = {
  step: number;
  label: string;
  plugin_name: string;
  plugin_id: string;
  execution_id: string;
  output_markdown?: string;
  output?: {
    markdown?: string;
    structured?: Record<string, unknown>;
  };
};

export function getSavedGenerated(output: Output): Record<string, unknown> | null {
  const gen = output.generated_output;
  if (!gen || typeof gen !== "object") return null;
  return gen;
}

export function getSavedStructured(output: Output): Record<string, unknown> | null {
  const gen = getSavedGenerated(output);
  if (!gen) return null;
  const structured = gen.structured;
  if (!structured || typeof structured !== "object") return null;
  return structured as Record<string, unknown>;
}

export function isPipelineSavedOutput(output: Output): boolean {
  const structured = getSavedStructured(output);
  if (!structured) return false;
  return structured.pipeline_report === true || Boolean(structured.pipeline_id);
}

export function getPipelineSavedMeta(output: Output): {
  pipelineId: string;
  pipelineName: string;
  pipelineRunId: string | null;
  steps: SavedPipelineStepMeta[];
} | null {
  const structured = getSavedStructured(output);
  if (!structured?.pipeline_id) return null;
  const steps = Array.isArray(structured.steps)
    ? (structured.steps as SavedPipelineStepMeta[])
    : [];
  return {
    pipelineId: String(structured.pipeline_id),
    pipelineName: String(structured.pipeline_name || output.plugin_name || "Pipeline Report"),
    pipelineRunId:
      typeof structured.pipeline_run_id === "string" ? structured.pipeline_run_id : null,
    steps,
  };
}

export function savedReportHref(projectId: string, outputId: string): string {
  const params = new URLSearchParams({
    projectId,
    outputId,
  });
  return `/reports/saved?${params.toString()}`;
}
