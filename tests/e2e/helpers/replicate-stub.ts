/**
 * Replicate-callback stub helpers for the E2E north-star flow.
 *
 * The PR-gate spec drives the REAL UI submit, then completes the job by POSTing a
 * correctly-signed Replicate-style (svix) `/callback` to the locally-served Edge
 * Function — no Replicate account, no cold boot. These helpers build that signed
 * request and flip a job row to `processing` so the callback's `markJobSucceeded`
 * guard (`.eq("status","processing")`) and prediction-id cross-check pass.
 *
 * Node-only (Vitest + Playwright both run under Node): uses `node:crypto`. The
 * signing scheme mirrors the production verifier in
 * `src/lib/services/replicate-webhook.ts` (HMAC-SHA256 over
 * `${webhook-id}.${webhook-timestamp}.${rawBody}`, base64-decoded `whsec_` key).
 * The hermetic round-trip test (`tests/replicate-stub.helpers.test.ts`) proves
 * the signature this produces is ACCEPTED by that verifier.
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { BREAD_VERSION } from "../../../src/lib/services/bread";

export interface SignedCallback {
  /** Headers to send with the POST (Content-Type + the three svix headers). */
  headers: Record<string, string>;
  /** The EXACT body string the signature covers — send this verbatim. */
  rawBody: string;
}

/**
 * Sign a raw callback body with the svix scheme the Edge Function verifies.
 * `body` is signed and returned byte-for-byte as `rawBody`; pass that exact
 * string as the request body (re-serializing parsed JSON would break the sig).
 */
export function signCallback(opts: {
  secret: string;
  body: string;
  /** Unix seconds; defaults to now. Pass a stale value to exercise the replay guard. */
  timestamp?: number;
  webhookId?: string;
}): SignedCallback {
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const webhookId = opts.webhookId ?? `msg_${randomUUID()}`;
  const key = Buffer.from(opts.secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${webhookId}.${ts}.${opts.body}`).digest("base64");
  return {
    rawBody: opts.body,
    headers: {
      "Content-Type": "application/json",
      "webhook-id": webhookId,
      "webhook-timestamp": ts,
      "webhook-signature": `v1,${signature}`,
    },
  };
}

/** Build a Replicate completion payload body (the string `signCallback` signs). */
export function callbackBody(opts: {
  predictionId: string;
  status: "succeeded" | "failed" | "canceled";
  output?: string;
  error?: string;
}): string {
  const payload: Record<string, unknown> = { id: opts.predictionId, status: opts.status };
  if (opts.output !== undefined) payload.output = opts.output;
  if (opts.error !== undefined) payload.error = opts.error;
  return JSON.stringify(payload);
}

/**
 * Resolve the signing secret the way the local stack supplies it: prefer the
 * process env, else read `REPLICATE_WEBHOOK_SIGNING_SECRET` from
 * `supabase/functions/.env` (the file `functions serve --env-file` loads). Hard-
 * fails loudly when neither is present — a missing secret is a setup error, not a
 * silent skip (same convention as `tests/env.ts`).
 */
export function resolveSigningSecret(): string {
  const fromEnv = process.env.REPLICATE_WEBHOOK_SIGNING_SECRET;
  if (fromEnv) return fromEnv;
  try {
    const env = readFileSync("supabase/functions/.env", "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("REPLICATE_WEBHOOK_SIGNING_SECRET="));
    if (line) return line.slice("REPLICATE_WEBHOOK_SIGNING_SECRET=".length).trim();
  } catch {
    /* fall through to the throw */
  }
  throw new Error(
    "resolveSigningSecret: set REPLICATE_WEBHOOK_SIGNING_SECRET, or add it to supabase/functions/.env (see tests/e2e/README or the local runbook).",
  );
}

/**
 * Flip a job row to `processing` with a prediction id — the precondition the
 * signed `/callback` needs (the success path guards on `status = processing` and
 * cross-checks `replicate_prediction_id`). Also writes `model_version` (default
 * the shared `BREAD_VERSION`) so a stubbed processing row mirrors a real one
 * (S-11 telemetry), not an undocumented exception. Service-role admin; setup
 * only, never an assertion. Returns the prediction id it set.
 */
export async function flipToProcessing(
  admin: SupabaseClient,
  jobId: string,
  predictionId = `pred_${randomUUID()}`,
  modelVersion: string = BREAD_VERSION,
): Promise<string> {
  const { error } = await admin
    .from("jobs")
    .update({ status: "processing", replicate_prediction_id: predictionId, model_version: modelVersion })
    .eq("id", jobId);
  if (error) throw new Error(`flipToProcessing(${jobId}) failed: ${error.message}`);
  return predictionId;
}
