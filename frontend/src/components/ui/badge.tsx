import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "secondary" | "outline" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium",
        variant === "default" && "border-primary/25 bg-primary-soft text-primary",
        variant === "secondary" && "border-border bg-surface-elevated text-muted",
        variant === "outline" && "border-border-strong bg-transparent text-muted",
        variant === "warning" && "border-warning/30 bg-warning-soft text-warning",
        className,
      )}
      {...props}
    />
  );
}
