# S-08 — 24h-retention cleanup for failed/abandoned cloud jobs — Implementation Plan

## Overview

Close the cloud-source privacy-NFR gap: an uploaded **source** object must be deleted within the 24h window even when a job does **not** succeed, and a **result** object must never orphan on a late `/callback` failure. We do this by (1) extracting one deletion primitive and tying source/result deletes to a **confirmed terminal transition** on every failed path, (2) guarding the success transition too (the deferred **F9** race fix), and (3) adding a **bounded, owner-scoped sweep** at create-job to reclaim browser-closed stalls — all **inline, no pg_cron**. While in the Edge Function we also bind the `/start` `predictions.create` fetch with a timeout (residual #2).

This is the last cloud-path prerequisite for the `CLOUD_PIPELINE_ENABLED` flip-ON gate (S-05 ✓ + S-08 + S-09 ✓). The change is inert until cloud flips ON.

## Current State Analysis

- **Only `markJobSucceeded` deletes the source** (`src/lib/services/photo-job.service.ts:140-147`), service-role, path-based, best-effort (swallow + `console.warn`). `markJobFailed` (`:195-208`) and `markPendingJobFailedForOwner` (`:222-242`) never touch Storage.
- **Terminal writers are mostly unconditional id-only UPDATEs.** `markJobFailed` and `markJobSucceeded` are `.eq("id")` with no status guard; only `markPendingJobFailedForOwner` is owner-scoped + status-guarded (`.eq id`+`.eq user_id`+`.in status [queued,processing]`+`.select("id")`, returns flipped).
- **`/callback` orphans the result on late failure (F5):** result is uploaded with `upsert:true` (`supabase/functions/enhance/index.ts:426`) **before** `markJobSucceeded` (`:435`); the catch (`:437-452`) only calls `markJobFailed` and never deletes the uploaded result.
- **F9 race:** `/callback` reads `job.status` (already-terminal guard, `:392-395`) then does a multi-second fetch+upload, then calls the **unconditional** `markJobSucceeded` — which can overwrite a row the client watchdog flipped to `failed` in between.
- **Abandoned-`queued` has no inline hook:** the `queued` row is INSERTed *before* the client PUT (`photo-job.service.ts:40-45`; webhook fires on INSERT, `20260531120000_jobs_enqueue_webhook.sql:51-55`), so an abandoned upload leaves **no object**. An orphaned *object* only arises when the upload completed and the pipeline then stalled with the browser closed (no watchdog). No reaper exists.
- **No retention mechanism** (no bucket lifecycle, no pg_cron, no sweep); "24h" is comment-only intent.
- **`.remove` on an absent object is a harmless no-op** — safe for the "upload never landed" case.

## Desired End State

After this plan, for every terminal outcome the storage objects are reconciled with the row:

- **Success:** row `succeeded`, result present, source deleted (unchanged behavior, now via a guarded transition).
- **Server failure** (`/start` or `/callback` error/predict-fail): row `failed`, source deleted, any uploaded result deleted.
- **Client timeout** (browser open): row `failed` via the guarded owner helper, source deleted.
- **Race** (watchdog failed the row mid-`/callback`): row stays `failed`, the just-uploaded result is cleaned, source already gone — a consistent terminal state, no orphan.
- **Browser-closed stall:** reclaimed on the user's next create-job (bounded sweep). The only residual is a user who never returns (acceptable without cron — documented).

Verify: unit tests assert deletes fire **only** on a confirmed transition and no-op flips skip deletion; `deno check` passes on the Edge Function; manual review confirms the `/callback` reconciliation and the sweep's owner-scoping/bounds.

### Key Discoveries:

- Deletion is inlined once today (`photo-job.service.ts:141`) — extract it so every path shares one best-effort primitive.
- `markPendingJobFailedForOwner` already models the target pattern (guarded UPDATE returning the flipped row) — mirror it for the other transitions and `.select("source_path")` to drive the delete.
- The service layer (`photo-job.service.ts`) takes `admin` as a parameter and imports no `astro:env` — so all new logic there is **vitest-unit-testable** and is shared by the Deno Edge Function ([[deno-supabase-edge-functions-must-be-excluded-from-the-astro-tsc-eslint-graph]]).
- `markJobFailed`/`markJobSucceeded` are each called only from post-`already_terminal`-check, `processing`-state contexts, so adding a status guard is safe (won't break a legitimate force-terminal path).
- S-05's `countCloudJobsToday`/`isOverDailyCap` are distinct functions — no collision with the failed-transition edits; `create-job.ts` is co-touched (cap check vs. sweep) but at different lines.

## What We're NOT Doing

- **No `pg_cron` / scheduled reaper** (explicit MVP non-goal) — cleanup is inline + the bounded create-job sweep only.
- **Not guaranteeing 24h for a user who never returns** — the no-cron residual; documented, not closed.
- **Not flipping cloud ON or running the live cold-boot/cleanup re-validation now** (cloud ships OFF) — that's a flip-ON gate step shared with S-09's D.1.
- **Not adding a `cancelled`/`expired` enum state** — reuse `failed` with a distinct `error_code` for swept rows.
- **Not changing the client watchdog budgets** (set in S-09) or **S-05's cap logic**.
- **Not retrofitting a retention sweep for already-orphaned prod objects** — cloud has never run in prod (flag OFF), so there are none.

## Implementation Approach

One principle drives all three phases: **every terminal transition is a guarded UPDATE, and object side-effects (source/result delete) fire only when the row actually transitioned.** Phase 1 establishes the primitive + the guarded failed/succeeded transitions in the testable service layer. Phase 2 wires the Deno `/callback` to the new guarded `markJobSucceeded` return (cleaning the orphaned result on a lost race or throw) and binds the `/start` fetch. Phase 3 adds the bounded owner-scoped sweep for the one case no inline hook can reach.

## Critical Implementation Details

- **Delete-on-confirmed-transition is the correctness core.** A guarded UPDATE that flips **0 rows** (already-terminal / no-op) must **not** delete any object — otherwise a race could delete a sibling state's object. Every delete is gated on the guarded UPDATE returning the row (and its `source_path`).
- **The F9 + F5 reconciliation in `/callback` is the one non-obvious sequence** (see Phase 2 contract). `markJobSucceeded` becoming guarded means it can now legitimately return "didn't flip" (the watchdog won); when that happens the result just uploaded is orphaned and must be deleted by the caller. `resultPath` must be hoisted to the handler scope so both the lost-race branch and the catch can clean it.
- **Sweep threshold must sit above the cold-boot ceiling.** Use ~1h (≫ the 5-min `PROCESSING_WATCHDOG_MS` + worst cold boot, ≪ 24h) so the sweep never flips a legitimately in-flight job. It is best-effort and must never block job creation.

## Phase 1: Service layer — deletion primitives + guarded transitions

### Overview

Extract a shared best-effort deletion primitive, and convert the three terminal writers in `photo-job.service.ts` to guarded transitions that delete objects only on a confirmed flip. Includes the F9 guard on `markJobSucceeded`. Fully unit-tested.

### Changes Required:

#### 1. Shared deletion primitives

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: Replace the inlined source `.remove` with reusable best-effort helpers so every terminal path deletes through one code path with identical swallow-and-warn semantics.

**Contract**: Add `deleteJobSource(admin: SupabaseClient, sourcePath: string): Promise<void>` and `deleteJobResult(admin: SupabaseClient, resultPath: string): Promise<void>` — each calls `admin.storage.from(PHOTOS_BUCKET).remove([path])`, swallows errors with a `console.warn` (mirroring `:142-147`), never throws. No owner scoping (service-role; paths are server-derived). `markJobSucceeded`'s existing inline delete is refactored to call `deleteJobSource`.

#### 2. Guard `markJobFailed` + delete source on flip

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: Make `markJobFailed` a guarded transition that flips only a still-pending row and deletes the source when (and only when) it actually transitioned — closing the source-orphan on every server-side failure path.

**Contract**: `markJobFailed` UPDATE gains `.in("status", ["queued", "processing"]).select("id, source_path")`; if a row was returned, call `deleteJobSource(admin, row.source_path)`. Return `Promise<boolean>` (flipped?) for symmetry; existing callers (`/start`, `/callback`) may ignore it. Behavior is unchanged for the normal case (row is `processing`/`queued`); a no-op on an already-terminal row now correctly skips the delete.

#### 3. Delete source on flip in `markPendingJobFailedForOwner`

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: The client-timeout path must also delete the source — only when its already-guarded UPDATE flips a row.

**Contract**: Extend the existing `.select("id")` to `.select("id, source_path")`; when `data.length > 0`, call `deleteJobSource(admin, data[0].source_path)`. Return value (`flipped`) unchanged.

#### 4. Guard `markJobSucceeded` (F9) + return flipped

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: Close the TOCTOU resurrection race: `markJobSucceeded` must transition only from `processing` and report whether it won, so `/callback` can detect a lost race and clean up. Source delete fires only on a real flip.

**Contract**: Replace the separate read + unconditional id-only UPDATE (`:118-138`) with a single guarded UPDATE returning the flipped row's `source_path`:

```
const { data } = await admin.from(JOBS_TABLE)
  .update({ status: "succeeded", result_path: cmd.resultPath,
            replicate_prediction_id: cmd.replicatePredictionId ?? null,
            completed_at: new Date().toISOString() })
  .eq("id", cmd.jobId)
  .eq("status", "processing")        // F9 guard: only a live processing row.
                                     // `processing` ONLY (not `.in([queued,processing])`)
                                     // is safe + intentional: a queued row can't match
                                     // the fail-closed prediction-id cross-check upstream
                                     // in /callback, so it never reaches here. Do not widen.
  .select("source_path");
const flipped = !!data?.length;
if (flipped) await deleteJobSource(admin, data[0].source_path as string);
return flipped;                       // signature becomes Promise<boolean>
```

The caller (`/callback`, Phase 2) handles `flipped === false`.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` passes, including new tests asserting: source deletes fire only when a row flips; no-op flips (already-terminal) skip deletion; `markJobSucceeded` returns false when the row isn't `processing`.
- `npm run lint` passes (touched files)
- `npm run build` passes

#### Manual Verification:

- Review confirms all three failed/succeeded transitions are guarded and every delete is gated on a confirmed flip; the shared primitive preserves swallow-and-warn semantics.

---

## Phase 2: Edge Function — `/callback` result-orphan cleanup + `/start` timeout

### Overview

Wire the Deno `/callback` to the new guarded `markJobSucceeded` (clean the orphaned result on a lost race or a throw — F5), and bound the `/start` `predictions.create` fetch (#2). Deno-only; validated by `deno check` + manual.

### Changes Required:

#### 1. `/callback` result reconciliation (F5 + F9 caller side)

**File**: `supabase/functions/enhance/index.ts`

**Intent**: Ensure the uploaded result never orphans — whether `markJobSucceeded` reports a lost race or throws.

**Contract**: Hoist `resultPath` to the handler scope (`let resultPath: string | null = null;`), set it after a successful `upload`. Then:

```
const flipped = await markJobSucceeded(admin, { jobId, resultPath, replicatePredictionId: payload.id });
if (!flipped) {                       // watchdog (or retry) terminalized the row first
  await deleteJobResult(admin, resultPath);
  return jsonResponse(200, { jobId, status: "ignored", reason: "row_already_terminal" });
}
```

And in the existing catch (`:437-452`), before/after `markJobFailed`, add `if (resultPath) await deleteJobResult(admin, resultPath);`. (Source is handled by the now-guarded `markJobFailed`.)

#### 2. `/start` `predictions.create` fetch timeout (#2)

**File**: `supabase/functions/enhance/index.ts`

**Intent**: Bound the kickoff POST so a hung Replicate API call can't stall the invocation with the row stuck `processing`.

**Contract**: Add `signal: AbortSignal.timeout(OUTPUT_FETCH_TIMEOUT_MS)` (reuse the existing 30s constant) to the `predictions.create` fetch (`:240-247`), mirroring the output fetch at `:418`.

### Success Criteria:

#### Automated Verification:

- `deno check supabase/functions/enhance/index.ts` passes (runs in CI's deploy job; `deno` not on local PATH — install locally or use the supabase-bundled deno)
- `npm run build` passes (no breakage from the shared service-layer signature change)

#### Manual Verification:

- Review confirms: the lost-race branch and the catch both delete the uploaded result; `markJobFailed` (guarded, Phase 1) deletes the source on the failure paths; the `/start` create fetch now carries `AbortSignal.timeout`.

---

## Phase 3: Bounded create-job sweep for browser-closed stalls

### Overview

Add an owner-scoped, bounded, best-effort sweep that reclaims the caller's own stale `queued`/`processing` rows (and their sources) on their next submit — the one case no inline hook reaches.

### Changes Required:

#### 1. Sweep helper

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: Flip + clean the caller's stale non-terminal rows in one owner-scoped, bounded pass, reusing the guarded-transition + delete primitive.

**Contract**: Add `sweepStalePendingJobsForOwner(admin, userId, opts?): Promise<number>` with a module constant `STALE_PENDING_JOB_MS = 3_600_000` (1h) and a bound `SWEEP_MAX = 100`. Steps: SELECT up to `SWEEP_MAX` ids+`source_path` where `user_id = userId AND status IN ('queued','processing') AND created_at < now()-threshold`, oldest first; guarded UPDATE those ids → `failed` with `error_code: "abandoned"`, `error_message` (generic), `.select("source_path")`; then issue **a SINGLE batched** `admin.storage.from(PHOTOS_BUCKET).remove(sourcePaths)` for all flipped rows' paths (supabase-js `.remove()` accepts a path array — precedent `tests/helpers/test-users.ts:92`), NOT a per-row `deleteJobSource` loop. Return the swept count; `console.warn` if it equals `SWEEP_MAX` (more may remain — no-silent-cap). Never throws (internal try/catch around the storage call).

#### 2. Wire the sweep into create-job

**File**: `src/pages/api/enhance/cloud/create-job.ts`

**Intent**: Trigger the sweep best-effort on each authenticated submit, scoped to the caller, without ever blocking job creation.

**Contract**: After `user` is resolved, call `await sweepStalePendingJobsForOwner(admin, user.id)` wrapped so any failure is swallowed (logged, non-fatal) and never affects the cap check or `createPhotoJob`.

**Cap interaction (intended, not incidental):** `countCloudJobsToday` counts a row unless `status='failed' AND replicate_prediction_id IS NULL` (`photo-job.service.ts:83`). Flipping a stale **pre-model** abandoned row (`prediction_id IS NULL`) to `failed` therefore **releases its daily-cap slot** — this is intended and consistent with the cap already excluding pre-model failures (a job that never invoked Replicate cost nothing and shouldn't permanently consume the global cap). Rows that already reached Replicate (`prediction_id` set) stay counted after the flip. So the sweep makes the cap tally *more* accurate, not less; it is **not** independent of `countCloudJobsToday`.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` passes, including tests: sweep selects only the owner's stale non-terminal rows; flips to `failed` + deletes their sources; respects `SWEEP_MAX`; is a no-op when nothing is stale.
- `npm run lint` passes (touched files)
- `npm run build` passes

#### Manual Verification:

- Review confirms the sweep is owner-scoped (`user_id`), bounded (`SWEEP_MAX` + log), best-effort (never blocks create-job), and uses a threshold safely above the watchdog/cold-boot window.

**Implementation Note**: After each phase's automated verification passes, pause for human confirmation of the manual items before proceeding.

---

## Testing Strategy

### Unit Tests:

- Service-layer (vitest, mock `admin` client): delete-on-confirmed-transition for `markJobFailed` / `markPendingJobFailedForOwner` / `markJobSucceeded`; no-op flips skip deletes; `markJobSucceeded` returns `false` off-`processing`; `sweepStalePendingJobsForOwner` owner-scoping, threshold, `SWEEP_MAX` bound, batched single `remove`, empty no-op.
- **Update existing tests** broken by the signature/guard changes: `tests/photo-job-helpers.test.ts:99-116` (`markJobFailed` now asserts the `.in("status",[…])` guard shape + boolean return, mirroring the existing `markPendingJobFailedForOwner` test at `:118-155`); `tests/jobs.rls.test.ts:174-218` (`markJobSucceeded` return-value assertion; add a failed-path source-delete case). `scripts/f01-smoke.ts:142` ignores the return — no change.
- Existing suites otherwise stay green (no behavior change to the success path beyond guarding).

### Integration / Manual Testing Steps:

1. `deno check supabase/functions/enhance/index.ts` — Edge Function type-checks with the new return-aware `/callback` + `/start` timeout.
2. Review the `/callback` reconciliation and the sweep wiring against the contracts above.

### Deferred — flip-ON re-validation (NOT run now):

- Against the live cloud path (Replicate creds + controlled `CLOUD_PIPELINE_ENABLED` flip), confirm: a failed/abandoned job's source is gone; a late-`/callback` race leaves no orphaned result; the create-job sweep reclaims a deliberately-stranded stale row. Shared flip-ON harness with **S-09 D.1**.

## Performance Considerations

The sweep adds **three** round-trips per create-job call — one bounded SELECT + one guarded UPDATE + one **batched** `storage.remove(paths)` (all flipped rows in a single call, NOT ≤`SWEEP_MAX` serial deletes) — and only for rows older than 1h. Negligible and best-effort. Storage deletes on absent objects are no-ops. No hot-path impact (cloud is OFF until flip-ON).

## Migration Notes

None — no schema/enum/data change. Reuses `failed` with a new `error_code` string value (`"abandoned"`); the `error_code` column is free-text, no migration. Worker/Edge secrets unchanged. Inert until cloud flips ON.

## References

- Research: `context/changes/cloud-job-retention-cleanup/research.md`
- Roadmap: `context/foundation/roadmap.md` → S-08 (issue #9); flip-ON gate (S-05 ✓ + S-08 + S-09 ✓)
- Lessons: [[deno-supabase-edge-functions-must-be-excluded-from-the-astro-tsc-eslint-graph]], [[client-supplied-jobid-must-route-through-owner-scoped-mutations-never-id-only-service-role-helpers]], [[async-fire-and-forget-enqueue-pg-net-db-webhook-needs-a-client-side-timeout-backstop-rows-stall-silently-otherwise]]
- Pattern precedent: `src/lib/services/photo-job.service.ts:222-242` (`markPendingJobFailedForOwner` guarded transition)
- F9 origin: `context/archive/2026-06-04-production-deployment/reviews/impl-review.md:112-120`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Service layer — deletion primitives + guarded transitions

#### Automated

- [x] 1.1 `npm run test:unit` passes incl. new delete-on-confirmed-transition + `markJobSucceeded`-guard tests
- [x] 1.2 `npm run lint` passes (touched files)
- [x] 1.3 `npm run build` passes

#### Manual

- [x] 1.4 Review confirms all terminal transitions guarded; every delete gated on a confirmed flip; shared primitive preserves swallow-and-warn

### Phase 2: Edge Function — `/callback` result-orphan cleanup + `/start` timeout

#### Automated

- [ ] 2.1 `deno check supabase/functions/enhance/index.ts` passes (CI deploy job)
- [ ] 2.2 `npm run build` passes

#### Manual

- [ ] 2.3 Review confirms lost-race + catch both delete the uploaded result; source handled by guarded `markJobFailed`; `/start` create fetch has `AbortSignal.timeout`

### Phase 3: Bounded create-job sweep for browser-closed stalls

#### Automated

- [ ] 3.1 `npm run test:unit` passes incl. sweep tests (owner-scope, threshold, `SWEEP_MAX`, no-op)
- [ ] 3.2 `npm run lint` passes (touched files)
- [ ] 3.3 `npm run build` passes

#### Manual

- [ ] 3.4 Review confirms sweep is owner-scoped, bounded (+log), best-effort (never blocks create-job), threshold above the watchdog window

### Deferred (flip-ON gate — not run in this change)

- [~] D.1 **(DEFERRED — flip-ON closure criterion; shared with S-09 D.1)** Live re-validation: failed/abandoned job → source gone; late-`/callback` race → no orphaned result; create-job sweep reclaims a stranded stale row (needs Replicate creds + controlled flip-ON)
