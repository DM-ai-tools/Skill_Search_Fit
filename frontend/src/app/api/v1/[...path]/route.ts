import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.API_PROXY_TARGET || "http://localhost:8000";
const PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 600_000);

export const maxDuration = 600;
export const dynamic = "force-dynamic";

async function proxyToBackend(request: NextRequest, pathSegments: string[]) {
  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND}/api/v1/${pathSegments.join("/")}${search}`;
  const isLongRunning =
    pathSegments[0] === "execute" ||
    (pathSegments[0] === "pipelines" && pathSegments[2] === "execute");

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
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const startedAt = Date.now();
  try {
    const backendRes = await fetch(targetUrl, init);
    const body = await backendRes.arrayBuffer();
    const response = new NextResponse(body, { status: backendRes.status });

    backendRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "set-cookie") {
        response.headers.append(key, value);
      }
    });

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
          message: "API proxy timed out or failed. Ensure the backend is running on port 8000.",
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
