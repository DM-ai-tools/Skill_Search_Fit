"use client";

import { create } from "zustand";

const STORAGE_KEY = "ssf-site-url";

interface SiteState {
  siteUrl: string | null;
  hydrated: boolean;
  setSiteUrl: (url: string) => void;
  clearSiteUrl: () => void;
  hydrate: () => void;
}

export const useSiteStore = create<SiteState>((set) => ({
  siteUrl: null,
  hydrated: false,
  setSiteUrl: (url) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, url);
    }
    set({ siteUrl: url });
  },
  clearSiteUrl: () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    set({ siteUrl: null });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    set({ siteUrl: stored, hydrated: true });
  },
}));
