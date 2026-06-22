"use client";

import { create } from "zustand";
import {
  integrationsApi,
  type IntegrationStatusResponse,
  type PlatformPublishResponse,
} from "@/lib/integrations-api";

interface IntegrationsState {
  integrations: IntegrationStatusResponse[];
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;

  connectWordPress: (siteUrl: string, username: string, appPassword: string) => Promise<void>;
  disconnectWordPress: () => Promise<void>;
  publishWordPress: (suggestionId: string, dryRun: boolean) => Promise<PlatformPublishResponse>;

  connectWebflow: (siteUrl: string, siteId: string, apiToken: string) => Promise<void>;
  disconnectWebflow: () => Promise<void>;
  publishWebflow: (suggestionId: string, dryRun: boolean) => Promise<PlatformPublishResponse>;

  connectWix: (siteUrl: string, siteId: string, apiKey: string) => Promise<void>;
  disconnectWix: () => Promise<void>;
  publishWix: (suggestionId: string, dryRun: boolean) => Promise<PlatformPublishResponse>;

  integrationFor: (platform: IntegrationStatusResponse["platform"]) => IntegrationStatusResponse | undefined;
  connectedCount: () => number;
}

function upsertIntegration(
  integrations: IntegrationStatusResponse[],
  row: IntegrationStatusResponse,
): IntegrationStatusResponse[] {
  const exists = integrations.some((i) => i.platform === row.platform);
  if (exists) {
    return integrations.map((i) => (i.platform === row.platform ? row : i));
  }
  return [...integrations, row];
}

function markDisconnected(
  integrations: IntegrationStatusResponse[],
  platform: IntegrationStatusResponse["platform"],
): IntegrationStatusResponse[] {
  return integrations.map((i) =>
    i.platform === platform
      ? { ...i, status: "disconnected" as const, site_url: null, last_used_at: null, connected_at: null }
      : i,
  );
}

export const useIntegrationsStore = create<IntegrationsState>()((set, get) => ({
  integrations: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await integrationsApi.list();
      set({ integrations: data.integrations });
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to load integrations.";
      set({ error: message });
    } finally {
      set({ loading: false });
    }
  },

  connectWordPress: async (siteUrl, username, appPassword) => {
    const row = await integrationsApi.connectWordPress(siteUrl, username, appPassword);
    set((s) => ({ integrations: upsertIntegration(s.integrations, row) }));
  },

  disconnectWordPress: async () => {
    await integrationsApi.disconnectWordPress();
    set((s) => ({ integrations: markDisconnected(s.integrations, "WordPress") }));
  },

  publishWordPress: (suggestionId, dryRun) =>
    integrationsApi.publishWordPress(suggestionId, dryRun),

  connectWebflow: async (siteUrl, siteId, apiToken) => {
    const row = await integrationsApi.connectWebflow(siteUrl, siteId, apiToken);
    set((s) => ({ integrations: upsertIntegration(s.integrations, row) }));
  },

  disconnectWebflow: async () => {
    await integrationsApi.disconnectWebflow();
    set((s) => ({ integrations: markDisconnected(s.integrations, "Webflow") }));
  },

  publishWebflow: (suggestionId, dryRun) =>
    integrationsApi.publishWebflow(suggestionId, dryRun),

  connectWix: async (siteUrl, siteId, apiKey) => {
    const row = await integrationsApi.connectWix(siteUrl, siteId, apiKey);
    set((s) => ({ integrations: upsertIntegration(s.integrations, row) }));
  },

  disconnectWix: async () => {
    await integrationsApi.disconnectWix();
    set((s) => ({ integrations: markDisconnected(s.integrations, "Wix") }));
  },

  publishWix: (suggestionId, dryRun) =>
    integrationsApi.publishWix(suggestionId, dryRun),

  integrationFor: (platform) => get().integrations.find((i) => i.platform === platform),

  connectedCount: () =>
    get().integrations.filter((i) => i.status === "connected").length,
}));

/** @deprecated Use integrationFor("WordPress") */
export function useWpIntegration() {
  return useIntegrationsStore((s) => s.integrationFor("WordPress"));
}
