import { api } from "@/lib/api";
import type { SeoProjectTrendsResponse } from "@/lib/types";

export const seoIntelligenceApi = {
  getProjectTrends: (projectId: string, days = 30) =>
    api.get<SeoProjectTrendsResponse>(
      `/seo-intelligence/projects/${projectId}/trends?days=${encodeURIComponent(String(days))}`,
    ),
};

