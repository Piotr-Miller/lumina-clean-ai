import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Vitest config used by Stryker mutation runs. Extends the base config but
// excludes the RLS integration test (jobs.rls.test.ts), which needs a live
// local Supabase instance and is far too slow to run once per mutant.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: ["**/jobs.rls.test.ts", "**/node_modules/**"],
    },
  }),
);
