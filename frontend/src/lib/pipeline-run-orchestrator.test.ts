import { describe, expect, it, vi, beforeEach } from "vitest";

import type { PipelinePendingInputs, PipelineRun } from "@/lib/types";
import { runPipelineWithReview } from "@/lib/pipeline-run-orchestrator";

vi.mock("@/lib/pipelines", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pipelines")>();
  return {
    ...actual,
    startPipelineRun: vi.fn(),
    fetchPipelineRun: vi.fn(),
    continuePipelineRun: vi.fn(),
  };
});

function baseRun(overrides: Partial<PipelineRun>): PipelineRun {
  return {
    id: "run-1",
    pipeline_id: "audit-fix-verify",
    project_id: "proj-1",
    status: "running",
    current_skill_index: 0,
    base_inputs: {},
    competitor_data: {},
    competitor_failed: false,
    prior_markdown: [],
    step_results: [],
    pending_inputs: null,
    edited_inputs_count: 0,
    expires_at: null,
    error_message: null,
    ...overrides,
  };
}

describe("runPipelineWithReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes when run reaches completed status", async () => {
    const { startPipelineRun, fetchPipelineRun } = await import("@/lib/pipelines");
    const completed = baseRun({ id: "run-1", status: "completed" });
    vi.mocked(startPipelineRun).mockResolvedValue(baseRun({ status: "running" }));
    vi.mocked(fetchPipelineRun).mockResolvedValue(completed);

    const result = await runPipelineWithReview({
      pipelineId: "audit-fix-verify",
      projectId: "proj-1",
      inputs: {},
      waitForReview: async () => ({}),
    });

    expect(result.status).toBe("completed");
  });

  it("pauses for review and continues with edited inputs", async () => {
    const { startPipelineRun, fetchPipelineRun, continuePipelineRun } = await import(
      "@/lib/pipelines"
    );

    const pending: PipelinePendingInputs = {
      step_index: 1,
      plugin_name: "On-Page SEO",
      skill_name: "on-page-seo",
      inputs: { topic: "SEO" },
      field_definitions: [
        {
          key: "topic",
          label: "Topic",
          type: "text",
          value: "SEO",
        },
      ],
    };

    vi.mocked(startPipelineRun).mockResolvedValue(
      baseRun({
        id: "run-2",
        status: "paused_for_review",
        pending_inputs: pending,
      }),
    );

    vi.mocked(continuePipelineRun).mockResolvedValue(
      baseRun({
        id: "run-2",
        status: "completed",
      }),
    );

    const waitForReview = vi.fn().mockResolvedValue({ topic: "Updated topic" });

    const result = await runPipelineWithReview({
      pipelineId: "audit-fix-verify",
      projectId: "proj-1",
      inputs: {},
      waitForReview,
    });

    expect(waitForReview).toHaveBeenCalled();
    expect(continuePipelineRun).toHaveBeenCalledWith("run-2", {
      editedInputs: { topic: "Updated topic" },
    });
    expect(result.status).toBe("completed");
  });
});
