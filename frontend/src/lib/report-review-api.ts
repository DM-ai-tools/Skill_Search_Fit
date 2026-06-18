import { api } from "@/lib/api";

// ── Types (mirror backend schemas) ────────────────────────────────────────────

export type ChangeType = "metadata" | "schema" | "content" | "technical" | "capture-form";
export type ChangePriority = "High" | "Medium" | "Low";
export type ChangeDestination = "WordPress" | "Webflow" | "Wix" | "Mailchimp";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ReportStatus = "uploaded" | "extracting" | "ready" | "failed";

export interface ReportResponse {
  id: string;
  filename: string;
  status: ReportStatus;
  extract_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeResponse {
  id: string;
  report_id: string;
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
  approval_status: ApprovalStatus;
  created_at: string;
  updated_at: string;
}

export interface ReportWithChanges {
  report: ReportResponse;
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

export const reportReviewApi = {
  upload: (rawContent: string, filename: string) =>
    api.post<ReportResponse>("/reports", { raw_content: rawContent, filename }),

  list: () => api.get<ReportResponse[]>("/reports"),

  get: (reportId: string) => api.get<ReportWithChanges>(`/reports/${reportId}`),

  extract: (reportId: string) =>
    api.post<ReportWithChanges>(`/reports/${reportId}/extract`),

  patchChange: (
    reportId: string,
    changeId: string,
    body: { approval_status?: ApprovalStatus; edited_content?: string },
  ) => api.patch<ChangeResponse>(`/reports/${reportId}/changes/${changeId}`, body),

  generatePayload: (reportId: string, destination: ChangeDestination) =>
    api.post<PayloadResponse>(`/reports/${reportId}/payload`, { destination }),

  publish: (reportId: string, destination: ChangeDestination, dryRun: boolean) =>
    api.post<PublishResponse>(`/reports/${reportId}/publish`, {
      destination,
      dry_run: dryRun,
    }),
};
