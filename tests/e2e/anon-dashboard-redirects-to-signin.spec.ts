/**
 * anon-dashboard-redirects-to-signin.spec.ts
 *
 * risk: context/foundation/test-plan.md §2 Risk #2 perimeter — middleware-protected
 *       routes must never render for an anonymous visitor. PROTECTED_ROUTES lives in
 *       src/middleware.ts; /dashboard is the protected page.
 * seed: tests/e2e/seed.spec.ts
 *
 * The middleware perimeter is the page-level edge of the Risk #2 auth gate: an
 * anonymous request to a PROTECTED_ROUTES path must be redirected to /auth/signin
 * before the page renders. This test fails when EITHER side regresses: the
 * redirect half (an anonymous /dashboard request comes back rendered instead of
 * bounced — e.g. /dashboard dropped from PROTECTED_ROUTES) or the access half
 * (a real signed-in user no longer reaches the dashboard — an over-tightened
 * gate is a regression too).
 *
 * Preconditions (same stack the integration suite documents in tests/README.md):
 *   - app running against the LOCAL Supabase stack (npm run dev),
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY exported (npx supabase status).
 *   The service-role client is used ONLY for setup/cleanup — never in assertions.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// playwright.config.ts owns baseURL and pre-authenticates the chromium project
// via the `setup` project (storageState). This spec asserts the anonymous
// bounce first, so it opts out and starts signed out — the documented reset
// pattern for "not signed in" tests.
test.use({ storageState: { cookies: [], origins: [] } });

// Unique run marker — the email derives from it, so parallel workers and
// repeated runs never collide on auth state.
const RUN_ID = `e2e-dash-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL = `${RUN_ID}@e2e.local`;
const PASSWORD = `Pw!${RUN_ID}`;

// Inferred return type, matching the integration suite's idiom (jobs.rls.test.ts).
function adminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    // Same hard-fail convention as tests/env.ts: a missing local stack is a
    // setup error to surface loudly, never a silent skip.
    throw new Error(
      "anon-dashboard-redirects-to-signin.spec.ts needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (local stack — see tests/README.md).",
    );
  }
  return createClient(url, serviceRole);
}

test.describe("Risk #2 perimeter: middleware-protected routes never render for an anonymous visitor", () => {
  let userId: string | null = null;

  // Cleanup — the only artifact this flow creates is its unique user;
  // /dashboard itself writes nothing.
  test.afterEach(async () => {
    if (userId) {
      const admin = adminClient();
      await admin.auth.admin.deleteUser(userId);
      userId = null;
    }
  });

  test("anonymous visitor requesting /dashboard ends up on the sign-in page; the same visitor signed in reaches the dashboard", async ({
    page,
    baseURL,
  }) => {
    // ——— Anonymous half: the browser flow ends on the sign-in page ———
    // Wait for state, not time: the navigation settles on /auth/signin (the
    // middleware's redirect target) and the page's H1 proves the sign-in page
    // rendered. The heading role disambiguates from the Nav's "Sign in" link
    // and the form's "Sign in" submit button (src/pages/auth/signin.astro).
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/auth/signin");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    // The protected page's content never showed up in the bounce.
    await expect(page.getByRole("heading", { name: "Dashboard" })).not.toBeVisible();

    // "Never render" at the protocol level — with redirects disabled, the raw
    // answer to an anonymous /dashboard request is the middleware's 302 to
    // /auth/signin (Astro context.redirect default status), not a 200 carrying
    // a rendered dashboard body. Same browser context = same (absent) cookies.
    const probe = await page.request.get("/dashboard", { maxRedirects: 0 });
    expect(probe.status()).toBe(302);
    expect(probe.headers().location).toBe("/auth/signin");

    // ——— Signed-in half: the gate is session-bound, not hardcoded ———
    // The user is this test's own creation: unique email, deleted in
    // afterEach. Created via the admin API and signed in via the app's real
    // form endpoint — auth WITHOUT driving the sign-in UI (rules file).
    const admin = adminClient();
    const created = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    userId = created.data.user?.id ?? null;

    const signIn = await page.request.post("/api/auth/signin", {
      form: { email: EMAIL, password: PASSWORD },
      // Astro's CSRF guard (security.checkOrigin) 403s origin-less form POSTs;
      // a browser always sends Origin — the request context must add it.
      headers: { Origin: baseURL ?? "http://localhost:4321" },
    });
    // Success follows the 302 chain to "/"; a failed sign-in also ends 200 but
    // on /auth/signin?error=… — so assert the landing path, not just ok().
    expect(signIn.ok()).toBe(true);
    expect(new URL(signIn.url()).pathname).toBe("/");

    // The same visitor, now signed in, requests /dashboard and reaches it:
    // the URL sticks (no bounce) and the page greets exactly this run's user —
    // the render is session-bound, not a static shell. "Welcome, " prefix
    // keeps the locator off the Nav's bare email span (src/components/Nav.astro).
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(`Welcome, ${EMAIL}`)).toBeVisible();
  });
});
