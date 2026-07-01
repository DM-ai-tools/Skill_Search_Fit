"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoadErrorBanner({
  message,
  onRetry,
  retrying = false,
  className,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  if (!message) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={onRetry}
          disabled={retrying}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}
