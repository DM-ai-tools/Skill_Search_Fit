"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InputField } from "@/lib/types";
import { resolveSelectValue, selectOptionLabel } from "@/lib/plugin-field-utils";

export function SuggestionSelect({
  field,
  value,
  onChange,
  suggestions,
  disabled,
  aiFilled,
}: {
  field: InputField;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  disabled?: boolean;
  aiFilled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const displayLabel = value ? selectOptionLabel(field, value) : "Select…";
  const aiOptions = suggestions.map((s) => ({
    value: resolveSelectValue(field, s),
    label: selectOptionLabel(field, resolveSelectValue(field, s)),
  }));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-xl border border-border-strong/50 bg-surface/50 px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50",
          !value && "text-muted",
          aiFilled && "border-primary/40 bg-primary-soft/20",
          open && "border-primary/40 ring-2 ring-primary/30",
        )}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-border-strong bg-surface-elevated dropdown-shadow">
          <ul className="max-h-56 overflow-auto py-1">
            {(field.options ?? []).map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface",
                    value === opt.value && "bg-primary/10 text-primary",
                  )}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {value === opt.value ? <Check className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
                  {opt.label}
                </button>
              </li>
            ))}
            {aiOptions.length > 0 && (
              <>
                <li className="border-t border-border/40 px-3 py-2">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                    AI suggestions
                  </p>
                </li>
                {aiOptions.map((opt) => (
                  <li key={`ai-${opt.value}`}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface",
                        value === opt.value && "bg-primary/10 text-primary",
                      )}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                    >
                      {value === opt.value ? <Check className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
                      {opt.label}
                    </button>
                  </li>
                ))}
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
