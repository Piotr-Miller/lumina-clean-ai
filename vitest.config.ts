import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Tests touch a shared local Supabase instance; keep them serial within
    // a file by default. UUID-suffixed test users avoid cross-file conflict.
    testTimeout: 30_000,
  },
});
