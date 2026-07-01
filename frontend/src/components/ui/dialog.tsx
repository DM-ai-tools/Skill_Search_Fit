"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const selectors = [
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ];
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(selectors.join(",")),
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      const autoFocus = root.querySelector<HTMLElement>("[data-autofocus]");
      if (autoFocus) {
        autoFocus.focus();
        return;
      }
      const first = root.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "glass-panel-strong relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-[var(--glass-shadow-strong)]",
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
            <h2 id={titleId} className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" data-autofocus>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
