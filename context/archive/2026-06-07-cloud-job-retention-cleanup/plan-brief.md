# S-08 — 24h-retention cleanup for failed/abandoned cloud jobs — Plan Brief

> Full plan: `context/changes/cloud-job-retention-cleanup/plan.md`
> Research: `context/changes/cloud-job-retention-cleanup/research.md`

## What & Why

Today only a **successful** cloud job deletes its uploaded source object; failed, abandoned, and late-`/callback` jobs leave the private source (and sometimes the result) in storage indefinitely — a launch privacy-NFR gap ("source not retained beyond 24h"). S-08 closes it inline (no pg_cron). It's the last cloud-path prerequisite for the `CLOUD_PIPELINE_ENABLED` flip-ON (S-05 ✓ + S-08 + S-09 ✓).

## Starting Point

`markJobSucceeded` is the only place a source is deleted (`photo-job.service.ts:141`); `markJobFailed` and the client-timeout helper never touch storage. Terminal writers are mostly unconditional id-only UPDATEs. `/callback` uploads the result before flipping the row, so a late failure orphans it (F5), and an unconditional `markJobSucceeded` can resurrect a watchdog-failed row (F9). The abandoned-`queued` row is INSERTed before the upload, so most abandoned rows have no object — only a browser-closed *processing* stall leaves a real orphan, and no reaper exists.

## Desired End State

Every terminal outcome reconciles storage with the row: failed/timeout/raced jobs delete their source (and any uploaded result); success is unchanged but now race-safe; browser-closed stalls are reclaimed on the user's next submit. The only residual is a user who never returns (unavoidable without cron — documented).

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Browser-closed stall | Bounded caller-scoped sweep at create-job | Closes it for any returning user, no cron, owner-scoped | Plan |
| Fix F9 here? | Yes — guard `markJobSucceeded` | Same "guard the terminal write" pattern, same files/flip-ON gate | Plan |
| Delete gating | Shared helper + delete only on confirmed flip | DRY + correct; no delete on no-op transitions | Plan |
| Testing | Unit-test service deletes/invariants; `deno check` + manual for Edge | Covers testable core, respects the Deno-coverage split | Plan / Research |
| `/start` timeout (#2) | Reuse 30s `AbortSignal.timeout` | Mirrors the existing `/callback` output-fetch bound | Plan |
| Sweep threshold | ~1h, bounded `SWEEP_MAX=100` + log | Safely above the 5-min watchdog/cold boot, far under 24h | Plan |

## Scope

**In scope:** shared `deleteJobSource`/`deleteJobResult`; guarded `markJobFailed` + `markPendingJobFailedForOwner` (delete-on-flip); F9 guard on `markJobSucceeded`; `/callback` result-orphan cleanup; `/start` create-fetch timeout; bounded owner-scoped create-job sweep; unit tests.

**Out of scope:** pg_cron/scheduled reaper; guaranteeing 24h for never-returning users; flipping cloud ON / live re-validation (flip-ON, shared with S-09 D.1); new enum state; watchdog-budget or S-05 cap changes; retroactive cleanup of prod orphans (none exist — cloud never ran in prod).

## Architecture / Approach

One principle across all phases: **every terminal transition is a guarded UPDATE, and object deletes fire only when the row actually transitioned.** Extract the delete primitive once, apply the guard to the failed *and* succeeded transitions, then add the bounded sweep for the one case no inline hook reaches. The `/callback` reconciliation is the only subtle bit: a now-guarded `markJobSucceeded` can report "didn't flip" (watchdog won) → the caller deletes its just-uploaded result.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Service layer | Delete primitive + guarded failed/succeeded transitions (incl. F9), unit-tested | Subtle guard semantics; mitigated by tests asserting no-op-skips-delete |
| 2. Edge Function | `/callback` result-orphan cleanup (F5/F9 caller side) + `/start` timeout (#2) | Deno-only (no unit coverage) — `deno check` + manual review |
| 3. Create-job sweep | Bounded owner-scoped reclaim of browser-closed stalls | Latency/over-reach — bounded by 1h threshold + `SWEEP_MAX` + best-effort |

**Prerequisites:** F-01/S-04 done (both archived). No new infra. Cloud stays OFF.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- The never-returning-user residual leaves a stale source until (a future) cron — accepted for MVP, documented.
- Making `markJobFailed`/`markJobSucceeded` guarded assumes they're only called from post-`already_terminal`, `processing`-state contexts (confirmed in research) — a guard there won't break a legitimate force-terminal path.
- Live correctness (race, sweep, deletes against real storage) is verified at flip-ON, not now (cloud OFF).

## Success Criteria (Summary)

- A failed/abandoned/timed-out/raced cloud job leaves **no** orphaned source or result object (verified by unit tests now; live at flip-ON).
- A browser-closed stalled row + its source are reclaimed on the owner's next create-job.
- The success path stays correct and is now race-safe (F9), with no regression to existing suites/build.
