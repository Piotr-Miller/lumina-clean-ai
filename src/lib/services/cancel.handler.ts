import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { STRINGS } from "@/lib/enhance-strings";
import { markPendingJobFailedForOwner } from "@/lib/services/photo-job.service";

/**
 * Env-free core of POST /api/enhance/cloud/cancel.
 *
 * The user-initiated hard-cancel of an in-flight cloud job (change
 * `cloud-job-cancel`). Structurally a sibling of `timeout.handler.ts`: the same
 * auth → parse → zod → owner-scoped-flip request→response sequence, receiving an
 * already-built admin client as a parameter instead of reading
 * `astro:env/server`, so Vitest can drive the route-boundary contract under Node
 * (Lesson #4) and the load-bearing owner scoping (a client-supplied `jobId`
 * belonging to another user must never touch that user's row) stays testable.
 *
 * The only functional difference from `/timeout` is the `errorCode` written
 * (`canceled` vs `timeout`) — the same owner-scoped, guarded single-UPDATE
 * (`markPendingJobFailedForOwner`) does the flip and deletes the source, so no
 * new service code and no schema change (the terminal state is `failed` with a
 * distinct `error_code`, deliberately NOT a new enum value).
 *
 * The `edge` field carries the Edge Function endpoint + shared secret for the
 * Replicate compute-cancel proxy. It is wired in Phase 2; when `null` the route
 * degrades to a DB-flip + source-delete (the prediction runs to completion as a
 * self-cleaning orphan, exactly today's behavior minus the row still being live).
 *
 * The thin route wrapper (`src/pages/api/enhance/cloud/cancel.ts`) owns the
 * env-coupled shell (reads `astro:env/server`, the env-presence 500 guard,
 * builds the admin client), mirroring `timeout.ts`.
 */

/** Minimal JSON responder. Error bodies follow the CLAUDE.md envelope and never include `status`. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface CancelCloudJobInput {
  /** Authoritative session user (`context.locals.user`); `null` for anonymous. */
  user: { id: string } | null;
  /** The inbound request, carrying the JSON body (`{ jobId }`). */
  request: Request;
  /** Service-role client (built via `createAdminClient`; bypasses RLS). */
  admin: SupabaseClient;
  /**
   * Edge Function endpoint + shared secret for the best-effort Replicate
   * compute-cancel proxy (Phase 2). `null` degrades to DB-flip + source-delete
   * only — never an error.
   */
  edge: { url: string; secret: string } | null;
}

/** Body: just the job to cancel. `userId` comes from the session, never the body. */
const cancelRequestSchema = z.object({ jobId: z.uuid() });

/**
 * User-initiated hard-cancel: flip a still-pending job to `failed` +
 * `error_code: "canceled"` and delete its source, owner-scoped.
 *
 * Auth-gated (401 for anonymous). The transition is owner-scoped and guarded:
 * `markPendingJobFailedForOwner` only flips rows still `queued`/`processing` AND
 * owned by the session user, in a SINGLE atomic UPDATE — so a Replicate success
 * that landed first is never overwritten (no read-then-write race), and a
 * client-supplied `jobId` can never touch another user's row (lesson:
 * client-supplied ids route through owner-scoped mutations). Returns 200 either
 * way; `canceled` tells the caller whether this request actually flipped the row.
 */
export async function cancelCloudJobResponse(input: CancelCloudJobInput): Promise<Response> {
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

  const parsed = cancelRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: { code: "invalid_body", message: "Expected a jobId (uuid)." } }, 400);
  }

  try {
    const canceled = await markPendingJobFailedForOwner(admin, {
      jobId: parsed.data.jobId,
      userId: user.id,
      errorCode: "canceled",
      errorMessage: STRINGS.cloudErrors.canceled,
    });
    // Phase 2: when `input.edge` is set, fire the best-effort Replicate
    // compute-cancel here (the Edge Function holds the token). Awaited, never
    // fails the route. Until then the flip + source-delete above is the whole job.
    return json({ canceled }, 200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("cancel failed:", err instanceof Error ? err.message : err);
    return json({ error: { code: "internal_error", message: "Could not cancel the cloud job." } }, 500);
  }
}
