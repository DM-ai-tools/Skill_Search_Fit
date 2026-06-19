import { NextResponse } from "next/server";

const BACKEND = process.env.API_PROXY_TARGET || "http://localhost:8000";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ status: "error", features: [] }, { status: 503 });
  }
}
