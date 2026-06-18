import type { ReactNode } from "react";
import { BentoTile } from "@/components/bento/bento-tile";
import { cn } from "@/lib/utils";

export function BentoActionTile({
  icon,
  label,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  label: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <BentoTile interactive className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/20">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{label}</p>
          {description && <div className="mt-1 text-sm leading-relaxed text-muted">{description}</div>}
        </div>
      </div>
      {action && <div className="mt-auto">{action}</div>}
    </BentoTile>
  );
}
