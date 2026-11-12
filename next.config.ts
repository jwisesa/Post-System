import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read from disk at runtime (src/db/client.ts), so they must ship with every server function.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
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
