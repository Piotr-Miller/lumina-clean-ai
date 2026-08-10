import { defineConfig } from "vitest/config";

// Without a package-local config, vitest resolves upward and finds the ROOT
// repo's vitest.config.ts (include: tests/**), discovering no package tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "evals/**/*.test.ts"],
  },
});
