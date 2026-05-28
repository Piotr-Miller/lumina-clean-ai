import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatePhotoJobCommand, CreatePhotoJobResponse, MarkJobSucceededCommand } from "@/types";

const PHOTOS_BUCKET = "photos";
const JOBS_TABLE = "jobs";

/**
 * Mint a one-shot signed upload URL for a new photo source object and
 * insert the matching `queued` row in `public.jobs`. The client then PUTs
 * the file directly to the signed URL via `uploadToSignedUrl`.
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
  // SELECT the source_path before the UPDATE so we know what to delete
  // even if the row's mutated state would lose that information.
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
