"use client";

import { create } from "zustand";
import { tenancyApi } from "@/lib/tenancy-api";
import type { TenantOrganization, TenantWorkspace } from "@/lib/types";

interface TenancyState {
  organizations: TenantOrganization[];
  workspaces: TenantWorkspace[];
  activeWorkspaceId: string | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  setActiveWorkspace: (id: string | null) => void;
}

export const useTenancyStore = create<TenancyState>()((set, get) => ({
  organizations: [],
  workspaces: [],
  activeWorkspaceId: null,
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const [orgs, workspaces] = await Promise.all([
        tenancyApi.listOrganizations(),
        tenancyApi.listWorkspaces(),
      ]);
      const workspaceList = workspaces.workspaces || [];
      set({
        organizations: orgs.organizations || [],
        workspaces: workspaceList,
        activeWorkspaceId: get().activeWorkspaceId ?? workspaceList[0]?.id ?? null,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load tenancy context",
      });
    } finally {
      set({ loading: false });
    }
  },
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
}));

