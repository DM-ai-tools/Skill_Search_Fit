/** Canonical 14 SearchFit SEO plugins — one entry per skill, no duplicates. */
type CanonicalPlugin = {
  slug: string;
  name: string;
  category: "content" | "research" | "technical" | "visibility";
  legacyNames: string[];
};

export const CANONICAL_PLUGINS: CanonicalPlugin[] = [
  { slug: "ai-visibility", name: "AI Visibility", category: "visibility", legacyNames: ["AI Visibility & Tracking"] },
  { slug: "broken-links", name: "Broken Links", category: "technical", legacyNames: ["Broken Link Checker"] },
  { slug: "competitor-analyzer", name: "Competitor Analyzer", category: "research", legacyNames: ["Competitor Gap Analyzer", "Keyword Gap Analyzer"] },
  { slug: "content-brief", name: "Content Brief", category: "content", legacyNames: ["Content Brief Generator"] },
  { slug: "content-strategy", name: "Content Strategy", category: "content", legacyNames: [] },
  { slug: "create-content", name: "Create Content", category: "content", legacyNames: ["Create SEO-Optimized Content"] },
  { slug: "create-topic", name: "Create Topic", category: "research", legacyNames: [] },
  { slug: "internal-linking", name: "Internal Linking", category: "technical", legacyNames: ["Internal Linking Strategy"] },
  { slug: "keyword-clustering", name: "Keyword Clustering", category: "research", legacyNames: ["Keyword Cluster"] },
  { slug: "on-page-seo", name: "On-Page SEO", category: "content", legacyNames: ["On-Page SEO Optimization"] },
  { slug: "schema-markup", name: "Schema Markup", category: "technical", legacyNames: ["Generate Schema Markup", "Generate Schema", "Schema Markup Generator"] },
  { slug: "seo-audit", name: "SEO Audit", category: "technical", legacyNames: [] },
  { slug: "seo-check", name: "SEO Check", category: "technical", legacyNames: [] },
  { slug: "technical-seo", name: "Technical SEO", category: "technical", legacyNames: ["Technical SEO Audit"] },
];

export const PLUGIN_CATEGORY_ORDER = ["visibility", "research", "content", "technical"] as const;

function resolveCanonical(rawName: string): CanonicalPlugin | undefined {
  const trimmed = rawName.trim();
  return CANONICAL_PLUGINS.find(
    (p) => p.name === trimmed || p.legacyNames.some((legacy) => legacy === trimmed),
  );
}

export function displayPluginName(pluginName: string): string {
  return resolveCanonical(pluginName)?.name ?? pluginName;
}

export function getPluginSlug(pluginName: string): string {
  return resolveCanonical(pluginName)?.slug ?? pluginName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function getPluginCategory(pluginName: string, fallback = "technical"): string {
  return resolveCanonical(pluginName)?.category ?? fallback;
}

/** Deduplicate API plugins by canonical slug; prefer canonical name + category. */
export function normalizePluginList<T extends { plugin_name: string; category: string }>(
  plugins: T[],
): T[] {
  const bySlug = new Map<string, T>();
  for (const plugin of plugins) {
    const canonical = resolveCanonical(plugin.plugin_name);
    if (!canonical) continue;

    const slug = canonical.slug;
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        ...plugin,
        plugin_name: canonical.name,
        category: canonical.category,
      });
    }
  }
  return Array.from(bySlug.values()).sort((a, b) => {
    const catA = PLUGIN_CATEGORY_ORDER.indexOf(a.category as (typeof PLUGIN_CATEGORY_ORDER)[number]);
    const catB = PLUGIN_CATEGORY_ORDER.indexOf(b.category as (typeof PLUGIN_CATEGORY_ORDER)[number]);
    if (catA !== catB) return (catA === -1 ? 99 : catA) - (catB === -1 ? 99 : catB);
    return a.plugin_name.localeCompare(b.plugin_name);
  });
}

const URL_SUGGESTIONS = (siteUrl?: string) =>
  siteUrl
    ? [siteUrl, `${siteUrl.replace(/\/$/, "")}/blog`, `${siteUrl.replace(/\/$/, "")}/sitemap.xml`]
    : [];

/** Suggestion options — only used after Generate AI provides cached suggestions. */
export function getFieldSuggestions(
  fieldName: string,
  _pluginName?: string,
  siteUrl?: string,
): string[] {
  if (fieldName === "site_url" || fieldName === "website_url" || fieldName === "page_url") {
    return URL_SUGGESTIONS(siteUrl);
  }
  return [];
}
