import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Proxy "/api/*" (and "/health") to the backend so the whole product lives
// behind a single public URL. The API client uses a same-origin empty BASE.
// Override the target for local dev with API_PROXY_TARGET (e.g. :4000).
const API = process.env.API_PROXY_TARGET || "http://localhost:4000";

const nextConfig: NextConfig = {
  // APP_URL is consumed at build for metadataBase (see app/layout.tsx).
  env: {
    APP_URL: process.env.APP_URL || "http://localhost:3000",
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API}/api/:path*` },
      { source: "/health", destination: `${API}/health` },
    ];
  },
};

export default withNextIntl(nextConfig);
