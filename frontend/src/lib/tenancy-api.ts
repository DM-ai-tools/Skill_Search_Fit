import { api } from "@/lib/api";
import type { TenantOrganization, TenantWorkspace } from "@/lib/types";

export const tenancyApi = {
  listOrganizations: () => api.get<{ organizations: TenantOrganization[] }>("/tenancy/organizations"),
  createOrganization: (name: string) =>
    api.post<{ organization: TenantOrganization; default_workspace: TenantWorkspace }>(
      "/tenancy/organizations",
      { name },
    ),
  listWorkspaces: () => api.get<{ workspaces: TenantWorkspace[] }>("/tenancy/workspaces"),
};

