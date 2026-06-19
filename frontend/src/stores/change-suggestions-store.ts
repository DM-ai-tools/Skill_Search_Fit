"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChangeSuggestionWithChanges, ChangeResponse, PublishItemResult } from "@/lib/change-suggestions-api";

export type WizardStep = "upload" | "review" | "publish";

export type LocalOverride = {
  approvalStatus?: "pending" | "approved" | "rejected";
  editedContent?: string;
};

interface ChangeSuggestionsState {
  step: WizardStep;
  suggestionId: string | null;
  filename: string | null;
  changes: ChangeResponse[];
  /** Local overrides before PATCH is confirmed — keyed by change id */
  overrides: Record<string, LocalOverride>;
  publishResults: PublishItemResult[] | null;
  publishDryRun: boolean;

  setStep: (step: WizardStep) => void;
  loadSuggestion: (data: ChangeSuggestionWithChanges) => void;
  setOverride: (changeId: string, override: Partial<LocalOverride>) => void;
  bulkApprove: (ids: string[]) => void;
  bulkReject: (ids: string[]) => void;
  setPublishResults: (results: PublishItemResult[], dryRun: boolean) => void;
  reset: () => void;

  /** Derived: merge server changes with local overrides */
  mergedChanges: () => ChangeResponse[];
}

const DEFAULT: Pick<
  ChangeSuggestionsState,
  "step" | "suggestionId" | "filename" | "changes" | "overrides" | "publishResults" | "publishDryRun"
> = {
  step: "upload",
  suggestionId: null,
  filename: null,
  changes: [],
  overrides: {},
  publishResults: null,
  publishDryRun: true,
};

export const useChangeSuggestionsStore = create<ChangeSuggestionsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT,

      setStep: (step) => set({ step }),

      loadSuggestion: (data) =>
        set({
          suggestionId: data.suggestion.id,
          filename: data.suggestion.filename,
          changes: data.changes,
          overrides: {},
          publishResults: null,
        }),

      setOverride: (changeId, override) =>
        set((s) => ({
          overrides: {
            ...s.overrides,
            [changeId]: { ...s.overrides[changeId], ...override },
          },
        })),

      bulkApprove: (ids) =>
        set((s) => {
          const next = { ...s.overrides };
          ids.forEach((id) => {
            next[id] = { ...next[id], approvalStatus: "approved" };
          });
          return { overrides: next };
        }),

      bulkReject: (ids) =>
        set((s) => {
          const next = { ...s.overrides };
          ids.forEach((id) => {
            next[id] = { ...next[id], approvalStatus: "rejected" };
          });
          return { overrides: next };
        }),

      setPublishResults: (results, dryRun) =>
        set({ publishResults: results, publishDryRun: dryRun }),

      reset: () => set({ ...DEFAULT }),

      mergedChanges: () => {
        const { changes, overrides } = get();
        return changes.map((c) => {
          const ov = overrides[c.id];
          if (!ov) return c;
          return {
            ...c,
            approval_status: ov.approvalStatus ?? c.approval_status,
            edited_content: ov.editedContent !== undefined ? ov.editedContent : c.edited_content,
          };
        });
      },
    }),
    {
      name: "change-suggestions-store",
      partialize: (s) => ({
        suggestionId: s.suggestionId,
        filename: s.filename,
        step: s.step,
        changes: s.changes,
        overrides: s.overrides,
      }),
    },
  ),
);
