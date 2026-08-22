import { defineConfig } from "vitest/config";

// Without a package-local config, vitest resolves upward and finds the ROOT
// repo's vitest.config.ts (include: tests/**), discovering no package tests.
export default defineConfig({
  test: {
    environment: "node",
    // scripts/**/*.test.mjs: hermetic tests for campaign tooling (e.g. the
    // fabrication grader) — pure-function coverage, no network, no API key.
    include: ["src/**/*.test.ts", "evals/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
