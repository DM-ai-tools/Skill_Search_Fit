import { displayPluginName } from "@/lib/plugin-catalog";
import { stripMarkdown } from "@/lib/report-text";

export type ParsedSection = {
  title: string;
  level: number;
  body: string;
};

const SUGGESTIONS_BY_PLUGIN: Record<string, string[]> = {
  "AI Visibility": [
    "Track the same prompts weekly to measure visibility trend, not one-off snapshots.",
    "Prioritize sources/models where visibility is lowest but business intent is highest.",
    "Turn low-visibility findings into FAQ/schema/content refresh tasks.",
  ],
  "Broken Links": [
    "Fix internal 4xx links first because they directly hurt crawl flow.",
    "Batch external link replacements by template/shared components for faster cleanup.",
    "Re-crawl key pages after fixes to confirm no redirect chains remain.",
  ],
  "Content Brief": [
    "Lock final search intent before drafting to avoid mixed-intent articles.",
    "Use the suggested heading map as the first draft structure, then refine for audience.",
    "Tie each section to one conversion or engagement goal.",
  ],
  "Content Strategy": [
    "Schedule quick wins first, then pillar pages and supporting clusters.",
    "Assign owner + due date for each strategy item to prevent backlog drift.",
    "Review performance monthly and recycle underperforming topics.",
  ],
  "Internal Linking": [
    "Implement links from high-authority pages first to maximize impact.",
    "Keep anchor text descriptive and varied; avoid repetitive exact-match anchors.",
    "Verify each suggested link destination is indexable and canonicalized correctly.",
  ],
  "Keyword Clustering": [
    "Create one page per cluster to avoid cannibalization.",
    "Map each cluster to funnel stage and conversion intent before content production.",
    "Start with clusters that combine high relevance and moderate difficulty.",
  ],
  "On-Page SEO": [
    "Apply title/meta updates on highest-traffic pages first.",
    "Keep one primary intent per page and align H1/H2 hierarchy accordingly.",
    "Validate improvements with CTR + ranking changes after reindexing.",
  ],
  "Schema Markup": [
    "Validate JSON-LD in rich results test before deployment.",
    "Add only schema types that match visible on-page content.",
    "Monitor Search Console enhancement reports after rollout.",
  ],
  "SEO Audit": [
    "Address critical blockers (crawl/index/canonical) before content-level tasks.",
    "Convert each finding into a ticket with owner, severity, and expected impact.",
    "Re-run audit after fixes and compare deltas to confirm closure.",
  ],
  "Technical SEO": [
    "Resolve crawlability and rendering issues before speed fine-tuning.",
    "Group fixes by platform layer (templates, CDN, robots, sitemap).",
    "Re-test on mobile and desktop separately to catch parity issues.",
  ],
  "Create Content": [
    "Use the draft as v1 and enrich it with unique first-party examples.",
    "Ensure intro and CTA match the exact target intent.",
    "Run on-page optimization pass before publishing.",
  ],
  "Create Topic": [
    "Select topics with clear audience pain and measurable business outcome.",
    "Build supporting subtopics around each selected pillar topic.",
    "Validate topic demand with search trend + SERP fit before committing.",
  ],
  "Competitor Analyzer": [
    "Compare gap topics against your current content inventory before prioritizing.",
    "Focus on competitor strengths where your site has zero coverage.",
    "Re-run quarterly as competitors publish new pillar content.",
  ],
  "SEO Check": [
    "Run checks before release and again after publishing.",
    "Fail fast on critical checks, warn on non-blocking quality checks.",
    "Turn repeated failures into reusable checklists/templates.",
  ],
};

export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: stripMarkdown(heading[2].trim()), level: heading[1].length, body: "" };
      continue;
    }
    if (!current) current = { title: "Overview", level: 2, body: "" };
    current.body += `${line}\n`;
  }
  if (current) sections.push(current);
  return sections.filter((s) => s.body.trim().length > 0 || s.title !== "Overview");
}

export function pluginSuggestions(pluginName: string): string[] {
  const canonical = displayPluginName(pluginName);
  return SUGGESTIONS_BY_PLUGIN[canonical] || [
    "Review the top findings and prioritize by expected business impact.",
    "Apply changes in batches, then re-run analysis to confirm improvements.",
    "Document what changed so future runs can compare outcomes accurately.",
  ];
}

