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
 * Carries the full auth → parse → zod → sweep → cap fast path → guarded admission
 * request→response sequence, but receives the already-built admin client and the
 * resolved cap as parameters instead of reading `astro:env/server`. Keeping this
 * module free of that build-time virtual import means Vitest can load it under
 * Node (Lesson #4) and drive the route-boundary contract with a stub admin
 * client — including the load-bearing reject-BEFORE-admission ordering of the
 * daily-cap fast path, and the 429 mapping of a declined guarded write
 * (PRD FR-014).
 *
 * The thin route wrapper (`src/pages/api/enhance/cloud/create-job.ts`) owns the
 * env-coupled shell: reading the three `astro:env/server` values, the
 * env-presence 500 guard, and building the admin client. Runtime behavior of the
 * two together matches the pre-refactor single-file route on every reachable
 * path, with one deliberate divergence: the env-presence 500 guard now runs in
 * the wrapper *before* this core's auth/parse/zod checks, whereas the original
 * placed it after them. That only changes the status code (500 vs 401/400) when
 * `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` is unset — a deploy-time
 * misconfiguration that never occurs in a configured deployment, so it is
 * unobservable in practice.
 */

/** Minimal JSON responder. Error bodies follow the CLAUDE.md envelope and never include `status`. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * The ONE `daily_cap_reached` body. Two sites now return it — the handler's
 * non-authoritative pre-check and a decline from the guarded write in
 * `createPhotoJob` — and the user-facing contract must be byte-identical from
 * both, so it is written once here rather than duplicated at each return.
 */
const DAILY_CAP_REACHED_BODY = {
  error: {
    code: "daily_cap_reached",
    message: "The daily Cloud AI limit has been reached. Please try again tomorrow.",
  },
} as const;

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

    // Global daily cap (PRD FR-014), part 1 of 2 — the NON-AUTHORITATIVE fast
    // path. This count is an optimization, not the gate: it rejects an over-cap
    // submission before any signed URL / storage / Replicate work, which is the
    // PRD property worth keeping. It cannot be the invariant, because the count
    // and the insert are two operations and nothing serializes them — N
    // simultaneous requests at `count = cap - 1` all pass here. The enforcement
    // point is the guarded write inside `createPhotoJob` below, which holds a
    // transaction-scoped advisory lock across count-and-insert. `cap = 0`
    // rejects every submission (operator kill-switch). A count-query throw
    // falls through to the outer catch → 500.
    if (isOverDailyCap(await countCloudJobsToday(admin), cap)) {
      return json(DAILY_CAP_REACHED_BODY, 429);
    }

    const result = await createPhotoJob(admin, {
      userId: user.id,
      fileExtension: parsed.data.fileExtension,
      mimeType: parsed.data.mimeType,
      cap,
      // S-12 Bread params (validated + bounded by the schema; undefined → defaults).
      gamma: parsed.data.gamma,
      strength: parsed.data.strength,
    });
    // Part 2 of 2 — the ACTUAL FR-014 gate. `null` means the guarded write
    // declined: the fast path above admitted this request, then the atomic
    // count-and-insert found the cap already taken (a concurrent submission won,
    // or the two clocks straddled UTC midnight). Same 429, same body — a race
    // loser is rejected exactly like any other over-cap request.
    if (result === null) {
      return json(DAILY_CAP_REACHED_BODY, 429);
    }
    return json(result, 200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create-job failed:", err instanceof Error ? err.message : err);
    return json({ error: { code: "internal_error", message: "Could not create the cloud job." } }, 500);
  }
}
