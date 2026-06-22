"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SuggestionDropdown({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled,
  type = "text",
  className,
  aiFilled,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "url" | "number";
  className?: string;
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

  const hasSuggestions = suggestions.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <div className="flex gap-1">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex h-10 min-w-0 flex-1 rounded-xl border border-border-strong/50 bg-surface/50 px-3 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50",
            aiFilled && "border-primary/40 bg-primary-soft/20",
            className,
          )}
        />
        {hasSuggestions && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-strong/50 bg-surface-elevated text-muted transition-colors hover:border-primary/30 hover:text-primary",
              open && "border-primary/40 bg-primary/10 text-primary",
            )}
            aria-label="Show AI suggestions"
            aria-expanded={open}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>

      {open && hasSuggestions && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-border-strong bg-surface-elevated dropdown-shadow">
          <div className="border-b border-border/40 px-3 py-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
              AI suggestions
            </p>
          </div>
          <ul className="max-h-52 overflow-auto py-1">
            {suggestions.map((suggestion) => {
              const selected = value === suggestion;
              return (
                <li key={suggestion}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface",
                      selected && "bg-primary/10 text-primary",
                    )}
                    onClick={() => {
                      onChange(suggestion);
                      setOpen(false);
                    }}
                  >
                    {selected ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <span className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span className="leading-relaxed">{suggestion}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SuggestionTextarea({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled,
  rows = 4,
  aiFilled,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
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

  return (
    <div ref={rootRef} className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(
          "w-full rounded-xl border border-border-strong/50 bg-surface/50 px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50",
          aiFilled && "border-primary/40 bg-primary-soft/20",
        )}
      />
      {suggestions.length > 0 && (
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
          >
            <ChevronDown className={cn("h-3.5 w-3.5", open && "rotate-180")} />
            {suggestions.length} AI suggestions
          </button>
          {open && (
            <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-border-strong bg-surface-elevated dropdown-shadow">
              <ul className="max-h-48 overflow-auto py-1">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-surface"
                      onClick={() => {
                        onChange(suggestion);
                        setOpen(false);
                      }}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
