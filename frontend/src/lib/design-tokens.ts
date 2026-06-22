export const CATEGORY_LABELS: Record<string, string> = {
  visibility: "Visibility",
  research: "Research",
  content: "Content",
  technical: "Technical",
  "local-seo": "Local SEO",
  reporting: "Reporting",
  analytics: "Analytics",
};

export const CATEGORY_STYLES: Record<string, { text: string; bg: string; border: string; badge: string }> = {
  research: {
    text: "text-category-research",
    bg: "bg-secondary-soft",
    border: "border-secondary/25",
    badge: "border border-secondary/25 bg-secondary-soft text-category-research",
  },
  content: {
    text: "text-category-content",
    bg: "bg-primary-soft",
    border: "border-primary/25",
    badge: "border border-primary/25 bg-primary-soft text-category-content",
  },
  technical: {
    text: "text-category-technical",
    bg: "bg-primary-soft",
    border: "border-primary/30",
    badge: "border border-primary/30 bg-primary-soft text-category-technical",
  },
  "local-seo": {
    text: "text-category-local-seo",
    bg: "bg-secondary-soft",
    border: "border-secondary/20",
    badge: "border border-secondary/20 bg-secondary-soft text-category-local-seo",
  },
  reporting: {
    text: "text-category-reporting",
    bg: "bg-surface-elevated",
    border: "border-border-strong",
    badge: "border border-border-strong bg-surface-elevated text-category-reporting",
  },
  analytics: {
    text: "text-destructive",
    bg: "bg-destructive-soft",
    border: "border-destructive/25",
    badge: "border border-destructive/25 bg-destructive-soft text-destructive",
  },
  visibility: {
    text: "text-category-visibility",
    bg: "bg-secondary-soft",
    border: "border-secondary/25",
    badge: "border border-secondary/25 bg-secondary-soft text-category-visibility",
  },
};

export function categoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.reporting;
}

export function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] || (category ? category.charAt(0).toUpperCase() + category.slice(1) : "Other");
}
