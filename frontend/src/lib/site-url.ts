/** Resolve the audited site base URL from plugin execution inputs. */
export function resolveExecutionSiteUrl(
  inputs?: Record<string, unknown> | null,
): string | undefined {
  if (!inputs) return undefined;

  for (const key of ["site_url", "website_url", "page_url"] as const) {
    const value = inputs[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    return normalizeSiteBaseUrl(trimmed);
  }

  return undefined;
}

/**
 * Normalize a site URL while preserving subdirectory installs
 * (e.g. https://trdemo.com.au/testdomain1 stays intact, not stripped to domain root).
 */
export function normalizeSiteBaseUrl(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname) return url.trim().replace(/\/$/, "");
    const path = parsed.pathname.replace(/\/$/, "") || "";
    return `${parsed.protocol}//${parsed.host}${path}`;
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

/** @deprecated Use normalizeSiteBaseUrl — kept for callers that only need host. */
export function normalizeSiteOrigin(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname) return url.trim();
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url.trim();
  }
}
