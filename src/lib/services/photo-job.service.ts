import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreatePhotoJobCommand,
  CreatePhotoJobResponse,
  MarkJobFailedCommand,
  MarkJobSucceededCommand,
  MarkPendingJobFailedCommand,
  PhotoJob,
  RecordJobPredictionCommand,
} from "@/types";

const PHOTOS_BUCKET = "photos";
const JOBS_TABLE = "jobs";

// Stale-pending sweep bounds (S-08 Phase 3). A non-terminal row older than this
// is treated as a browser-closed stall no inline hook can reach: the client
// watchdog never fired (tab gone) and no `/callback` will arrive. 1h sits far
// above the 5-min processing watchdog + the worst observed cold-boot tail
// (>300s under platform load, per the SOURCE_URL_TTL note in enhance/index.ts)
// + Replicate's ~30-min run window, yet far below the 24h retention window — so
// the sweep never flips a legitimately in-flight job.
const STALE_PENDING_JOB_MS = 3_600_000;
// Per-call ceiling on how many stale rows one create-job sweep reclaims. Keeps
// the best-effort pass cheap; a larger backlog drains over subsequent submits
// (surfaced via console.warn — no silent cap).
const SWEEP_MAX = 100;
// Scheduled-reaper source-retention window. A `source.*` object older than this
// is an orphan by definition (every terminal path deletes the source on its
// flip), so the global reaper removes it regardless of job status. 23h pairs
// with the hourly cron so worst-case object age (run interval + threshold) stays
// within the ≤24h retention NFR (Risk #5).
const ABANDONED_SOURCE_RETENTION_MS = 82_800_000; // 23h

// Observability seam (Phase 3 of sentry-integration). This module is imported by
// BOTH runtimes — the workerd app (@sentry/cloudflare) and the Deno Edge Function
// (@sentry/deno) — so it MUST stay SDK-free. Each runtime wires its own Sentry at
// init via setObservabilityWarnCapture; the default is log-only (no-op). The
// best-effort swallow sites below call it ALONGSIDE their existing console.warn so
// silent degradation surfaces as a Sentry *warning* (not an error — no alert noise
// or quota burn). Capture-hook failures must never affect job logic, so the swallow
// behavior is unchanged. The shared scrub (sentry-scrub.ts) redacts the message.
type WarnCapture = (message: string) => void;
let captureWarning: WarnCapture = () => undefined;
export function setObservabilityWarnCapture(fn: WarnCapture): void {
  captureWarning = fn;
}

/**
 * Best-effort delete of a private `photos` object, shared by every terminal
 * transition. Swallows storage errors with a `console.warn` — an orphaned
 * object is an operator-cleanup concern, never a user-facing failure — and
 * never throws. `admin` must be a service-role client (bypasses RLS); paths are
 * server-derived (`${userId}/${jobId}/...`), so no owner scoping is needed.
 * Deleting an absent object is a harmless no-op.
 */
async function bestEffortRemove(admin: SupabaseClient, path: string, label: string): Promise<void> {
  const { error } = await admin.storage.from(PHOTOS_BUCKET).remove([path]);
  if (error) {
    const msg = `${label}: object delete for ${path} failed: ${error.message}`;
    // eslint-disable-next-line no-console
    console.warn(msg);
    captureWarning(msg);
  }
}

/** Delete a job's source object (best-effort). See {@link bestEffortRemove}. */
export async function deleteJobSource(admin: SupabaseClient, sourcePath: string): Promise<void> {
  await bestEffortRemove(admin, sourcePath, "deleteJobSource");
}

/** Delete a job's result object (best-effort). See {@link bestEffortRemove}. */
export async function deleteJobResult(admin: SupabaseClient, resultPath: string): Promise<void> {
  await bestEffortRemove(admin, resultPath, "deleteJobResult");
}

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
 * Count today's *billable* cloud jobs across ALL users, for the S-05 global
 * daily cap (PRD FR-014). "Today" is the current UTC calendar day. A job
 * counts unless it is a pre-model failure — i.e. excluded only when
 * `status = 'failed' AND replicate_prediction_id IS NULL` (a failure that
 * never reached Replicate, so it cost nothing). Everything that did or will
 * likely invoke the model — `queued`/`processing`/`succeeded`, plus `failed`
 * rows that retain a `replicate_prediction_id` — is counted.
 *
 * The predicate is the De Morgan form of `NOT (failed AND id IS NULL)`:
 * `status <> 'failed' OR replicate_prediction_id IS NOT NULL`.
 *
 * This is a global (cross-user) count, so it MUST run via the service-role
 * `admin` client (RLS would otherwise scope it to one user). `admin` must be
 * built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function countCloudJobsToday(admin: SupabaseClient): Promise<number> {
  const now = new Date();
  const utcDayStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  // `head: true` returns only the count (data is null); read `count`, not data.
  const { count, error } = await admin
    .from(JOBS_TABLE)
    .select("id", { count: "exact", head: true })
    .gte("created_at", utcDayStartIso)
    .or("status.neq.failed,replicate_prediction_id.not.is.null");
  if (error) {
    throw new Error(`countCloudJobsToday: failed to count today's cloud jobs: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Pure over-cap decision for the create-job guard. `count >= cap` so a cap of
 * `0` rejects the first request (operator kill-switch) and `cap - 1` is the
 * last allowed slot. Kept env-free and side-effect-free so it is unit-testable
 * without loading the route (which imports `astro:env/server`).
 */
export function isOverDailyCap(count: number, cap: number): boolean {
  return count >= cap;
}

/**
 * Transition a job to `succeeded` (guarded: only a live `processing` row) and
 * delete its source object — the enforcement point for the ≤24h source-retention
 * NFR. Returns `true` iff the row was actually flipped.
 *
 * A single guarded UPDATE (`.eq("status","processing")`) closes the F9 TOCTOU
 * race: if the client watchdog already flipped the row to `failed`, this no-ops
 * (returns `false`) instead of resurrecting it, and the caller (`/callback`)
 * cleans up the result it uploaded. `processing` ONLY (not `[queued,processing]`)
 * is safe + intentional — a `queued` row can't match `/callback`'s fail-closed
 * prediction-id cross-check, so it never reaches here.
 *
 * Source delete fires only on a confirmed flip (best-effort; a missed delete is
 * an operator-cleanup concern, not a user-facing error).
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function markJobSucceeded(admin: SupabaseClient, cmd: MarkJobSucceededCommand): Promise<boolean> {
  const { data, error } = (await admin
    .from(JOBS_TABLE)
    .update({
      status: "succeeded",
      result_path: cmd.resultPath,
      replicate_prediction_id: cmd.replicatePredictionId ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", cmd.jobId)
    .eq("status", "processing")
    .select("source_path")) as {
    data: { source_path: string }[] | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(`markJobSucceeded: failed to update job ${cmd.jobId}: ${error.message}`);
  }
  const row = data?.[0];
  if (row) {
    await deleteJobSource(admin, row.source_path);
  }
  return Boolean(row);
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
 * Atomically claim a queued job for one `/start` invocation. The guarded
 * transition is the ownership boundary before any paid provider work starts.
 * Concurrent or replayed invocations receive `null` and must not create a
 * prediction. No timestamps beyond the DB-trigger-owned `updated_at` are
 * touched while the job remains in flight.
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function claimJobForProcessing(admin: SupabaseClient, jobId: string): Promise<PhotoJob | null> {
  const { data, error } = (await admin
    .from(JOBS_TABLE)
    .update({ status: "processing" })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle()) as {
    data: PhotoJob | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(`claimJobForProcessing: failed to claim job ${jobId}: ${error.message}`);
  }
  return data;
}

/**
 * Persist the provider identity for a claimed processing job exactly once.
 * Both NULL guards are load-bearing: a replay or competing invocation cannot
 * replace the prediction id or pinned model version after either is set.
 * Returns false when the row was terminalized or already populated.
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function recordJobPrediction(admin: SupabaseClient, cmd: RecordJobPredictionCommand): Promise<boolean> {
  const { data, error } = (await admin
    .from(JOBS_TABLE)
    .update({
      replicate_prediction_id: cmd.replicatePredictionId,
      model_version: cmd.modelVersion,
    })
    .eq("id", cmd.jobId)
    .eq("status", "processing")
    .is("replicate_prediction_id", null)
    .is("model_version", null)
    .select("id")
    .maybeSingle()) as {
    data: { id: string } | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(`recordJobPrediction: failed to update job ${cmd.jobId}: ${error.message}`);
  }
  return Boolean(data);
}

/**
 * Guarded transition to `failed` with an error code/message + `completed_at`,
 * and delete the source object when (and only when) the row actually flips.
 * Only a still-pending row (`queued`/`processing`) transitions; a no-op on an
 * already-terminal row skips the delete. Returns `true` iff a row was flipped
 * (callers may ignore it). Closes the failed-path half of the ≤24h
 * source-retention NFR (S-08).
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function markJobFailed(admin: SupabaseClient, cmd: MarkJobFailedCommand): Promise<boolean> {
  const { data, error } = (await admin
    .from(JOBS_TABLE)
    .update({
      status: "failed",
      error_code: cmd.errorCode,
      error_message: cmd.errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", cmd.jobId)
    .in("status", ["queued", "processing"])
    .select("id, source_path")) as {
    data: { id: string; source_path: string }[] | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(`markJobFailed: failed to update job ${cmd.jobId}: ${error.message}`);
  }
  const row = data?.[0];
  if (row) {
    await deleteJobSource(admin, row.source_path);
  }
  return Boolean(row);
}

/**
 * Owner-scoped, race-safe transition to `failed` for the client watchdog's
 * timeout route. A SINGLE guarded UPDATE flips the row only when it is still
 * `queued`/`processing` AND owned by `userId`; the `select` makes the affected
 * rows observable so the boolean return distinguishes "flipped to failed" from
 * "already terminal" (a Replicate success that landed first is left untouched —
 * no read-then-write race). On a confirmed flip the source object is deleted
 * (S-08: the browser-open client-timeout half of the ≤24h source-retention NFR).
 *
 * Returns `true` iff a row was actually transitioned.
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function markPendingJobFailedForOwner(
  admin: SupabaseClient,
  cmd: MarkPendingJobFailedCommand,
): Promise<boolean> {
  const { data, error } = (await admin
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
    .select("id, source_path")) as {
    data: { id: string; source_path: string }[] | null;
    error: { message: string } | null;
  };
  if (error) {
    throw new Error(`markPendingJobFailedForOwner: failed to update job ${cmd.jobId}: ${error.message}`);
  }
  const row = data?.[0];
  if (row) {
    await deleteJobSource(admin, row.source_path);
  }
  return Boolean(row);
}

/**
 * Owner-scoped, bounded, best-effort reclaim of the caller's OWN stale
 * non-terminal jobs (and their source objects) — the one ≤24h-retention case no
 * inline terminal hook reaches: a browser-closed stall where the client watchdog
 * never fired and no `/callback` will arrive. Selects up to `max` of the caller's
 * `queued`/`processing` rows older than `staleMs` (oldest first), flips them to
 * `failed` (`error_code: "abandoned"`) in one guarded UPDATE, and deletes all
 * their sources in a SINGLE batched `storage.remove`. Returns the swept count;
 * warns when it hits `max` (no silent cap — more may remain, draining on later
 * submits). **Never throws** — a sweep fault must never block job creation.
 *
 * Cap interaction (intended): flipping a pre-model abandoned row
 * (`replicate_prediction_id IS NULL`) to `failed` releases its daily-cap slot,
 * since {@link countCloudJobsToday} excludes `failed AND prediction_id IS NULL`
 * (a job that never invoked Replicate cost nothing). Rows that reached Replicate
 * stay counted. The sweep thus makes the cap tally *more* accurate.
 *
 * `admin` must be built via `createAdminClient` (server-only, bypasses RLS).
 */
export async function sweepStalePendingJobsForOwner(
  admin: SupabaseClient,
  userId: string,
  opts?: { staleMs?: number; max?: number },
): Promise<number> {
  const staleMs = opts?.staleMs ?? STALE_PENDING_JOB_MS;
  const max = opts?.max ?? SWEEP_MAX;
  try {
    const thresholdIso = new Date(Date.now() - staleMs).toISOString();

    // 1. Find the caller's stale non-terminal rows (oldest first, bounded).
    const { data: stale, error: selectError } = (await admin
      .from(JOBS_TABLE)
      .select("id, source_path")
      .eq("user_id", userId)
      .in("status", ["queued", "processing"])
      .lt("created_at", thresholdIso)
      .order("created_at", { ascending: true })
      .limit(max)) as {
      data: { id: string; source_path: string }[] | null;
      error: { message: string } | null;
    };
    if (selectError) {
      throw new Error(selectError.message);
    }
    const rows = stale ?? [];
    if (rows.length === 0) {
      return 0;
    }

    // 2. Guarded flip → failed for exactly those ids — still owner-scoped AND
    //    still non-terminal, so a row that terminalized between the select and
    //    here (a late /callback, the watchdog) is left untouched. The `select`
    //    drives the source deletes off the rows that actually flipped.
    const ids = rows.map((r) => r.id);
    const { data: flipped, error: updateError } = (await admin
      .from(JOBS_TABLE)
      .update({
        status: "failed",
        error_code: "abandoned",
        error_message: "Reclaimed: job stalled past the retention window with no terminal event.",
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .in("id", ids)
      .in("status", ["queued", "processing"])
      .select("source_path")) as {
      data: { source_path: string }[] | null;
      error: { message: string } | null;
    };
    if (updateError) {
      throw new Error(updateError.message);
    }
    const flippedRows = flipped ?? [];

    // 3. SINGLE batched delete for all flipped sources (supabase-js `.remove()`
    //    takes a path array). Absent objects are harmless no-ops. Best-effort:
    //    a storage error is warned, never thrown.
    const sourcePaths = flippedRows.map((r) => r.source_path).filter(Boolean);
    if (sourcePaths.length > 0) {
      const { error: removeError } = await admin.storage.from(PHOTOS_BUCKET).remove(sourcePaths);
      if (removeError) {
        // eslint-disable-next-line no-console
        console.warn(`sweepStalePendingJobsForOwner: source batch delete failed: ${removeError.message}`);
      }
    }

    const sweptCount = flippedRows.length;
    if (sweptCount >= max) {
      // eslint-disable-next-line no-console
      console.warn(
        `sweepStalePendingJobsForOwner: hit the ${max}-row cap for user ${userId} — ` +
          `more stale rows may remain and will drain on subsequent submits.`,
      );
    }
    return sweptCount;
  } catch (err) {
    // Best-effort: never block job creation. Log + capture, report zero swept.
    const msg = `sweepStalePendingJobsForOwner: sweep failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`;
    // eslint-disable-next-line no-console
    console.warn(msg);
    captureWarning(msg);
    return 0;
  }
}

/**
 * Cross-user, scheduled retention reaper — the owner-agnostic backstop for the
 * ≤24h source-retention NFR (Risk #5). Runs two independent best-effort passes:
 *
 *  1. **Row-flip (SQL only).** Flip every non-terminal (`queued`/`processing`)
 *     job older than `staleMs` → `failed` (`error_code: "abandoned"`) in one
 *     guarded UPDATE. Touches only `jobs`; it does NOT delete sources (pass 2
 *     owns all deletes). This is {@link sweepStalePendingJobsForOwner}'s flip
 *     minus the `user_id` filter — it keeps the DB consistent and the daily-cap
 *     tally accurate for users who never return.
 *  2. **Storage-first delete.** Delete EVERY `source.*` object older than
 *     `retentionMs` via the Storage API, regardless of job status — the literal
 *     NFR invariant. Status-agnostic, so it catches the gaps the inline terminal
 *     hooks structurally cannot reach: legacy already-terminal orphans,
 *     abandon-and-never-return, and best-effort-delete failures. Stale paths
 *     come from the `stale_source_object_paths` RPC (a SECURITY DEFINER read of
 *     `storage.objects` — PostgREST doesn't expose the `storage` schema and SQL
 *     cannot delete the object).
 *
 * Each pass is isolated in its own try/catch and the function NEVER throws — a
 * reaper fault must not surface anywhere user-facing. Bounded by `max` with no
 * silent cap (warns when the stale source set hits the bound; the remainder
 * drains on the next run). Returns the `{ flipped, deleted }` counts.
 *
 * `admin` must be a service-role client (bypasses RLS; the RPC is granted to
 * `service_role` only). Thresholds are overridable via `opts` (used by tests to
 * drive staleness deterministically instead of backdating storage timestamps).
 */
export async function sweepAbandonedSourcesGlobally(
  admin: SupabaseClient,
  opts?: { staleMs?: number; retentionMs?: number; max?: number },
): Promise<{ flipped: number; deleted: number }> {
  const staleMs = opts?.staleMs ?? STALE_PENDING_JOB_MS;
  const retentionMs = opts?.retentionMs ?? ABANDONED_SOURCE_RETENTION_MS;
  const max = opts?.max ?? SWEEP_MAX;

  let flipped = 0;
  let deleted = 0;

  // Pass 1 — flip stale non-terminal rows (SQL only; pass 2 owns deletes).
  try {
    const staleIso = new Date(Date.now() - staleMs).toISOString();
    const { data, error } = (await admin
      .from(JOBS_TABLE)
      .update({
        status: "failed",
        error_code: "abandoned",
        error_message: "Reclaimed: job stalled past the retention window with no terminal event.",
        completed_at: new Date().toISOString(),
      })
      .in("status", ["queued", "processing"])
      .lt("created_at", staleIso)
      .select("id")) as { data: { id: string }[] | null; error: { message: string } | null };
    if (error) {
      throw new Error(error.message);
    }
    flipped = (data ?? []).length;
  } catch (err) {
    const msg = `sweepAbandonedSourcesGlobally: row-flip pass failed: ${err instanceof Error ? err.message : String(err)}`;
    // eslint-disable-next-line no-console
    console.warn(msg);
    captureWarning(msg);
  }

  // Pass 2 — storage-first delete of stale source objects (status-agnostic).
  try {
    const { data: paths, error: rpcError } = (await admin.rpc("stale_source_object_paths", {
      older_than_seconds: Math.floor(retentionMs / 1000),
      max_rows: max,
    })) as { data: { name: string }[] | null; error: { message: string } | null };
    if (rpcError) {
      throw new Error(rpcError.message);
    }
    const names = (paths ?? []).map((r) => r.name).filter(Boolean);
    if (names.length > 0) {
      const { error: removeError } = await admin.storage.from(PHOTOS_BUCKET).remove(names);
      if (removeError) {
        // eslint-disable-next-line no-console
        console.warn(`sweepAbandonedSourcesGlobally: source batch delete failed: ${removeError.message}`);
      } else {
        deleted = names.length;
      }
    }
    if (names.length >= max) {
      // eslint-disable-next-line no-console
      console.warn(
        `sweepAbandonedSourcesGlobally: hit the ${max}-object cap — more stale sources may remain and will drain next run.`,
      );
    }
  } catch (err) {
    const msg = `sweepAbandonedSourcesGlobally: storage-delete pass failed: ${err instanceof Error ? err.message : String(err)}`;
    // eslint-disable-next-line no-console
    console.warn(msg);
    captureWarning(msg);
  }

  return { flipped, deleted };
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
