import { api } from "@/lib/api";

export type SystemCapabilities = {
  live_ai: boolean;
  primary_executor: "claude" | "openai" | "preview";
  claude_configured: boolean;
  openai_configured: boolean;
  anthropic_model: string | null;
  openai_model: string | null;
  features: {
    plugin_execution: boolean;
    pipeline_execution: boolean;
    report_presentation: boolean;
    article_preview_polish: boolean;
    pdf_enhance: boolean;
    change_suggestions_extraction: boolean;
  };
};

let cache: SystemCapabilities | null = null;
let inflight: Promise<SystemCapabilities> | null = null;

export async function fetchSystemCapabilities(): Promise<SystemCapabilities> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api
    .get<SystemCapabilities>("/system/capabilities")
    .then((data) => {
      cache = data;
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function clearCapabilitiesCache(): void {
  cache = null;
}
