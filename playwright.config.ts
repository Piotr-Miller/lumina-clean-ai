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
  // Serve a PRODUCTION BUILD via workerd (`wrangler dev`), NOT `astro dev`.
  // `astro dev`'s Vite SSR dep-optimizer intermittently re-optimizes mid-request
  // and re-emits react-dom/server under a fresh `?v=` hash that desyncs from the
  // already-loaded React → "more than one copy of React" → null hooks on the
  // enhance page (dev-only issue #15). The built worker has no `.vite/deps_ssr`
  // re-optimization, so it renders deterministically — and matches prod runtime.
  // Always starts its own server (no reuse) for a deterministic, identical
  // runtime locally and in CI; cost is one build per run (e2e is already a heavy
  // gate). `wrangler dev` reads `.dev.vars` for runtime secrets; the build
  // inherits this process's env.
  webServer: {
    command: "npm run test:e2e:serve",
    url: process.env.E2E_BASE_URL ?? "http://localhost:4321",
    timeout: 180_000,
    reuseExistingServer: false,
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
