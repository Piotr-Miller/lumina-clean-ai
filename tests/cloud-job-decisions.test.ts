import { describe, expect, it } from "vitest";
import {
  deriveCloudPhase,
  deriveDisplayError,
  isTerminalStatus,
  shouldArmProcessingBudget,
  shouldFailAfterQueuedReRead,
  TIMEOUT_MESSAGE,
  GENERIC_FAILED_MESSAGE,
  PROVIDER_RATE_LIMITED_MESSAGE,
} from "@/components/hooks/cloud-job-decisions";

/**
 * Deterministic coverage for `useCloudJob`'s test-plan §2 Risk #6 decision logic,
 * extracted into pure predicates (Phase 1). Per the R6 guidance these assert the
 * DECISION (fail vs re-read vs render) under late/out-of-order state — never a
 * timer's numeric value. The async wiring (catch-up read firing on SUBSCRIBED, the
 * live re-read call) deliberately stays E2E-covered; here we pin the choices it makes.
 */

// deriveCloudPhase needs every field; this keeps each case to the field under test.
function phaseInput(over: Partial<Parameters<typeof deriveCloudPhase>[0]> = {}) {
  return { jobId: "job-1", status: null, hasResult: false, timedOut: false, loadError: null, ...over };
}

describe("deriveCloudPhase", () => {
  it("succeeded wins even when a timeout watchdog also fired (the rare race)", () => {
    expect(deriveCloudPhase(phaseInput({ status: "succeeded", hasResult: true, timedOut: true }))).toBe("succeeded");
  });

  it("stays processing while a succeeded result's URL is still loading", () => {
    expect(deriveCloudPhase(phaseInput({ status: "succeeded", hasResult: false }))).toBe("processing");
  });

  it("is failed on a load error", () => {
    expect(deriveCloudPhase(phaseInput({ status: "processing", loadError: "boom" }))).toBe("failed");
  });

  it("is failed on a row-level failed status", () => {
    expect(deriveCloudPhase(phaseInput({ status: "failed" }))).toBe("failed");
  });

  it("is failed on a timeout", () => {
    expect(deriveCloudPhase(phaseInput({ status: "processing", timedOut: true }))).toBe("failed");
  });

  it("is idle before submit (no jobId), even if a stale status lingers", () => {
    expect(deriveCloudPhase(phaseInput({ jobId: null, status: "succeeded", hasResult: true }))).toBe("idle");
  });

  it("is processing while queued/processing with no terminal signal", () => {
    expect(deriveCloudPhase(phaseInput({ status: "queued" }))).toBe("processing");
    expect(deriveCloudPhase(phaseInput({ status: "processing" }))).toBe("processing");
  });
});

describe("deriveDisplayError", () => {
  it("returns null when the phase is not failed", () => {
    expect(
      deriveDisplayError({
        phase: "processing",
        status: "processing",
        timedOut: false,
        loadError: null,
        errorMessage: null,
        errorCode: null,
      }),
    ).toBeNull();
    expect(
      deriveDisplayError({
        phase: "succeeded",
        status: "succeeded",
        timedOut: false,
        loadError: null,
        errorMessage: null,
        errorCode: null,
      }),
    ).toBeNull();
  });

  it("uses the row's authoritative message on a failed status, else a generic fallback", () => {
    expect(
      deriveDisplayError({
        phase: "failed",
        status: "failed",
        timedOut: false,
        loadError: null,
        errorMessage: "pipeline boom",
        errorCode: null,
      }),
    ).toBe("pipeline boom");
    expect(
      deriveDisplayError({
        phase: "failed",
        status: "failed",
        timedOut: false,
        loadError: null,
        errorMessage: null,
        errorCode: null,
      }),
    ).toBe(GENERIC_FAILED_MESSAGE);
  });

  it("maps a provider_rate_limited code to the friendly 429 copy (over the raw message)", () => {
    expect(
      deriveDisplayError({
        phase: "failed",
        status: "failed",
        timedOut: false,
        loadError: null,
        errorMessage: "Replicate predictions.create failed (429): rate limit",
        errorCode: "provider_rate_limited",
      }),
    ).toBe(PROVIDER_RATE_LIMITED_MESSAGE);
  });

  it("leaves an unrelated error_code on the row's authoritative message", () => {
    expect(
      deriveDisplayError({
        phase: "failed",
        status: "failed",
        timedOut: false,
        loadError: null,
        errorMessage: "pipeline boom",
        errorCode: "start_failed",
      }),
    ).toBe("pipeline boom");
  });

  it("shows the timeout message on a client-side timeout (row not yet failed)", () => {
    expect(
      deriveDisplayError({
        phase: "failed",
        status: "processing",
        timedOut: true,
        loadError: null,
        errorMessage: null,
        errorCode: null,
      }),
    ).toBe(TIMEOUT_MESSAGE);
  });

  it("falls back to the load-error message, else generic", () => {
    expect(
      deriveDisplayError({
        phase: "failed",
        status: "succeeded",
        timedOut: false,
        loadError: "decode failed",
        errorMessage: null,
        errorCode: null,
      }),
    ).toBe("decode failed");
    expect(
      deriveDisplayError({
        phase: "failed",
        status: null,
        timedOut: false,
        loadError: null,
        errorMessage: null,
        errorCode: null,
      }),
    ).toBe(GENERIC_FAILED_MESSAGE);
  });

  it("pins the user-facing timeout copy (Risk #1 contract)", () => {
    expect(TIMEOUT_MESSAGE).toBe("Cloud processing took too long. Please try again.");
  });
});

describe("shouldFailAfterQueuedReRead — the load-bearing #6 decision", () => {
  it("fails only a row still queued or genuinely absent at the deadline", () => {
    expect(shouldFailAfterQueuedReRead("queued")).toBe(true);
    expect(shouldFailAfterQueuedReRead(null)).toBe(true);
  });

  it("NEVER fails a row that advanced — a cold boot that reached processing survives", () => {
    expect(shouldFailAfterQueuedReRead("processing")).toBe(false);
    expect(shouldFailAfterQueuedReRead("succeeded")).toBe(false);
    expect(shouldFailAfterQueuedReRead("failed")).toBe(false);
  });
});

describe("shouldArmProcessingBudget", () => {
  it("arms the long budget on the first processing", () => {
    expect(shouldArmProcessingBudget("processing", false)).toBe(true);
  });

  it("arms at most once — a repeated processing event does not re-arm", () => {
    expect(shouldArmProcessingBudget("processing", true)).toBe(false);
  });

  it("does not arm on a non-processing status", () => {
    expect(shouldArmProcessingBudget("queued", false)).toBe(false);
    expect(shouldArmProcessingBudget("succeeded", false)).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  it("is terminal for succeeded and failed", () => {
    expect(isTerminalStatus("succeeded")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
  });

  it("is not terminal for queued and processing", () => {
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("processing")).toBe(false);
  });
});
