import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPhotoJob, isOverDailyCap } from "@/lib/services/photo-job.service";

/**
 * Pure unit tests for the S-05 cap decision. No DB / no `astro:env` import,
 * so this runs in plain Vitest (and CI). The count-predicate itself
 * (`countCloudJobsToday`) is exercised against a live local Supabase in
 * tests/jobs.rls.test.ts — it can't be meaningfully faked here.
 */
describe("isOverDailyCap", () => {
  it("rejects the first request when cap is 0 (kill-switch)", () => {
    expect(isOverDailyCap(0, 0)).toBe(true);
  });

  it("allows the last slot below the cap", () => {
    expect(isOverDailyCap(49, 50)).toBe(false);
  });

  it("rejects once the count reaches the cap", () => {
    expect(isOverDailyCap(50, 50)).toBe(true);
  });

  it("rejects when the count is above the cap", () => {
    expect(isOverDailyCap(51, 50)).toBe(true);
  });
});

/**
 * Fail-closed contract for {@link createPhotoJob} (Codex impl-review-phase-3 O1),
 * now over the FR-014 guarded write. A broken signed-URL mint or a faulting
 * admission RPC must THROW — never return a half-created job (no usable upload
 * URL, or a signed URL with no backing row). A *declined* admission is different:
 * it is a normal, typed outcome and returns `null`. Stub admin: no DB / no
 * `astro:env`, so this runs in plain Vitest.
 */
function makeStubAdmin(opts: { signError?: boolean; admitError?: boolean; admitted?: boolean | null } = {}) {
  const createSignedUploadUrl = vi
    .fn()
    .mockResolvedValue(
      opts.signError
        ? { data: null, error: { message: "sign boom" } }
        : { data: { signedUrl: "https://signed.test/upload", token: "tok-1" }, error: null },
    );
  // The admission RPC replaced the raw insert: `{ data: true }` admits,
  // `{ data: false }` declines, a non-null `error` is a fault.
  const rpc = vi
    .fn()
    .mockResolvedValue(
      opts.admitError
        ? { data: null, error: { message: "rpc boom" } }
        : { data: "admitted" in opts ? opts.admitted : true, error: null },
    );
  const admin = {
    rpc,
    storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
  };
  return { admin: admin as unknown as SupabaseClient, createSignedUploadUrl, rpc };
}

const CREATE_CMD = {
  userId: "11111111-1111-1111-1111-111111111111",
  fileExtension: "jpg",
  mimeType: "image/jpeg",
  // Required since the guarded write owns admission — an omitted cap would be
  // an uncapped admission, which is the bypass the required field closes.
  cap: 3,
} as const;

describe("createPhotoJob — fail-closed on infra errors", () => {
  it("throws (does not return a job) when the signed upload URL cannot be minted", async () => {
    const { admin, rpc } = makeStubAdmin({ signError: true });
    await expect(createPhotoJob(admin, CREATE_CMD)).rejects.toThrow(/signed upload URL/);
    // Fail-closed: a failed sign must NOT proceed to admit a dangling row.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws when the guarded admission RPC faults", async () => {
    const { admin } = makeStubAdmin({ admitError: true });
    // An RPC *error* is a fault, not a rejection — it must not be reported to the
    // caller as a cap decline (which would render as a 429 the user cannot act on).
    await expect(createPhotoJob(admin, CREATE_CMD)).rejects.toThrow(/guarded admission failed/);
  });
});

describe("createPhotoJob — guarded admission outcome", () => {
  it("returns the job on an admitted write", async () => {
    const { admin, rpc } = makeStubAdmin({ admitted: true });

    const res = await createPhotoJob(admin, CREATE_CMD);

    expect(res).not.toBeNull();
    expect(res?.uploadUrl).toBe("https://signed.test/upload");
    expect(res?.uploadToken).toBe("tok-1");
    expect(res?.sourcePath).toBe(`${CREATE_CMD.userId}/${res?.jobId}/source.jpg`);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns null (does not throw) when the guarded write declines admission", async () => {
    const { admin, rpc } = makeStubAdmin({ admitted: false });

    // The "someone else won" shape claimJobForProcessing already uses. The route
    // maps it to the same 429 as the pre-check; see cloud-create-job.handler.test.
    await expect(createPhotoJob(admin, CREATE_CMD)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a non-boolean RPC result (treats it as declined, not admitted)", async () => {
    // `admit_cloud_job` cannot currently return NULL, but only an explicit `true`
    // may hand back a job — anything else must not be reported as a created row.
    const { admin } = makeStubAdmin({ admitted: null });

    await expect(createPhotoJob(admin, CREATE_CMD)).resolves.toBeNull();
  });

  it("passes the cap, the server-derived path and the S-12 Bread params to the RPC", async () => {
    const { admin, rpc } = makeStubAdmin({ admitted: true });

    const res = await createPhotoJob(admin, { ...CREATE_CMD, cap: 7, gamma: 1.1, strength: 0.05 });

    expect(rpc).toHaveBeenCalledWith("admit_cloud_job", {
      p_job_id: res?.jobId,
      p_user_id: CREATE_CMD.userId,
      p_source_path: `${CREATE_CMD.userId}/${res?.jobId}/source.jpg`,
      p_gamma: 1.1,
      p_strength: 0.05,
      // The cap reaches the database gate — a dropped/defaulted cap here would
      // admit uncapped while every other assertion still passed.
      p_cap: 7,
    });
  });

  it("sends null gamma/strength to the RPC when the command omits them", async () => {
    const { admin, rpc } = makeStubAdmin({ admitted: true });

    await createPhotoJob(admin, CREATE_CMD);

    expect(rpc).toHaveBeenCalledWith("admit_cloud_job", expect.objectContaining({ p_gamma: null, p_strength: null }));
  });
});
