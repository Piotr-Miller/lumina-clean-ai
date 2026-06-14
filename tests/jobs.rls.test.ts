import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  countCloudJobsToday,
  createPhotoJob,
  markJobSucceeded,
  sweepAbandonedSourcesGlobally,
} from "@/lib/services/photo-job.service";
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
    // row, so advance past `queued` first (the /start step does this in prod).
    await supabaseAdmin.from("jobs").update({ status: "processing" }).eq("id", created.jobId);

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
      .select("status, result_path, replicate_prediction_id, completed_at")
      .eq("id", created.jobId)
      .single();
    expect(readError).toBeNull();
    expect(row?.status).toBe("succeeded");
    expect(row?.result_path).toBe(resultPath);
    expect(row?.replicate_prediction_id).toBe("test-prediction-id");
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

  it("flips a stale non-terminal job to failed('abandoned'), globally (no owner scope)", async () => {
    const user = await makeUser("reap-flip");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Seed a processing row backdated 2h, with a source_path that was never
    // uploaded (so the delete pass — which reads real storage — leaves it alone).
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("jobs")
      .insert({
        user_id: user.id,
        status: "processing",
        source_path: `${user.id}/never-uploaded/source.jpg`,
        created_at: twoHoursAgo,
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    const jobId = (inserted as { id: string }).id;

    // staleMs 1h → the 2h-old row is reclaimed; retentionMs 1yr → delete pass no-op.
    const result = await sweepAbandonedSourcesGlobally(supabaseAdmin, {
      staleMs: 60 * 60 * 1000,
      retentionMs: ONE_YEAR_MS,
    });
    expect(result.flipped).toBeGreaterThanOrEqual(1);

    const { data: row } = await supabaseAdmin
      .from("jobs")
      .select("status, error_code, completed_at")
      .eq("id", jobId)
      .single();
    expect(row?.status).toBe("failed");
    expect(row?.error_code).toBe("abandoned");
    expect(row?.completed_at).not.toBeNull();
  });
});
