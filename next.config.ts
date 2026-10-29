import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Demo mode runs Postgres (PGlite, WebAssembly) on the server: load it from
  // node_modules as is, and ship the SQL it starts from.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: { "/*": ["supabase/**/*.sql"] },
  // Off on purpose: every page renders fresh per request, so totals are never
  // served from a cache right after you add or edit a transaction.
  cacheComponents: false,
  experimental: {
    // Restores send the backup gzip-compressed; this leaves room for years of data.
    serverActions: { bodySizeLimit: "10mb" },
    // Dev only: don't reuse database responses across hot reloads (shows stale data).
    serverComponentsHmrCache: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Always check for a new service worker, so notification fixes reach the phone.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
