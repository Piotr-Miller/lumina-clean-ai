/**
 * seed.spec.ts — the E2E exemplar every generated test in this repo is modeled on.
 *
 * Provenance: 10x-e2e quality lever (.claude/skills/10x-e2e/references/
 * seed-test-pattern.md), adapted to LuminaClean's REAL routes and accessible
 * names — every role/name below was read from the running app (2026-06-11),
 * not guessed.
 *
 * Risk: context/foundation/test-plan.md §2 Risk #2 — "An anonymous or
 * otherwise unauthorized request reaches Cloud AI processing because the gate
 * is enforced only in the UI toggle, not in the API." This test fails when
 * EITHER half of the gate regresses: the UI half (no sign-in prompt for an
 * anonymous Cloud AI selection) or the API half (create-job accepting an
 * unauthenticated request). It also proves the gate is auth-bound, not
 * hardcoded: the same visitor, signed in, sees the cloud submit UI.
 *
 * Conventions demonstrated (follow ALL of these in every generated test):
 *   1. getByRole / getByLabel as default locators — never CSS or XPath.
 *   2. Wait for STATE (toBeVisible, response status) — never waitForTimeout.
 *   3. Unique identifiers in test data — parallel runs / re-runs never collide.
 *   4. Cleanup in afterEach — the test deletes everything it created.
 *   5. Test name bound to the risk — not "test 1".
 *
 * Preconditions (same stack the integration suite documents in tests/README.md):
 *   - app running against the LOCAL Supabase stack (npm run dev),
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY exported (npx supabase status).
 *   The service-role client is used ONLY for setup/cleanup — never in assertions.
 */
import { test, expect } from "@playwright/test";
import { adminClient as sharedAdminClient } from "./helpers/env";

// playwright.config.ts owns baseURL and pre-authenticates the chromium project
// via the `setup` project (storageState). This spec asserts the ANON half of
// the Risk #2 gate first, so it opts out and starts signed out — the
// documented reset pattern for "not signed in" tests.
test.use({ storageState: { cookies: [], origins: [] } });

// (3) Unique run marker — email + upload name derive from it, so parallel
// workers and repeated runs never collide on auth state or storage paths.
const RUN_ID = `e2e-seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL = `${RUN_ID}@e2e.local`;
const PASSWORD = `Pw!${RUN_ID}`;

// Smallest valid PNG (1×1). Local-engine-only in this test — never sent to
// the cloud pipeline (alpha PNGs would be rejected by Bread anyway).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// Shared guarded client (helpers/env.ts): hard-fails on missing env AND on a
// non-local SUPABASE_URL — this suite must never run its admin deletes remotely.
function adminClient() {
  return sharedAdminClient("seed.spec.ts");
}

test.describe("Risk #2: anon request must not reach Cloud AI processing", () => {
  let userId: string | null = null;

  // (4) Cleanup — remove exactly what this test created: the unique user and,
  // defensively, any jobs row that could only exist if the API gate regressed
  // mid-run (on a green run that delete matches nothing).
  test.afterEach(async () => {
    const admin = adminClient();
    if (userId) {
      await admin.from("jobs").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
      userId = null;
    }
  });

  test("anonymous visitor cannot reach Cloud AI — gate shows sign-in prompt and API rejects; the same visitor signed in passes the gate", async ({
    page,
    baseURL,
  }) => {
    // ——— Anonymous half ———
    await page.goto("/");
    // (2) Wait for rendered state, not time: the H1 proves the page is up.
    await expect(page.getByRole("heading", { name: "Fix your night photos" })).toBeVisible();

    // (1) Role/label locators only. The file input is the app's real
    // accessible control (aria-label="Upload an image"); the photo-loaded
    // state is the local "Enhance" button appearing.
    // (2) The uploader is a React island: its SSR markup (incl. the input) is
    // present BEFORE hydration attaches the change handler, so an immediate
    // setInputFiles can fire into a not-yet-interactive input and be silently
    // lost. Retry the upload until the app visibly reacts — state, not time.
    await expect(async () => {
      await page.getByLabel("Upload an image").setInputFiles({
        name: `${RUN_ID}.png`, // (3) unique upload name
        mimeType: "image/png",
        buffer: TINY_PNG,
      });
      await expect(page.getByRole("button", { name: "Enhance" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    // Selecting Cloud AI as an anonymous visitor must surface the sign-in
    // gate (FR-007), not a cloud submit UI.
    const engineToggle = page.getByRole("group", { name: "Processing engine" });
    await engineToggle.getByRole("button", { name: "Cloud AI" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to use Cloud AI" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Process with Cloud AI" })).not.toBeVisible();

    // The API half — the exact failure mode Risk #2 names ("enforced only in
    // the UI toggle"). Same browser context = same (absent) auth cookies; the
    // body is the route's REAL contract (photo-job.schema.ts), so a regressed
    // gate would act on it. Must reject with the API error contract.
    const probe = await page.request.post("/api/enhance/cloud/create-job", {
      data: { fileExtension: "png", mimeType: "image/png" },
    });
    expect(probe.status()).toBe(401);
    const probeBody = (await probe.json()) as { error?: { code?: string } };
    expect(probeBody.error?.code).toBe("unauthorized");

    // ——— Signed-in half: the gate is auth-bound, not hardcoded ———
    // (3)+(4) The user is this test's own creation: unique email, deleted in
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
    // on /auth/signin?error=… — so assert the landing path, not just ok(), or a
    // broken sign-in would slip through here and only surface later, with a
    // murkier message, at the "Process with Cloud AI" assertion.
    expect(signIn.ok()).toBe(true);
    expect(new URL(signIn.url()).pathname).toBe("/");

    // Fresh render with the session cookie; photo state is client-side, so
    // re-upload (same hydration-race retry as above), then select Cloud AI again.
    await page.goto("/");
    await expect(async () => {
      await page.getByLabel("Upload an image").setInputFiles({
        name: `${RUN_ID}-authed.png`,
        mimeType: "image/png",
        buffer: TINY_PNG,
      });
      await expect(page.getByRole("button", { name: "Enhance" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole("group", { name: "Processing engine" }).getByRole("button", { name: "Cloud AI" }).click();

    // Gate open: the sign-in prompt is gone and the real submit control is
    // present. STOP at visibility — clicking it would create a real cloud job
    // (cap spend + Replicate); that flow belongs to the north-star E2E, not
    // the seed.
    await expect(page.getByRole("button", { name: "Process with Cloud AI" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to use Cloud AI" })).not.toBeVisible();
  });
});
