"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ChangeDestination } from "@/lib/report-review-api";

interface PublishConfirmModalProps {
  destination: ChangeDestination;
  approvedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PublishConfirmModal({
  destination,
  approvedCount,
  onConfirm,
  onCancel,
}: PublishConfirmModalProps) {
  return (
    <ConfirmDialog
      open
      title="Publish to live site?"
      description={
        <>
          This will push{" "}
          <strong className="text-foreground">
            {approvedCount} change{approvedCount !== 1 ? "s" : ""}
          </strong>{" "}
          directly to your live <strong className="text-foreground">{destination}</strong> site. This cannot be
          automatically undone.
        </>
      }
      confirmLabel="Yes, publish live"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
