/**
 * D.1 Phase-2 deterministic retention harness — no Replicate, no API token.
 *
 * Exits 0 iff all three assertions pass; re-runnable (each case seeds + cleans
 * its own user/job). Validates the S-08 retention invariants against the LOCAL
 * stack via the shared service layer + a crafted signed `/callback`:
 *
 *   2a — failed-job source delete: markJobFailed flips a processing row → failed
 *        and deletes the source (returns true).
 *   2b — create-job sweep: sweepStalePendingJobsForOwner reclaims a backdated
 *        stale row, deletes its source, and (pre-model row) releases its daily-cap
 *        slot — asserted as the countCloudJobsToday DELTA around the single sweep.
 *   2c-i — late-/callback idempotency: a row flipped to `failed` (watchdog sim)
 *        then hit with a valid signed success callback returns
 *        200 {ignored:"already_terminal"}, stays `failed` (no resurrection), and
 *        creates NO result object. (The true F5/F9 cleanup branch is covered by
 *        the S-08 unit test + impl-review; not black-box reproducible.)
 *
 * Run (local stack up; `supabase functions serve enhance --env-file
 * supabase/functions/.env` running):
 *   SERVICE_ROLE_KEY=... npx tsx scripts/spikes/d1-retention-check.ts
 *
 * `SERVICE_ROLE_KEY` from `npx supabase status -o json`. The signing secret is
 * read from supabase/functions/.env (same as phase3-callback-test.ts).
 */
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  markJobFailed,
  markPendingJobFailedForOwner,
  sweepStalePendingJobsForOwner,
  countCloudJobsToday,
} from "../../src/lib/services/photo-job.service.ts";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) throw new Error("SERVICE_ROLE_KEY env required (npx supabase status -o json)");
const FUNCTION_URL = process.env.FUNCTION_URL ?? `${API_URL}/functions/v1/enhance`;
const BUCKET = "photos";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const created = { userIds: [] as string[], paths: [] as string[] };

function readSigningSecret(): string {
  const env = readFileSync("supabase/functions/.env", "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("REPLICATE_WEBHOOK_SIGNING_SECRET="));
  if (!line) throw new Error("REPLICATE_WEBHOOK_SIGNING_SECRET not in supabase/functions/.env");
  return line.slice("REPLICATE_WEBHOOK_SIGNING_SECRET=".length).trim();
}
function signSvix(secret: string, id: string, ts: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}
async function postCallback(jobId: string, body: string, secret: string): Promise<{ status: number; text: string }> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const wid = `msg_${randomUUID()}`;
  const res = await fetch(`${FUNCTION_URL}/callback?jobId=${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": wid,
      "webhook-timestamp": ts,
      "webhook-signature": signSvix(secret, wid, ts, body),
    },
    body,
  });
  return { status: res.status, text: await res.text() };
}
async function listDir(dir: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(BUCKET).list(dir);
  return error || !data ? [] : data.map((o) => o.name);
}
async function objectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  return (await listDir(path.slice(0, slash))).includes(path.slice(slash + 1));
}
async function newUser(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: `d1-${randomUUID()}@example.test`, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  created.userIds.push(data.user.id);
  return data.user.id;
}
async function uploadSource(userId: string, jobId: string): Promise<string> {
  const path = `${userId}/${jobId}/source.jpg`;
  created.paths.push(path);
  const up = await admin.storage.from(BUCKET).upload(path, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) throw new Error(`source upload: ${up.error.message}`);
  return path;
}
/** Seed a row directly as `processing` (NOT `queued`) so the queued-only webhook trigger never fires /start. */
async function seedProcessing(opts: { predictionId?: string | null; createdAtIso?: string }): Promise<{
  jobId: string;
  userId: string;
  sourcePath: string;
}> {
  const userId = await newUser();
  const jobId = randomUUID();
  const sourcePath = await uploadSource(userId, jobId);
  const row: Record<string, unknown> = {
    id: jobId,
    user_id: userId,
    status: "processing",
    source_path: sourcePath,
    replicate_prediction_id: opts.predictionId ?? null,
  };
  if (opts.createdAtIso) row.created_at = opts.createdAtIso;
  const ins = await admin.from("jobs").insert(row);
  if (ins.error) throw new Error(`job insert: ${ins.error.message}`);
  return { jobId, userId, sourcePath };
}
async function readJob(jobId: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  return data as Record<string, unknown> | null;
}
function assert(label: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function case2a() {
  console.log("\n[2a] failed-job source delete");
  const { jobId, sourcePath } = await seedProcessing({ predictionId: "pred_2a" });
  const flipped = await markJobFailed(admin, { jobId, errorCode: "callback_failed", errorMessage: "synthetic" });
  const job = await readJob(jobId);
  assert("markJobFailed returned true", flipped === true);
  assert("status == failed", job?.status === "failed");
  assert("source object deleted", !(await objectExists(sourcePath)));
}

async function case2b() {
  console.log("\n[2b] create-job sweep reclaims a stale row + releases its cap slot");
  // Backdate 65 min (> STALE_PENDING_JOB_MS 1h); pre-model (prediction_id NULL) so the cap excludes it once failed.
  const createdAtIso = new Date(Date.now() - 65 * 60 * 1000).toISOString();
  const { jobId, userId, sourcePath } = await seedProcessing({ predictionId: null, createdAtIso });
  const countBefore = await countCloudJobsToday(admin);
  const swept = await sweepStalePendingJobsForOwner(admin, userId);
  const countAfter = await countCloudJobsToday(admin);
  const job = await readJob(jobId);
  assert("swept >= 1", swept >= 1);
  assert("status == failed", job?.status === "failed");
  assert("error_code == abandoned", job?.error_code === "abandoned");
  assert("source object deleted", !(await objectExists(sourcePath)));
  assert("cap-slot released (count delta == 1)", countBefore - countAfter === 1);
}

async function case2cI() {
  console.log("\n[2c-i] late-/callback idempotency (already_terminal, no resurrection/orphan)");
  const secret = readSigningSecret();
  const predictionId = `pred_2c_${randomUUID()}`;
  const { jobId, userId } = await seedProcessing({ predictionId });
  // Watchdog sim: flip processing → failed (owner-scoped). prediction_id is preserved.
  const flipped = await markPendingJobFailedForOwner(admin, { jobId, userId, errorCode: "timeout", errorMessage: "no result in time" });
  assert("watchdog flip returned true", flipped === true);
  // Deliver a valid signed SUCCESS callback for the same prediction id.
  const body = JSON.stringify({ id: predictionId, status: "succeeded", output: "https://picsum.photos/seed/d1/120/120" });
  const res = await postCallback(jobId, body, secret);
  console.log(`  → HTTP ${res.status} ${res.text}`);
  const job = await readJob(jobId);
  assert("HTTP 200", res.status === 200);
  assert("body ignored:already_terminal", /already_terminal/.test(res.text));
  assert("row stays failed (no resurrection)", job?.status === "failed");
  assert("result_path still null", job?.result_path == null);
  assert("no result object created", !(await listDir(`${userId}/${jobId}`)).some((n) => n.startsWith("result.")));
}

async function cleanup() {
  console.log("\n[cleanup] removing test objects + users");
  for (const p of created.paths) {
    try { await admin.storage.from(BUCKET).remove([p]); } catch { /* best-effort */ }
  }
  for (const u of created.userIds) {
    try { await admin.from("jobs").delete().eq("user_id", u); await admin.auth.admin.deleteUser(u); } catch { /* best-effort */ }
  }
}

async function main() {
  console.log(`D.1 retention harness → ${FUNCTION_URL}`);
  try {
    await case2a();
    await case2b();
    await case2cI();
  } finally {
    await cleanup();
  }
  console.log(process.exitCode ? "\nRESULT: FAIL (see ✗ above)" : "\nRESULT: PASS");
}
await main();
