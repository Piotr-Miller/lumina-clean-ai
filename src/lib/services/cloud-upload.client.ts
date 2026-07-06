import { STRINGS } from "@/lib/enhance-strings";
import type { BreadParams } from "@/lib/engines/types";
import type { CreatePhotoJobRequest, CreatePhotoJobResponse } from "@/types";

/**
 * Client-side cloud submission: mint a job + upload the source directly to
 * the signed URL. Two steps, no supabase-js client:
 *
 *   1. POST {fileExtension, mimeType} to the create-job route → returns an
 *      absolute, token-bearing `uploadUrl`.
 *   2. Raw `PUT` the file bytes to `uploadUrl` (the token rides in the URL;
 *      POST would 403). Bytes go browser → Supabase, never through the Worker.
 *
 * `userId` and the storage path are derived server-side — the body only
 * carries the (advisory) format. Maps both legs' failures to user-facing
 * messages. Pure of any `astro:env` import so it's unit-testable.
 */

const CREATE_JOB_ENDPOINT = "/api/enhance/cloud/create-job";

/** User-facing copy per error envelope `code` from the create-job route. */
const ROUTE_MESSAGES: Record<string, string> = STRINGS.uploadErrors.route;

const GENERIC_ROUTE_MESSAGE = STRINGS.uploadErrors.genericRoute;

/**
 * Derive the create-job request body from a validated File and (optional) Bread
 * params. Defaults to JPEG; PNG is the only other branch. The params, when
 * present, ride this SINGLE create-job POST — the only cost-bearing path; no
 * slider/Auto action ever issues a request (S-12 cost-safety invariant).
 */
function deriveRequest(file: File, params?: BreadParams): CreatePhotoJobRequest {
  const base: CreatePhotoJobRequest =
    file.type === "image/png"
      ? { fileExtension: "png", mimeType: "image/png" }
      : { fileExtension: "jpg", mimeType: "image/jpeg" };
  return params ? { ...base, gamma: params.gamma, strength: params.strength } : base;
}

async function routeErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { code?: string } };
    const code = data.error?.code;
    if (code && code in ROUTE_MESSAGES) return ROUTE_MESSAGES[code];
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return GENERIC_ROUTE_MESSAGE;
}

function uploadErrorMessage(status: number): string {
  if (status === 413) return STRINGS.uploadErrors.uploadTooLarge;
  if (status === 403) return STRINGS.uploadErrors.uploadRejected;
  return STRINGS.uploadErrors.uploadFailed;
}

const NETWORK_MESSAGE = STRINGS.uploadErrors.network;

/** `fetch` that maps a network-layer rejection (offline, DNS) to friendly copy instead of the raw `TypeError`. */
async function safeFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(NETWORK_MESSAGE);
  }
}

/**
 * Submit `file` for cloud processing. Resolves with the created `jobId`
 * (used by S-04's Realtime subscription); throws an `Error` whose message is
 * safe to show the user on any failure.
 */
export async function submitCloudJob(file: File, params?: BreadParams): Promise<{ jobId: string }> {
  const body = deriveRequest(file, params);

  const res = await safeFetch(CREATE_JOB_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await routeErrorMessage(res));
  }

  const job = (await res.json()) as CreatePhotoJobResponse;

  const put = await safeFetch(job.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": body.mimeType },
    body: file,
  });
  if (!put.ok) {
    throw new Error(uploadErrorMessage(put.status));
  }

  return { jobId: job.jobId };
}
