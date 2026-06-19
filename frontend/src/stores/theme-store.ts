"use client";

import { create } from "zustand";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "ssf-theme";

function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

interface ThemeState {
  theme: ThemeMode;
  hydrated: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  hydrate: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "dark",
  hydrated: false,
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, theme);
    }
    applyThemeToDocument(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: ThemeMode = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    const theme: ThemeMode = stored === "light" ? "light" : "dark";
    applyThemeToDocument(theme);
    set({ theme, hydrated: true });
  },
}));

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}
