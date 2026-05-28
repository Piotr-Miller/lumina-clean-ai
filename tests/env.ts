import { createAdminClient } from "@/lib/supabase-admin";

const HINT = "(see tests/README.md — run `npx supabase start` and export the three env vars before `npm test`)";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`tests/env.ts: missing required env var ${name} ${HINT}`);
  }
  return value;
}

export const supabaseUrl = requireEnv("SUPABASE_URL");
export const supabaseAnonKey = requireEnv("SUPABASE_KEY");
export const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

/**
 * Shared admin client built once at module init. Imported by test files and
 * helpers so each test doesn't re-construct it.
 */
export const supabaseAdmin = createAdminClient({
  url: supabaseUrl,
  serviceRoleKey: supabaseServiceRoleKey,
});
