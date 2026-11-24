import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Every file boots its own PGlite and runs all migrations (WASM, CPU-heavy): give it room, and do not run all files at once.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    maxWorkers: 4,
  },
});
