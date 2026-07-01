import type { NextConfig } from "next";
import path from "path";

/** Fallback for any routes not handled by app/api/v1/[...path]/route.ts */
const PROXY_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS || 600_000);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: ["puppeteer-core"],
  experimental: {
    proxyTimeout: PROXY_TIMEOUT_MS,
  },
};

export default nextConfig;
