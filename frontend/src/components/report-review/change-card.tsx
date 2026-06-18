"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, X, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import type { ChangeResponse, ApprovalStatus } from "@/lib/report-review-api";

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

// ── Diff panel ────────────────────────────────────────────────────────────────

function DiffView({ current, proposed }: { current: string; proposed: string }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      {/* Current: dark, receding */}
      <div className="rounded-xl border border-border/40 bg-background/60 p-3">
        <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted/60">
          Current
        </p>
        <p className="whitespace-pre-wrap leading-relaxed text-muted">
          {current || <span className="italic text-muted/40">(empty)</span>}
        </p>
      </div>
      {/* Proposed: warm amber tint, coming forward */}
      <div className="rounded-xl border border-primary/20 bg-primary-soft p-3">
        <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/70">
          Proposed
        </p>
        <p className="whitespace-pre-wrap leading-relaxed text-foreground">
          {proposed || <span className="italic text-muted">(empty)</span>}
        </p>
      </div>
    </div>
  );
}

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
        "relative overflow-hidden rounded-2xl border transition-all duration-200",
        approvalStatus === "approved" &&
          "border-success/20 bg-success-soft/20 shadow-[0_4px_16px_rgba(34,197,94,0.08)]",
        approvalStatus === "rejected" &&
          "border-border/30 bg-background/40 opacity-55",
        approvalStatus === "pending" &&
          "border-border/40 bg-surface/50 shadow-[0_2px_12px_rgba(5,2,2,0.25)]",
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
            <Label className="border-border/40 bg-surface/30 text-muted">
              {change.change_type}
            </Label>
            <Label className="border-border/40 bg-surface/30 text-muted">
              {change.destination}
            </Label>
            {change.impact_score !== null && (
              <Label className="border-border/40 bg-surface/30 text-muted">
                {change.impact_score}/10
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
                  "border-success/40 bg-success text-white hover:bg-success/90 shadow-none",
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

        {/* Field + page */}
        <div className="mt-2">
          <p className="text-sm font-semibold text-foreground">{change.field_label}</p>
          <p className="text-[11px] text-muted/60 truncate">{change.page_url}</p>
        </div>

        {/* Diff */}
        <DiffView current={change.current_state} proposed={effectiveProposed} />

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
