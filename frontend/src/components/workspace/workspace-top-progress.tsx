"use client";

import { cn } from "@/lib/utils";

export function WorkspaceTopProgress({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div
      className={cn("relative h-1 w-full overflow-hidden rounded-full bg-border/40", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-secondary via-primary to-[#F4D88A] shadow-[0_0_8px_rgba(224,138,60,0.4)] transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
      {clamped < 100 && (
        <div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
          style={{ width: `${clamped}%` }}
        >
          <div className="workspace-progress-shimmer absolute inset-y-0 w-full" />
        </div>
      )}
    </div>
  );
}
