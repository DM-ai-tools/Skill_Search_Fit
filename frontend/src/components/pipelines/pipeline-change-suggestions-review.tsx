"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ClipboardList, Loader2, X } from "lucide-react";
import type {
  PipelineChangeSuggestion,
  PipelinePendingInputs,
  PipelineSuggestionApprovalStatus,
} from "@/lib/types";
import { updatePendingSuggestions } from "@/lib/pipelines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PipelineContinueOptions } from "@/lib/pipelines";
import {
  fieldTextContent,
  isStructuredFieldContent,
  reviewFieldTextareaClass,
  reviewFieldsScrollClass,
  reviewPanelClass,
  textareaRowsForContent,
} from "@/lib/pipeline-review-ui";

function formatContent(value: unknown): string {
  return fieldTextContent(value);
}

function effectiveContent(suggestion: PipelineChangeSuggestion): unknown {
  if (suggestion.approval_status === "rejected") {
    return suggestion.current_content;
  }
  if (suggestion.edited_content != null) {
    return suggestion.edited_content;
  }
  return suggestion.proposed_content;
}

function SuggestionDiff({
  current,
  proposed,
}: {
  current: unknown;
  proposed: unknown;
}) {
  const currentText = formatContent(current);
  const proposedText = formatContent(proposed);
  if (currentText === proposedText) {
    return <p className="text-xs text-muted">No visible change</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="max-h-48 overflow-auto rounded-lg border border-border/50 bg-surface/30 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted">Current</p>
        <p className="whitespace-pre-wrap text-sm text-muted line-through decoration-destructive/50">
          {currentText || "—"}
        </p>
      </div>
      <div className="max-h-48 overflow-auto rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Suggested
        </p>
        <p className="whitespace-pre-wrap text-sm text-foreground">{proposedText || "—"}</p>
      </div>
    </div>
  );
}

function SuggestionEditor({
  suggestion,
  value,
  onChange,
  disabled,
}: {
  suggestion: PipelineChangeSuggestion;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const type = suggestion.field_type;
  const text = formatContent(value);
  const structured = isStructuredFieldContent(text);
  if (type === "textarea") {
    return (
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={textareaRowsForContent(text)}
        disabled={disabled}
        className={reviewFieldTextareaClass(structured)}
        spellCheck={!structured}
      />
    );
  }
  if (type === "tag-list" || type === "url-list") {
    const tags = Array.isArray(value) ? (value as string[]) : text.split("\n").filter(Boolean);
    const joined = tags.join("\n");
    return (
      <Textarea
        value={joined}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean),
          )
        }
        rows={textareaRowsForContent(joined)}
        disabled={disabled}
        className={reviewFieldTextareaClass(true)}
        placeholder="One item per line"
      />
    );
  }
  if (type === "number") {
    return (
      <Input
        type="number"
        value={Number(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
    );
  }
  return (
    <Input
      value={formatContent(value)}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="text-sm"
    />
  );
}

function SuggestionCard({
  suggestion,
  onUpdate,
  showErrors,
}: {
  suggestion: PipelineChangeSuggestion;
  onUpdate: (patch: Partial<PipelineChangeSuggestion>) => void;
  showErrors: boolean;
}) {
  const status = suggestion.approval_status;
  const editable = status === "approved" || status === "pending";
  const content = effectiveContent(suggestion);

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        status === "approved" && "border-emerald-500/40 bg-emerald-500/5",
        status === "rejected" && "border-border/40 bg-surface/20 opacity-75",
        status === "pending" && "border-primary/30 bg-surface/40",
        showErrors && status === "pending" && "border-destructive/50",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-semibold">{suggestion.field_label}</Label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={status === "approved" ? "default" : "outline"}
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              onUpdate({
                approval_status: "approved",
                edited_content: suggestion.edited_content ?? suggestion.proposed_content,
              })
            }
          >
            <Check className="h-3 w-3" />
            Accept
          </Button>
          <Button
            type="button"
            size="sm"
            variant={status === "rejected" ? "destructive" : "outline"}
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => onUpdate({ approval_status: "rejected", edited_content: null })}
          >
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      </div>

      <SuggestionDiff current={suggestion.current_content} proposed={suggestion.proposed_content} />

      {status !== "rejected" && (
        <div className="mt-3 space-y-1">
          <p className="text-[11px] text-muted">Edit before applying (optional)</p>
          <SuggestionEditor
            suggestion={suggestion}
            value={content}
            onChange={(v) =>
              onUpdate({
                approval_status: status === "pending" ? "approved" : status,
                edited_content: v,
              })
            }
            disabled={!editable}
          />
        </div>
      )}
    </div>
  );
}

export function buildContinuePayloadFromSuggestions(
  suggestions: PipelineChangeSuggestion[],
  fieldValues: Record<string, unknown>,
  options?: { approveAllPending?: boolean },
): PipelineContinueOptions {
  return {
    editedInputs: fieldValues,
    suggestionUpdates: suggestions.map((s) => ({
      id: s.id,
      approval_status: s.approval_status,
      edited_content: s.edited_content ?? undefined,
    })),
    approveAllPending: options?.approveAllPending ?? false,
  };
}

export function PipelineChangeSuggestionsReview({
  pending,
  runId,
  competitorData,
  continuing,
  compact,
  featured,
  onContinue,
  onSkip,
}: {
  pending: PipelinePendingInputs;
  runId?: string;
  competitorData: Record<string, unknown>;
  continuing?: boolean;
  compact?: boolean;
  featured?: boolean;
  onContinue: (payload: PipelineContinueOptions) => void;
  onSkip: () => void;
}) {
  const suggestions = pending.change_suggestions ?? [];
  const [items, setItems] = useState<PipelineChangeSuggestion[]>(suggestions);
  const [showErrors, setShowErrors] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [confirmBulk, setConfirmBulk] = useState<"accept" | "reject" | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setItems(suggestions);
    setShowErrors(false);
    setConfirmBulk(null);
  }, [pending.step_index, pending.plugin_name, suggestions]);

  const persist = useCallback(
    (next: PipelineChangeSuggestion[]) => {
      if (!runId) return;
      setSyncError("");
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(async () => {
        setSyncing(true);
        try {
          await updatePendingSuggestions(
            runId,
            next.map((s) => ({
              id: s.id,
              approval_status: s.approval_status,
              edited_content: s.edited_content,
            })),
          );
        } catch {
          setSyncError("Could not save decisions — they will be sent when you continue.");
        } finally {
          setSyncing(false);
        }
      }, 500);
    },
    [runId],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<PipelineChangeSuggestion>) => {
      setItems((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const pendingCount = items.filter((s) => s.approval_status === "pending").length;
  const approvedCount = items.filter((s) => s.approval_status === "approved").length;
  const rejectedCount = items.filter((s) => s.approval_status === "rejected").length;

  const contextStrip = useMemo(() => {
    const wc = competitorData.minimum_competitive_word_count;
    const gap = Array.isArray(competitorData.competitor_gaps)
      ? (competitorData.competitor_gaps as string[])[0]
      : null;
    if (wc && gap) return `Competitors average ${wc} words | Top gap: ${gap}`;
    if (wc) return `Competitors average ${wc} words`;
    if (gap) return `Top gap: ${gap}`;
    return null;
  }, [competitorData]);

  const applyBulk = (status: PipelineSuggestionApprovalStatus) => {
    setItems((prev) => {
      const next = prev.map((s) => ({
        ...s,
        approval_status: status,
        edited_content:
          status === "approved" ? (s.edited_content ?? s.proposed_content) : null,
      }));
      persist(next);
      return next;
    });
    setConfirmBulk(null);
  };

  const handleContinue = () => {
    if (pendingCount > 0) {
      setShowErrors(true);
      return;
    }
    onContinue(buildContinuePayloadFromSuggestions(items, {}));
  };

  const handleSkip = () => {
    onSkip();
  };

  return (
    <div className={reviewPanelClass({ compact, featured })}>
      <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-700/90 dark:text-amber-300/90">
                {pending.is_final_review ? "Final review" : `Step ${pending.step_index} · change suggestions`}
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {pending.is_final_review ? "Approve publish-ready output" : `Next: ${pending.skill_name}`}
              </p>
              <p className="mt-1 text-sm text-muted">
                {pending.is_final_review
                  ? "Review and approve your publish-ready content before the pipeline completes."
                  : `Accept, reject, or edit each suggestion before ${pending.skill_name} runs.`}
              </p>
            </div>
          </div>
          {syncing && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          )}
        </div>
        {contextStrip && (
          <p className="mt-3 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
            {contextStrip}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span>{approvedCount} accepted</span>
          <span>·</span>
          <span>{pendingCount} pending</span>
          <span>·</span>
          <span>{rejectedCount} rejected</span>
        </div>
      </div>

      <div className={cn(reviewFieldsScrollClass({ compact, featured }), "space-y-4")}>
        {items.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onUpdate={(patch) => updateItem(suggestion.id, patch)}
            showErrors={showErrors}
          />
        ))}
      </div>

      {syncError && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {syncError}
        </div>
      )}

      {showErrors && pendingCount > 0 && (
        <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Resolve all {pendingCount} pending suggestion(s) before continuing, or use Accept all / Skip editing.
        </div>
      )}

      <div className="sticky bottom-0 shrink-0 space-y-2 border-t border-amber-500/20 bg-surface/80 px-5 py-4 backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          {confirmBulk === "accept" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>Accept all {items.length} suggestions?</span>
              <Button size="sm" className="h-7" onClick={() => applyBulk("approved")}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmBulk(null)}>
                Cancel
              </Button>
            </div>
          ) : confirmBulk === "reject" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>Reject all suggestions? Extracted values will not be applied.</span>
              <Button size="sm" variant="destructive" className="h-7" onClick={() => applyBulk("rejected")}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmBulk(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={continuing || items.length === 0}
                onClick={() => setConfirmBulk("accept")}
              >
                Accept all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={continuing || items.length === 0}
                onClick={() => setConfirmBulk("reject")}
              >
                Reject all
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={continuing}
            className="text-xs text-muted hover:text-primary"
          >
            Skip editing →
          </button>
          <Button onClick={handleContinue} disabled={continuing} className="gap-1.5">
            {continuing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {pending.is_final_review ? "Completing…" : "Running next step…"}
              </>
            ) : (
              <>
                {pending.is_final_review ? "Complete pipeline" : `Continue to ${pending.skill_name}`}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
