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
 * Fail-closed contract for {@link createPhotoJob} (Codex impl-review-phase-3 O1).
 * A broken signed-URL mint or row insert must THROW — never return a half-created
 * job (no usable upload URL, or a signed URL with no backing row). Stub admin: no
 * DB / no `astro:env`, so this runs in plain Vitest.
 */
function makeStubAdmin(opts: { signError?: boolean; insertError?: boolean }) {
  const createSignedUploadUrl = vi
    .fn()
    .mockResolvedValue(
      opts.signError
        ? { data: null, error: { message: "sign boom" } }
        : { data: { signedUrl: "https://signed.test/upload", token: "tok-1" }, error: null },
    );
  const insert = vi.fn().mockResolvedValue(opts.insertError ? { error: { message: "insert boom" } } : { error: null });
  const admin = {
    from: vi.fn(() => ({ insert })),
    storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
  };
  return { admin: admin as unknown as SupabaseClient, createSignedUploadUrl, insert };
}

const CREATE_CMD = {
  userId: "11111111-1111-1111-1111-111111111111",
  fileExtension: "jpg",
  mimeType: "image/jpeg",
} as const;

describe("createPhotoJob — fail-closed on infra errors", () => {
  it("throws (does not return a job) when the signed upload URL cannot be minted", async () => {
    const { admin, insert } = makeStubAdmin({ signError: true });
    await expect(createPhotoJob(admin, CREATE_CMD)).rejects.toThrow(/signed upload URL/);
    // Fail-closed: a failed sign must NOT proceed to insert a dangling row.
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws when the job-row insert fails", async () => {
    const { admin } = makeStubAdmin({ insertError: true });
    await expect(createPhotoJob(admin, CREATE_CMD)).rejects.toThrow(/insert job row/);
  });
});
