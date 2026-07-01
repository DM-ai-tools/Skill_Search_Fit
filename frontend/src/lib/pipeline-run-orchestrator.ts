import type { PipelinePendingInputs, PipelineRun } from "@/lib/types";
import {
  continuePipelineRun,
  fetchPipelineRun,
  normalizeContinuePayload,
  startPipelineRun,
  type PipelineContinueOptions,
} from "@/lib/pipelines";

const POLL_MS = 3000;
const ACTIVE_STATUSES = new Set(["analyzing_competitors", "running"]);
const MAX_ANALYZING_MS = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertAnalyzingNotTimedOut(
  run: PipelineRun,
  analyzingStartedAt: number,
): void {
  if (run.status !== "analyzing_competitors") return;
  if (Date.now() - analyzingStartedAt <= MAX_ANALYZING_MS) return;
  throw new Error(
    "Pipeline startup timed out. Restart the API (npm run dev:api) and run again.",
  );
}

export type PipelineRunReviewHandler = (
  pending: PipelinePendingInputs,
  run: PipelineRun,
) => Promise<PipelineContinueOptions | Record<string, unknown>>;

export type RunPipelineWithReviewOptions = {
  pipelineId: string;
  projectId: string;
  inputs: Record<string, unknown>;
  onRunUpdate?: (run: PipelineRun) => void;
  waitForReview: PipelineRunReviewHandler;
  aborted?: () => boolean;
};

/**
 * Run a pipeline via POST /runs with polling and inter-skill review gates.
 */
export async function runPipelineWithReview({
  pipelineId,
  projectId,
  inputs,
  onRunUpdate,
  waitForReview,
  aborted,
}: RunPipelineWithReviewOptions): Promise<PipelineRun> {
  let run = await startPipelineRun(pipelineId, projectId, inputs);
  onRunUpdate?.(run);
  let analyzingStartedAt =
    run.status === "analyzing_competitors" ? Date.now() : 0;

  for (;;) {
    if (aborted?.()) {
      throw new Error("Pipeline run aborted");
    }

    while (ACTIVE_STATUSES.has(run.status)) {
      assertAnalyzingNotTimedOut(run, analyzingStartedAt);
      await sleep(POLL_MS);
      if (aborted?.()) {
        throw new Error("Pipeline run aborted");
      }
      run = await fetchPipelineRun(run.id);
      if (run.status !== "analyzing_competitors") {
        analyzingStartedAt = 0;
      } else if (!analyzingStartedAt) {
        analyzingStartedAt = Date.now();
      }
      onRunUpdate?.(run);
    }

    if (run.status === "paused_for_review" && run.pending_inputs) {
      onRunUpdate?.(run);
      const payload = await waitForReview(run.pending_inputs, run);
      if (aborted?.()) {
        throw new Error("Pipeline run aborted");
      }
      run = await continuePipelineRun(run.id, normalizeContinuePayload(payload));
      onRunUpdate?.(run);
      continue;
    }

    if (run.status === "failed") {
      throw new Error(run.error_message || "Pipeline run failed");
    }

    return run;
  }
}

export async function pollPipelineRun(
  runId: string,
  onUpdate: (run: PipelineRun) => void,
  aborted?: () => boolean,
): Promise<PipelineRun> {
  let run = await fetchPipelineRun(runId);
  onUpdate(run);
  let analyzingStartedAt =
    run.status === "analyzing_competitors" ? Date.now() : 0;

  while (ACTIVE_STATUSES.has(run.status)) {
    assertAnalyzingNotTimedOut(run, analyzingStartedAt);
    await sleep(POLL_MS);
    if (aborted?.()) {
      throw new Error("Pipeline run aborted");
    }
    run = await fetchPipelineRun(runId);
    if (run.status !== "analyzing_competitors") {
      analyzingStartedAt = 0;
    } else if (!analyzingStartedAt) {
      analyzingStartedAt = Date.now();
    }
    onUpdate(run);
  }

  return run;
}
