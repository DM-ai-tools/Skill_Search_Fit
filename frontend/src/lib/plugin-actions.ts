/** Category-level CTA copy for plugin cards and workspace run buttons. */
export const CATEGORY_ACTION_LABELS: Record<string, string> = {
  content: "Start creating →",
  research: "Start research →",
  technical: "Run diagnostics →",
  visibility: "Check reach →",
};

export const CATEGORY_RUN_LABELS: Record<string, string> = {
  content: "Start creating",
  research: "Start research",
  technical: "Run diagnostics",
  visibility: "Check reach",
};

/** Optional per-plugin overrides when the default category label is too generic. */
const PLUGIN_ACTION_OVERRIDES: Record<string, string> = {
  "SEO Audit": "Run full audit →",
  "SEO Check": "Quick-check page →",
  "Broken Links": "Find broken links →",
  "Schema Markup": "Generate schema →",
  "Keyword Clustering": "Cluster keywords →",
  "Competitor Analyzer": "Analyze competitors →",
  "Content Brief": "Build brief →",
  "Content Strategy": "Plan strategy →",
  "Create Content": "Start creating →",
  "Create Topic": "Discover topics →",
  "On-Page SEO": "Optimize page →",
  "Internal Linking": "Map link gaps →",
  "Technical SEO": "Run diagnostics →",
  "AI Visibility": "Check reach →",
};

const PLUGIN_RUN_OVERRIDES: Record<string, string> = {
  "SEO Audit": "Run full audit",
  "SEO Check": "Quick-check page",
  "Broken Links": "Find broken links",
  "Schema Markup": "Generate schema",
  "Keyword Clustering": "Cluster keywords",
  "Competitor Analyzer": "Analyze competitors",
};

export function getPluginActionLabel(category: string, pluginName?: string): string {
  if (pluginName && PLUGIN_ACTION_OVERRIDES[pluginName]) {
    return PLUGIN_ACTION_OVERRIDES[pluginName];
  }
  return CATEGORY_ACTION_LABELS[category] ?? "Launch plugin →";
}

export function getPluginRunLabel(category: string, pluginName?: string): string {
  if (pluginName && PLUGIN_RUN_OVERRIDES[pluginName]) {
    return PLUGIN_RUN_OVERRIDES[pluginName];
  }
  return CATEGORY_RUN_LABELS[category] ?? "Run plugin";
}
