import { api } from "@/lib/api";
import type { Pipeline, PipelineStepResult } from "@/lib/types";

function stepMarkdown(step: PipelineStepResult): string {
  const output = step.output;
  if (output && typeof output.markdown === "string" && output.markdown.trim()) {
    return output.markdown;
  }
  return step.output_markdown ?? "";
}

export function buildPipelineCombinedMarkdown(
  pipelineName: string,
  steps: PipelineStepResult[],
): string {
  const sections = steps.map(
    (step) => `## Step ${step.step}: ${step.label}\n\n${stepMarkdown(step)}`,
  );
  return `# ${pipelineName}\n\n${sections.join("\n\n---\n\n")}`;
}

export async function savePipelineReportToProject(options: {
  projectId: string;
  pipeline: Pipeline;
  steps: PipelineStepResult[];
  pipelineRunId?: string | null;
}): Promise<void> {
  const { projectId, pipeline, steps, pipelineRunId } = options;
  if (!steps.length) return;

  const first = steps[0];
  const combinedMarkdown = buildPipelineCombinedMarkdown(pipeline.name, steps);

  await api.post("/outputs", {
    project_id: projectId,
    plugin_id: first.plugin_id,
    execution_id: first.execution_id,
    input_snapshot: { pipeline_id: pipeline.id },
    schema_version: first.schema_version ?? 1,
    pipeline_id: pipeline.id,
    report_title: pipeline.name,
    generated_output: {
      markdown: combinedMarkdown,
      structured: {
        pipeline_report: true,
        pipeline_id: pipeline.id,
        pipeline_name: pipeline.name,
        pipeline_run_id: pipelineRunId ?? null,
        step_count: steps.length,
        steps: steps.map((step) => ({
          step: step.step,
          label: step.label,
          plugin_name: step.plugin_name,
          plugin_id: step.plugin_id,
          execution_id: step.execution_id,
          output_markdown: step.output_markdown,
          output: step.output ?? {
            markdown: step.output_markdown,
            structured: {},
          },
        })),
      },
    },
  });
}
