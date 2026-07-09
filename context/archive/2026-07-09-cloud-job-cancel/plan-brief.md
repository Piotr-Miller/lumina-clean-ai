# Cloud Job Hard-Cancel — Plan Brief

> Full plan: `context/changes/cloud-job-cancel/plan.md`

## What & Why

Give a signed-in user a way to **hard-cancel an in-flight Cloud AI job** — stop a long-running / stuck job on demand instead of waiting out the 300s watchdog. Cancel flips the job terminal, deletes its orphaned `source.*` object, and stops the Replicate prediction so paid compute halts. Promotes the parked roadmap item _"Cancel in-flight cloud job on Start over (S-04)"_ into a post-MVP change (not a new slice).

## Starting Point

Today, mid-`processing` "Start over" is purely client-side: it tears down the Realtime subscription and the backend prediction runs to completion as an orphan (self-cleaning its source via `markJobSucceeded`). Authenticated users have **SELECT-own only** on `jobs`, so any cancel must go through a service-role server route — and the Replicate token lives **only in the Edge Function**, so stopping compute requires proxying there.

## Desired End State

A user watching a `processing` job clicks the (relabeled) **Cancel** button: the UI resets to the upload screen immediately (optimistic), the row becomes `failed` + `error_code: "canceled"` with its source deleted, and the Replicate prediction is canceled. A cancel that races a completed job is a silent no-op.

## Key Decisions Made

| Decision       | Choice                                            | Why (1 sentence)                                                                                             | Source |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| Backend depth  | True hard-cancel (stop Replicate)                 | User wants compute actually stopped; the cancel primitive already exists in the Edge Function                | Plan   |
| Terminal state | Reuse `failed` + `error_code: "canceled"`         | Zero migration; user never sees "failed" (UI resets); reuses the `errorCode`-parameterized owner-scoped flip | Plan   |
| UI affordance  | Fold into the mid-processing "Start over" button  | The button users already reach for to abandon a slow job now truly stops it — no new UI                      | Plan   |
| Client UX      | Optimistic reset (fire-and-forget POST)           | Instant, no "canceling…" state; mirrors the existing watchdog `/timeout` POST; reaper backstops a lost POST  | Plan   |
| Scope          | Explicit button only (no switched-away)           | Keeps scope tight and avoids flaky `beforeunload`; tab-close jobs stay covered by watchdog + reaper          | Plan   |
| Testing        | Handler units + decision-helper units, no new E2E | Matches repo precedent (session-idle-timeout); the E2E gate stubs the cloud pipeline                         | Plan   |

## Scope

**In scope:** a `POST /api/enhance/cloud/cancel` route; an Edge `/cancel` sub-path that cancels the Replicate prediction; folding cancel into the mid-processing button; a pure cancel-enablement predicate; source deletion on cancel; unit tests.

**Out of scope:** a `canceled` enum value; switched-away / `beforeunload` cancel; a separate "purge temp bucket" ops button; a "Canceling…" confirmation UI; a new E2E spec; any new service-layer function (reuse `markPendingJobFailedForOwner`).

## Architecture / Approach

Client button → **Astro route** (auth + service-role): owner-scoped guarded flip to `failed`/`canceled` + source delete (reuses `markPendingJobFailedForOwner`), then `await`s a best-effort POST to the **Edge Function** `/cancel` (shared-secret authed, mirrors `/reap`), which resolves `replicate_prediction_id` and calls the existing `cancelReplicatePrediction()`. Row is flipped **first** (authoritative); a finishing prediction's callback no-ops on the already-terminal row.

## Phases at a Glance

| Phase                      | What it delivers                                                      | Key risk                                                                                             |
| -------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1. Server cancel route     | `/api/enhance/cloud/cancel` flips row + deletes source; handler units | Owner-scoping (IDOR) — must route through the user_id-guarded write                                  |
| 2. Edge `/cancel` sub-path | True Replicate compute kill; Astro handler awaits best-effort proxy   | Cross-runtime + Workers floating-promise (must `await`, not fire-and-forget); two new Worker secrets |
| 3. Client wiring           | Cancel folded into the mid-processing button; predicate + units       | Capturing `jobId` before reset nulls it; label/branch correctness                                    |

**Prerequisites:** local Supabase stack + enhance seam env for the Phase-2 smoke (test-plan §6.3); Worker secrets `EDGE_FUNCTION_URL` + `DB_WEBHOOK_SECRET` for prod.
**Estimated effort:** ~2–3 sessions across 3 phases (Phase 1 mostly mirrors `/timeout`).

## Open Risks & Assumptions

- **Best-effort compute kill**: if the Edge POST fails, the row is still terminal and the source deleted, but that run's Replicate compute finishes (≤ one job's ~$0.0006). Accepted.
- **Two Worker secrets** must be set in prod for the compute kill to fire; unset degrades to flip+cleanup only (never an error). Per the Worker-secrets lesson, CI doesn't sync runtime secrets.
- Assumes `markPendingJobFailedForOwner`'s `[queued,processing]` guard is the right cancelable set (it is — matches the watchdog).

## Success Criteria (Summary)

- Mid-`processing` cancel: UI resets instantly; row `failed`/`error_code: "canceled"`; source object gone; Replicate prediction `canceled`.
- A cancel racing a completed job is a silent no-op (no crash, result preserved).
- Existing E2E gate stays green; new logic covered by handler + decision-helper unit suites.
