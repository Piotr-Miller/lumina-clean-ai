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
} from "../../../src/lib/services/photo-job.service.ts";

const SOURCE_URL_TTL_SECONDS = 300;
const REPLICATE_PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

async function handleStart(req: Request): Promise<Response> {
  // 1. Authenticate the DB-webhook call (shared bearer; no Supabase JWT).
  const expectedSecret = Deno.env.get("DB_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return jsonResponse(500, { error: { code: "misconfigured", message: "DB_WEBHOOK_SECRET not set" } });
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${expectedSecret}`) {
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
    const signedSourceUrl = await createSignedReadUrl(admin, job.source_path, SOURCE_URL_TTL_SECONDS);
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
      const detail = await predictionRes.text();
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

Deno.serve(async (req) => {
  const { pathname } = new URL(req.url);

  // The function is invoked at /functions/v1/enhance; routes are sub-paths the
  // function dispatches on (verify_jwt = false, so no platform JWT gate).
  if (req.method === "POST" && pathname.endsWith("/start")) {
    return await handleStart(req);
  }

  // /callback lands in Phase 3.
  return jsonResponse(404, { error: { code: "not_found", message: "unknown route" } });
});
