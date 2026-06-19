import type { NextConfig } from "next";
import path from "path";

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || "http://localhost:8000";
/** Fallback for any routes not handled by app/api/v1/[...path]/route.ts */
const PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 600_000);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd()),
  experimental: {
    proxyTimeout: PROXY_TIMEOUT_MS,
  },
  async rewrites() {
    return [
      {
        source: "/backend-health",
        destination: `${API_PROXY_TARGET}/health`,
      },
    ];
  },
};

export default nextConfig;
