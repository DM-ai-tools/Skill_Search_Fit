import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  color = "primary",
}: {
  value: number;
  className?: string;
  color?: "primary" | "success" | "warning";
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const trackColor = "bg-surface/60 border border-border/40";
  const fillColor =
    color === "success"
      ? "bg-success"
      : color === "warning"
        ? "bg-warning"
        : "bg-gradient-to-r from-primary to-accent";

  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full", trackColor, className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500 ease-out", fillColor)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
