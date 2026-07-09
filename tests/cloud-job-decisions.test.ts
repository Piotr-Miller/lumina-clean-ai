import { describe, expect, it } from "vitest";
import {
  deriveCloudPhase,
  deriveDisplayError,
  isRgbaAlphaError,
  isTerminalStatus,
  shouldArmProcessingBudget,
  shouldCancelInFlight,
  shouldFailAfterQueuedReRead,
  TIMEOUT_MESSAGE,
  GENERIC_FAILED_MESSAGE,
  PROVIDER_RATE_LIMITED_MESSAGE,
  RGBA_ALPHA_MESSAGE,
} from "@/components/hooks/cloud-job-decisions";

// Bread's RGBA rejection as it lands in the row's `error_message` (serialized +
// truncated to 300 chars). The torch signature sits at the front.
const RGBA_FULL_MESSAGE = "Input size must have a shape of (*, 3, H, W). Got torch.Size([1, 4, 96, 96])";
// A truncation that cuts mid-message but keeps the front-anchored signature.
const RGBA_TRUNCATED_MESSAGE = "Input size must have a shape of (*, 3, H, W). Got torch.S";

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

  it("maps the RGBA/torch signature to the friendly convert copy (full + truncated)", () => {
    for (const errorMessage of [RGBA_FULL_MESSAGE, RGBA_TRUNCATED_MESSAGE]) {
      expect(
        deriveDisplayError({
          phase: "failed",
          status: "failed",
          timedOut: false,
          loadError: null,
          errorMessage,
          errorCode: "replicate_failed",
        }),
      ).toBe(RGBA_ALPHA_MESSAGE);
    }
  });

  it("lets a provider_rate_limited code win over an RGBA-looking message", () => {
    expect(
      deriveDisplayError({
        phase: "failed",
        status: "failed",
        timedOut: false,
        loadError: null,
        errorMessage: RGBA_FULL_MESSAGE,
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

describe("isRgbaAlphaError", () => {
  it("detects the torch signature, full or front-truncated", () => {
    expect(isRgbaAlphaError(RGBA_FULL_MESSAGE)).toBe(true);
    expect(isRgbaAlphaError(RGBA_TRUNCATED_MESSAGE)).toBe(true);
  });

  it("is false for null and for unrelated failures", () => {
    expect(isRgbaAlphaError(null)).toBe(false);
    expect(isRgbaAlphaError("")).toBe(false);
    expect(isRgbaAlphaError("Replicate predictions.create failed (429): rate limit")).toBe(false);
    expect(isRgbaAlphaError("pipeline boom")).toBe(false);
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

describe("shouldCancelInFlight", () => {
  it("fires the backend cancel only for an in-flight job with an id", () => {
    expect(shouldCancelInFlight("processing", "job-1")).toBe(true);
  });

  it("does not fire without a job id — nothing is running to cancel", () => {
    expect(shouldCancelInFlight("processing", null)).toBe(false);
  });

  it("does not fire outside the processing phase (idle/succeeded/failed keep the pure reset)", () => {
    expect(shouldCancelInFlight("idle", "job-1")).toBe(false);
    expect(shouldCancelInFlight("succeeded", "job-1")).toBe(false);
    expect(shouldCancelInFlight("failed", "job-1")).toBe(false);
  });
});
