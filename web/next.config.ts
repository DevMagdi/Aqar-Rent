import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  // e2e runs its own dev server on :3010 with an isolated build directory
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The browser always talks to same-origin /api/v1/* — the Next server proxies
  // to the backend (works behind the Arena preview host, no CORS, no localhost).
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${BACKEND}/api/v1/:path*` },
      { source: "/health", destination: `${BACKEND}/health` },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000" },
      { protocol: "https", hostname: "**" },
    ],
    // Media files are served by the backend proxy path; keep the optimizer on
    // but tolerate slow first loads in dev.
    minimumCacheTTL: 60,
  },
};

export default nextConfig;
