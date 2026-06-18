import type { Pipeline } from "@/lib/types";

export interface PipelineDetail {
  summary: string;
  outcome: string;
  whyValuable: string;
  workflow: string[];
  implementations: string[];
  impact: number;
  ease: number;
  revenue: number;
}

export const PIPELINE_DETAILS: Record<string, PipelineDetail> = {
  "content-production-pipeline": {
    summary:
      "Competitor-Informed Content Production Pipeline chains gap analysis into topics, clusters, briefs, content, and internal links.",
    outcome:
      "Gap-driven articles published with briefs, schema-ready structure, and link wiring — end to end.",
    whyValuable:
      "Replaces the agency workflow (strategist → SEO analyst → writer → editor) with one chained run. The brief step is the quality gate that makes AI content competitive with the SERP.",
    workflow: [
      "Competitor Analyzer discovers top SERP competitors (or uses URLs you provide) → gap table with priorities.",
      "Create Topic turns each gap into scored topic ideas with funnel stage.",
      "Keyword Clustering maps topics to pages with no cannibalization.",
      "Content Brief analyzes the live SERP → outline, word count, differentiation.",
      "Create Content writes the article with schema and internal-link markers.",
      "Internal Linking resolves markers and adds reciprocal links.",
    ],
    implementations: [
      "Competitor Analyzer agent",
      "Create Topic command",
      "Keyword Clustering skill",
      "Content Brief skill",
      "Create Content command",
      "Internal Linking skill",
    ],
    impact: 9,
    ease: 8,
    revenue: 9,
  },
  "audit-fix-verify": {
    summary:
      "Audit → Prioritize → Fix → Verify Loop turns a scored SEO audit into applied fixes and re-verified improvements.",
    outcome:
      "Self-healing site: scored audit becomes applied fixes, then re-verified with measurable score deltas.",
    whyValuable:
      "Most SEO tools stop at the PDF report. This loop diagnoses, edits, and proves the improvement in one session.",
    workflow: [
      "SEO Audit crawls the site → 0–100 score with Critical/Warning/Opportunity tiers.",
      "Technical SEO routes crawlability, CWV, and redirect issues to fixes.",
      "Broken Link Checker emits redirect configs and exact href edits.",
      "On-Page SEO rewrites titles, metas, and headings.",
      "Schema Markup adds framework-specific JSON-LD.",
      "SEO Check rescores every touched page to confirm improvement.",
    ],
    implementations: [
      "SEO Auditor agent",
      "Technical SEO skill",
      "Broken Links skill",
      "On-Page SEO skill",
      "Schema Markup skill",
      "SEO Check command",
    ],
    impact: 9,
    ease: 9,
    revenue: 7,
  },
  "ai-visibility-flywheel": {
    summary:
      "AI Visibility (GEO) Flywheel audits which AI prompts you lose, then publishes comparison and FAQ assets to earn mentions.",
    outcome:
      "Brand earns recommendations in ChatGPT, Claude, Gemini, and Perplexity for buying-intent prompts.",
    whyValuable:
      "GEO is the most differentiated capability — almost no toolkit closes the loop from AI-mention audit to remediation content to re-measurement.",
    workflow: [
      "AI Visibility audits target prompts → visibility score and content checklist.",
      "Competitor Analyzer researches brands winning those prompts.",
      "Create Content writes comparison and alternatives pages.",
      "Generate Schema adds Organization, FAQ, and Product JSON-LD.",
      "SEO Check verifies published assets before re-audit.",
    ],
    implementations: [
      "AI Visibility skill",
      "Competitor Analyzer agent",
      "Create Content command",
      "Generate Schema command",
      "SEO Check command",
    ],
    impact: 8,
    ease: 7,
    revenue: 9,
  },
};

export function getPipelineDetail(pipeline: Pipeline): PipelineDetail {
  return (
    PIPELINE_DETAILS[pipeline.id] ?? {
      summary: pipeline.description,
      outcome: pipeline.description,
      whyValuable: "Chained multi-skill workflow for faster SEO outcomes.",
      workflow: pipeline.steps.map((s, i) => `${i + 1}. ${s.label}`),
      implementations: pipeline.steps.map((s) => s.plugin_name),
      impact: pipeline.impact,
      ease: 7,
      revenue: 8,
    }
  );
}
