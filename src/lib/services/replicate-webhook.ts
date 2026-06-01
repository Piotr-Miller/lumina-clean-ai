/**
 * Replicate webhook verification + payload mapping — a pure, dependency-free
 * module shared across the Deno boundary: imported by the Supabase Edge Function
 * (`supabase/functions/enhance/index.ts`) by relative path AND by Vitest via
 * `@/lib/services/replicate-webhook`.
 *
 * Like `bread.ts`, keep this free of `@/` imports and of any npm-/Deno-specific
 * API: it uses only Web Crypto (`crypto.subtle`), `TextEncoder`, and
 * `atob`/`btoa`, all global in both Deno and Node 22 (lesson #4). This is why
 * the function does its OWN signature check instead of pulling Replicate's
 * `validateWebhook` from esm.sh — the verification logic that runs in the
 * function stays unit-testable inside the Astro/Vitest graph.
 *
 * Signature scheme (verified against Replicate docs via Context7, 2026-06-01):
 * standard "svix" webhooks — HMAC-SHA256 over
 * `${webhook-id}.${webhook-timestamp}.${rawBody}` keyed by the base64-decoded
 * portion of the `whsec_…` signing secret, compared (base64) against each
 * space-delimited `v1,<sig>` entry of the `webhook-signature` header.
 */

const SIGNATURE_VERSION = "v1";

/** Cap on persisted/returned error text (matches the function's own bound). */
const MAX_ERROR_MESSAGE_CHARS = 300;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Constant-time string comparison — avoids leaking the expected signature
 * through early-exit timing. A length mismatch still walks the longer string so
 * timing doesn't reveal the expected length.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export interface VerifyReplicateSignatureParams {
  /** `webhook-id` header. */
  webhookId: string;
  /** `webhook-timestamp` header (seconds since epoch, as a string). */
  webhookTimestamp: string;
  /** Raw `webhook-signature` header — space-delimited `v1,<base64>` entries. */
  webhookSignature: string;
  /** The RAW request body, byte-for-byte (do NOT re-serialize parsed JSON). */
  body: string;
  /** The `whsec_…` signing secret (REPLICATE_WEBHOOK_SIGNING_SECRET). */
  signingSecret: string;
}

/**
 * Verify a Replicate webhook signature. Returns `false` (never throws) on any
 * malformed input so the caller can answer a uniform 401.
 */
export async function verifyReplicateSignature(params: VerifyReplicateSignatureParams): Promise<boolean> {
  const { webhookId, webhookTimestamp, webhookSignature, body, signingSecret } = params;
  if (!webhookId || !webhookTimestamp || !webhookSignature || !signingSecret) return false;

  const secretB64 = signingSecret.replace(/^whsec_/, "");
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64ToBytes(secretB64);
  } catch {
    return false;
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;
  let expected: string;
  try {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
    expected = bytesToBase64(new Uint8Array(sig));
  } catch {
    return false;
  }

  // The header may carry several space-delimited signatures (key rotation).
  // Match the base64 portion of any `v1,<sig>` entry in constant time.
  for (const entry of webhookSignature.split(" ")) {
    const comma = entry.indexOf(",");
    if (comma === -1) continue;
    const version = entry.slice(0, comma);
    const candidate = entry.slice(comma + 1);
    if (version === SIGNATURE_VERSION && constantTimeEquals(candidate, expected)) {
      return true;
    }
  }
  return false;
}

/** Subset of Replicate's prediction webhook payload the `/callback` route acts on. */
export interface ReplicatePredictionPayload {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
}

/** Terminal action the `/callback` route should take for a completion payload. */
export type PredictionOutcome =
  | { kind: "succeeded"; outputUrl: string }
  | { kind: "failed"; errorMessage: string }
  | { kind: "ignore" };

/** Bread returns a single output URI; tolerate the array-of-strings shape too. */
function firstOutputUrl(output: unknown): string | null {
  if (typeof output === "string" && output.length > 0) return output;
  if (Array.isArray(output)) {
    const first = (output as unknown[]).find((o): o is string => typeof o === "string" && o.length > 0);
    return first ?? null;
  }
  return null;
}

function errorText(error: unknown): string {
  if (typeof error === "string" && error.length > 0) return error;
  if (error != null) {
    try {
      return JSON.stringify(error);
    } catch {
      // Circular/unserializable error object — avoid '[object Object]'.
      return "unserializable error";
    }
  }
  return "prediction failed";
}

/**
 * Map a completed Replicate prediction payload to the terminal action the
 * `/callback` route should take. `webhook_events_filter: ["completed"]` means we
 * only ever see terminal states, but anything that isn't a clear success/failure
 * is defensively `ignore`d rather than mutating the row.
 */
export function mapPredictionToOutcome(payload: ReplicatePredictionPayload): PredictionOutcome {
  switch (payload.status) {
    case "succeeded": {
      const outputUrl = firstOutputUrl(payload.output);
      return outputUrl
        ? { kind: "succeeded", outputUrl }
        : { kind: "failed", errorMessage: "Replicate reported success but returned no output URL" };
    }
    case "failed":
    case "canceled":
      return { kind: "failed", errorMessage: errorText(payload.error).slice(0, MAX_ERROR_MESSAGE_CHARS) };
    default:
      return { kind: "ignore" };
  }
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Pick the result object's file extension from the output's Content-Type,
 * falling back to the output URL's extension, then `jpg`. Bread returns a single
 * image URI; the result lands at `{uid}/{jobId}/result.{ext}`.
 */
export function resultExtensionFromContentType(contentType: string | null, outputUrl?: string): string {
  if (contentType) {
    const mime = contentType.split(";")[0].trim().toLowerCase();
    if (CONTENT_TYPE_EXTENSIONS[mime]) return CONTENT_TYPE_EXTENSIONS[mime];
  }
  if (outputUrl) {
    const match = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(outputUrl);
    if (match) {
      const ext = match[1].toLowerCase();
      if (ext === "jpeg") return "jpg";
      if (ext === "jpg" || ext === "png" || ext === "webp") return ext;
    }
  }
  return "jpg";
}
