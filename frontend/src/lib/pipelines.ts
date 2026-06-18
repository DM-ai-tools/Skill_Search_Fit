import type { Pipeline } from "@/lib/types";

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
];

export function getPipelineById(id: string): Pipeline | undefined {
  return STATIC_PIPELINES.find((p) => p.id === id);
}

/** Fetch pipelines from API, falling back to static definitions. */
export async function fetchPipelines(): Promise<Pipeline[]> {
  try {
    const { api } = await import("@/lib/api");
    const data = await api.get<Pipeline[]>("/pipelines");
    return data.length > 0 ? data : STATIC_PIPELINES;
  } catch {
    return STATIC_PIPELINES;
  }
}
