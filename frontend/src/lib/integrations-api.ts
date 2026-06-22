import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntegrationPlatform =
  | "WordPress"
  | "Shopify"
  | "Webflow"
  | "Wix"
  | "Squarespace";

export type IntegrationStatus =
  | "connected"
  | "reauth"
  | "disconnected"
  | "coming_soon";

export interface IntegrationStatusResponse {
  platform: IntegrationPlatform;
  status: IntegrationStatus;
  site_url: string | null;
  last_used_at: string | null;
  connected_at: string | null;
}

export interface IntegrationsListResponse {
  integrations: IntegrationStatusResponse[];
}

export interface ConnectionTestResponse {
  success: boolean;
  site_name: string | null;
  error: string | null;
}

export interface PublishItemResult {
  change_id: string;
  field_label: string;
  page_url: string;
  success: boolean;
  error: string | null;
  widget_id?: string | null;
  widget_type?: string | null;
}

export interface PlatformPublishResponse {
  dry_run: boolean;
  results: PublishItemResult[];
  cache_cleared?: boolean | null;
}

export interface ElementorCheckResponse {
  is_elementor_page: boolean;
  elementor_data_accessible: boolean;
  widget_count: number | null;
  page_id: number | null;
  page_url: string | null;
  setup_required: boolean;
  setup_instructions: string | null;
}

/** @deprecated Use PlatformPublishResponse */
export type WordPressPublishResponse = PlatformPublishResponse;

// ── API client ────────────────────────────────────────────────────────────────

export const integrationsApi = {
  list: () => api.get<IntegrationsListResponse>("/integrations"),

  // WordPress
  testWordPress: (siteUrl: string, username: string, appPassword: string) =>
    api.post<ConnectionTestResponse>("/integrations/wordpress/test", {
      site_url: siteUrl,
      username,
      app_password: appPassword,
    }),

  connectWordPress: (siteUrl: string, username: string, appPassword: string) =>
    api.post<IntegrationStatusResponse>("/integrations", {
      site_url: siteUrl,
      username,
      app_password: appPassword,
    }),

  disconnectWordPress: () => api.delete<void>("/integrations/wordpress"),

  publishWordPress: (suggestionId: string, dryRun: boolean) =>
    api.post<PlatformPublishResponse>("/integrations/wordpress/publish", {
      suggestion_id: suggestionId,
      dry_run: dryRun,
    }),

  // Webflow
  testWebflow: (siteId: string, apiToken: string) =>
    api.post<ConnectionTestResponse>("/integrations/webflow/test", {
      site_id: siteId,
      api_token: apiToken,
    }),

  connectWebflow: (siteUrl: string, siteId: string, apiToken: string) =>
    api.post<IntegrationStatusResponse>("/integrations/webflow", {
      site_url: siteUrl,
      site_id: siteId,
      api_token: apiToken,
    }),

  disconnectWebflow: () => api.delete<void>("/integrations/webflow"),

  publishWebflow: (suggestionId: string, dryRun: boolean) =>
    api.post<PlatformPublishResponse>("/integrations/webflow/publish", {
      suggestion_id: suggestionId,
      dry_run: dryRun,
    }),

  // Wix
  testWix: (siteId: string, apiKey: string) =>
    api.post<ConnectionTestResponse>("/integrations/wix/test", {
      site_id: siteId,
      api_key: apiKey,
    }),

  connectWix: (siteUrl: string, siteId: string, apiKey: string) =>
    api.post<IntegrationStatusResponse>("/integrations/wix", {
      site_url: siteUrl,
      site_id: siteId,
      api_key: apiKey,
    }),

  disconnectWix: () => api.delete<void>("/integrations/wix"),

  publishWix: (suggestionId: string, dryRun: boolean) =>
    api.post<PlatformPublishResponse>("/integrations/wix/publish", {
      suggestion_id: suggestionId,
      dry_run: dryRun,
    }),

  elementorCheck: (suggestionId: string) =>
    api.post<ElementorCheckResponse>("/integrations/wordpress/elementor-check", {
      suggestion_id: suggestionId,
    }),
};
