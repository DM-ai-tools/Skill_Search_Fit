import { NextResponse } from "next/server";

import {
  getApiProxyTarget,
  proxyMisconfigurationHint,
} from "@/lib/backend-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  const BACKEND = getApiProxyTarget();
  const misconfig = proxyMisconfigurationHint(BACKEND);
  if (misconfig) {
    return NextResponse.json(
      { status: "error", message: misconfig, backend: BACKEND },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${BACKEND}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return NextResponse.json({ ...data, proxy_target: BACKEND }, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Cannot reach backend", backend: BACKEND },
      { status: 503 },
    );
  }
}
