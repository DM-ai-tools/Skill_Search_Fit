import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BentoSectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div>
        {eyebrow && (
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted/70">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{title}</h1>
        {description && <div className="mt-1 text-sm leading-relaxed text-muted">{description}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
