"use client";

import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/stores/theme-store";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const hydrated = useThemeStore((s) => s.hydrated);

  const isLight = hydrated && theme === "light";

  return (
    <div
      className={cn(
        "inline-flex rounded-xl border border-border/60 bg-surface/60 p-1",
        className,
      )}
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200",
          isLight
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted hover:bg-surface-elevated hover:text-foreground",
        )}
        aria-pressed={isLight}
      >
        <Sun className="h-3.5 w-3.5" />
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200",
          !isLight
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted hover:bg-surface-elevated hover:text-foreground",
        )}
        aria-pressed={!isLight}
      >
        <Moon className="h-3.5 w-3.5" />
        Dark
      </button>
    </div>
  );
}
