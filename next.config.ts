import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read from disk at runtime (src/db/client.ts), so they must ship with every server function.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  // Feedback imports can reach ~2 MB; the default Server Action limit is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
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
