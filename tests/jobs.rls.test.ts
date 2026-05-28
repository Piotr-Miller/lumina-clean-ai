import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createPhotoJob, markJobSucceeded } from "@/lib/services/photo-job.service";
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
    // Either RLS denial (42501) or grant-layer denial — both are correct.
    expect(error).not.toBeNull();
    expect(error?.code === "42501" || error?.code === "401").toBe(true);
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

    // Act.
    const resultPath = `${user.id}/${created.jobId}/result.jpg`;
    await markJobSucceeded(supabaseAdmin, {
      jobId: created.jobId,
      resultPath,
      replicatePredictionId: "test-prediction-id",
    });

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
});
