import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUD_DAILY_CAP } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  countCloudJobsToday,
  createPhotoJob,
  isOverDailyCap,
  sweepStalePendingJobsForOwner,
} from "@/lib/services/photo-job.service";
import { createPhotoJobRequestSchema } from "@/lib/services/photo-job.schema";

export const prerender = false;

/** Minimal JSON responder. Error bodies follow the CLAUDE.md envelope and never include `status`. */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: { code: "unauthorized", message: "Sign in to use Cloud AI." } }, 401);
  }

  // Defensive parse: a malformed / non-JSON body is a client error (400),
  // not an unexpected server failure (500). Keep it out of the outer catch.
  let raw: unknown;
  try {
    raw = await context.request.json();
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.error("create-job: Supabase admin env is not configured");
    return json({ error: { code: "internal_error", message: "Cloud processing is unavailable." } }, 500);
  }

  try {
    const admin = createAdminClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });

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
    if (isOverDailyCap(await countCloudJobsToday(admin), CLOUD_DAILY_CAP)) {
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
};
