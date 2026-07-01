import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.generated";

// ── Types (mirror backend schemas) ────────────────────────────────────────────

export type ChangeType = "metadata" | "schema" | "content" | "technical" | "capture-form";
export type ChangePriority = "High" | "Medium" | "Low";
export type ChangeDestination = "WordPress" | "Webflow" | "Wix";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type SuggestionStatus = "uploaded" | "extracting" | "ready" | "failed";

export interface ChangeSuggestionResponse {
  id: string;
  filename: string;
  status: SuggestionStatus;
  extract_error: string | null;
  created_at: string;
  updated_at: string;
}

export type ChangeSuggestionResponseFromOpenApi =
  components["schemas"] extends { ChangeSuggestionResponse: infer T }
    ? T
    : ChangeSuggestionResponse;

export interface ChangeResponse {
  id: string;
  suggestion_id: string;
  location: string | null;
  page_url: string;
  change_type: ChangeType;
  priority: ChangePriority;
  impact_score: number | null;
  destination: ChangeDestination;
  field_label: string;
  current_state: string;
  proposed_content: string;
  edited_content: string | null;
  source_excerpt: string | null;
  needs_review: boolean;
  review_reason: string | null;
  approval_status: ApprovalStatus;
  created_at: string;
  updated_at: string;
}

export interface ChangeSuggestionWithChanges {
  suggestion: ChangeSuggestionResponse;
  changes: ChangeResponse[];
}

export interface PublishItemResult {
  change_id: string;
  field_label: string;
  page_url: string;
  success: boolean;
  error: string | null;
}

export interface PublishResponse {
  destination: ChangeDestination;
  dry_run: boolean;
  results: PublishItemResult[];
  audit_log_id: string | null;
}

export interface PayloadResponse {
  destination: ChangeDestination;
  content: string;
  change_ids: string[];
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const changeSuggestionsApi = {
  upload: (rawContent: string, filename: string, baseUrl?: string, pluginName?: string, pluginSlug?: string) =>
    api.post<ChangeSuggestionResponse>("/change-suggestions", {
      raw_content: rawContent,
      filename,
      base_url: baseUrl || undefined,
      plugin_name: pluginName || undefined,
      plugin_slug: pluginSlug || undefined,
    }),

  list: () => api.get<ChangeSuggestionResponse[]>("/change-suggestions"),

  get: (suggestionId: string) =>
    api.get<ChangeSuggestionWithChanges>(`/change-suggestions/${suggestionId}`),

  extract: (suggestionId: string) =>
    api.post<ChangeSuggestionWithChanges>(`/change-suggestions/${suggestionId}/extract`),

  patchChange: (
    suggestionId: string,
    changeId: string,
    body: { approval_status?: ApprovalStatus; edited_content?: string },
  ) => api.patch<ChangeResponse>(`/change-suggestions/${suggestionId}/changes/${changeId}`, body),

  generatePayload: (suggestionId: string, destination: ChangeDestination) =>
    api.post<PayloadResponse>(`/change-suggestions/${suggestionId}/payload`, { destination }),

  publish: (suggestionId: string, destination: ChangeDestination, dryRun: boolean) =>
    api.post<PublishResponse>(`/change-suggestions/${suggestionId}/publish`, {
      destination,
      dry_run: dryRun,
    }),
};
