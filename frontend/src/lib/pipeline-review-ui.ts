import { cn } from "@/lib/utils";

export function fieldTextContent(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join("\n");
  return String(value);
}

/** Tall enough to read pipeline handoff content (JSON, briefs, markdown). */
export function textareaRowsForContent(text: string): number {
  const lines = text.split("\n").length;
  const byLength = Math.ceil(text.length / 72);
  return Math.min(32, Math.max(12, Math.max(lines + 2, byLength)));
}

export function isStructuredFieldContent(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 160) return true;
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("```")) return true;
  if (trimmed.includes("@type") || trimmed.includes("<script") || trimmed.includes("<html")) return true;
  return false;
}

export function reviewPanelClass(options?: { compact?: boolean; featured?: boolean }): string {
  return cn(
    "flex flex-col overflow-hidden rounded-2xl border-2 border-amber-500/35 bg-amber-500/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-amber-500/20 backdrop-blur-xl dark:bg-amber-950/20",
    !options?.compact && "animate-in fade-in slide-in-from-top-2 duration-300",
    options?.featured && "min-h-0 flex-1",
    !options?.compact && !options?.featured && "my-4",
  );
}

export function reviewFieldTextareaClass(structured: boolean, hasError?: boolean): string {
  return cn(
    "min-h-[14rem] w-full resize-y text-sm leading-relaxed",
    structured && "font-mono text-[13px] leading-5",
    hasError && "border-destructive",
  );
}

export function reviewFieldsScrollClass(options?: { compact?: boolean; featured?: boolean }): string {
  return cn(
    "space-y-6 overflow-y-auto px-5 py-5",
    options?.featured ? "min-h-0 flex-1" : options?.compact ? "max-h-[50vh]" : "max-h-[min(70vh,42rem)]",
  );
}
