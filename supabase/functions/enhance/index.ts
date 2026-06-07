// Supabase Edge Function: `enhance` — S-04 Cloud-AI pipeline.
//
// Phase 2 implements the `/start` route: the Database Webhook (pg_net) POSTs
// here when a `queued` job is inserted. `/start` authenticates the call
// (DB_WEBHOOK_SECRET bearer), honors the CLOUD_PIPELINE_ENABLED cost guard,
// mints a short-TTL signed READ URL for the private source, creates a Replicate
// "Bread" prediction with a webhook callback pointing at this function's
// `/callback` route, and flips the job to `processing` (storing the prediction
// id as the callback integrity cross-check). The `/callback` route lands in
// Phase 3.
//
// verify_jwt = false (supabase/config.toml): neither invoker (the DB webhook
// nor Replicate) carries a Supabase user JWT, so the function authenticates
// calls itself. See context/changes/cloud-ai-realtime-result/plan.md.
//
// Deno import boundary (lesson #4): the job-state transitions and the Bread
// input mapping are the SAME shared modules the Astro app uses, imported by
// relative path. Their type-only imports (`@/types`, `@supabase/supabase-js`)
// resolve via the deno.json import map — ONE implementation of the status
// transitions + the 24h-source-delete retention logic, no app-vs-Deno drift.

import { createClient } from "@supabase/supabase-js";
import { BREAD_VERSION, buildBreadInput } from "../../../src/lib/services/bread.ts";
import {
  createSignedReadUrl,
  getJobById,
  markJobFailed,
  markJobProcessing,
  markJobSucceeded,
} from "../../../src/lib/services/photo-job.service.ts";
import type { ReplicatePredictionPayload } from "../../../src/lib/services/replicate-webhook.ts";
import {
  isAllowedOutputUrl,
  isWebhookTimestampFresh,
  mapPredictionToOutcome,
  resultExtensionFromContentType,
  verifyReplicateSignature,
} from "../../../src/lib/services/replicate-webhook.ts";

// Source READ URL TTL (S-09). Replicate (Cog) fetches this URL at `predict()`
// start — AFTER the container cold-boots, which can exceed several minutes
// (>300s observed under platform load, well past Phase-0's ~135s). The URL is
// fixed at prediction creation and CANNOT be re-minted, so it must still be
// valid when a cold worker finally fetches it: size it to cover queue + cold
// boot + Replicate's 30-min run window. 3600s (Supabase imposes no practical
// TTL cap). Privacy: the source is deleted on SUCCESS; the failed/abandoned
// source-cleanup gap is pre-existing (24h retention sweep) and tracked by S-08.
// A 300s TTL was the cold-boot reliability gap S-09 closes.
const SOURCE_URL_TTL_SECONDS = 3600;
const REPLICATE_PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";
const PHOTOS_BUCKET = "photos";
// Kickoff-race backstop: the DB webhook fires /start on the `queued` INSERT, but
// the client PUTs the source object only AFTER create-job returns. When the
// function is warm, /start can run before the upload lands and createSignedReadUrl
// 404s ("Object not found"). Retry a bounded number of times to absorb that race;
// ~4.5s total, well inside pg_net's fire-and-forget window. Any non-404 signing
// error fails fast.
const SOURCE_SIGN_MAX_ATTEMPTS = 6;
const SOURCE_SIGN_RETRY_DELAY_MS = 750;
// Cap how much Replicate error text we persist/return: the body can echo the
// signed source URL, and error_message is read by the owner. Bound it.
const MAX_ERROR_DETAIL_CHARS = 300;
// /callback output-download bounds: a slow or oversized response must not hang or
// OOM the function. 30s is generous for a CDN image fetch; 25 MB mirrors the
// photos bucket limit, so a legitimate Bread output always fits.
const OUTPUT_FETCH_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Length-safe constant-time compare via fixed-length SHA-256 digests — avoids
// leaking the webhook secret through early-exit timing on the bearer check.
// Named `digestEquals` to distinguish it from the char-level constant-time
// compare in replicate-webhook.ts (`charConstantTimeEquals`) — same intent,
// different guarantees, so the two must not be confused at a call site.
async function digestEquals(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// Service-role client built from the auto-injected runtime env. Bypasses RLS —
// this function is the sole writer of `jobs` status transitions (the table has
// no user UPDATE policy).
function buildAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("enhance: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not injected into the runtime");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

// Public base URL of THIS function, used to build the Replicate webhook
// callback. Prefer an explicit override (local dev points Replicate at a public
// tunnel, since Replicate cannot reach host.docker.internal); otherwise derive
// from the auto-injected SUPABASE_URL (correct in prod:
// https://<ref>.supabase.co/functions/v1/enhance).
function enhanceFunctionBaseUrl(): string {
  const override = Deno.env.get("EDGE_FUNCTION_URL");
  if (override) return override.replace(/\/$/, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("enhance: cannot derive callback URL — set EDGE_FUNCTION_URL or SUPABASE_URL");
  }
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/enhance`;
}

// Rewrite a signed Storage URL's origin to a publicly reachable host when a
// public tunnel is configured. Locally the injected SUPABASE_URL is an internal
// Docker host (http://kong:8000) that Replicate cannot fetch, so the signed
// source URL must be re-pointed at the same public tunnel used for the callback.
// We reuse EDGE_FUNCTION_URL's origin as that tunnel root (the storage and
// function paths ride the same tunnel rooted at the API port), avoiding a second
// env var — and the `SUPABASE_*` prefix, which Edge Functions reserve. The
// signed token is bound to the object PATH (not the host), so swapping the
// origin is safe. In prod EDGE_FUNCTION_URL is unset and SUPABASE_URL is already
// public, so this is a no-op.
function toPublicStorageUrl(signedUrl: string): string {
  const fnUrl = Deno.env.get("EDGE_FUNCTION_URL");
  if (!fnUrl) return signedUrl;
  // Rebuild from origin + path + query. Do NOT mutate `target.host`/`.protocol`
  // piecemeal: the WHATWG `host` setter leaves a pre-existing port in place when
  // the new host carries none, so an internal `kong:8000` origin would yield
  // `<tunnel>:8000` — unreachable (ngrok serves 443). origin already encodes
  // protocol + host + correct port.
  const publicOrigin = new URL(fnUrl).origin;
  const target = new URL(signedUrl);
  return `${publicOrigin}${target.pathname}${target.search}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A "not found" signing failure means the client's source upload hasn't landed
// yet (the kickoff race). Distinguish it from real errors so only the race is
// retried.
function isObjectNotFound(err: unknown): boolean {
  return err instanceof Error && /object not found/i.test(err.message);
}

// Sign the source READ URL, retrying ONLY while the object is still missing
// (upload in flight). See SOURCE_SIGN_MAX_ATTEMPTS for the rationale.
async function signSourceWithRetry(admin: ReturnType<typeof buildAdminClient>, sourcePath: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= SOURCE_SIGN_MAX_ATTEMPTS; attempt++) {
    try {
      return await createSignedReadUrl(admin, sourcePath, SOURCE_URL_TTL_SECONDS);
    } catch (err) {
      lastErr = err;
      if (!isObjectNotFound(err) || attempt === SOURCE_SIGN_MAX_ATTEMPTS) break;
      await delay(SOURCE_SIGN_RETRY_DELAY_MS);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function handleStart(req: Request): Promise<Response> {
  // 1. Authenticate the DB-webhook call (shared bearer; no Supabase JWT).
  const expectedSecret = Deno.env.get("DB_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return jsonResponse(500, { error: { code: "internal_error", message: "DB_WEBHOOK_SECRET not set" } });
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!(await digestEquals(authHeader, `Bearer ${expectedSecret}`))) {
    return jsonResponse(401, { error: { code: "unauthorized", message: "invalid webhook bearer" } });
  }

  // 2. Parse the job id from the webhook body.
  let jobId: string | undefined;
  try {
    const body = (await req.json()) as { jobId?: unknown };
    if (typeof body.jobId === "string") jobId = body.jobId;
  } catch {
    // malformed body → handled by the missing-jobId guard below
  }
  if (!jobId) {
    return jsonResponse(400, { error: { code: "invalid_body", message: "missing jobId" } });
  }

  // 3. Cost guard — pipeline OFF in prod until S-05. No-op (job stays queued).
  if (Deno.env.get("CLOUD_PIPELINE_ENABLED") !== "true") {
    return jsonResponse(200, { skipped: "cloud_pipeline_disabled" });
  }

  const admin = buildAdminClient();

  try {
    const job = await getJobById(admin, jobId);
    if (!job) {
      return jsonResponse(404, { error: { code: "not_found", message: `job ${jobId} not found` } });
    }

    const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
    if (!replicateToken) {
      throw new Error("REPLICATE_API_TOKEN not set");
    }

    // Replicate fetches the source itself, so it needs a short-TTL public URL.
    // signSourceWithRetry absorbs the kickoff race (upload may still be in
    // flight when a warm /start runs). Locally the signed URL carries the
    // internal `kong` host; rewrite its origin to the public tunnel (no-op in
    // prod). See toPublicStorageUrl.
    const signedSourceUrl = toPublicStorageUrl(await signSourceWithRetry(admin, job.source_path));
    const callbackUrl = `${enhanceFunctionBaseUrl()}/callback?jobId=${encodeURIComponent(jobId)}`;

    // Replicate requires the webhook to be a public HTTPS URL. In prod the
    // derived URL is https://<ref>.supabase.co/... — set normally. In local dev
    // it's http://host.docker.internal:54321/... which Replicate rejects with a
    // 422; omit the webhook so the prediction is still created. The completion
    // callback then needs a public HTTPS tunnel (set EDGE_FUNCTION_URL) — that
    // tunnel is the Phase-3 manual-testing setup anyway.
    const predictionBody: Record<string, unknown> = {
      version: BREAD_VERSION,
      input: buildBreadInput(signedSourceUrl),
    };
    if (callbackUrl.startsWith("https://")) {
      predictionBody.webhook = callbackUrl;
      predictionBody.webhook_events_filter = ["completed"];
    } else {
      console.warn(
        `enhance/start: callback URL ${callbackUrl} is not HTTPS — creating prediction without a webhook. ` +
          `Set EDGE_FUNCTION_URL to a public HTTPS tunnel to receive completion callbacks.`,
      );
    }

    const predictionRes = await fetch(REPLICATE_PREDICTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(predictionBody),
    });

    if (!predictionRes.ok) {
      const detail = (await predictionRes.text()).slice(0, MAX_ERROR_DETAIL_CHARS);
      throw new Error(`Replicate predictions.create failed (${predictionRes.status}): ${detail}`);
    }

    const prediction = (await predictionRes.json()) as { id?: string };
    if (!prediction.id) {
      throw new Error("Replicate response missing prediction id");
    }

    // status → processing + store the prediction id (the /callback cross-check).
    await markJobProcessing(admin, { jobId, replicatePredictionId: prediction.id });
    return jsonResponse(200, { jobId, predictionId: prediction.id, status: "processing" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Record the failure on the row (the client's source of truth) before
    // returning. Best-effort: if markJobFailed itself throws, the 500 still
    // signals the failure.
    try {
      await markJobFailed(admin, { jobId, errorCode: "start_failed", errorMessage: message });
    } catch {
      // swallow — the row may be unreachable; the 500 below surfaces it
    }
    return jsonResponse(500, { error: { code: "start_failed", message } });
  }
}

// Download a response body into memory bounded by `maxBytes`, to bound PEAK
// memory (not just the stored object). A present Content-Length is pre-checked so
// an oversized response is rejected before reading; then the body stream is read
// chunk-by-chunk and aborted the moment the running total exceeds the cap, so a
// missing or lying header is still bounded. (A plain `arrayBuffer()` would buffer
// the whole body first, defeating the cap.)
async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = res.headers.get("content-length");
  if (declared) {
    const len = Number(declared);
    if (Number.isFinite(len) && len > maxBytes) {
      throw new Error(`Replicate output exceeds ${maxBytes}-byte cap (Content-Length ${len})`);
    }
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Replicate output response had no readable body");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    // Check BEFORE accumulating so the bound is strict — never hold more than
    // maxBytes resident (the over-cap chunk is neither counted nor retained).
    if (total + value.byteLength > maxBytes) {
      await reader.cancel();
      throw new Error(`Replicate output exceeds ${maxBytes}-byte cap`);
    }
    total += value.byteLength;
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function handleCallback(req: Request): Promise<Response> {
  // 1. Read the RAW body before parsing — the signature is over the exact bytes
  //    Replicate sent; re-serializing parsed JSON would break verification. Wrap
  //    the read so a mid-body client abort returns a controlled 400 instead of
  //    throwing out of the handler unhandled (no JSON envelope, no row update).
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse(400, { error: { code: "invalid_body", message: "failed to read request body" } });
  }

  // 2. Verify the Replicate (svix) webhook signature. Invalid → 401, no mutation.
  const signingSecret = Deno.env.get("REPLICATE_WEBHOOK_SIGNING_SECRET");
  if (!signingSecret) {
    return jsonResponse(500, {
      error: { code: "internal_error", message: "REPLICATE_WEBHOOK_SIGNING_SECRET not set" },
    });
  }
  const signatureValid = await verifyReplicateSignature({
    webhookId: req.headers.get("webhook-id") ?? "",
    webhookTimestamp: req.headers.get("webhook-timestamp") ?? "",
    webhookSignature: req.headers.get("webhook-signature") ?? "",
    body: rawBody,
    signingSecret,
  });
  if (!signatureValid) {
    return jsonResponse(401, { error: { code: "unauthorized", message: "invalid webhook signature" } });
  }
  // Replay guard: a valid signature over a stale timestamp is a replay (the
  // timestamp is part of the signed content). Reject with the same uniform 401;
  // log the distinct reason so the gate that failed is visible.
  if (!isWebhookTimestampFresh(req.headers.get("webhook-timestamp") ?? "")) {
    console.warn("enhance/callback: rejecting webhook outside the freshness window (replay guard)");
    return jsonResponse(401, { error: { code: "unauthorized", message: "stale webhook timestamp" } });
  }

  // 3. Resolve the job: `jobId` comes from the callback query string (set by
  //    /start); the payload's prediction id is cross-checked below.
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return jsonResponse(400, { error: { code: "invalid_body", message: "missing jobId" } });
  }

  let payload: ReplicatePredictionPayload;
  try {
    payload = JSON.parse(rawBody) as ReplicatePredictionPayload;
  } catch {
    return jsonResponse(400, { error: { code: "invalid_body", message: "malformed JSON" } });
  }

  const admin = buildAdminClient();

  try {
    const job = await getJobById(admin, jobId);
    // Past signature verification, always 200 so Replicate stops retrying a
    // request we've already (idempotently) decided not to act on.
    if (!job) {
      return jsonResponse(200, { ignored: "job_not_found" });
    }
    // Integrity cross-check (fail-closed): the payload's prediction id must be
    // PRESENT and equal the id /start stored on the row. A mismatch is a
    // stale/replayed completion for a different prediction; a missing payload id
    // — or a row with no stored prediction id (which /start always sets on a
    // `processing` job) — is anomalous, so refuse to mutate rather than trust an
    // unverifiable completion. (Defense-in-depth behind the HMAC gate.)
    if (!payload.id || !job.replicate_prediction_id || payload.id !== job.replicate_prediction_id) {
      console.warn(
        `enhance/callback: prediction-id cross-check failed ` +
          `(payload=${payload.id ?? "none"}, stored=${job.replicate_prediction_id ?? "none"}) — ignoring`,
      );
      return jsonResponse(200, { ignored: "prediction_id_mismatch" });
    }
    // Idempotency: a row already terminal (Replicate retry, or the client
    // watchdog failed it first) must not be re-processed.
    if (job.status === "succeeded" || job.status === "failed") {
      return jsonResponse(200, { ignored: "already_terminal" });
    }

    const outcome = mapPredictionToOutcome(payload);
    if (outcome.kind === "ignore") {
      return jsonResponse(200, { ignored: `status_${payload.status ?? "unknown"}` });
    }
    if (outcome.kind === "failed") {
      await markJobFailed(admin, { jobId, errorCode: "replicate_failed", errorMessage: outcome.errorMessage });
      return jsonResponse(200, { jobId, status: "failed" });
    }

    // SSRF guard: only fetch Replicate's real output CDN. A payload that passed
    // signature verification could still carry an attacker-influenced output URL;
    // reject anything that isn't https `*.replicate.delivery` BEFORE the fetch.
    if (!isAllowedOutputUrl(outcome.outputUrl)) {
      throw new Error(`refusing to fetch output from a disallowed host: ${outcome.outputUrl}`);
    }

    // Success: download Bread's output and store it as the result object. The
    // AbortSignal.timeout bounds the WHOLE download — connection, headers, AND the
    // streamed body read (an abort errors the in-flight reader.read()), so a slow
    // trickle can't outlive the 30s budget; readBodyCapped independently caps size
    // at 25 MB so a missing/lying Content-Length can't OOM the function.
    const outputRes = await fetch(outcome.outputUrl, { signal: AbortSignal.timeout(OUTPUT_FETCH_TIMEOUT_MS) });
    if (!outputRes.ok) {
      throw new Error(`failed to fetch Replicate output (${outputRes.status})`);
    }
    const contentType = outputRes.headers.get("content-type");
    const bytes = await readBodyCapped(outputRes, MAX_OUTPUT_BYTES);
    const ext = resultExtensionFromContentType(contentType, outcome.outputUrl);
    const resultPath = `${job.user_id}/${job.id}/result.${ext}`;
    const { error: uploadError } = await admin.storage.from(PHOTOS_BUCKET).upload(resultPath, bytes, {
      contentType: contentType ?? "image/jpeg",
      upsert: true,
    });
    if (uploadError) {
      throw new Error(`failed to upload result to ${resultPath}: ${uploadError.message}`);
    }
    // Flip terminal + delete the source (24h-retention enforcement) via the
    // shared helper — the same writer the app uses, no inline status update.
    await markJobSucceeded(admin, { jobId, resultPath, replicatePredictionId: payload.id });
    return jsonResponse(200, { jobId, status: "succeeded", resultPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Record the failure on the row (the client's source of truth), then still
    // 200 so Replicate stops retrying a deterministic processing error (e.g. a
    // dead output URL). Best-effort: a failed markJobFailed is swallowed.
    try {
      await markJobFailed(admin, {
        jobId,
        errorCode: "callback_failed",
        errorMessage: message.slice(0, MAX_ERROR_DETAIL_CHARS),
      });
    } catch {
      // swallow — the row may be unreachable; the 200 below still acks Replicate
    }
    return jsonResponse(200, { jobId, status: "failed", error: { code: "callback_failed", message } });
  }
}

Deno.serve(async (req) => {
  const { pathname } = new URL(req.url);

  // The function is invoked at /functions/v1/enhance; routes are sub-paths the
  // function dispatches on (verify_jwt = false, so no platform JWT gate).
  if (req.method === "POST" && pathname.endsWith("/start")) {
    return await handleStart(req);
  }
  if (req.method === "POST" && pathname.endsWith("/callback")) {
    return await handleCallback(req);
  }

  return jsonResponse(404, { error: { code: "not_found", message: "unknown route" } });
});
