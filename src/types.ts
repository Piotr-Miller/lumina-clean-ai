/**
 * Shared entity and DTO types for the LuminaClean app.
 *
 * Per CLAUDE.md hard rule, entities and DTOs live here (single canonical
 * `src/types.ts`). Service and API code imports from `@/types`.
 */

// ---------------------------------------------------------------------------
// PhotoJob (table: public.jobs)
// ---------------------------------------------------------------------------

/** Lifecycle state of a photo job. Mirrors `public.photo_job_status`. */
export type PhotoJobStatus = "queued" | "processing" | "succeeded" | "failed";

/** Row-shaped entity for `public.jobs`. Timestamp columns serialize as ISO strings. */
export interface PhotoJob {
  id: string;
  user_id: string;
  status: PhotoJobStatus;
  source_path: string;
  result_path: string | null;
  replicate_prediction_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// DTOs for photo-job.service.ts
// ---------------------------------------------------------------------------

/** Input to {@link createPhotoJob}. `userId` is authoritative caller context (never client-supplied). */
export interface CreatePhotoJobCommand {
  userId: string;
  fileExtension: "jpg" | "png" | "heic";
  mimeType: "image/jpeg" | "image/png" | "image/heic";
}

/**
 * Request body for `POST /api/enhance/cloud/create-job`. `userId` is NOT part
 * of the body — the route derives it from the session. HEIC is excluded
 * (S-03 only sends JPG/PNG). Mirrored by `createPhotoJobRequestSchema`.
 */
export interface CreatePhotoJobRequest {
  fileExtension: "jpg" | "png";
  mimeType: "image/jpeg" | "image/png";
}

/** Output of {@link createPhotoJob}. S-03 uploads with raw PUT to the absolute `uploadUrl`. */
export interface CreatePhotoJobResponse {
  jobId: string;
  uploadUrl: string;
  uploadToken: string;
  sourcePath: string;
}

/** Input to {@link markJobSucceeded}. Called by S-04's Edge Function when Replicate returns a result. */
export interface MarkJobSucceededCommand {
  jobId: string;
  resultPath: string;
  replicatePredictionId?: string;
}

/**
 * Input to {@link markJobProcessing}. Called by S-04's Edge Function `/start`
 * route after it creates the Replicate prediction. `replicatePredictionId` is
 * stored so `/callback` can cross-check the completion payload.
 */
export interface MarkJobProcessingCommand {
  jobId: string;
  replicatePredictionId?: string;
}

/**
 * Input to {@link markJobFailed}. Called by S-04's Edge Function on a pipeline
 * error or a failed Replicate prediction. No source cleanup in v1 (failed jobs
 * are out of scope for retention; mirrors {@link markJobSucceeded}'s note).
 */
export interface MarkJobFailedCommand {
  jobId: string;
  errorCode: string;
  errorMessage: string;
}

/**
 * Input to {@link markPendingJobFailedForOwner}. Used by the client watchdog's
 * `POST /api/enhance/cloud/timeout` route. The update is owner-scoped
 * (`userId`) and guarded to only flip rows still in a non-terminal state, so a
 * Replicate success that landed first is never overwritten (no read-then-write
 * race).
 */
export interface MarkPendingJobFailedCommand {
  jobId: string;
  userId: string;
  errorCode: string;
  errorMessage: string;
}
