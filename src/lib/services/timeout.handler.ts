import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { STRINGS } from "@/lib/enhance-strings";
import { markPendingJobFailedForOwner } from "@/lib/services/photo-job.service";

/**
 * Env-free core of POST /api/enhance/cloud/timeout.
 *
 * Carries the full auth → parse → zod → owner-scoped-flip request→response
 * sequence, but receives the already-built admin client as a parameter instead
 * of reading `astro:env/server`. Keeping this module free of that build-time
 * virtual import means Vitest can load it under Node (Lesson #4) and drive the
 * route-boundary contract against a real local Supabase — including the
 * load-bearing owner scoping: a client-supplied `jobId` belonging to another
 * user must never touch that user's row (lesson: client-supplied ids route
 * through owner-scoped mutations).
 *
 * The thin route wrapper (`src/pages/api/enhance/cloud/timeout.ts`) owns the
 * env-coupled shell: reading the two `astro:env/server` values, the
 * env-presence 500 guard, and building the admin client. Runtime behavior of
 * the two together matches the pre-refactor single-file route on every
 * reachable path, with one deliberate divergence: the env-presence 500 guard
 * now runs in the wrapper *before* this core's auth/parse checks, whereas the
 * original placed it after them. That only changes the status code (500 vs
 * 401/400) when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` is unset — a
 * deploy-time misconfiguration that never occurs in a configured deployment, so
 * it is unobservable in practice.
 */

/** Minimal JSON responder. Error bodies follow the CLAUDE.md envelope and never include `status`. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface FailTimedOutJobInput {
  /** Authoritative session user (`context.locals.user`); `null` for anonymous. */
  user: { id: string } | null;
  /** The inbound request, carrying the JSON body (`{ jobId }`). */
  request: Request;
  /** Service-role client (built via `createAdminClient`; bypasses RLS). */
  admin: SupabaseClient;
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
export async function failTimedOutJobResponse(input: FailTimedOutJobInput): Promise<Response> {
  const { user, request, admin } = input;

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

  const parsed = timeoutRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: { code: "invalid_body", message: "Expected a jobId (uuid)." } }, 400);
  }

  try {
    const flipped = await markPendingJobFailedForOwner(admin, {
      jobId: parsed.data.jobId,
      userId: user.id,
      errorCode: "timeout",
      // Identical to the client's TIMEOUT_MESSAGE by construction (same
      // enhance-strings value) so the UI shows one consistent string whether
      // it's the optimistic client copy or this authoritative row write.
      errorMessage: STRINGS.cloudErrors.timeout,
    });
    return json({ flipped }, 200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("timeout failed:", err instanceof Error ? err.message : err);
    return json({ error: { code: "internal_error", message: "Could not update the cloud job." } }, 500);
  }
}
