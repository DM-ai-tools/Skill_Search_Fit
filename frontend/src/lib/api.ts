import { getCookie } from "./utils";

/** Browser always uses same-origin /api/v1 (route handler proxies with long timeout). */
function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/v1";
  }
  const proxyTarget = process.env.API_PROXY_TARGET?.trim();
  if (proxyTarget) {
    return `${proxyTarget.replace(/\/+$/, "")}/api/v1`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
}

const LONG_RUNNING_PATH_RE = /\/(execute\/|pipelines\/[^/]+\/runs)/;

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown[];

  constructor(code: string, message: string, status: number, details: unknown[] = []) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  csrf?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, csrf = method !== "GET" } = options;
  const apiUrl = resolveApiUrl();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (csrf && typeof document !== "undefined") {
    const token = getCookie("ssf_csrf");
    if (token) headers["X-CSRF-Token"] = token;
  }

  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
        "Cannot reach the API server. Make sure the backend is running (npm run dev:api, port 8000).",
      0,
    );
  }

  if (res.status === 204) return {} as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = data?.error || data?.detail?.error || data?.detail;
    const code = err?.code || "UNKNOWN_ERROR";
    const status = res.status;

    if (
      status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login") &&
      !window.location.pathname.startsWith("/admin/login")
    ) {
      const redirect = encodeURIComponent(
        `${window.location.pathname}${window.location.search}`,
      );
      window.location.replace(`/login?redirect=${redirect}&reason=session_expired`);
      await new Promise(() => {
        /* wait for navigation */
      });
    }

    throw new ApiError(
      code,
      err?.message || (typeof data?.detail === "string" ? data.detail : "Request failed"),
      status,
      err?.details || [],
    );
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, csrf = true) =>
    request<T>(path, { method: "POST", body, csrf }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
