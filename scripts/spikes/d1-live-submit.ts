/**
 * D.1 Phase-3 LIVE submit harness — real Replicate "Bread" via a cloudflared tunnel.
 *
 * Drives the FULL pipeline (no browser): createPhotoJob inserts a `queued` row →
 * the jobs_enqueue_webhook trigger fires /start → Replicate runs Bread →
 * /callback lands → markJobSucceeded flips `succeeded`, stores the result, deletes
 * the source. Mirrors the real client: it uploads the source to the signed URL
 * IMMEDIATELY after create, racing /start's signSourceWithRetry (the warm
 * webhook-vs-upload race — run this twice to exercise WARM, per lessons).
 *
 * Prereqs (all from the runbook): local stack up; `supabase functions serve enhance
 * --env-file supabase/functions/.env` running with REPLICATE_API_TOKEN +
 * EDGE_FUNCTION_URL=<tunnel>; cloudflared tunnel → 127.0.0.1:54321 live.
 *
 *   SERVICE_ROLE_KEY=... npx tsx scripts/spikes/d1-live-submit.ts [imageUrl]
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createPhotoJob } from "../../src/lib/services/photo-job.service.ts";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) throw new Error("SERVICE_ROLE_KEY env required (npx supabase status -o json)");
const SAMPLE_IMAGE = process.argv[2] ?? "https://picsum.photos/seed/d1live/640/480.jpg";
const BUCKET = "photos";
const POLL_MS = 2000;
const MAX_WAIT_MS = 6 * 60 * 1000; // cold boot can be multi-minute (S-09)

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface JobRow {
  status: string;
  result_path: string | null;
  error_code: string | null;
  error_message: string | null;
  replicate_prediction_id: string | null;
}

async function objectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const { data } = await admin.storage.from(BUCKET).list(path.slice(0, slash));
  return (data ?? []).some((o) => o.name === path.slice(slash + 1));
}
async function readJob(jobId: string): Promise<JobRow | null> {
  const { data } = (await admin.from("jobs").select("*").eq("id", jobId).maybeSingle()) as {
    data: JobRow | null;
  };
  return data;
}

async function main() {
  console.log(`Fetching sample RGB JPG: ${SAMPLE_IMAGE}`);
  const imgRes = await fetch(SAMPLE_IMAGE);
  if (!imgRes.ok) throw new Error(`sample fetch failed: ${imgRes.status}`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  console.log(`  ${bytes.length} bytes, content-type ${imgRes.headers.get("content-type")}`);

  const { data: user, error: uErr } = await admin.auth.admin.createUser({
    email: `d1live-${randomUUID()}@example.test`,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser: ${uErr.message}`);
  const userId = user.user.id;

  const t0 = Date.now();
  const { jobId, uploadToken, sourcePath } = await createPhotoJob(admin, {
    userId,
    fileExtension: "jpg",
    mimeType: "image/jpeg",
  });
  console.log(`job ${jobId} created (queued; webhook → /start fired). Uploading source now (racing /start)…`);

  const up = await admin.storage.from(BUCKET).uploadToSignedUrl(sourcePath, uploadToken, bytes, {
    contentType: "image/jpeg",
  });
  if (up.error) throw new Error(`source upload: ${up.error.message}`);
  console.log(`source uploaded ${Date.now() - t0}ms after create`);

  let job: JobRow | null = null;
  let last = "";
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    job = await readJob(jobId);
    if (job && job.status !== last) {
      const pred = job.replicate_prediction_id ? ` pred=${job.replicate_prediction_id}` : "";
      console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] status=${job.status}${pred}`);
      last = job.status;
    }
    if (job && (job.status === "succeeded" || job.status === "failed")) break;
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  const resultPresent = typeof job?.result_path === "string" && (await objectExists(job.result_path));
  const sourceGone = !(await objectExists(sourcePath));
  console.log("\n--- RESULT ---");
  console.log(`status:                ${job?.status ?? "(none)"}`);
  console.log(`secs_to_terminal:      ${secs}  (${secs > 90 ? "COLD boot" : "warm"})`);
  console.log(`result_path:           ${job?.result_path ?? "(none)"}`);
  console.log(`result object present: ${resultPresent}`);
  console.log(`source object deleted: ${sourceGone}`);
  if (job?.error_code)
    console.log(`error:                 ${job.error_code} — ${(job.error_message ?? "").slice(0, 160)}`);

  const pass = job?.status === "succeeded" && resultPresent && sourceGone;
  console.log(`\n3.2 ${pass ? "PASS" : "FAIL"} — live queued→processing→succeeded, source deleted, result present`);
  if (pass && secs > 90) console.log(`3.4 cold-boot: source URL survived a ${secs}s boot (3600s TTL) ✓`);

  // cleanup
  if (typeof job?.result_path === "string") await admin.storage.from(BUCKET).remove([job.result_path]);
  await admin.storage.from(BUCKET).remove([sourcePath]);
  await admin.from("jobs").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
  process.exitCode = pass ? 0 : 1;
}
await main();
