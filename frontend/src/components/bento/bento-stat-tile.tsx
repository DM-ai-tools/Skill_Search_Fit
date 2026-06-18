import type { ReactNode } from "react";
import { BentoTile } from "@/components/bento/bento-tile";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function BentoStatTile({
  label,
  value,
  description,
  icon,
  progress,
  tone = "default",
  span = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  progress?: number;
  tone?: "default" | "primary" | "secondary" | "success" | "warning" | "destructive";
  span?: "default" | "hero" | "wide";
  className?: string;
}) {
  const valueClass = {
    default: "text-foreground",
    primary: "text-primary",
    secondary: "text-secondary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];

  return (
    <BentoTile span={span} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</p>
          <p className={cn("mt-2 text-3xl font-bold tabular-nums", span === "hero" && "text-5xl", valueClass)}>
            {value}
          </p>
        </div>
        {icon && <div className="shrink-0">{icon}</div>}
      </div>
      {typeof progress === "number" && <Progress value={progress} />}
      {description && <div className="text-sm leading-relaxed text-muted">{description}</div>}
    </BentoTile>
  );
}
