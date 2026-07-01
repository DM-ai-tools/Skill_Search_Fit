"use client";

import { useMemo, useState, useEffect } from "react";
import { ArrowRight, ClipboardList, Loader2 } from "lucide-react";
import type { PipelineInputFieldDef, PipelinePendingInputs } from "@/lib/types";
import type { PipelineContinueOptions } from "@/lib/pipelines";
import {
  fieldTextContent,
  isStructuredFieldContent,
  reviewFieldTextareaClass,
  reviewFieldsScrollClass,
  reviewPanelClass,
  textareaRowsForContent,
} from "@/lib/pipeline-review-ui";
import { PipelineChangeSuggestionsReview } from "@/components/pipelines/pipeline-change-suggestions-review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function isEmptyValue(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function TagListEditor({
  values,
  onChange,
  disabled,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/60 px-2 py-0.5 text-xs"
          >
            <input
              className="w-24 bg-transparent text-foreground outline-none disabled:opacity-60"
              value={tag}
              disabled={disabled}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            {!disabled && (
              <button
                type="button"
                className="text-muted hover:text-destructive"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add value"
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (!draft.trim()) return;
              onChange([...values, draft.trim()]);
              setDraft("");
            }}
          >
            +
          </Button>
        </div>
      )}
    </div>
  );
}

function FieldEditor({
  field,
  value,
  original,
  onChange,
  onReset,
  showErrors,
}: {
  field: PipelineInputFieldDef;
  value: unknown;
  original: unknown;
  onChange: (v: unknown) => void;
  onReset: () => void;
  showErrors: boolean;
}) {
  const edited = JSON.stringify(value) !== JSON.stringify(original);
  const type = field.type || "string";
  const readOnly = field.editable === false;
  const required = field.required === true;
  const empty = required && isEmptyValue(value);
  const text = fieldTextContent(value);
  const structured = type === "textarea" && isStructuredFieldContent(text);
  const textareaRows = type === "textarea" ? textareaRowsForContent(text) : 5;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-surface/50 p-4 shadow-sm",
        structured && "border-primary/25 bg-surface/70",
        empty && showErrors && "border-destructive/50",
      )}
    >
      <div className="flex items-center gap-2">
        <Label className="text-sm font-semibold text-foreground">
          {field.label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        {edited && !readOnly && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Edited</span>
        )}
        {edited && !readOnly && (
          <button type="button" onClick={onReset} className="text-[10px] text-muted hover:text-primary">
            Reset to original
          </button>
        )}
      </div>
      {field.description && <p className="text-xs text-muted">{field.description}</p>}
      {readOnly ? (
        <pre
          className={cn(
            "max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-background/60 px-4 py-3 text-sm",
            structured && "font-mono text-[13px] leading-5",
          )}
        >
          {text || "—"}
        </pre>
      ) : (
        <>
          {type === "textarea" && (
            <Textarea
              value={text}
              onChange={(e) => onChange(e.target.value)}
              rows={textareaRows}
              className={reviewFieldTextareaClass(structured, empty && showErrors)}
              spellCheck={!structured}
            />
          )}
          {type === "number" && (
            <Input
              type="number"
              value={Number(value ?? 0)}
              onChange={(e) => onChange(Number(e.target.value))}
              className={cn(empty && showErrors && "border-destructive")}
            />
          )}
          {type === "tag-list" && (
            <TagListEditor
              values={Array.isArray(value) ? (value as string[]) : []}
              onChange={(v) => onChange(v)}
            />
          )}
          {type === "url-list" && (
            <TagListEditor
              values={Array.isArray(value) ? (value as string[]) : String(value ?? "").split("\n").filter(Boolean)}
              onChange={(v) => onChange(v)}
            />
          )}
          {!["textarea", "number", "tag-list", "url-list"].includes(type) && (
            <Input
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}
              className={cn(empty && showErrors && "border-destructive")}
            />
          )}
        </>
      )}
      {empty && showErrors && (
        <p className="text-[11px] text-destructive">This field is required before continuing.</p>
      )}
      {field.editNote && <p className="text-[11px] text-muted/80">{field.editNote}</p>}
    </div>
  );
}

export function PipelineInputReview({
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
  onContinue: (payload: PipelineContinueOptions | Record<string, unknown>) => void;
  onSkip: () => void;
}) {
  const hasSuggestions = (pending.change_suggestions?.length ?? 0) > 0;

  if (hasSuggestions) {
    return (
      <PipelineChangeSuggestionsReview
        pending={pending}
        runId={runId}
        competitorData={competitorData}
        continuing={continuing}
        compact={compact}
        featured={featured}
        onContinue={onContinue}
        onSkip={onSkip}
      />
    );
  }

  return (
    <PipelineFieldInputReview
      pending={pending}
      competitorData={competitorData}
      continuing={continuing}
      compact={compact}
      featured={featured}
      onContinue={onContinue}
      onSkip={onSkip}
    />
  );
}

function PipelineFieldInputReview({
  pending,
  competitorData,
  continuing,
  compact,
  featured,
  onContinue,
  onSkip,
}: {
  pending: PipelinePendingInputs;
  competitorData: Record<string, unknown>;
  continuing?: boolean;
  compact?: boolean;
  featured?: boolean;
  onContinue: (payload: PipelineContinueOptions | Record<string, unknown>) => void;
  onSkip: () => void;
}) {
  const originals = useMemo(() => {
    const map: Record<string, unknown> = {};
    for (const f of pending.field_definitions) {
      map[f.key] = f.value;
    }
    return map;
  }, [pending]);

  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...originals }));
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    const next: Record<string, unknown> = {};
    for (const f of pending.field_definitions) {
      next[f.key] = f.value;
    }
    setValues(next);
    setShowErrors(false);
  }, [pending.step_index, pending.plugin_name, pending.field_definitions]);

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

  const missingRequired = pending.field_definitions.filter((f) => {
    if (!f.required) return false;
    return isEmptyValue(values[f.key]);
  });

  const handleContinue = () => {
    if (missingRequired.length > 0) {
      setShowErrors(true);
      return;
    }
    onContinue({ editedInputs: values });
  };

  return (
    <div className={reviewPanelClass({ compact, featured })}>
      <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-700/90 dark:text-amber-300/90">
              Step {pending.step_index} review · {pending.field_definitions.length} field
              {pending.field_definitions.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              Next: {pending.skill_name}
            </p>
            <p className="mt-1 text-sm text-muted">
              Review and edit what feeds into <span className="font-medium text-foreground">{pending.plugin_name}</span> before it runs.
            </p>
            {contextStrip && (
              <p className="mt-3 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                {contextStrip}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={reviewFieldsScrollClass({ compact, featured })}>
        {pending.field_definitions.map((field) => (
          <FieldEditor
            key={field.key}
            field={field}
            value={values[field.key]}
            original={originals[field.key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
            onReset={() => setValues((prev) => ({ ...prev, [field.key]: originals[field.key] }))}
            showErrors={showErrors}
          />
        ))}
      </div>

      {missingRequired.length > 0 && showErrors && (
        <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Fill all required fields ({missingRequired.length}) before continuing, or use Skip editing to keep
          extracted defaults.
        </div>
      )}

      {missingRequired.length > 0 && !showErrors && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {missingRequired.length} required field(s) are empty.
        </div>
      )}

      <div className="sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t border-amber-500/20 bg-surface/80 px-5 py-4 backdrop-blur-md">
        <button
          type="button"
          onClick={onSkip}
          disabled={continuing}
          className="text-sm text-muted hover:text-primary"
        >
          Skip editing →
        </button>
        <Button onClick={handleContinue} disabled={continuing} size="lg" className="gap-2 px-6">
          {continuing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running next step…
            </>
          ) : (
            <>
              Continue to {pending.skill_name}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
