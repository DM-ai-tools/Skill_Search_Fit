function resolveHealthUrl(): string {
  if (typeof window !== "undefined") {
    return "/backend-health";
  }
  const root = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(
    /\/api\/v1\/?$/,
    ""
  );
  return `${root}/health`;
}

export type ApiCapabilities = {
  websiteAnalysis: boolean;
  features: string[];
};

let cached: ApiCapabilities | null = null;

export async function getApiCapabilities(): Promise<ApiCapabilities> {
  if (cached) return cached;

  try {
    const res = await fetch(resolveHealthUrl(), { credentials: "include" });
    if (!res.ok) {
      cached = { websiteAnalysis: false, features: [] };
      return cached;
    }
    const data = (await res.json()) as { features?: string[] };
    const features = data.features ?? [];
    cached = {
      websiteAnalysis: features.includes("website_analysis"),
      features,
    };
    return cached;
  } catch {
    cached = { websiteAnalysis: false, features: [] };
    return cached;
  }
}

export function resetApiCapabilitiesCache() {
  cached = null;
}
