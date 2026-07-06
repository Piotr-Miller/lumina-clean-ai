import { STRINGS } from "@/lib/enhance-strings";
import type { PhotoJobStatus } from "@/types";

/** Coarse render phase the workspace gates on (derived from the live job state). */
export type CloudJobPhase = "idle" | "processing" | "succeeded" | "failed";

// User-facing failure copy — values live in the enhance-strings module (i18n
// readiness), re-exported here under the original names so tests and consumers
// keep their imports. The two timeout strings — this client-side one and the
// timeout route's own row-level write — are identical, so there's no flicker between them.
export const TIMEOUT_MESSAGE = STRINGS.cloudErrors.timeout;
export const GENERIC_FAILED_MESSAGE = STRINGS.cloudErrors.genericFailed;
// Provider (Replicate) rate-limit — distinct from the create-job daily cap, which
// has its own copy. Keyed off the row's `error_code` (`provider_rate_limited`),
// set by the Edge Function's `classifyStartFailure` on a 429.
export const PROVIDER_RATE_LIMITED_MESSAGE = STRINGS.cloudErrors.providerRateLimited;
// Alpha-PNG (RGBA) input rejected by Bread, which needs a 3-channel RGB tensor.
// The reactive recovery (Convert to RGB and try again) is offered alongside.
export const RGBA_ALPHA_MESSAGE = STRINGS.cloudErrors.rgbaAlpha;

// Stable, front-of-message anchor of Bread's RGBA rejection, e.g.
// `Input size must have a shape of (*, 3, H, W). Got torch.Size([1, 4, 96, 96])`.
// Matched as a substring so it survives the row's 300-char `error_message`
// truncation (the signature sits near the front); the trailing H/W dims vary.
const RGBA_ALPHA_SIGNATURE = "Input size must have a shape of (*, 3";

/**
 * Recognize the alpha-channel (RGBA) failure from its `error_message` signature.
 * Truncation-safe: an early, dimension-independent substring (the model's
 * "needs 3 channels" complaint), not the full message. Drives both the friendly
 * copy in {@link deriveDisplayError} and the workspace's Convert-to-RGB button.
 */
export function isRgbaAlphaError(errorMessage: string | null): boolean {
  return errorMessage?.includes(RGBA_ALPHA_SIGNATURE) ?? false;
}

/**
 * Pure decision predicates lifted out of `useCloudJob`'s effect closures so the
 * test-plan §2 Risk #6 logic (re-read-before-fail, idempotent/monotonic apply,
 * succeeded-wins render) is deterministically unit-testable under Node — no React,
 * no Realtime, no mocking. The hook keeps all the async wiring (subscription,
 * timers, the queued-deadline re-read) and routes its decisions through these.
 * Tested by `tests/cloud-job-decisions.test.ts`.
 */

/** A status that closes the job (terminal → clear the watchdog). */
export function isTerminalStatus(next: PhotoJobStatus): boolean {
  return next === "succeeded" || next === "failed";
}

/**
 * Arm the long (cold-boot) budget exactly once, on the first `processing` — the
 * `sawProcessing`-once guard keeps a repeated `processing` event from re-arming it.
 */
export function shouldArmProcessingBudget(next: PhotoJobStatus, sawProcessing: boolean): boolean {
  return next === "processing" && !sawProcessing;
}

/**
 * Re-read-before-fail: at the queued deadline, only a row that is STILL `queued`
 * (or genuinely absent) is a real stall. A row that has advanced to
 * `processing`/terminal must NOT be failed — it gets folded in instead. This is the
 * load-bearing #6 decision (a cold boot that reached `processing` survives).
 */
export function shouldFailAfterQueuedReRead(readStatus: PhotoJobStatus | null): boolean {
  return readStatus === null || readStatus === "queued";
}

/** Inputs to {@link deriveCloudPhase} — the live job state the render phase derives from. */
export interface CloudPhaseInput {
  jobId: string | null;
  status: PhotoJobStatus | null;
  hasResult: boolean;
  timedOut: boolean;
  loadError: string | null;
}

/**
 * Coarse render phase. `succeeded` always wins (even against a concurrent timeout):
 * a real result must render, never a stale timeout. While the result URL is still
 * loading (`hasResult` false), stay in `processing`.
 */
export function deriveCloudPhase(input: CloudPhaseInput): CloudJobPhase {
  const { jobId, status, hasResult, timedOut, loadError } = input;
  if (!jobId) return "idle";
  if (status === "succeeded") return hasResult ? "succeeded" : "processing";
  if (timedOut || status === "failed" || loadError !== null) return "failed";
  return "processing";
}

/** Inputs to {@link deriveDisplayError} — the failure-state fields it maps to a message. */
export interface CloudDisplayErrorInput {
  phase: CloudJobPhase;
  status: PhotoJobStatus | null;
  timedOut: boolean;
  loadError: string | null;
  errorMessage: string | null;
  /** Row-level `error_code` (e.g. `provider_rate_limited`); keys the friendly map. */
  errorCode: string | null;
}

/**
 * The user-facing error for a `failed` phase: a row-level `failed` carries the
 * authoritative message; the client `TIMEOUT_MESSAGE` only covers the gap before the
 * timeout route's write lands; a load failure falls back to its own message.
 *
 * On a row-level `failed`, a known `error_code` maps to friendly copy first (e.g. a
 * provider 429 → {@link PROVIDER_RATE_LIMITED_MESSAGE}); then the RGBA-signature
 * message map ({@link isRgbaAlphaError} → {@link RGBA_ALPHA_MESSAGE}); unknown
 * codes/messages fall back to the row's `error_message`, then the generic.
 */
export function deriveDisplayError(input: CloudDisplayErrorInput): string | null {
  const { phase, status, timedOut, loadError, errorMessage, errorCode } = input;
  if (phase !== "failed") return null;
  if (status === "failed") {
    if (errorCode === "provider_rate_limited") return PROVIDER_RATE_LIMITED_MESSAGE;
    if (isRgbaAlphaError(errorMessage)) return RGBA_ALPHA_MESSAGE;
    return errorMessage ?? GENERIC_FAILED_MESSAGE;
  }
  if (timedOut) return TIMEOUT_MESSAGE;
  return loadError ?? GENERIC_FAILED_MESSAGE;
}
