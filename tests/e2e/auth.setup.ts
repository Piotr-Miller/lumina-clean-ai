/**
 * auth.setup.ts — the storageState producer (playwright.config.ts `setup` project).
 *
 * Authenticates WITHOUT driving the sign-in UI (tests/e2e/RULES.md): recreates
 * the dedicated e2e account via the admin API (idempotent — `npx supabase db
 * reset` wipes local users), signs in through the app's real form endpoint,
 * and saves the session cookie to playwright/.auth/user.json. Every test in
 * the `chromium` project starts with that state; anon-start specs opt out
 * with `test.use({ storageState: { cookies: [], origins: [] } })`.
 */
import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const AUTH_FILE = "playwright/.auth/user.json";
// Deterministic, dedicated to E2E — never a real account.
const EMAIL = "e2e-storage-state@e2e.local";
const PASSWORD = "Pw!e2e-storage-state";

setup("authenticate: admin-create user + form sign-in, save storage state", async ({ request, baseURL }) => {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    // Same hard-fail convention as tests/env.ts: a missing local stack is a
    // setup error to surface loudly, never a silent skip.
    throw new Error(
      "auth.setup.ts needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (local stack — see tests/README.md).",
    );
  }

  // Idempotent create: an already-existing account is the expected steady
  // state between db resets; anything else is a real failure.
  const admin = createClient(url, serviceRole);
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error && created.error.code !== "email_exists" && !/already.*registered/i.test(created.error.message)) {
    throw new Error(`auth.setup: createUser failed: ${created.error.message}`);
  }

  // The app's real sign-in contract (src/pages/api/auth/signin.ts): form POST,
  // success follows the 302 chain to "/" — a failed sign-in also ends 200 but
  // on /auth/signin?error=…, so assert the landing path, not just ok().
  const signIn = await request.post("/api/auth/signin", {
    form: { email: EMAIL, password: PASSWORD },
    // Astro's CSRF guard (security.checkOrigin, default-on) 403s form POSTs
    // whose Origin doesn't match the request URL. A browser always sends it;
    // the API request context doesn't — supply it explicitly.
    headers: { Origin: baseURL ?? "http://localhost:4321" },
  });
  expect(signIn.ok()).toBe(true);
  expect(new URL(signIn.url()).pathname).toBe("/");

  await request.storageState({ path: AUTH_FILE });
});
