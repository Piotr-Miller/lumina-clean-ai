import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  claimJobForProcessing,
  countCloudJobsToday,
  createPhotoJob,
  markJobSucceeded,
  recordJobPrediction,
  sweepAbandonedSourcesGlobally,
} from "@/lib/services/photo-job.service";
import { BREAD_VERSION } from "@/lib/services/bread";
import { failTimedOutJobResponse } from "@/lib/services/timeout.handler";
import { supabaseAdmin, supabaseAnonKey, supabaseUrl } from "./env";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";

const PHOTOS_BUCKET = "photos";

/**
 * A minimal but real JPG payload (SOI + APP0 + EOI). Enough bytes that
 * Storage accepts the upload as a real object; not a parseable image.
 */
function tinyJpegPayload(): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00, // APP0
    0xff,
    0xd9, // EOI
  ]);
}

describe("public.jobs RLS + photo-job service", () => {
  const created: TestUser[] = [];

  beforeEach(() => {
    created.length = 0;
  });

  afterEach(async () => {
    for (const u of created) {
      await deleteTestUser(u.id);
    }
  });

  async function makeUser(prefix?: string): Promise<TestUser> {
    const u = await createTestUser(prefix);
    created.push(u);
    return u;
  }

  it("user A cannot SELECT user B's job rows", async () => {
    const a = await makeUser("rls-a");
    const b = await makeUser("rls-b");

    // Admin inserts a row owned by user A.
    const { error: insertError } = await supabaseAdmin.from("jobs").insert({
      user_id: a.id,
      status: "queued",
      source_path: `${a.id}/fake-job/source.jpg`,
    });
    expect(insertError).toBeNull();

    // User B selects: should see zero rows (RLS scopes by auth.uid()).
    const { data: bRows, error: bError } = await b.client.from("jobs").select("*");
    expect(bError).toBeNull();
    expect(bRows).toEqual([]);

    // Sanity: user A sees their own row.
    const { data: aRows, error: aError } = await a.client.from("jobs").select("*");
    expect(aError).toBeNull();
    expect(aRows).toHaveLength(1);
  });

  it("anon cannot INSERT a job row", async () => {
    const anon = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    const { error } = await anon.from("jobs").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      status: "queued",
      source_path: "anon/none.jpg",
    });
    // After the explicit revoke from anon, the grant layer denies before
    // RLS evaluates — Postgres returns SQLSTATE 42501 (insufficient_privilege).
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("authenticated users cannot INSERT job rows or forge server-owned telemetry", async () => {
    const user = await makeUser("insert-denied");
    const { error } = await user.client.from("jobs").insert({
      user_id: user.id,
      status: "queued",
      source_path: `${user.id}/forged/source.jpg`,
      model_version: "attacker-controlled",
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("anon cannot read Storage objects", async () => {
    const user = await makeUser("storage-anon");

    // Admin uploads an object the anon then attempts to read.
    const sourcePath = `${user.id}/fake-job/source.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(PHOTOS_BUCKET)
      .upload(sourcePath, tinyJpegPayload(), { contentType: "image/jpeg" });
    expect(uploadError).toBeNull();

    const anon = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await anon.storage.from(PHOTOS_BUCKET).download(sourcePath);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("signed URL is one-shot", async () => {
    const user = await makeUser("oneshot");

    const sourcePath = `${user.id}/oneshot-job/source.jpg`;
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(PHOTOS_BUCKET)
      .createSignedUploadUrl(sourcePath);
    expect(signError).toBeNull();
    if (!signed) throw new Error("createSignedUploadUrl returned no data");

    const payload = tinyJpegPayload();

    // First PUT succeeds.
    const firstPut = await fetch(signed.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: payload as BodyInit,
    });
    expect(firstPut.status).toBeGreaterThanOrEqual(200);
    expect(firstPut.status).toBeLessThan(300);

    // Second PUT with the same token fails.
    const secondPut = await fetch(signed.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: payload as BodyInit,
    });
    expect(secondPut.status).toBeGreaterThanOrEqual(400);
  });

  it("createPhotoJob inserts a queued row and a usable signed URL", async () => {
    const user = await makeUser("create");

    const res = await createPhotoJob(supabaseAdmin, {
      userId: user.id,
      fileExtension: "jpg",
      mimeType: "image/jpeg",
    });

    expect(res.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.sourcePath).toBe(`${user.id}/${res.jobId}/source.jpg`);
    expect(res.uploadToken).toBeTypeOf("string");

    // Row exists and is queued.
    const { data: row, error: readError } = await supabaseAdmin
      .from("jobs")
      .select("status, source_path")
      .eq("id", res.jobId)
      .single();
    expect(readError).toBeNull();
    expect(row?.status).toBe("queued");
    expect(row?.source_path).toBe(res.sourcePath);

    // Signed URL is actually usable.
    const put = await fetch(res.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: tinyJpegPayload() as BodyInit,
    });
    expect(put.status).toBeGreaterThanOrEqual(200);
    expect(put.status).toBeLessThan(300);
  });

  it("createPhotoJob persists per-job Bread params; omitting them leaves the columns null (S-12)", async () => {
    const user = await makeUser("bread-params");

    // With params: the row carries the chosen gamma/strength.
    const withParams = await createPhotoJob(supabaseAdmin, {
      userId: user.id,
      fileExtension: "jpg",
      mimeType: "image/jpeg",
      gamma: 1.1,
      strength: 0.05,
    });
    const { data: rowA, error: errA } = await supabaseAdmin
      .from("jobs")
      .select("gamma, strength")
      .eq("id", withParams.jobId)
      .single();
    expect(errA).toBeNull();
    expect(rowA?.gamma).toBe(1.1);
    expect(rowA?.strength).toBe(0.05);

    // Without params: the columns stay null (Edge Function falls back to defaults).
    const noParams = await createPhotoJob(supabaseAdmin, {
      userId: user.id,
      fileExtension: "jpg",
      mimeType: "image/jpeg",
    });
    const { data: rowB, error: errB } = await supabaseAdmin
      .from("jobs")
      .select("gamma, strength")
      .eq("id", noParams.jobId)
      .single();
    expect(errB).toBeNull();
    expect(rowB?.gamma).toBeNull();
    expect(rowB?.strength).toBeNull();
  });

  it("markJobSucceeded updates the row and deletes the source object", async () => {
    const user = await makeUser("succeed");

    // Set up: create the job and upload the source via the helper's URL.
    const created = await createPhotoJob(supabaseAdmin, {
      userId: user.id,
      fileExtension: "jpg",
      mimeType: "image/jpeg",
    });
    const put = await fetch(created.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: tinyJpegPayload() as BodyInit,
    });
    expect(put.status).toBeGreaterThanOrEqual(200);
    expect(put.status).toBeLessThan(300);

    // Confirm the source object exists before markJobSucceeded.
    const { data: before } = await supabaseAdmin.storage.from(PHOTOS_BUCKET).list(`${user.id}/${created.jobId}`);
    expect(before?.some((f) => f.name === "source.jpg")).toBe(true);

    // markJobSucceeded is status-guarded (F9): it only flips a live `processing`
    // row, so use the same claim + provider-metadata sequence as /start.
    const claimed = await claimJobForProcessing(supabaseAdmin, created.jobId);
    expect(claimed?.id).toBe(created.jobId);
    const recorded = await recordJobPrediction(supabaseAdmin, {
      jobId: created.jobId,
      replicatePredictionId: "test-prediction-id",
      modelVersion: BREAD_VERSION,
    });
    expect(recorded).toBe(true);

    // Act.
    const resultPath = `${user.id}/${created.jobId}/result.jpg`;
    const flipped = await markJobSucceeded(supabaseAdmin, {
      jobId: created.jobId,
      resultPath,
      replicatePredictionId: "test-prediction-id",
    });
    expect(flipped).toBe(true);

    // Row state.
    const { data: row, error: readError } = await supabaseAdmin
      .from("jobs")
      .select("status, result_path, replicate_prediction_id, model_version, completed_at")
      .eq("id", created.jobId)
      .single();
    expect(readError).toBeNull();
    expect(row?.status).toBe("succeeded");
    expect(row?.result_path).toBe(resultPath);
    expect(row?.replicate_prediction_id).toBe("test-prediction-id");
    // model_version was written by recordJobPrediction and survives markJobSucceeded.
    expect(row?.model_version).toBe(BREAD_VERSION);
    expect(row?.completed_at).not.toBeNull();

    // Source object is gone.
    const { data: after } = await supabaseAdmin.storage.from(PHOTOS_BUCKET).list(`${user.id}/${created.jobId}`);
    expect(after?.some((f) => f.name === "source.jpg")).toBe(false);
  });

  it("markJobSucceeded no-ops on a non-processing row (F9 guard blocks resurrection)", async () => {
    const user = await makeUser("f9guard");

    const created = await createPhotoJob(supabaseAdmin, {
      userId: user.id,
      fileExtension: "jpg",
      mimeType: "image/jpeg",
    });
    const put = await fetch(created.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: tinyJpegPayload() as BodyInit,
    });
    expect(put.status).toBeGreaterThanOrEqual(200);
    expect(put.status).toBeLessThan(300);

    // Simulate the client watchdog winning the race: the row is already `failed`
    // when /callback's markJobSucceeded runs. The F9 guard (.eq status processing)
    // must NOT resurrect it to succeeded, and must NOT delete the source.
    await supabaseAdmin.from("jobs").update({ status: "failed", error_code: "timeout" }).eq("id", created.jobId);

    const flipped = await markJobSucceeded(supabaseAdmin, {
      jobId: created.jobId,
      resultPath: `${user.id}/${created.jobId}/result.jpg`,
      replicatePredictionId: "test-prediction-id",
    });
    expect(flipped).toBe(false);

    // Row stays failed; success fields are NOT written.
    const { data: row } = await supabaseAdmin
      .from("jobs")
      .select("status, result_path")
      .eq("id", created.jobId)
      .single();
    expect(row?.status).toBe("failed");
    expect(row?.result_path).toBeNull();

    // Source object is untouched (the winning failed-path delete owns it, not this no-op).
    const { data: after } = await supabaseAdmin.storage.from(PHOTOS_BUCKET).list(`${user.id}/${created.jobId}`);
    expect(after?.some((f) => f.name === "source.jpg")).toBe(true);
  });

  it("allows exactly one concurrent claim and one write-once prediction identity", async () => {
    const user = await makeUser("claim-race");
    const created = await createPhotoJob(supabaseAdmin, {
      userId: user.id,
      fileExtension: "jpg",
      mimeType: "image/jpeg",
    });

    const claims = await Promise.all([
      claimJobForProcessing(supabaseAdmin, created.jobId),
      claimJobForProcessing(supabaseAdmin, created.jobId),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);

    const writes = await Promise.all([
      recordJobPrediction(supabaseAdmin, {
        jobId: created.jobId,
        replicatePredictionId: "pred-a",
        modelVersion: "model-a",
      }),
      recordJobPrediction(supabaseAdmin, {
        jobId: created.jobId,
        replicatePredictionId: "pred-b",
        modelVersion: "model-b",
      }),
    ]);
    expect(writes.filter(Boolean)).toHaveLength(1);

    const { data: row, error } = (await supabaseAdmin
      .from("jobs")
      .select("status, replicate_prediction_id, model_version")
      .eq("id", created.jobId)
      .single()) as {
      data: {
        status: string;
        replicate_prediction_id: string | null;
        model_version: string | null;
      } | null;
      error: { message: string } | null;
    };
    expect(error).toBeNull();
    expect(row?.status).toBe("processing");
    expect([
      { replicate_prediction_id: "pred-a", model_version: "model-a" },
      { replicate_prediction_id: "pred-b", model_version: "model-b" },
    ]).toContainEqual({
      replicate_prediction_id: row?.replicate_prediction_id,
      model_version: row?.model_version,
    });

    const overwrite = await recordJobPrediction(supabaseAdmin, {
      jobId: created.jobId,
      replicatePredictionId: "pred-overwrite",
      modelVersion: "model-overwrite",
    });
    expect(overwrite).toBe(false);
  });
});

describe("countCloudJobsToday (S-05 global daily-cap count)", () => {
  const created: TestUser[] = [];

  afterEach(async () => {
    for (const u of created) {
      await deleteTestUser(u.id);
    }
    created.length = 0;
  });

  async function makeUser(prefix?: string): Promise<TestUser> {
    const u = await createTestUser(prefix);
    created.push(u);
    return u;
  }

  // Direct admin insert of a job row with a controlled status / prediction-id /
  // created_at — bypasses the storage path so we can assert the count predicate
  // in isolation. source_path is NOT NULL, so a placeholder is supplied.
  async function seedJob(
    userId: string,
    status: "queued" | "processing" | "succeeded" | "failed",
    replicatePredictionId: string | null,
    createdAtIso?: string,
  ): Promise<void> {
    const row: Record<string, unknown> = {
      user_id: userId,
      status,
      source_path: `${userId}/seed/source.jpg`,
      replicate_prediction_id: replicatePredictionId,
    };
    if (createdAtIso) row.created_at = createdAtIso;
    const { error } = await supabaseAdmin.from("jobs").insert(row);
    expect(error).toBeNull();
  }

  it("counts only billable jobs created today, excluding pre-model failures and earlier days", async () => {
    const user = await makeUser("cap-count");

    // The count is global; measure the delta so pre-existing rows don't break it.
    const before = await countCloudJobsToday(supabaseAdmin);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await seedJob(user.id, "queued", null); // billable (in flight)
    await seedJob(user.id, "processing", "pred-a"); // billable (model started)
    await seedJob(user.id, "succeeded", "pred-b"); // billable (completed)
    await seedJob(user.id, "failed", "pred-c"); // billable (reached model, then failed)
    await seedJob(user.id, "failed", null); // EXCLUDED (pre-model failure)
    await seedJob(user.id, "queued", null, yesterday); // EXCLUDED (earlier UTC day)

    const after = await countCloudJobsToday(supabaseAdmin);
    expect(after - before).toBe(4);
  });

  it("returns the baseline (delta 0) when a user has only pre-model failures today", async () => {
    const user = await makeUser("cap-count-zero");
    const before = await countCloudJobsToday(supabaseAdmin);

    await seedJob(user.id, "failed", null);
    await seedJob(user.id, "failed", null);

    const after = await countCloudJobsToday(supabaseAdmin);
    expect(after - before).toBe(0);
  });
});

describe("sweepAbandonedSourcesGlobally (Risk #5 retention reaper, real storage)", () => {
  const created: TestUser[] = [];

  // Threshold large enough to make a pass a no-op for fresh test artifacts, so
  // each test exercises ONE pass in isolation (the reaper is global, no scoping):
  //  - disable the flip pass with a far-past stale threshold (nothing is that old);
  //  - disable the delete pass with a far-past retention (no fresh source qualifies).
  // 1 year in ms; retentionMs/1000 stays within the RPC's int4 `older_than_seconds`.
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

  afterEach(async () => {
    for (const u of created) {
      await deleteTestUser(u.id);
    }
    created.length = 0;
  });

  async function makeUser(prefix?: string): Promise<TestUser> {
    const u = await createTestUser(prefix);
    created.push(u);
    return u;
  }

  async function uploadSource(userId: string): Promise<{ jobId: string }> {
    const job = await createPhotoJob(supabaseAdmin, { userId, fileExtension: "jpg", mimeType: "image/jpeg" });
    const put = await fetch(job.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: tinyJpegPayload() as BodyInit,
    });
    expect(put.status).toBeGreaterThanOrEqual(200);
    expect(put.status).toBeLessThan(300);
    return { jobId: job.jobId };
  }

  async function sourceExists(userId: string, jobId: string): Promise<boolean> {
    const { data } = await supabaseAdmin.storage.from(PHOTOS_BUCKET).list(`${userId}/${jobId}`);
    return data?.some((f) => f.name === "source.jpg") ?? false;
  }

  it("deletes a lingering source object (retentionMs:0), flip pass disabled", async () => {
    const user = await makeUser("reap-del");
    const { jobId } = await uploadSource(user.id);
    expect(await sourceExists(user.id, jobId)).toBe(true);

    // retentionMs:0 → every existing source is past-window; staleMs far past → no flip.
    const result = await sweepAbandonedSourcesGlobally(supabaseAdmin, { retentionMs: 0, staleMs: ONE_YEAR_MS });

    expect(await sourceExists(user.id, jobId)).toBe(false);
    expect(result.deleted).toBeGreaterThanOrEqual(1);
  });

  it("leaves a fresh source object in place when retentionMs exceeds its age", async () => {
    const user = await makeUser("reap-keep");
    const { jobId } = await uploadSource(user.id);

    // 1-year retention → a seconds-old source is NOT yet an orphan; flip disabled.
    await sweepAbandonedSourcesGlobally(supabaseAdmin, { retentionMs: ONE_YEAR_MS, staleMs: ONE_YEAR_MS });

    expect(await sourceExists(user.id, jobId)).toBe(true);
  });

  it("flips a stale non-terminal job to failed('abandoned') but SPARES a fresh one (don't reap live jobs)", async () => {
    const user = await makeUser("reap-flip");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Seed two processing rows with source_paths that were never uploaded (so the
    // delete pass — which reads real storage — leaves them alone): one backdated
    // 2h (must be reclaimed) and one created NOW (an in-flight job that must NOT be).
    const { data: staleRow, error: staleErr } = await supabaseAdmin
      .from("jobs")
      .insert({
        user_id: user.id,
        status: "processing",
        source_path: `${user.id}/never-uploaded-stale/source.jpg`,
        created_at: twoHoursAgo,
      })
      .select("id")
      .single();
    expect(staleErr).toBeNull();
    const staleJobId = (staleRow as { id: string }).id;

    const { data: freshRow, error: freshErr } = await supabaseAdmin
      .from("jobs")
      .insert({
        user_id: user.id,
        status: "processing",
        source_path: `${user.id}/never-uploaded-fresh/source.jpg`,
      })
      .select("id")
      .single();
    expect(freshErr).toBeNull();
    const freshJobId = (freshRow as { id: string }).id;

    // staleMs 1h → only the 2h-old row is past the threshold; retentionMs 1yr → delete pass no-op.
    const result = await sweepAbandonedSourcesGlobally(supabaseAdmin, {
      staleMs: 60 * 60 * 1000,
      retentionMs: ONE_YEAR_MS,
    });
    expect(result.flipped).toBeGreaterThanOrEqual(1);

    // The stale row is reclaimed …
    const { data: stale } = await supabaseAdmin
      .from("jobs")
      .select("status, error_code, completed_at")
      .eq("id", staleJobId)
      .single();
    expect(stale?.status).toBe("failed");
    expect(stale?.error_code).toBe("abandoned");
    expect(stale?.completed_at).not.toBeNull();

    // … but the fresh, still-in-flight row is left untouched (pins the threshold
    // direction: a `-`→`+` regression would reap every live job).
    const { data: fresh } = await supabaseAdmin.from("jobs").select("status").eq("id", freshJobId).single();
    expect(fresh?.status).toBe("processing");
  });
});

/**
 * Risk #4 (IDOR) at the route-core boundary. The timeout route is the only
 * user-facing endpoint that accepts a client-supplied `jobId`. We drive its
 * env-free core (`failTimedOutJobResponse`) with the real service-role admin
 * client and two real users: the route MUST resolve ownership from the session
 * user (never the body), so user B supplying user A's `jobId` flips nothing and
 * leaves A's row untouched. Helper-in-isolation is already pinned in
 * photo-job-helpers.test.ts; this proves the ROUTE picks the owner-scoped helper
 * against a real RLS-bypassing write (service-role bypasses RLS, so only a real
 * row proves the `.eq("user_id")` filter has teeth).
 *
 * A self-contained top-level describe with its own makeUser/created/afterEach,
 * matching the sibling-describe pattern in this file (each block owns its
 * teardown so test users + storage never leak across runs).
 */
describe("POST /api/enhance/cloud/timeout — cross-user IDOR (route boundary)", () => {
  const created: TestUser[] = [];

  afterEach(async () => {
    for (const u of created) {
      await deleteTestUser(u.id);
    }
    created.length = 0;
  });

  async function makeUser(prefix?: string): Promise<TestUser> {
    const u = await createTestUser(prefix);
    created.push(u);
    return u;
  }

  function timeoutRequest(jobId: string): Request {
    return new Request("https://example.test/api/enhance/cloud/timeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
  }

  async function insertProcessingJob(ownerId: string): Promise<string> {
    const jobId = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("jobs").insert({
      id: jobId,
      user_id: ownerId,
      status: "processing",
      source_path: `${ownerId}/${jobId}/source.jpg`,
    });
    expect(error).toBeNull();
    return jobId;
  }

  it("user B supplying user A's jobId flips nothing and leaves A's row untouched", async () => {
    const a = await makeUser("idor-a");
    const b = await makeUser("idor-b");
    const jobId = await insertProcessingJob(a.id);

    // B (authenticated) targets A's job via the route core.
    const res = await failTimedOutJobResponse({
      user: { id: b.id },
      request: timeoutRequest(jobId),
      admin: supabaseAdmin,
    });

    // Live contract: a foreign/non-matching jobId is a silent no-op, not 403/404.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flipped: false });

    // A's row is provably unmutated.
    const { data: row, error } = await supabaseAdmin
      .from("jobs")
      .select("status, error_code, completed_at")
      .eq("id", jobId)
      .single();
    expect(error).toBeNull();
    expect(row?.status).toBe("processing");
    expect(row?.error_code).toBeNull();
    expect(row?.completed_at).toBeNull();
  });

  it("user A timing out their OWN job flips it to failed (positive control)", async () => {
    const a = await makeUser("idor-owner");
    const jobId = await insertProcessingJob(a.id);

    // Owner's own call must succeed — proves the test isn't trivially green
    // (the no-op above is genuine cross-user denial, not a broken route).
    // NB: the flip fires deleteJobSource on a never-uploaded source object; that
    // is a benign best-effort no-op (a console.warn), not a failure.
    const res = await failTimedOutJobResponse({
      user: { id: a.id },
      request: timeoutRequest(jobId),
      admin: supabaseAdmin,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flipped: true });

    const { data: row, error } = await supabaseAdmin.from("jobs").select("status, error_code").eq("id", jobId).single();
    expect(error).toBeNull();
    expect(row?.status).toBe("failed");
    expect(row?.error_code).toBe("timeout");
  });
});
