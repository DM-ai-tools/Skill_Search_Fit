"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const DEFAULT_STEPS = [
  "Validate inputs",
  "Load prompt template",
  "AI execution",
  "Process response",
];

export function ExecutionProgress({
  steps = DEFAULT_STEPS,
  activeStep,
  progress,
  running,
}: {
  steps?: string[];
  activeStep: number;
  progress: number;
  running: boolean;
}) {
  if (!running && progress === 0) return null;

  return (
    <div className="mb-6 space-y-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-foreground">
          {running && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-ai-accent" />
          )}
          {running ? "Processing your report…" : "Report complete"}
        </span>
        <span className="font-mono text-xs text-muted">{Math.round(progress)}%</span>
      </div>

      <Progress value={progress} color={progress >= 100 ? "success" : "primary"} />

      <ol className="space-y-2">
        {steps.map((label, i) => {
          const done = i < activeStep || (!running && progress >= 100);
          const current = running && i === activeStep;
          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2 text-sm",
                done && "text-foreground",
                current && "font-medium text-primary",
                !done && !current && "text-muted/50",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  done && "bg-success",
                  current && "animate-pulse bg-primary",
                  !done && !current && "bg-border-strong/40",
                )}
              />
              Step {i + 1}: {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
