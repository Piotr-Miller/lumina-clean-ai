import { describe, expect, it } from "vitest";
import { QUEUED_WATCHDOG_MS, PROCESSING_WATCHDOG_MS, SLOW_HINT_MS } from "@/components/hooks/useCloudJob";

/**
 * Regression guard for the cloud-job timing budgets (S-09). Asserts the design
 * INVARIANTS — the relationships that must hold for cold-start handling to work —
 * not just literal values, so an intentional retune can't silently break the
 * two-phase watchdog or hide the reassurance line.
 *
 * The Edge Function's source signed-URL TTL (`SOURCE_URL_TTL_SECONDS`) is
 * Deno-only and not importable here; it is covered by Phase 1's `deno check`.
 */
describe("cloud-job timing budgets", () => {
  it("shows the cold-start reassurance before the processing watchdog fails the job", () => {
    expect(SLOW_HINT_MS).toBeLessThan(PROCESSING_WATCHDOG_MS);
  });

  it("keeps the two-phase ordering (queued budget shorter than processing budget)", () => {
    expect(QUEUED_WATCHDOG_MS).toBeLessThan(PROCESSING_WATCHDOG_MS);
  });

  it("keeps the processing watchdog above the observed >300s cold-boot tail", () => {
    expect(PROCESSING_WATCHDOG_MS).toBeGreaterThanOrEqual(300_000);
  });
});
