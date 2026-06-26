/**
 * chroma-postpass-on.spec.ts
 *
 * Phase 4 of `chroma-postpass-enable`: exercise the REAL client-side chroma
 * post-pass (the Canvas `createImageBitmap` → `denoiseChroma` → JPEG re-encode
 * adapter) end-to-end in a real browser with the flag forced ON — the ON path
 * the unit tests can't reach (they inject a stub) and that CI otherwise never
 * runs (the flag defaults OFF).
 *
 * Same stubbed cloud flow as north-star-cloud-result.spec.ts (Replicate replaced
 * by a svix-signed `/callback` → local fixture server; everything else real).
 * The ONE delta: the page is opened with `?chroma=1`, which the enhance page
 * honors ONLY because the LOCAL/CI-ONLY seam `E2E_CHROMA_OVERRIDE` is set in the
 * served app's env (index.astro). On success the post-pass produces a re-encoded
 * JPEG fed to BOTH slider and download via a single `blob:` object URL — so the
 * processed path is proven by the after-image src being a `blob:` URL (the OFF
 * path serves the raw signed storage URL instead).
 *
 * Preconditions (hard-fail loudly — same as north-star, plus the seam):
 *   - local stack + the served enhance app on workerd (`npm run test:e2e:serve`);
 *   - the app server env (`.dev.vars`) carries `E2E_CHROMA_OVERRIDE=true` — without
 *     it `?chroma=1` is ignored and this spec fails with a clear setup error;
 *   - the Edge Function served with the seam env (REPLICATE_WEBHOOK_SIGNING_SECRET
 *     + E2E_ALLOWED_OUTPUT_ORIGIN=http://host.docker.internal:8787).
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { adminClient as sharedAdminClient, supabaseEnv } from "./helpers/env";
import { serveFixture, type FixtureServer } from "./helpers/fixture-server";
import { ensureRealtimeReady } from "./helpers/realtime-ready";
import { callbackBody, flipToProcessing, resolveSigningSecret, signCallback } from "./helpers/replicate-stub";

const RUN_ID = `e2e-chroma-on-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const FIXTURE_PATH = "tests/e2e/fixtures/night-rgb.jpg";

function adminClient() {
  return sharedAdminClient("chroma-postpass-on.spec.ts");
}

test.describe("Phase 4: flag ON → the real chroma post-pass runs and serves a processed result", () => {
  let jobId: string | null = null;
  let fixture: FixtureServer | null = null;

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

  test("signed-in upload → Cloud AI (chroma ON via ?chroma=1) → before/after renders a processed blob: result", async ({
    page,
    request,
  }) => {
    const admin = adminClient();
    const { url: supabaseUrl, serviceRole } = supabaseEnv("chroma-postpass-on.spec.ts");
    const functionUrl = `${supabaseUrl}/functions/v1/enhance`;

    const secret = resolveSigningSecret();
    try {
      await request.get(functionUrl);
    } catch {
      throw new Error(
        `chroma-postpass-on setup: Edge Function unreachable at ${functionUrl} — start it with: ` +
          "npx supabase functions serve enhance --env-file supabase/functions/.env.",
      );
    }

    await ensureRealtimeReady({ url: supabaseUrl, key: serviceRole });

    // Opt into the post-pass for THIS spec only (seam: E2E_CHROMA_OVERRIDE must be
    // set in the served app's env, else the param is ignored — checked below).
    await page.goto("/?chroma=1");
    await expect(page.getByRole("heading", { name: "Fix your night photos" })).toBeVisible();

    const jpgBytes = readFileSync(FIXTURE_PATH);
    await expect(async () => {
      await page.getByLabel("Upload an image").setInputFiles({
        name: `${RUN_ID}.jpg`,
        mimeType: "image/jpeg",
        buffer: jpgBytes,
      });
      await expect(page.getByRole("button", { name: "Enhance" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    await page.getByRole("group", { name: "Processing engine" }).getByRole("button", { name: "Cloud AI" }).click();

    const createJobResponse = page.waitForResponse(
      (r) => r.url().includes("/api/enhance/cloud/create-job") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Process with Cloud AI" }).click();
    const createJob = await createJobResponse;
    expect(createJob.ok()).toBe(true);
    jobId = ((await createJob.json()) as { jobId: string }).jobId;

    await expect(page.getByText("Enhancing in the cloud…")).toBeVisible();

    const predictionId = await flipToProcessing(admin, jobId);
    fixture = await serveFixture({ filePath: FIXTURE_PATH });
    const body = callbackBody({ predictionId, status: "succeeded", output: fixture.url });
    const signed = signCallback({ secret, body });
    const callback = await request.post(`${functionUrl}/callback?jobId=${jobId}`, {
      headers: signed.headers,
      data: signed.rawBody,
    });
    if (callback.status() !== 200) {
      throw new Error(
        `chroma-postpass-on setup: signed callback rejected (HTTP ${String(callback.status())}): ${await callback.text()}.`,
      );
    }

    // The result renders without reload (same north-star guarantee).
    const afterImage = page.getByRole("img", { name: "Your photo — enhanced" });
    await expect(afterImage).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();

    // The processed-path proof: with the post-pass ON the after-image is a fresh
    // `blob:` object URL (minted from the re-encoded JPEG), NOT the raw signed
    // storage URL the OFF path serves. A non-blob src means the seam env wasn't
    // honored — surface that as a setup error, not an opaque assertion failure.
    const afterSrc = (await afterImage.getAttribute("src")) ?? "";
    if (!afterSrc.startsWith("blob:")) {
      throw new Error(
        `chroma-postpass-on setup: after-image src is "${afterSrc.slice(0, 40)}…", not a blob: URL — the post-pass did ` +
          "not run. Ensure E2E_CHROMA_OVERRIDE=true is in the served app's .dev.vars (read at server start).",
      );
    }
    expect(afterSrc).toMatch(/^blob:/);
    await expect(page.getByText("Enhancing in the cloud…")).not.toBeVisible();

    // Download works end-to-end: clicking the button fires a real browser download
    // whose suggested name is the derived `luminaclean-<base>.jpg` (chroma ON ⇒ JPEG
    // re-encode ⇒ .jpg). The base comes from the uploaded `e2e-chroma-on-…` filename.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^luminaclean-e2e-chroma-on-.+\.jpg$/);
    expect(await download.failure()).toBeNull();
  });
});
