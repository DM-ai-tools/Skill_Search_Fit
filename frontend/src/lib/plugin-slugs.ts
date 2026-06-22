/** Maps display plugin names → canonical SearchFit SEO plugin slugs */

export const PLUGIN_SLUG_BY_NAME: Record<string, string> = {
  "SEO Audit": "seo-audit",
  "Technical SEO": "technical-seo",
  "On-Page SEO": "on-page-seo",
  "Schema Markup": "schema-markup",
  "Content Strategy": "content-strategy",
  "Content Brief": "content-brief",
  "Keyword Clustering": "keyword-clustering",
  "Internal Linking": "internal-linking",
  "Broken Links": "broken-links",
  "AI Visibility": "ai-visibility",
  "Content Translation": "content-translation",
};

export function resolvePluginSlug(pluginName: string): string | undefined {
  return PLUGIN_SLUG_BY_NAME[pluginName];
}
