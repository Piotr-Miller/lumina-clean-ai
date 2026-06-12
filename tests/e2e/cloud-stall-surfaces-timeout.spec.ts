/**
 * cloud-stall-surfaces-timeout.spec.ts
 *
 * risk: context/foundation/test-plan.md §2 Risk #1 (stall half — "a job that
 *       never receives a valid terminal callback surfaces a terminal failure
 *       within the watchdog budget (never hangs forever)"). The north-star
 *       spec proves the happy half; this spec proves a stuck job ends in a
 *       clear, actionable failure instead of an eternal spinner.
 * seed: tests/e2e/seed.spec.ts
 *
 * Stub boundary: NOTHING is mocked. The stall fixture is the ABSENCE of the
 * pipeline: with the DB webhook unwired (Vault/GUC unset — the local/CI
 * default) a submitted row simply stays `queued`. The client's queued
 * watchdog (QUEUED_WATCHDOG_MS = 30s, useCloudJob.ts) must re-read the row
 * (never blindly fail), see it genuinely still `queued`, flip it `failed`
 * server-side via POST /api/enhance/cloud/timeout, and surface the timeout
 * alert with retry actions. No fixture server (the port-8787 single-spec
 * rule in RULES.md stays with the north-star spec), no functions serve, no
 * Realtime warmup — the deadline path is read-driven, not event-driven.
 *
 * Preconditions (hard-fail loudly, never silently skip — tests/env.ts
 * convention):
 *   - local stack + dev server running (tests/README.md);
 *     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY exported;
 *   - the DB webhook UNWIRED (the local/CI default). A wired local pipeline
 *     would legitimately advance the row past `queued` and this spec would
 *     never observe the 30 s timeout — if it goes red with a slider/success
 *     state on screen, check the webhook wiring before suspecting the app.
 *
 * The admin (service-role) client is used ONLY for cleanup — every assertion
 * is on the rendered UI (the contract: admin never asserts).
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { adminClient as sharedAdminClient } from "./helpers/env";

// The wait crosses Playwright's default 30 s test timeout by design: the
// watchdog budget itself is 30 s (plus re-read + render). Scoped to this file;
// the rest of the gate stays fast.
test.setTimeout(60_000);

// Unique run marker — the upload name derives from it so parallel runs never
// collide. The job row is correlated by the CAPTURED jobId only: the
// storageState account is shared with the other specs, so "all rows for the
// user" is never this test's to touch.
const RUN_ID = `e2e-stall-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Same real RGB JPG the north-star spec uploads — the create-job contract and
// the signed PUT are identical; only the aftermath differs (nothing arrives).
const FIXTURE_PATH = "tests/e2e/fixtures/night-rgb.jpg";

// Shared guarded client (helpers/env.ts): hard-fails on missing env AND on a
// non-local SUPABASE_URL — this suite must never run its admin deletes remotely.
function adminClient() {
  return sharedAdminClient("cloud-stall-surfaces-timeout.spec.ts");
}

test.describe("Risk #1 (stall half): a stuck cloud job surfaces a terminal failure, never an eternal spinner", () => {
  let jobId: string | null = null;

  // Cleanup — delete exactly what this test created: the captured job row and
  // its storage prefix. The upload PUT landed even though processing never
  // started (the source object exists); the timeout endpoint flipped the row
  // `failed` server-side. Idempotent: list-then-remove tolerates whatever the
  // failure path already deleted. The shared e2e user stays — it belongs to
  // the setup project.
  test.afterEach(async () => {
    if (jobId) {
      const admin = adminClient();
      const { data: row } = await admin
        .from("jobs")
        .select("user_id")
        .eq("id", jobId)
        .maybeSingle<{ user_id: string }>();
      if (row) {
        const prefix = `${row.user_id}/${jobId}`;
        const { data: objects } = await admin.storage.from("photos").list(prefix);
        if (objects && objects.length > 0) {
          await admin.storage.from("photos").remove(objects.map((o) => `${prefix}/${o.name}`));
        }
        await admin.from("jobs").delete().eq("id", jobId);
      }
      jobId = null;
    }
  });

  test("signed-in upload → Cloud AI → pipeline never advances → timeout alert with retry actions replaces the spinner", async ({
    page,
  }) => {
    // ——— The REAL submit: what a signed-in user actually does ———
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fix your night photos" })).toBeVisible();

    // The uploader is a React island: its SSR markup (incl. the file input) is
    // present BEFORE hydration attaches the change handler, so an immediate
    // setInputFiles can fire into a not-yet-interactive input and be silently
    // lost. Retry the upload until the app visibly reacts — state, not time.
    const jpgBytes = readFileSync(FIXTURE_PATH);
    await expect(async () => {
      await page.getByLabel("Upload an image").setInputFiles({
        name: `${RUN_ID}.jpg`,
        mimeType: "image/jpeg",
        buffer: jpgBytes,
      });
      await expect(page.getByRole("button", { name: "Enhance" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    // storageState session ⇒ the Cloud AI gate is open for this visitor.
    await page.getByRole("group", { name: "Processing engine" }).getByRole("button", { name: "Cloud AI" }).click();

    // Arm the response capture BEFORE clicking — the create-job response's
    // jobId is the correlation key for cleanup.
    const createJobResponse = page.waitForResponse(
      (r) => r.url().includes("/api/enhance/cloud/create-job") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Process with Cloud AI" }).click();
    const createJob = await createJobResponse;
    expect(createJob.ok()).toBe(true);
    jobId = ((await createJob.json()) as { jobId: string }).jobId;

    // The waiting branch proves the submit fully settled (the source PUT
    // landed) and the watchdog effect for this jobId is armed. From here the
    // test deliberately does NOTHING — the unwired pipeline is the stall.
    await expect(page.getByText("Enhancing in the cloud…")).toBeVisible();

    // ——— The risk assertion: the stall must surface, not spin forever ———
    // At QUEUED_WATCHDOG_MS (30 s) the client re-reads the row (never a blind
    // fail — a cold boot that reached `processing` must survive), sees it
    // genuinely still `queued`, and fails it. 40 s = 30 s budget + re-read +
    // render, state-based. The exact copy is the user-facing contract
    // (useCloudJob.ts TIMEOUT_MESSAGE).
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 40_000 });
    await expect(alert).toHaveText("Cloud processing took too long. Please try again.");

    // The failure is actionable — both recovery paths are offered…
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
    // …and the spinner is gone — Risk #1's wording is literally "permanent spinner".
    await expect(page.getByText("Enhancing in the cloud…")).not.toBeVisible();
  });
});
