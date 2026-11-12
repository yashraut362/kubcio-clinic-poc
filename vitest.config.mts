import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests (lib/**) and API integration tests (tests/api/**).
 * Browser tests live in tests/e2e and run with Playwright instead.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/api/**/*.test.ts"],
    // The first API run downloads a MongoDB binary for the in-memory server.
    hookTimeout: 180_000,
  },
});
