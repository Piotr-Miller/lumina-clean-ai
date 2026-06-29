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
  /** Pinned Bread model version the job ran (S-11). Written once at prediction-create; null for legacy/pre-S-11 rows. */
  model_version: string | null;
  /** Per-job Bread gamma chosen in the panel (S-12). Null → Edge Function uses the locked default. */
  gamma: number | null;
  /** Per-job Bread strength chosen in the panel (S-12). Null → Edge Function uses the locked default. */
  strength: number | null;
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
  /** Optional Bread params (S-12). Omitted → row stores null and the Edge Function uses locked defaults. */
  gamma?: number;
  strength?: number;
}

/**
 * Request body for `POST /api/enhance/cloud/create-job`. `userId` is NOT part
 * of the body — the route derives it from the session. HEIC is excluded
 * (S-03 only sends JPG/PNG). Mirrored by `createPhotoJobRequestSchema`.
 */
export interface CreatePhotoJobRequest {
  fileExtension: "jpg" | "png";
  mimeType: "image/jpeg" | "image/png";
  /** Optional Bread params (S-12), bound-validated by `createPhotoJobRequestSchema` (gamma ≤ 1.5, strength ≤ 0.2). */
  gamma?: number;
  strength?: number;
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
 * Input to {@link recordJobPrediction}. Called by S-04's Edge Function `/start`
 * route after it claims the job and creates the Replicate prediction. `replicatePredictionId` is
 * stored so `/callback` can cross-check the completion payload. `modelVersion`
 * is the pinned Bread version the prediction ran (S-11 telemetry) — required so
 * every processing row records it; `markJobSucceeded` never overwrites it.
 */
export interface RecordJobPredictionCommand {
  jobId: string;
  replicatePredictionId: string;
  modelVersion: string;
}

/**
 * Input to {@link markJobFailed}. Called by S-04's Edge Function on a pipeline
 * error or a failed Replicate prediction. On a confirmed flip the source object
 * is deleted (S-08: the failed-path half of the ≤24h source-retention NFR).
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
