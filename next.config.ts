import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read from disk at runtime (src/db/client.ts), so they must ship with every server function.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  // Feedback imports can reach ~2 MB; a script with up to 2.5 MB of text round-trips preview -> save as JSON (~3.2 MB worst case). Default is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Content-Type", value: "text/javascript; charset=utf-8" }, { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
