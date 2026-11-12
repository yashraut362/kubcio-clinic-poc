import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (tests/e2e). `npm run test:e2e` builds the app, then Playwright
 * starts scripts/e2e-server.mjs: the production build on port 3200 backed by a
 * throwaway in-memory MongoDB. Your dev server and real database are not used.
 */
const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}/api/health`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
