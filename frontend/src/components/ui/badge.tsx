import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline" | "warning" | "success" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold",
        variant === "default"   && "border-primary/25 bg-primary-soft text-primary",
        variant === "secondary" && "border-border bg-surface-elevated text-muted",
        variant === "outline"   && "border-border-strong bg-transparent text-muted",
        variant === "warning"   && "border-warning/30 bg-warning-soft text-warning",
        variant === "success"   && "border-success/30 bg-success-soft text-success",
        variant === "danger"    && "border-destructive/30 bg-destructive-soft text-destructive",
        className,
      )}
      {...props}
    />
  );
}
