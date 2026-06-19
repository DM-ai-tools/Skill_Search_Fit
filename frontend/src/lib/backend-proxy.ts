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
