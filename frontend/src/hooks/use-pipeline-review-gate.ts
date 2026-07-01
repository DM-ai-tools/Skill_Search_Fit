"use client";

import { useCallback, useRef, useState } from "react";
import type { PipelinePendingInputs, PipelineRun } from "@/lib/types";
import type { PipelineContinueOptions } from "@/lib/pipelines";
import { buildContinuePayloadFromSuggestions } from "@/components/pipelines/pipeline-change-suggestions-review";

/**
 * Shared review-gate state for dashboard modal and pipeline view.
 * Returns a waitForReview handler compatible with runPipelineWithReview().
 */
export function usePipelineReviewGate() {
  const [pendingReview, setPendingReview] = useState<PipelinePendingInputs | null>(null);
  const [reviewRun, setReviewRun] = useState<PipelineRun | null>(null);
  const [continuingReview, setContinuingReview] = useState(false);
  const resolverRef = useRef<
    ((payload: PipelineContinueOptions | Record<string, unknown>) => void) | null
  >(null);

  const waitForReview = useCallback(
    (pending: PipelinePendingInputs, run: PipelineRun) =>
      new Promise<PipelineContinueOptions | Record<string, unknown>>((resolve) => {
        setPendingReview(pending);
        setReviewRun(run);
        resolverRef.current = resolve;
      }),
    [],
  );

  const resolveReview = useCallback((payload: PipelineContinueOptions | Record<string, unknown>) => {
    setContinuingReview(true);
    resolverRef.current?.(payload);
    resolverRef.current = null;
    // Keep pendingReview visible until applyRunState clears it after continue succeeds.
  }, []);

  const handleReviewContinue = useCallback(
    (payload: PipelineContinueOptions | Record<string, unknown>) => {
      resolveReview(payload);
    },
    [resolveReview],
  );

  const handleReviewSkip = useCallback(() => {
    if (pendingReview?.change_suggestions?.length) {
      resolveReview(
        buildContinuePayloadFromSuggestions(pendingReview.change_suggestions, {}, {
          approveAllPending: true,
        }),
      );
      return;
    }
    resolveReview({ editedInputs: {} });
  }, [pendingReview, resolveReview]);

  const showPendingReview = useCallback((pending: PipelinePendingInputs, run: PipelineRun) => {
    setPendingReview(pending);
    setReviewRun(run);
  }, []);

  const clearReview = useCallback(() => {
    resolverRef.current = null;
    setPendingReview(null);
    setReviewRun(null);
    setContinuingReview(false);
  }, []);

  return {
    pendingReview,
    reviewRun,
    continuingReview,
    waitForReview,
    handleReviewContinue,
    handleReviewSkip,
    showPendingReview,
    clearReview,
    endContinuingReview: () => setContinuingReview(false),
  };
}
