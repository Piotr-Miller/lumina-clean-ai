import type { APIRoute } from "astro";
import { z } from "zod";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { markPendingJobFailedForOwner } from "@/lib/services/photo-job.service";

export const prerender = false;

/** Minimal JSON responder. Error bodies follow the CLAUDE.md envelope and never include `status`. */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Body for the client watchdog: just the job to fail. `userId` comes from the session, never the body. */
const timeoutRequestSchema = z.object({ jobId: z.uuid() });

/**
 * Client watchdog backstop: flip a still-pending job to `failed` when no
 * terminal Realtime event arrived within the browser's ~60s budget (the
 * pg_net/webhook stall fix — async fire-and-forget enqueues never retry).
 *
 * Auth-gated (401 for anonymous). The transition is owner-scoped and guarded:
 * `markPendingJobFailedForOwner` only flips rows still `queued`/`processing`
 * AND owned by the session user, in a SINGLE atomic UPDATE — so a Replicate
 * success that landed first is never overwritten (no read-then-write race), and
 * a client-supplied `jobId` can never touch another user's row (lesson:
 * client-supplied ids route through owner-scoped mutations). Returns 200 either
 * way; `flipped` tells the caller whether this request actually failed the row.
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

  const parsed = timeoutRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: { code: "invalid_body", message: "Expected a jobId (uuid)." } }, 400);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.error("timeout: Supabase admin env is not configured");
    return json({ error: { code: "internal_error", message: "Cloud processing is unavailable." } }, 500);
  }

  try {
    const admin = createAdminClient({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
    const flipped = await markPendingJobFailedForOwner(admin, {
      jobId: parsed.data.jobId,
      userId: user.id,
      errorCode: "timeout",
      // Keep this identical to the client's TIMEOUT_MESSAGE (useCloudJob) so the
      // UI shows one consistent string whether it's the optimistic client copy
      // or this authoritative row write — no flicker between two timeout texts.
      errorMessage: "Cloud processing took too long. Please try again.",
    });
    return json({ flipped }, 200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("timeout failed:", err instanceof Error ? err.message : err);
    return json({ error: { code: "internal_error", message: "Could not update the cloud job." } }, 500);
  }
};
