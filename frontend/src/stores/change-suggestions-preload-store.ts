"use client";

import { create } from "zustand";
import { changeSuggestionsApi } from "@/lib/change-suggestions-api";
import type { ChangeSuggestionWithChanges } from "@/lib/change-suggestions-api";
import { resolvePluginSlug } from "@/lib/plugin-slugs";

export interface PreloadEntry {
  status: "loading" | "ready" | "error";
  data: ChangeSuggestionWithChanges | null;
  loadedAt: Date | null;
  error: string | null;
}

interface PreloadState {
  cache: Record<string, PreloadEntry>;
  preload: (executionId: string, markdown: string, pluginName: string, baseUrl?: string) => void;
  retry: (executionId: string, markdown: string, pluginName: string, baseUrl?: string) => void;
  invalidate: (executionId: string) => void;
}

export const useChangeSuggestionsPreloadStore = create<PreloadState>()((set, get) => ({
  cache: {},

  preload: (executionId, markdown, pluginName, baseUrl) => {
    const existing = get().cache[executionId];
    if (existing?.status === "loading" || existing?.status === "ready") return;

    set((s) => ({
      cache: {
        ...s.cache,
        [executionId]: { status: "loading", data: null, loadedAt: null, error: null },
      },
    }));

    const filename = `${pluginName}-${executionId}.md`;
    const pluginSlug = resolvePluginSlug(pluginName);
    changeSuggestionsApi
      .upload(markdown, filename, baseUrl, pluginName, pluginSlug)
      .then((suggestion) => changeSuggestionsApi.extract(suggestion.id))
      .then((data) => {
        set((s) => ({
          cache: {
            ...s.cache,
            [executionId]: { status: "ready", data, loadedAt: new Date(), error: null },
          },
        }));
      })
      .catch((err) => {
        set((s) => ({
          cache: {
            ...s.cache,
            [executionId]: {
              status: "error",
              data: null,
              loadedAt: null,
              error: err instanceof Error ? err.message : "Preload failed",
            },
          },
        }));
      });
  },

  retry: (executionId, markdown, pluginName, baseUrl) => {
    get().invalidate(executionId);
    get().preload(executionId, markdown, pluginName, baseUrl);
  },

  invalidate: (executionId) => {
    set((s) => {
      const next = { ...s.cache };
      delete next[executionId];
      return { cache: next };
    });
  },
}));
