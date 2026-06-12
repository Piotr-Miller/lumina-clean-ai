import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config (tests/e2e/*.spec.ts — Vitest owns tests/*.test.ts).
 *
 * Auth follows the storageState pattern (tests/e2e/RULES.md): the `setup`
 * project signs in once (tests/e2e/auth.setup.ts — admin-create + the app's
 * real form endpoint, no UI) and saves playwright/.auth/user.json; the
 * browser project starts every test already authenticated. Tests that must
 * START anonymous (the Risk #2 gate specs) opt out per file with
 * `test.use({ storageState: { cookies: [], origins: [] } })`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4321",
    trace: "on-first-retry",
  },
  // Reuses the already-running dev server locally; CI starts its own.
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
