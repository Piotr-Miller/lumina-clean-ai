/**
 * north-star-cloud-result.spec.ts
 *
 * risk: context/foundation/test-plan.md §2 Risk #1 (happy half — the user gets
 *       a RESULT, not a permanent spinner) + Risk #6 (a result that committed
 *       must actually render: catch-up read, succeeded-wins, render guard).
 *       In the browser these are one inseparable flow: signed-in upload →
 *       Cloud AI submit → pipeline completes → the before/after slider
 *       renders WITHOUT any page reload, pushed by Supabase Realtime.
 * seed: tests/e2e/seed.spec.ts
 *
 * Stub boundary (research §Q1): Replicate — the only expensive,
 * non-deterministic external — is replaced at the network layer by a
 * svix-SIGNED `/callback` POST (helpers/replicate-stub.ts) whose `output`
 * points at a local fixture server (helpers/fixture-server.ts). Everything
 * else stays REAL: session auth (storageState), routing, the create-job API,
 * the signed PUT to storage, the jobs row, the Edge Function's signature
 * verification + result materialization (it fetches the output, uploads the
 * result object, deletes the source), storage RLS, the Realtime push, and the
 * browser's signed-URL read + image decode + render.
 *
 * Preconditions (hard-fail loudly, never silently skip — tests/env.ts
 * convention):
 *   - local stack + dev server running (tests/README.md);
 *     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY exported;
 *   - the Edge Function served with the seam env:
 *       npx supabase functions serve enhance --env-file supabase/functions/.env
 *     where the file carries REPLICATE_WEBHOOK_SIGNING_SECRET and
 *     E2E_ALLOWED_OUTPUT_ORIGIN=http://host.docker.internal:8787 (the fixture
 *     server's advertised origin; serve env is read at STARTUP — restart after
 *     edits). Port 8787 is pinned because that origin can't change per-test.
 *   - the DB webhook UNWIRED (the local/CI default): a submitted row staying
 *     `queued` is this spec's intended starting state — the service-role flip
 *     + signed callback stand in for the live pipeline.
 *
 * The admin (service-role) client is used ONLY for setup/cleanup and harness
 * sanity — every business assertion is on the rendered UI.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { serveFixture, type FixtureServer } from "./helpers/fixture-server";
import { ensureRealtimeReady } from "./helpers/realtime-ready";
import { callbackBody, flipToProcessing, resolveSigningSecret, signCallback } from "./helpers/replicate-stub";

// Unique run marker — the upload name derives from it so parallel runs never
// collide. The job row is correlated by the CAPTURED jobId only: the
// storageState account is shared with the other specs, so "all rows for the
// user" is never this test's to touch.
const RUN_ID = `e2e-northstar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Real RGB JPG (96×96+ — the smallest Bread-verified shape): the browser
// genuinely decodes the result bytes for the slider, and the repo's documented
// deliberate-FAILURE fixture is an RGBA PNG — so both the upload and the stub
// "model output" must be a real 3-channel JPG, no 1×1 stunt files.
const FIXTURE_PATH = "tests/e2e/fixtures/night-rgb.jpg";

// Inferred return type, matching the integration suite's idiom (jobs.rls.test.ts).
function adminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      "north-star-cloud-result.spec.ts needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (local stack — see tests/README.md).",
    );
  }
  return createClient(url, serviceRole);
}

test.describe("Risks #1+#6: the cloud result renders without refresh", () => {
  let jobId: string | null = null;
  let fixture: FixtureServer | null = null;

  // Cleanup — close the one-shot fixture server (idempotent), then delete
  // exactly what this test created: the captured job row and its storage
  // prefix (the result object on green; defensively whatever else is left).
  // The shared e2e user stays — it belongs to the setup project.
  test.afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
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

  test("signed-in upload → Cloud AI → stubbed pipeline completion → before/after slider renders without any reload", async ({
    page,
    request,
  }) => {
    const admin = adminClient();
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRole) {
      throw new Error(
        "north-star-cloud-result.spec.ts needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (local stack — see tests/README.md).",
      );
    }
    const functionUrl = `${supabaseUrl}/functions/v1/enhance`;

    // Preconditions, loudly: a missing signing secret or an unreachable
    // function router is a setup error, not a product failure.
    const secret = resolveSigningSecret();
    try {
      // Any response counts — the router's 404 for a bare GET IS the ready signal.
      await request.get(functionUrl);
    } catch {
      throw new Error(
        `north-star setup: Edge Function unreachable at ${functionUrl} — start it with: ` +
          "npx supabase functions serve enhance --env-file supabase/functions/.env " +
          "(env must include E2E_ALLOWED_OUTPUT_ORIGIN=http://host.docker.internal:8787).",
      );
    }

    // Validate + WARM the Realtime tenant before the browser subscribes: a
    // cold tenant (idle local stack, fresh CI boot) re-initializes on first
    // join and DROPS postgres_changes events that commit during that warmup —
    // the UI would sit on the spinner until a watchdog far outside this
    // spec's budget. Warm-path testing is the plan's explicit PR-gate choice.
    await ensureRealtimeReady({ url: supabaseUrl, key: serviceRole });

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
    // jobId is the correlation key for the flip, the callback, and cleanup.
    const createJobResponse = page.waitForResponse(
      (r) => r.url().includes("/api/enhance/cloud/create-job") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Process with Cloud AI" }).click();
    const createJob = await createJobResponse;
    expect(createJob.ok()).toBe(true);
    jobId = ((await createJob.json()) as { jobId: string }).jobId;

    // The waiting branch proves the submit fully settled (the source PUT
    // landed — submitCloudJob resolves only after it) and the Realtime
    // subscription effect for this jobId is mounted.
    await expect(page.getByText("Enhancing in the cloud…")).toBeVisible();

    // ——— Stand in for the live pipeline (the DB webhook stays unwired) ———
    // Flip queued → processing (+ prediction id) IMMEDIATELY after submit:
    // the callback's success path guards on `status = processing` AND the
    // prediction id, and the flip must land well inside the client's 30 s
    // queued watchdog (QUEUED_WATCHDOG_MS) or the UI fails the job first.
    const predictionId = await flipToProcessing(admin, jobId);

    // Serve the "model output": the Edge Function will REALLY fetch these
    // bytes from inside its container, upload them as the result object under
    // the user's prefix, and delete the source (the retention contract).
    fixture = await serveFixture({ filePath: FIXTURE_PATH });

    const body = callbackBody({ predictionId, status: "succeeded", output: fixture.url });
    const signed = signCallback({ secret, body });
    const callback = await request.post(`${functionUrl}/callback?jobId=${jobId}`, {
      headers: signed.headers,
      data: signed.rawBody,
    });
    if (callback.status() !== 200) {
      throw new Error(
        `north-star setup: signed callback rejected (HTTP ${String(callback.status())}): ${await callback.text()} — ` +
          "likely REPLICATE_WEBHOOK_SIGNING_SECRET mismatch between this run and the serving env.",
      );
    }

    // Harness sanity (admin, setup-only — the business assertions are the UI
    // below): /callback deliberately answers 200 even when it could NOT
    // materialize the result (that stops provider retries), so surface that
    // case as a loud setup error instead of an opaque UI-assertion failure.
    const { data: terminal } = await admin
      .from("jobs")
      .select("status, error_code, error_message")
      .eq("id", jobId)
      .maybeSingle<{ status: string; error_code: string | null; error_message: string | null }>();
    if (terminal?.status !== "succeeded") {
      throw new Error(
        `north-star setup: callback accepted but the row did not reach 'succeeded' (row: ${JSON.stringify(terminal)}). ` +
          "Likely causes: the serving env is missing E2E_ALLOWED_OUTPUT_ORIGIN (read at serve startup — restart serve), " +
          "or the fixture server is unreachable from the edge container (host.docker.internal).",
      );
    }

    // ——— The north-star assertions — NO reload between submit and here ———
    // The Realtime UPDATE (or the catch-up read, if the event won the race
    // against SUBSCRIBED — exactly Risk #6's defense) must drive the browser
    // to mint a signed read URL, decode the result, and swap the spinner for
    // the before/after slider. 15 s is a generous, state-based ceiling for
    // push + mint + decode; locally this lands in ~1–2 s.
    await expect(
      page.getByRole("slider", { name: "Before and after comparison — drag or use arrow keys to compare" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
    // The spinner resolved — Risk #1's wording is literally "permanent spinner".
    await expect(page.getByText("Enhancing in the cloud…")).not.toBeVisible();
  });
});
