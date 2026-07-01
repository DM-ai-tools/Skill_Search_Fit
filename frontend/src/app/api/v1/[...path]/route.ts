import { NextRequest, NextResponse } from "next/server";

import {
  appendBackendSetCookies,
  getApiProxyTarget,
  proxyMisconfigurationHint,
} from "@/lib/backend-proxy";

const PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 600_000);
const PIPELINE_TIMEOUT_MS = 1_800_000; // 30 min per pipeline step
const AI_REPORT_TIMEOUT_MS = Number(process.env.API_PROXY_AI_TIMEOUT_MS || 900_000); // 15 min

export const maxDuration = 600;
export const dynamic = "force-dynamic";

async function proxyToBackend(request: NextRequest, pathSegments: string[]) {
  const BACKEND = getApiProxyTarget();
  const misconfig = proxyMisconfigurationHint(BACKEND);
  if (misconfig) {
    return NextResponse.json(
      {
        error: {
          code: "PROXY_MISCONFIGURED",
          message: misconfig,
        },
      },
      { status: 503 },
    );
  }

  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND}/api/v1/${pathSegments.join("/")}${search}`;
  const isPipelineExecute =
    pathSegments[0] === "execute" ||
    (pathSegments[0] === "pipelines" &&
      (pathSegments[2] === "runs" || pathSegments[1] === "runs"));
  const isAiReport =
    pathSegments[0] === "reports" &&
    (pathSegments[1] === "present-appearance" || pathSegments[1] === "preview-article");

  const timeoutMs = isPipelineExecute
    ? PIPELINE_TIMEOUT_MS
    : isAiReport
      ? AI_REPORT_TIMEOUT_MS
      : PROXY_TIMEOUT_MS;

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const csrf = request.headers.get("x-csrf-token");
  if (csrf) headers.set("x-csrf-token", csrf);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit = {
    method: request.method,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const startedAt = Date.now();
  try {
    const backendRes = await fetch(targetUrl, init);
    const body = await backendRes.arrayBuffer();
    const response = new NextResponse(body, { status: backendRes.status });

    appendBackendSetCookies(backendRes.headers, response);

    const backendContentType = backendRes.headers.get("content-type");
    if (backendContentType) {
      response.headers.set("content-type", backendContentType);
    }

    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "PROXY_ERROR",
          message:
            err instanceof Error && err.name === "TimeoutError"
              ? "The request timed out. OpenAI formatting can take a few minutes — try Refresh preview."
              : "API proxy could not reach the backend. Ensure the backend is running and API_PROXY_TARGET is set correctly.",
          backend: BACKEND.replace(/\/\/[^@]+@/, "//***@"),
        },
      },
      { status: 504 },
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToBackend(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
