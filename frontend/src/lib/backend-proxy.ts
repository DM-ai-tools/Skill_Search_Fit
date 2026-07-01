/** Server-side backend URL for API route proxying (Railway: set API_PROXY_TARGET). */
export function getApiProxyTarget(): string {
  const raw = (process.env.API_PROXY_TARGET || "http://localhost:8000").trim();
  return raw.replace(/\/+$/, "");
}

export function isLocalBackendTarget(target: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(target);
}

export function proxyMisconfigurationHint(target: string): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (!process.env.API_PROXY_TARGET?.trim()) {
    return "API_PROXY_TARGET is not set on the frontend service. Set it to your Railway API URL, e.g. https://your-api.up.railway.app";
  }
  if (isLocalBackendTarget(target)) {
    return "API_PROXY_TARGET points to localhost, which is unreachable inside the deployed frontend container.";
  }
  return null;
}

/** Split a combined Set-Cookie header into individual cookie directives. */
export function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,=\s]+=)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Forward backend Set-Cookie headers without merging them (required for auth). */
export function appendBackendSetCookies(
  backendHeaders: Headers,
  response: { headers: Headers },
): void {
  const getSetCookie = (
    backendHeaders as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;

  if (typeof getSetCookie === "function") {
    for (const cookie of getSetCookie.call(backendHeaders)) {
      response.headers.append("set-cookie", cookie);
    }
    return;
  }

  const combined = backendHeaders.get("set-cookie");
  if (!combined) return;
  for (const cookie of splitSetCookieHeader(combined)) {
    response.headers.append("set-cookie", cookie);
  }
}
