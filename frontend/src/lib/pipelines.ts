import type {
  Pipeline,
  PipelineExecuteResponse,
  PipelinePendingInputs,
  PipelineRun,
  PipelineStepResult,
  PipelineSuggestionApprovalStatus,
} from "@/lib/types";

/** Static fallback — mirrors backend/app/data/pipelines.py and SEARCH~1.MD */
export const STATIC_PIPELINES: Pipeline[] = [
  {
    id: "content-production-pipeline",
    name: "Competitor-Informed Content Production",
    description:
      "Gap-driven articles from competitor analysis through topics, clustering, briefs, content, and internal linking — end to end.",
    icon: "workflow",
    impact: 9,
    steps: [
      { plugin_name: "Competitor Analyzer", label: "Competitor gap analysis" },
      { plugin_name: "Create Topic", label: "Topic ideas & cluster map" },
      { plugin_name: "Keyword Clustering", label: "Keyword clusters" },
      { plugin_name: "Content Brief", label: "Writer-ready brief" },
      { plugin_name: "Create Content", label: "Full article" },
      { plugin_name: "Internal Linking", label: "Link wiring plan" },
    ],
    step_count: 6,
  },
  {
    id: "audit-fix-verify",
    name: "Audit → Fix → Verify Loop",
    description:
      "Comprehensive audit, technical and on-page fixes, schema markup, and per-page verification to prove improvements.",
    icon: "shield-check",
    impact: 9,
    steps: [
      { plugin_name: "SEO Audit", label: "Full site audit" },
      { plugin_name: "Technical SEO", label: "Technical fixes" },
      { plugin_name: "Broken Links", label: "Link remediation" },
      { plugin_name: "On-Page SEO", label: "On-page rewrites" },
      { plugin_name: "Schema Markup", label: "Structured data" },
      { plugin_name: "SEO Check", label: "Verify improvements" },
    ],
    step_count: 6,
  },
  {
    id: "ai-visibility-flywheel",
    name: "AI Visibility (GEO) Flywheel",
    description:
      "Audit AI mention gaps, analyze competitors, publish comparison content with schema, then verify visibility assets.",
    icon: "sparkles",
    impact: 8,
    steps: [
      { plugin_name: "AI Visibility", label: "AI visibility audit" },
      { plugin_name: "Competitor Analyzer", label: "Competitor differentiation" },
      { plugin_name: "Create Content", label: "GEO content assets" },
      { plugin_name: "Schema Markup", label: "FAQ & Product schema" },
      { plugin_name: "SEO Check", label: "Asset verification" },
    ],
    step_count: 5,
  },
  {
    id: "full-content-page-pipeline",
    name: "Full Content Page Pipeline",
    description:
      "7-step pipeline from seed idea through topic research, keyword clustering, content strategy, brief, full draft, on-page SEO, and internal linking — one pipeline, one publish-ready page.",
    icon: "file-pen",
    impact: 9,
    steps: [
      { plugin_name: "Create Topic", label: "Topic angle & seed keywords" },
      { plugin_name: "Keyword Clustering", label: "Keyword groups & clusters" },
      { plugin_name: "Content Strategy", label: "Content pillars & page map" },
      { plugin_name: "Content Brief", label: "Writer-ready brief" },
      { plugin_name: "Create Content", label: "Full draft article" },
      { plugin_name: "On-Page SEO", label: "SEO optimization" },
      { plugin_name: "Internal Linking", label: "Link wiring plan" },
    ],
    step_count: 7,
  },
];

export const FULL_CONTENT_PAGE_PIPELINE_ID = "full-content-page-pipeline";

export function isFullContentPagePipeline(pipelineId: string): boolean {
  return pipelineId === FULL_CONTENT_PAGE_PIPELINE_ID;
}

export function getPipelineById(id: string): Pipeline | undefined {
  return STATIC_PIPELINES.find((p) => p.id === id);
}

export type FetchPipelinesResult = {
  pipelines: Pipeline[];
  source: "api" | "static";
  error?: string;
};

/** Fetch pipelines from API, falling back to static definitions when the API is unavailable. */
export async function fetchPipelines(): Promise<FetchPipelinesResult> {
  try {
    const { api } = await import("@/lib/api");
    const data = await api.get<Pipeline[]>("/pipelines");
    if (data.length > 0) {
      return { pipelines: data, source: "api" };
    }
    return {
      pipelines: STATIC_PIPELINES,
      source: "static",
      error: "API returned no pipelines — showing offline catalog.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load pipelines from API";
    return { pipelines: STATIC_PIPELINES, source: "static", error: message };
  }
}

function buildCombinedMarkdown(pipeline: Pipeline, steps: PipelineStepResult[]): string {
  const sections = steps.map(
    (step) => `### Step ${step.step}: ${step.label}\n\n${step.output_markdown}`,
  );
  return `# ${pipeline.name}\n\n${sections.join("\n\n")}`;
}

export function pipelineRunSessionKey(pipelineId: string, projectId: string): string {
  return `pipeline-run:${pipelineId}:${projectId}`;
}

export function buildPipelineReportHref(
  pipelineId: string,
  projectId: string,
  options?: { runId?: string; siteUrl?: string },
): string {
  const params = new URLSearchParams({
    pipelineId,
    projectId,
  });
  if (options?.runId) params.set("runId", options.runId);
  if (options?.siteUrl) params.set("site_url", options.siteUrl);
  return `/reports/pipeline-view?${params.toString()}`;
}

export function runToExecuteResponse(run: PipelineRun, pipeline: Pipeline): PipelineExecuteResponse {
  const steps = (run.step_results || []) as PipelineStepResult[];
  return {
    pipeline_id: run.pipeline_id,
    pipeline_name: pipeline.name,
    status: run.status,
    steps,
    combined_markdown: buildCombinedMarkdown(pipeline, steps),
    workflow_steps: steps.map((step) => ({
      step: step.step,
      label: step.label,
      status: "done",
    })),
  };
}

export async function startPipelineRun(
  pipelineId: string,
  projectId: string,
  inputs: Record<string, unknown>,
): Promise<PipelineRun> {
  const { api } = await import("@/lib/api");
  return api.post<PipelineRun>(`/pipelines/${pipelineId}/runs`, {
    project_id: projectId,
    inputs,
  });
}

export async function fetchPipelineRun(runId: string): Promise<PipelineRun> {
  const { api } = await import("@/lib/api");
  return api.get<PipelineRun>(`/pipelines/runs/${runId}`);
}

export type PipelineContinueOptions = {
  editedInputs?: Record<string, unknown>;
  suggestionUpdates?: Array<{
    id: string;
    approval_status?: PipelineSuggestionApprovalStatus;
    edited_content?: unknown;
  }>;
  approveAllPending?: boolean;
};

export function normalizeContinuePayload(
  payload: PipelineContinueOptions | Record<string, unknown>,
): PipelineContinueOptions {
  if ("editedInputs" in payload || "suggestionUpdates" in payload || "approveAllPending" in payload) {
    return payload as PipelineContinueOptions;
  }
  return { editedInputs: payload as Record<string, unknown> };
}

export async function updatePendingSuggestions(
  runId: string,
  suggestions: PipelineContinueOptions["suggestionUpdates"],
): Promise<PipelinePendingInputs> {
  const { api } = await import("@/lib/api");
  return api.patch<PipelinePendingInputs>(`/pipelines/runs/${runId}/pending-suggestions`, {
    suggestions: suggestions ?? [],
  });
}

export async function continuePipelineRun(
  runId: string,
  options?: PipelineContinueOptions | Record<string, unknown>,
): Promise<PipelineRun> {
  const { api } = await import("@/lib/api");
  const payload =
    options && ("editedInputs" in options || "suggestionUpdates" in options || "approveAllPending" in options)
      ? {
          edited_inputs: (options as PipelineContinueOptions).editedInputs ?? {},
          suggestion_updates: (options as PipelineContinueOptions).suggestionUpdates,
          approve_all_pending: (options as PipelineContinueOptions).approveAllPending ?? false,
        }
      : {
          edited_inputs: (options as Record<string, unknown>) ?? {},
        };
  return api.post<PipelineRun>(`/pipelines/runs/${runId}/continue`, payload);
}
