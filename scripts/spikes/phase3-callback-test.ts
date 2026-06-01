/**
 * Phase 3 (`/callback`) manual-verification harness — deterministic, no Replicate.
 *
 * Exercises the Edge Function `/callback` route end-to-end against the LOCAL
 * stack by crafting correctly-signed Replicate-style webhooks (svix scheme), so
 * we can verify 3.3 / 3.4 / 3.5 without a real prediction or a reachable source
 * URL:
 *   - 3.3 success  → job `succeeded`, result_path set, result object exists, source deleted
 *   - 3.4 failure  → job `failed` with error_code/error_message
 *   - 3.5 bad sig  → 401, no mutation
 *
 * It uses a public sample image as the "output" (the function fetches it with
 * internet access from the edge runtime), uploads a dummy source so the
 * success path's source-delete has something to remove, and cleans up after.
 *
 * Run (local stack up, `supabase functions serve enhance --env-file
 * supabase/functions/.env` running):
 *
 *   npx tsx scripts/spikes/phase3-callback-test.ts [outputImageUrl]
 *
 * Env (defaults target the local stack; override if needed):
 *   API_URL                 default http://127.0.0.1:54321
 *   SERVICE_ROLE_KEY        default the local demo service_role JWT
 *   FUNCTION_URL            default ${API_URL}/functions/v1/enhance
 *   The signing secret is read from supabase/functions/.env.
 */

import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const FUNCTION_URL = process.env.FUNCTION_URL ?? `${API_URL}/functions/v1/enhance`;
const OUTPUT_IMAGE_URL = process.argv[2] ?? "https://picsum.photos/seed/lumina/200/200";
const BUCKET = "photos";

function readSigningSecret(): string {
  const env = readFileSync("supabase/functions/.env", "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("REPLICATE_WEBHOOK_SIGNING_SECRET="));
  if (!line) throw new Error("REPLICATE_WEBHOOK_SIGNING_SECRET not found in supabase/functions/.env");
  return line.slice("REPLICATE_WEBHOOK_SIGNING_SECRET=".length).trim();
}

/** svix signature: HMAC-SHA256 over `${id}.${ts}.${body}`, base64-decoded key. */
function signSvix(secret: string, id: string, ts: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

/** POST a callback. With `secret`, sign correctly; with `badSignature`, send that verbatim. */
async function postCallback(
  jobId: string,
  body: string,
  opts: { secret?: string; badSignature?: string },
): Promise<{ status: number; text: string }> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const wid = `msg_${randomUUID()}`;
  let signature: string;
  if (opts.badSignature) signature = opts.badSignature;
  else if (opts.secret) signature = signSvix(opts.secret, wid, ts, body);
  else throw new Error("postCallback: provide secret or badSignature");
  const res = await fetch(`${FUNCTION_URL}/callback?jobId=${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": wid,
      "webhook-timestamp": ts,
      "webhook-signature": signature,
    },
    body,
  });
  return { status: res.status, text: await res.text() };
}

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const created = { userIds: [] as string[], paths: [] as string[] };

async function seedProcessingJob(): Promise<{
  jobId: string;
  userId: string;
  predictionId: string;
  sourcePath: string;
}> {
  const email = `phase3-${randomUUID()}@example.test`;
  const { data: user, error: userErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (userErr) throw new Error(`createUser failed: ${userErr.message}`);
  const userId = user.user.id;
  created.userIds.push(userId);

  const jobId = randomUUID();
  const predictionId = `pred_${randomUUID()}`;
  const sourcePath = `${userId}/${jobId}/source.jpg`;
  created.paths.push(sourcePath);

  // Dummy source bytes so the success path's source-delete has something to remove.
  const dummy = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const up = await admin.storage.from(BUCKET).upload(sourcePath, dummy, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`source upload failed: ${up.error.message}`);

  const ins = await admin.from("jobs").insert({
    id: jobId,
    user_id: userId,
    status: "processing",
    source_path: sourcePath,
    replicate_prediction_id: predictionId,
  });
  if (ins.error) throw new Error(`job insert failed: ${ins.error.message}`);

  return { jobId, userId, predictionId, sourcePath };
}

async function readJob(jobId: string): Promise<Record<string, unknown>> {
  const { data, error } = (await admin.from("jobs").select("*").eq("id", jobId).single()) as {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  };
  if (error || !data) throw new Error(`readJob failed: ${error?.message ?? "no row"}`);
  return data;
}

async function objectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await admin.storage.from(BUCKET).list(dir);
  if (error) return false;
  return data.some((o) => o.name === name);
}

function assert(label: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function caseSuccess() {
  console.log("\n[3.3] success → succeeded + result stored + source deleted");
  const secret = readSigningSecret();
  const { jobId, predictionId, sourcePath } = await seedProcessingJob();
  const body = JSON.stringify({ id: predictionId, status: "succeeded", output: OUTPUT_IMAGE_URL });
  const res = await postCallback(jobId, body, { secret });
  console.log(`  → HTTP ${res.status} ${res.text}`);
  const job = await readJob(jobId);
  assert("HTTP 200", res.status === 200);
  assert("status == succeeded", job.status === "succeeded");
  assert("result_path set", typeof job.result_path === "string" && job.result_path.length > 0);
  if (typeof job.result_path === "string") {
    created.paths.push(job.result_path);
    assert("result object exists", await objectExists(job.result_path));
  }
  assert("source object deleted", !(await objectExists(sourcePath)));
  assert("replicate_prediction_id preserved", job.replicate_prediction_id === predictionId);
  return jobId;
}

async function caseFailure() {
  console.log("\n[3.4] failed status → job failed with error fields");
  const secret = readSigningSecret();
  const { jobId, predictionId } = await seedProcessingJob();
  const body = JSON.stringify({ id: predictionId, status: "failed", error: "synthetic failure" });
  const res = await postCallback(jobId, body, { secret });
  console.log(`  → HTTP ${res.status} ${res.text}`);
  const job = await readJob(jobId);
  assert("HTTP 200", res.status === 200);
  assert("status == failed", job.status === "failed");
  assert("error_code == replicate_failed", job.error_code === "replicate_failed");
  assert("error_message set", typeof job.error_message === "string" && job.error_message.length > 0);
}

async function caseBadSignature() {
  console.log("\n[3.5] invalid signature → 401, no mutation");
  const { jobId, predictionId } = await seedProcessingJob();
  const body = JSON.stringify({ id: predictionId, status: "succeeded", output: OUTPUT_IMAGE_URL });
  const res = await postCallback(jobId, body, { badSignature: "v1,deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef=" });
  console.log(`  → HTTP ${res.status} ${res.text}`);
  const job = await readJob(jobId);
  assert("HTTP 401", res.status === 401);
  assert("status unchanged (still processing)", job.status === "processing");
}

async function cleanup() {
  console.log("\n[cleanup] removing test objects + users");
  for (const p of created.paths) {
    try {
      await admin.storage.from(BUCKET).remove([p]);
    } catch {
      /* best-effort */
    }
  }
  for (const u of created.userIds) {
    try {
      await admin.from("jobs").delete().eq("user_id", u);
      await admin.auth.admin.deleteUser(u);
    } catch {
      /* best-effort */
    }
  }
}

async function main() {
  console.log(`Phase 3 /callback harness → ${FUNCTION_URL}`);
  console.log(`Output image: ${OUTPUT_IMAGE_URL}`);
  try {
    await caseSuccess();
    await caseFailure();
    await caseBadSignature();
  } finally {
    await cleanup();
  }
  console.log(process.exitCode ? "\nRESULT: FAIL (see ✗ above)" : "\nRESULT: PASS");
}

await main();
