"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, X, Pencil, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { ChangeResponse, ApprovalStatus } from "@/lib/change-suggestions-api";
import { ChangeTypeView } from "@/components/change-suggestions/change-type-views";

// ── Priority rail color ───────────────────────────────────────────────────────

function railColor(priority: string, status: ApprovalStatus) {
  if (status === "approved") return "bg-success";
  if (status === "rejected") return "bg-muted/40";
  if (priority === "High") return "bg-destructive";
  if (priority === "Medium") return "bg-warning";
  return "bg-primary";
}

// ── Monospace label badge ─────────────────────────────────────────────────────

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </span>
  );
}

function sourceUrlHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return null;
  return `https://${trimmed}`;
}

function SourceUrl({ url }: { url: string }) {
  const trimmed = url.trim();
  const href = sourceUrlHref(trimmed);

  return (
    <div className="mt-2.5 flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5">
      <ExternalLink className="h-3 w-3 shrink-0 text-muted/70" aria-hidden />
      <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted/80">
        Source URL
      </span>
      <span className="min-w-0 flex-1">
        {trimmed ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-primary hover:underline"
              title={trimmed}
            >
              {trimmed}
            </a>
          ) : (
            <span className="block truncate text-xs text-foreground/80" title={trimmed}>
              {trimmed}
            </span>
          )
        ) : (
          <span className="text-xs italic text-muted/50">Not specified in report</span>
        )}
      </span>
    </div>
  );
}

// ── Diff panel (fallback — type-specific views used in card) ─────────────────

// ── Main card ─────────────────────────────────────────────────────────────────

interface ChangeCardProps {
  change: ChangeResponse;
  approvalStatus: ApprovalStatus;
  editedContent: string | undefined;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (content: string) => void;
}

export function ChangeCard({
  change,
  approvalStatus,
  editedContent,
  onApprove,
  onReject,
  onEdit,
}: ChangeCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editedContent ?? change.proposed_content);
  const [expanded, setExpanded] = useState(false);

  const effectiveProposed = editedContent !== undefined ? editedContent : change.proposed_content;

  const handleSaveEdit = () => {
    onEdit(draft);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "surface-glow-target relative overflow-hidden rounded-2xl border transition-all duration-200",
        approvalStatus === "approved" &&
          "border-success/25 bg-success-soft shadow-[0_4px_16px_rgba(63,143,85,0.12)]",
        approvalStatus === "rejected" &&
          "border-border bg-surface/60 opacity-60",
        approvalStatus === "pending" &&
          "cs-change-card-pending border-border bg-surface",
      )}
    >
      {/* Priority rail */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-200",
          railColor(change.priority, approvalStatus),
        )}
      />

      {/* Card body */}
      <div className="pl-5 pr-4 pt-4 pb-4">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Label
              className={cn(
                approvalStatus === "approved"
                  ? "border-success/25 bg-success-soft/30 text-success"
                  : approvalStatus === "rejected"
                    ? "border-border/40 bg-surface/30 text-muted/50 line-through"
                    : change.priority === "High"
                      ? "border-destructive/25 bg-destructive-soft/30 text-destructive"
                      : change.priority === "Medium"
                        ? "border-warning/25 bg-warning-soft/30 text-warning"
                        : "border-primary/25 bg-primary/10 text-primary",
              )}
            >
              {change.priority}
            </Label>
            <Label className="border-border bg-surface-elevated text-muted">
              {change.change_type}
            </Label>
            <Label className="border-border bg-surface-elevated text-muted">
              {change.destination}
            </Label>
            {change.impact_score !== null && (
              <Label className="border-border bg-surface-elevated text-muted">
                {change.impact_score}/100
              </Label>
            )}
            {change.needs_review && (
              <Label className="border-warning/30 bg-warning-soft/30 text-warning">
                Needs review
              </Label>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant={approvalStatus === "approved" ? "default" : "outline"}
              className={cn(
                "h-7 w-7 transition-colors",
                approvalStatus === "approved" &&
                  "border-success/40 bg-success text-primary-foreground hover:bg-success/90 shadow-none",
              )}
              onClick={onApprove}
              aria-label="Approve"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant={approvalStatus === "rejected" ? "destructive" : "outline"}
              className="h-7 w-7"
              onClick={onReject}
              aria-label="Reject"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={() => {
                setDraft(effectiveProposed);
                setEditing((v) => !v);
              }}
              aria-label="Edit proposed content"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Field */}
        <div className="mt-2">
          <p className="text-sm font-semibold text-foreground">{change.field_label}</p>
          {change.location && (
            <p className="text-[11px] text-muted/70">{change.location}</p>
          )}
        </div>

        {/* Type-specific change preview */}
        <ChangeTypeView
          changeType={change.change_type}
          current={change.current_state}
          proposed={effectiveProposed}
          fieldLabel={change.field_label}
          pageUrl={change.page_url}
          onApprove={onApprove}
        />

        <SourceUrl url={change.page_url} />

        {change.needs_review && change.review_reason && (
          <p className="mt-2 rounded-lg border border-warning/25 bg-warning-soft/15 px-3 py-2 text-xs text-warning">
            {change.review_reason}
          </p>
        )}

        {/* Inline editor */}
        {editing && (
          <div className="mt-3">
            <textarea
              className="w-full rounded-xl border border-primary/30 bg-surface/60 p-3 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                Save edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Source excerpt (collapsible) */}
        {change.source_excerpt && (
          <div className="mt-2">
            <button
              className="flex items-center gap-1 text-[11px] text-muted/50 hover:text-muted transition-colors"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Source excerpt
            </button>
            {expanded && (
              <blockquote className="mt-1.5 border-l-2 border-primary/30 pl-3 text-xs italic leading-relaxed text-muted">
                {change.source_excerpt}
              </blockquote>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
