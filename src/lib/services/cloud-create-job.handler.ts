import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countCloudJobsToday,
  createPhotoJob,
  isOverDailyCap,
  sweepStalePendingJobsForOwner,
} from "@/lib/services/photo-job.service";
import { createPhotoJobRequestSchema } from "@/lib/services/photo-job.schema";

/**
 * Env-free core of POST /api/enhance/cloud/create-job.
 *
 * Carries the full auth → parse → zod → sweep → cap → insert request→response
 * sequence, but receives the already-built admin client and the resolved cap as
 * parameters instead of reading `astro:env/server`. Keeping this module free of
 * that build-time virtual import means Vitest can load it under Node (Lesson #4)
 * and drive the route-boundary contract with a stub admin client — including the
 * load-bearing reject-BEFORE-insert ordering of the daily cap (PRD FR-014).
 *
 * The thin route wrapper (`src/pages/api/enhance/cloud/create-job.ts`) owns the
 * env-coupled shell: reading the three `astro:env/server` values, the
 * env-presence 500 guard, and building the admin client. Runtime behavior of the
 * two together is byte-identical to the pre-refactor single-file route.
 */

/** Minimal JSON responder. Error bodies follow the CLAUDE.md envelope and never include `status`. */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface CreateCloudJobInput {
  /** Authoritative session user (`context.locals.user`); `null` for anonymous. */
  user: { id: string } | null;
  /** The inbound request, carrying the JSON body. */
  request: Request;
  /** Service-role client (built via `createAdminClient`; bypasses RLS). */
  admin: SupabaseClient;
  /** Resolved `CLOUD_DAILY_CAP`. `cap = 0` rejects every submission (kill-switch). */
  cap: number;
}

/**
 * Mint a signed upload URL + create a `queued` job row for a signed-in user.
 *
 * Auth-gated (401 for anonymous). The body carries only `fileExtension` +
 * `mimeType` (zod-validated, advisory); the authoritative `userId` comes from
 * the session, never the body. The source path is derived server-side by
 * `createPhotoJob`. Cloud bytes are uploaded by the client directly to the
 * returned absolute `uploadUrl` (raw PUT) — this route never proxies them.
 */
export async function createCloudJobResponse(input: CreateCloudJobInput): Promise<Response> {
  const { user, request, admin, cap } = input;

  if (!user) {
    return json({ error: { code: "unauthorized", message: "Sign in to use Cloud AI." } }, 401);
  }

  // Defensive parse: a malformed / non-JSON body is a client error (400),
  // not an unexpected server failure (500). Keep it out of the outer catch.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: { code: "invalid_body", message: "Request body must be valid JSON." } }, 400);
  }

  const parsed = createPhotoJobRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: { code: "invalid_body", message: "Expected fileExtension (jpg|png) and matching mimeType." } },
      400,
    );
  }

  try {
    // Best-effort retention sweep (S-08 Phase 3): reclaim THIS caller's own
    // browser-closed stale jobs + their sources before doing new work. Runs
    // BEFORE the cap count on purpose — flipping a pre-model abandoned row frees
    // its daily-cap slot, so the subsequent count is more accurate. The helper is
    // internally fail-safe; this guard is belt-and-suspenders so a sweep fault
    // can never affect the cap check or createPhotoJob.
    try {
      await sweepStalePendingJobsForOwner(admin, user.id);
    } catch (sweepErr) {
      // eslint-disable-next-line no-console
      console.warn(
        "create-job: stale-job sweep failed (non-fatal):",
        sweepErr instanceof Error ? sweepErr.message : sweepErr,
      );
    }

    // Global daily cap (PRD FR-014): reject before any signed URL / storage /
    // Replicate work. The cap value is the route's concern (env); the count +
    // boundary decision live in the env-free service helpers. `cap = 0` rejects
    // every submission (operator kill-switch). A count-query throw falls through
    // to the outer catch → 500.
    if (isOverDailyCap(await countCloudJobsToday(admin), cap)) {
      return json(
        {
          error: {
            code: "daily_cap_reached",
            message: "The daily Cloud AI limit has been reached. Please try again tomorrow.",
          },
        },
        429,
      );
    }

    const result = await createPhotoJob(admin, {
      userId: user.id,
      fileExtension: parsed.data.fileExtension,
      mimeType: parsed.data.mimeType,
    });
    return json(result, 200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create-job failed:", err instanceof Error ? err.message : err);
    return json({ error: { code: "internal_error", message: "Could not create the cloud job." } }, 500);
  }
}
