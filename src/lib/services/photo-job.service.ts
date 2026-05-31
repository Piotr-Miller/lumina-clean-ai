import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreatePhotoJobCommand,
  CreatePhotoJobResponse,
  MarkJobFailedCommand,
  MarkJobProcessingCommand,
  MarkJobSucceededCommand,
  MarkPendingJobFailedCommand,
  PhotoJob,
} from "@/types";

const PHOTOS_BUCKET = "photos";
const JOBS_TABLE = "jobs";

/**
 * Mint a one-shot signed upload URL for a new photo source object and
 * insert the matching `queued` row in `public.jobs`. The client then PUTs
 * the file directly to the absolute signed URL.
 *
 * The signed URL is **one-shot**: if the client retries the upload (e.g.,
 * after a network failure), the caller must invoke `createPhotoJob` again
 * to mint a fresh token. S-03 should design its retry UX accordingly.
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 * `cmd.userId` is authoritative caller context (typically
 * `context.locals.user.id`) — never client-supplied.
 */
export async function createPhotoJob(
  admin: SupabaseClient,
  cmd: CreatePhotoJobCommand,
): Promise<CreatePhotoJobResponse> {
  const jobId = crypto.randomUUID();
  const sourcePath = `${cmd.userId}/${jobId}/source.${cmd.fileExtension}`;

  const { data: signed, error: signError } = await admin.storage.from(PHOTOS_BUCKET).createSignedUploadUrl(sourcePath);
  if (signError) {
    throw new Error(`createPhotoJob: failed to mint signed upload URL for ${sourcePath}: ${signError.message}`);
  }

  const { error: insertError } = await admin.from(JOBS_TABLE).insert({
    id: jobId,
    user_id: cmd.userId,
    status: "queued",
    source_path: sourcePath,
  });
  if (insertError) {
    throw new Error(`createPhotoJob: failed to insert job row ${jobId}: ${insertError.message}`);
  }

  return {
    jobId,
    uploadUrl: signed.signedUrl,
    uploadToken: signed.token,
    sourcePath,
  };
}

/**
 * Mark a job as `succeeded` and delete its source object from Storage in
 * the same call. This is the foundation's enforcement point for the PRD
 * ≤24h source-retention NFR — every successful job triggers source cleanup
 * via this helper.
 *
 * Ordering: row UPDATE first, then Storage delete. If the Storage delete
 * fails, the row stays at `succeeded` (the user-visible result is intact);
 * a missed source delete is an operator-cleanup concern, not a user-facing
 * error. A console.warn captures the orphan for later sweeps.
 *
 * Failed jobs are out of scope for source cleanup in v1 (documented v1
 * limitation; re-evaluated alongside Admin role in v2).
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function markJobSucceeded(admin: SupabaseClient, cmd: MarkJobSucceededCommand): Promise<void> {
  // Caller supplies jobId only; source_path lives on the row.
  const { data: row, error: readError } = await admin
    .from(JOBS_TABLE)
    .select("source_path")
    .eq("id", cmd.jobId)
    .single();
  if (readError) {
    throw new Error(`markJobSucceeded: job ${cmd.jobId} not found: ${readError.message}`);
  }

  const { error: updateError } = await admin
    .from(JOBS_TABLE)
    .update({
      status: "succeeded",
      result_path: cmd.resultPath,
      replicate_prediction_id: cmd.replicatePredictionId ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", cmd.jobId);
  if (updateError) {
    throw new Error(`markJobSucceeded: failed to update job ${cmd.jobId}: ${updateError.message}`);
  }

  const sourcePath = row.source_path as string;
  const { error: removeError } = await admin.storage.from(PHOTOS_BUCKET).remove([sourcePath]);
  if (removeError) {
    // Intentional: orphaned source is an operator-cleanup concern, not a
    // user-facing error. The user-visible result_path is intact.
    // eslint-disable-next-line no-console
    console.warn(`markJobSucceeded: source delete for job ${cmd.jobId} (${sourcePath}) failed: ${removeError.message}`);
  }
}

/**
 * Read a single job row by id (including `source_path` / `user_id`), or `null`
 * when no row matches. The Edge Function `/start` route uses this to resolve
 * the source object before minting the Replicate input URL.
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function getJobById(admin: SupabaseClient, jobId: string): Promise<PhotoJob | null> {
  const { data, error } = (await admin.from(JOBS_TABLE).select("*").eq("id", jobId).maybeSingle()) as {
    data: PhotoJob | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(`getJobById: failed to read job ${jobId}: ${error.message}`);
  }
  return data;
}

/**
 * Mark a job as `processing` and (optionally) store the Replicate prediction
 * id used later as the `/callback` integrity cross-check. No timestamps beyond
 * the DB-trigger-owned `updated_at` are touched (the job is still in flight).
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function markJobProcessing(admin: SupabaseClient, cmd: MarkJobProcessingCommand): Promise<void> {
  const { error } = await admin
    .from(JOBS_TABLE)
    .update({
      status: "processing",
      replicate_prediction_id: cmd.replicatePredictionId ?? null,
    })
    .eq("id", cmd.jobId);
  if (error) {
    throw new Error(`markJobProcessing: failed to update job ${cmd.jobId}: ${error.message}`);
  }
}

/**
 * Mark a job as `failed` with an error code/message and stamp `completed_at`.
 * No source cleanup in v1 (failed jobs are out of scope for retention; mirrors
 * {@link markJobSucceeded}'s documented limitation).
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function markJobFailed(admin: SupabaseClient, cmd: MarkJobFailedCommand): Promise<void> {
  const { error } = await admin
    .from(JOBS_TABLE)
    .update({
      status: "failed",
      error_code: cmd.errorCode,
      error_message: cmd.errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", cmd.jobId);
  if (error) {
    throw new Error(`markJobFailed: failed to update job ${cmd.jobId}: ${error.message}`);
  }
}

/**
 * Owner-scoped, race-safe transition to `failed` for the client watchdog's
 * timeout route. A SINGLE guarded UPDATE flips the row only when it is still
 * `queued`/`processing` AND owned by `userId`; the `select` makes the affected
 * rows observable so the boolean return distinguishes "flipped to failed" from
 * "already terminal" (a Replicate success that landed first is left untouched —
 * no read-then-write race).
 *
 * Returns `true` iff a row was actually transitioned.
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function markPendingJobFailedForOwner(
  admin: SupabaseClient,
  cmd: MarkPendingJobFailedCommand,
): Promise<boolean> {
  const { data, error } = await admin
    .from(JOBS_TABLE)
    .update({
      status: "failed",
      error_code: cmd.errorCode,
      error_message: cmd.errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", cmd.jobId)
    .eq("user_id", cmd.userId)
    .in("status", ["queued", "processing"])
    .select("id");
  if (error) {
    throw new Error(`markPendingJobFailedForOwner: failed to update job ${cmd.jobId}: ${error.message}`);
  }
  return data.length > 0;
}

/**
 * Mint a short-TTL signed READ URL for a private `photos` object. The Edge
 * Function `/start` route passes this as Bread's `image` input (Replicate needs
 * a fetchable URL); the browser re-mints a result URL on demand.
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function createSignedReadUrl(
  admin: SupabaseClient,
  path: string,
  expiresInSeconds: number,
): Promise<string> {
  const { data, error } = await admin.storage.from(PHOTOS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) {
    throw new Error(`createSignedReadUrl: failed to sign ${path}: ${error.message}`);
  }
  return data.signedUrl;
}
