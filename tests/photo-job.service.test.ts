import { describe, expect, it } from "vitest";
import { isOverDailyCap } from "@/lib/services/photo-job.service";

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
