---
date: 2026-06-07T12:43:04Z
researcher: Claude (Opus 4.8)
git_commit: 4a7dc48006734b6453c835d56539959faae14e5f
branch: master
repository: Piotr-Miller/lumina-clean-ai
topic: "S-08 — 24h-retention cleanup for failed/abandoned cloud jobs"
tags: [research, codebase, cloud-pipeline, retention, edge-function, storage, race-condition]
status: complete
last_updated: 2026-06-07
last_updated_by: Claude (Opus 4.8)
---

# Research: S-08 — 24h-retention cleanup for failed/abandoned cloud jobs

**Date**: 2026-06-07T12:43:04Z
**Researcher**: Claude (Opus 4.8)
**Git Commit**: 4a7dc48
**Branch**: master
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

How should S-08 close the cloud-source privacy-NFR gap — delete an uploaded source object within 24h even when the job does **not** succeed (failed / abandoned-queued) — given the scope guard (inline deletes, **NOT** pg_cron)? Map the source/result object lifecycle, every stall path that orphans an object, the abandoned-`queued` trigger options, the F9 race interaction, residual #2 (`/start` create-fetch timeout), and the S-05 collision surface.

## Summary

- **Today only the success path deletes the source.** `markJobSucceeded` is the *single* production `.remove` (`photo-job.service.ts:141`). `markJobFailed`, `markPendingJobFailedForOwner`, and `markJobProcessing` never touch Storage. There is **no bucket lifecycle rule, no pg_cron, no sweep** anywhere — "24h retention" is comment-only intent. (idea-notes.md lists pg_cron retention as an explicit non-goal.)
- **Six failure paths orphan the source object; one (F5) orphans the result.** All are reachable once cloud flips ON.
- **The abandoned-`queued` object never exists in most cases.** The `queued` row is INSERTed *before* the client PUT, so a browser that closes before/during upload leaves **no object** — only a stranded DB row. An orphaned *object* only arises when the upload completed **and** the pipeline then stalled with the browser closed (no watchdog).
- **The inline approach closes 5 of 7 paths cleanly** (add source-delete to the failed-transition writers + delete the orphaned result in `/callback`'s catch). The **only** path inline deletes can't reach is a browser-closed stall (no event ever fires) — the roadmap's open "abandoned-`queued` trigger" question. The bounded, no-cron answer is a **caller-scoped sweep at create-job time** (flip + clean the *user's own* stale `queued`/`processing` rows), with an accepted residual: a user who never returns leaves an orphan (unavoidable without cron).
- **F9 and S-08 are the same pattern** ("guard the terminal transition; tie the delete side-effect to the guarded write succeeding"). S-08 does **not** worsen F9's data state, but the delete-on-failure side-effect makes guarding the failed writers important, and the planner should decide whether to fold F9 in.
- **No hard collision with S-05.** S-05's `countCloudJobsToday` / `isOverDailyCap` are distinct functions from S-08's target `markJobFailed`; only `create-job.ts` is co-touched (cap check vs. a possible sweep).
- **Residual #2 confirmed:** `/start`'s `predictions.create` fetch has no `AbortSignal.timeout` (`enhance/index.ts:240-247`), unlike the `/callback` output fetch.

## Detailed Findings

### Object lifecycle (source + result)

- **Source path** is server-derived in `createPhotoJob`: `${userId}/${jobId}/source.${ext}` (`photo-job.service.ts:32-33`); a one-shot signed upload URL is minted via service-role `admin.storage.from("photos").createSignedUploadUrl(...)` (`:35`).
- **Browser PUTs the source directly to Storage** (never through the Worker) in `submitCloudJob` (`cloud-upload.client.ts:83-87`), **after** create-job returns.
- **Source delete — the only production `.remove`** — inside `markJobSucceeded` (`photo-job.service.ts:140-147`), service-role, **path-only** (no `user_id` predicate; ownership implicit in the server-derived path; service-role bypasses RLS). Order: row UPDATE → then delete; a failed delete is swallowed with `console.warn` (`:142-147`), no retry.
- **`markJobFailed` does NOT delete** (`photo-job.service.ts:195-208`); its comment is explicit: "No source cleanup in v1 (failed jobs are out of scope for retention…)" (`:188-194`).
- **Result object** is uploaded in `/callback` with `upsert:true` (`enhance/index.ts:426-429`) **before** `markJobSucceeded` (`:435`). The catch path (`:437-452`) calls only `markJobFailed` and **never deletes the just-uploaded result** → the **F5 orphan**.
- **Retention policy**: none implemented. Bucket migration sets only `public=false`, 25 MB limit, mime allow-list (`20260528120100_create_photos_storage.sql:22-33`). "24h" appears only in prose comments (`photo-job.service.ts:104-109`; `enhance/index.ts:46-47,433`).
- **Storage RLS** (`storage.objects`) has authenticated own-prefix policies for SELECT/INSERT/UPDATE/DELETE; **no anon**; **service-role bypasses RLS**, so deletes need no policy (`20260528120100_create_photos_storage.sql:46-88`).

### State machine + stall points

- **Enum** `photo_job_status`: `queued | processing | succeeded | failed` (`20260528120000_create_jobs_table.sql:19-24`). No `cancelled`/`expired`.
- **`jobs` columns**: `id, user_id, status, source_path, result_path, replicate_prediction_id, error_code, error_message, created_at, updated_at, completed_at` (`:30-42`). RLS allows authenticated SELECT/INSERT own; **no UPDATE/DELETE policy** — all transitions go through service-role helpers.
- **Status writers**:

  | Status | Function | Guard | Caller |
  |---|---|---|---|
  | `queued` | `createPhotoJob` (`:40-45`) | INSERT (sets `user_id`) | create-job route |
  | `processing` | `markJobProcessing` (`:175-186`) | **id-only, unconditional** | Edge `/start` |
  | `succeeded` | `markJobSucceeded` (`:116-138`) | **id-only, unconditional** + source delete | Edge `/callback` |
  | `failed` (server) | `markJobFailed` (`:195-208`) | **id-only, unconditional**, no delete | `/start` catch, `/callback` (`:402`, `:443`) |
  | `failed` (client) | `markPendingJobFailedForOwner` (`:222-242`) | **owner-scoped + status-guarded** (`.eq id`+`.eq user_id`+`.in status [queued,processing]`), returns flipped? | timeout route (`timeout.ts:61`) |

- **The webhook fires before the upload.** `jobs_enqueue_webhook` fires `after insert … when (new.status='queued')` → `handle_queued_job()` → `net.http_post(fn_url||'/start', …)` (`20260531120000_jobs_enqueue_webhook.sql:25-55`). The client PUT lands later, so `/start` absorbs the race with `signSourceWithRetry` (~4.5s) (`enhance/index.ts:52-59`).
- **Abandoned-`queued`**: (a) upload never landed → **no source object exists** (only an unconsumed token); (b) **no server event ever re-fires** for that row (single `/start` on INSERT; in prod `CLOUD_PIPELINE_ENABLED!=="true"` makes `/start` a no-op leaving it `queued` — `enhance/index.ts:195-197`). The **only** retroactive transition is the client watchdog, which needs the browser open. Browser closed ⇒ row stranded `queued` forever; **no reaper exists**.
- **Watchdog covers both** `queued` and `processing` (`.in("status",["queued","processing"])`, `photo-job.service.ts:236`) — but only while the browser is open.

### Watchdog, F9 race, residual #2

- **Watchdog** (`useCloudJob.ts`): `QUEUED_WATCHDOG_MS=30_000` / `PROCESSING_WATCHDOG_MS=300_000` (`:77-78`); on expiry POSTs `{jobId}` to `/api/enhance/cloud/timeout` (`:150-164`); catch-up read on `SUBSCRIBED` (`:245-251`) and re-read-before-fail at the queued deadline (`:213-219`).
- **F9 TOCTOU**: `/callback` reads `job.status` (already-terminal guard, `enhance/index.ts:392-395`) with no row lock, then does a multi-second output fetch+upload, then calls the **unconditional** `markJobSucceeded` (`:435`). If the watchdog's **guarded** `markPendingJobFailedForOwner` flips the row to `failed` in that window, `markJobSucceeded` overwrites it back to `succeeded` (last-writer-wins). **DB ends `succeeded` + result present + source deleted (a correct success end-state)**, but the row passed transiently through `failed` and — if the client folded in that intermediate `failed` Realtime event — `applyStatus` sets `terminal=true` and **drops** the later `succeeded` (`useCloudJob.ts:176,183`), so the user sees a timeout while the DB says succeeded. Client precedence otherwise makes "succeeded wins" (`:321-332`).
- **Residual #2**: `/start` `predictions.create` POST has **no** `AbortSignal.timeout` (`enhance/index.ts:240-247`); the `/callback` output fetch does (`:418`).

### S-05 collision surface

- S-05 added `countCloudJobsToday(admin)` (`photo-job.service.ts:74`) and pure `isOverDailyCap` (`:96`) — **distinct** from `markJobFailed` (`:195`). No function-level collision. `create-job.ts` is touched by both (S-05's cap check; a possible S-08 sweep) — file-level co-location only.
- Full exported surface of `photo-job.service.ts`: `createPhotoJob`(28), `countCloudJobsToday`(74)[S-05], `isOverDailyCap`(96)[S-05], `markJobSucceeded`(116)[F9 target], `getJobById`(157), `markJobProcessing`(175), `markJobFailed`(195)[S-08 target], `markPendingJobFailedForOwner`(222)[S-08 target], `createSignedReadUrl`(251).

## Code References

- `src/lib/services/photo-job.service.ts:140-147` — the ONLY production source delete (in `markJobSucceeded`)
- `src/lib/services/photo-job.service.ts:195-208` — `markJobFailed`, no delete (S-08 target)
- `src/lib/services/photo-job.service.ts:222-242` — `markPendingJobFailedForOwner`, owner-scoped+status-guarded (S-08 target; delete must be conditional on flipped?=true)
- `src/lib/services/photo-job.service.ts:116-138` — `markJobSucceeded` unconditional UPDATE (F9 race site)
- `supabase/functions/enhance/index.ts:413-436` — `/callback` result upload → markJobSucceeded
- `supabase/functions/enhance/index.ts:437-452` — `/callback` catch: markJobFailed only, **no result delete** (F5)
- `supabase/functions/enhance/index.ts:240-247` — `/start` predictions.create fetch, no timeout (residual #2)
- `supabase/functions/enhance/index.ts:392-395` — `/callback` already-terminal read (F9 TOCTOU read)
- `src/pages/api/enhance/cloud/create-job.ts:75-80` — signed upload + queued INSERT (sweep insertion point)
- `src/pages/api/enhance/cloud/timeout.ts:61-69` — timeout route → markPendingJobFailedForOwner
- `supabase/migrations/20260531120000_jobs_enqueue_webhook.sql:25-55` — INSERT→/start webhook
- `supabase/migrations/20260528120100_create_photos_storage.sql` — photos bucket + storage RLS

## Architecture Insights

1. **One deletion primitive, many transitions.** Today the source delete is inlined inside `markJobSucceeded`. S-08 should extract a shared `deleteJobSource(admin, sourcePath)` (and a `deleteJobResult`) and call it from every terminal-failed writer, so the deletion logic is DRY and uniformly best-effort (swallow + warn, like today).
2. **Tie the delete to a guarded transition.** `markPendingJobFailedForOwner` already returns whether it flipped — the source delete there MUST be conditional on `flipped===true`, else a no-op flip on an already-terminal row could delete a sibling state's object. This is the same "guard the terminal write" principle as **F9** (which asks `markJobSucceeded` to become status-guarded). Treat F9 and S-08 as one design: *every terminal transition is a guarded UPDATE whose object side-effects fire only when the row actually transitioned.*
3. **Inline coverage is near-total; the residual is structural.** Adding deletes to `markJobFailed` + `markPendingJobFailedForOwner` + the `/callback` catch covers `/start` failure, predict failure, callback-throw, client-timeout, and F5. The single uncovered case — browser closed before any terminal event — has no inline hook by definition. A **bounded create-job-time sweep** of the *caller's own* stale `queued`/`processing` rows (flip via the existing owner-scoped guarded helper, then delete) is the no-cron way to reclaim those on the user's next visit; the never-returns case is the documented residual.
4. **`.remove` on a non-existent object is safe**, so the abandoned-`queued`-without-upload case needs no special handling — a sweep delete is a harmless no-op; only the stranded row needs a status flip for hygiene.
5. **Testability split (Deno-coverage lesson).** `markJobFailed` / `markPendingJobFailedForOwner` / any sweep helper live in `photo-job.service.ts` (no `astro:env` import; `admin` passed in) → **unit-testable in vitest**. The `/callback` result-delete and `/start` timeout are Deno-only → validated by `deno check` + manual, not vitest ([[deno-supabase-edge-functions-must-be-excluded-from-the-astro-tsc-eslint-graph]]).

## Historical Context (from prior changes)

- `context/archive/2026-05-31-cloud-ai-realtime-result/reviews/impl-review-phase-3.md` — F5 (result orphan) first surfaced here as PENDING; now owned by S-08.
- `context/archive/2026-06-04-production-deployment/reviews/impl-review.md:102-120` — F8 (source orphan on partial delete) DEFERRED to S-08; F9 (markJobSucceeded TOCTOU) DEFERRED to flip-ON. The S-07 hardening cluster (replay/SSRF/output-timeout) landed; the `/start` create-fetch timeout (residual #2) was missed.
- `context/archive/2026-06-06-cloud-source-url-ttl-fix/` — S-09 (just archived): raised source TTL + client watchdog to 5 min; its D.1 (live >300s re-validation) shares the flip-ON harness with S-08.
- `context/foundation/roadmap.md` S-08 block (`:181-192`) — scope guard (inline, NOT pg_cron) + the residual-hardening note folding in residual #2 and the benign SUPABASE_KEY nit.

## Related Research

- `context/archive/2026-05-31-cloud-ai-realtime-result/research.md` — original async-pipeline + watchdog design.
- `context/foundation/lessons.md` — [[async-fire-and-forget-enqueue-pg-net-db-webhook-needs-a-client-side-timeout-backstop-rows-stall-silently-otherwise]], [[a-realtime-driven-watchdog-must-catch-up-on-subscribe-and-re-read-before-failing-never-fire-blindly-on-a-timer]], [[client-supplied-jobid-must-route-through-owner-scoped-mutations-never-id-only-service-role-helpers]], [[deno-supabase-edge-functions-must-be-excluded-from-the-astro-tsc-eslint-graph]].

## Open Questions

1. **Abandoned-`queued`/`processing` browser-closed stall — accept or sweep?** Recommended: bounded **caller-scoped sweep at create-job time** (flip the user's own stale non-terminal rows via the existing guarded helper + delete their sources). Decide the staleness threshold (≥ `PROCESSING_WATCHDOG_MS`? a fixed e.g. 1h?) and accept the never-returns residual. Alternative: accept the gap and document it (weakens the NFR).
2. **Fold in F9 (status-guard `markJobSucceeded`) within S-08?** They are the same pattern and the same files; S-08 doesn't worsen F9's data state but the thematic + correctness link is strong. Decide: bundle, or keep F9 a separate flip-ON item and have S-08 only *not regress* it.
3. **Should `markJobFailed` become status-guarded** (like `markPendingJobFailedForOwner`) so the new source-delete only fires on a real transition? Or keep it unconditional (it's single-shot from server contexts) and accept best-effort delete? Affects how cleanly the delete side-effect can be gated.
4. **Threshold + idempotency for the sweep**: cap how many of the caller's stale rows are swept per create-job call (bound the added latency); confirm `.remove` no-op behavior on absent objects is acceptable as the "upload-never-landed" path.
5. **Residual #2 timeout value** for `/start` `predictions.create` — reuse `OUTPUT_FETCH_TIMEOUT_MS` (30s) or a separate budget? Trivial, but pick a constant.
6. **Live re-validation** (shared with S-09 D.1) happens at flip-ON, not in this change (cloud ships OFF).
