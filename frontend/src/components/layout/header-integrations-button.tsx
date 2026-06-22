"use client";

import { Plug2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function HeaderIntegrationsButton({
  connectedCount,
  onClick,
  className,
}: {
  connectedCount: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative hidden min-w-0 items-center rounded-xl border border-border/55 bg-surface/50 p-1 surface-inset-edge sm:flex",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-foreground/90 transition-colors hover:bg-primary/10 hover:text-primary"
        aria-label="Business integrations"
      >
        <Plug2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="hidden md:inline">Integrations</span>
      </button>
      {connectedCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {connectedCount}
        </span>
      )}
    </div>
  );
}
