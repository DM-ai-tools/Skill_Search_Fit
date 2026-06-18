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
    text: "text-[#6BA4F8]",
    bg: "bg-[rgba(107,164,248,0.12)]",
    border: "border-[rgba(107,164,248,0.22)]",
    badge: "border border-[rgba(107,164,248,0.22)] bg-[rgba(107,164,248,0.10)] text-[#6BA4F8]",
  },
  content: {
    text: "text-[#4ADE80]",
    bg: "bg-[rgba(74,222,128,0.12)]",
    border: "border-[rgba(74,222,128,0.22)]",
    badge: "border border-[rgba(74,222,128,0.22)] bg-[rgba(74,222,128,0.10)] text-[#4ADE80]",
  },
  technical: {
    text: "text-[#FF8B3D]",
    bg: "bg-[rgba(255,139,61,0.12)]",
    border: "border-[rgba(255,139,61,0.22)]",
    badge: "border border-[rgba(255,139,61,0.22)] bg-[rgba(255,139,61,0.10)] text-[#FF8B3D]",
  },
  "local-seo": {
    text: "text-[#C084FC]",
    bg: "bg-[rgba(192,132,252,0.12)]",
    border: "border-[rgba(192,132,252,0.22)]",
    badge: "border border-[rgba(192,132,252,0.22)] bg-[rgba(192,132,252,0.10)] text-[#C084FC]",
  },
  reporting: {
    text: "text-[#B8A8A1]",
    bg: "bg-[rgba(184,168,161,0.12)]",
    border: "border-[rgba(184,168,161,0.22)]",
    badge: "border border-[rgba(184,168,161,0.22)] bg-[rgba(184,168,161,0.10)] text-[#B8A8A1]",
  },
  analytics: {
    text: "text-[#D45A8C]",
    bg: "bg-[rgba(212,90,140,0.12)]",
    border: "border-[rgba(212,90,140,0.22)]",
    badge: "border border-[rgba(212,90,140,0.22)] bg-[rgba(212,90,140,0.10)] text-[#D45A8C]",
  },
  visibility: {
    text: "text-[#6BA4F8]",
    bg: "bg-[rgba(107,164,248,0.12)]",
    border: "border-[rgba(107,164,248,0.22)]",
    badge: "border border-[rgba(107,164,248,0.22)] bg-[rgba(107,164,248,0.10)] text-[#6BA4F8]",
  },
};

export function categoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.reporting;
}

export function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] || (category ? category.charAt(0).toUpperCase() + category.slice(1) : "Other");
}
