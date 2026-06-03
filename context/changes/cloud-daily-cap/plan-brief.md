# Global Daily Cap on Cloud AI Requests — Plan Brief

> Full plan: `context/changes/cloud-daily-cap/plan.md`

## What & Why

Add a **global** daily cost cap to the Cloud AI path so runaway Replicate spend is structurally impossible. The `create-job` route counts today's billable cloud jobs and, once the configured cap is hit, rejects the request with a clear message **before** any signed URL, storage write, or Replicate prediction happens. Delivers PRD **FR-014**; this is roadmap **S-05**, sequenced right after S-04 because cloud spend is uncapped until it ships.

## Starting Point

S-04 left a working async cloud pipeline: `create-job` (`src/pages/api/enhance/cloud/create-job.ts`) gates auth, validates the body, builds a service-role admin client, then mints a signed upload URL + inserts a `queued` `jobs` row. Errors already use the `{ error: { code, message } }` envelope, and the client (`cloud-upload.client.ts`) maps each `code` to user copy. There is currently **no** cap — every authenticated submit reaches the model.

## Desired End State

The Nth+1 cloud submission of a UTC day (N = `CLOUD_DAILY_CAP`) is rejected at `create-job` with `429 daily_cap_reached`, surfaced as a friendly "daily cloud limit reached" message in the existing error UI — no row created, no bytes uploaded, no prediction started. Below-cap submissions are unchanged. `CLOUD_DAILY_CAP=0` rejects everything (operator kill-switch).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Cap scope | Global, not per-user | PRD FR-014 + Non-Goals (per-user is v2); the per-user phrasing in idea-notes/CLAUDE.md/migration comment is stale | Plan |
| Cap value source | Env var `CLOUD_DAILY_CAP`, default 50 | Tunable per env without a redeploy; `0` doubles as a kill-switch | Plan |
| Window | Calendar day, UTC | Simplest to reason about; matches migration comment; resets predictably at 00:00 UTC | Plan |
| What counts | All jobs except `failed` with NULL `replicate_prediction_id` | Pre-model failures cost nothing, so they shouldn't burn quota; everything that reached the model counts | Plan |
| Reject status | `429` + `daily_cap_reached` | Semantically correct rate-limit status; client maps by `code` regardless | Plan |
| Atomicity | Best-effort count-then-insert | Trivial, roadmap-scoped, collision-free; minor boundary overrun acceptable at v1 scale | Plan |
| Enforcement point | `create-job` route, pre-insert | Rejects before any work; keeps Edge `/start` + `/callback` untouched (S-07/S-08 collision-free) | Roadmap |

## Scope

**In scope:** `CLOUD_DAILY_CAP` env field; a pure `countCloudJobsToday(admin)` service helper; a pre-insert cap guard in `create-job`; a `daily_cap_reached` client message; unit + route tests.

**Out of scope:** per-user limits; any migration / SQL function / Edge Function change; strict atomic enforcement; a new index; admin UI / usage dashboard; an invocation ledger.

## Architecture / Approach

Two thin, bottom-up layers. **Phase 1 (data/service):** declare the env var and add an injectable, `astro:env`-free count helper that runs `count(*) where created_at >= <UTC day start> and NOT (status='failed' and replicate_prediction_id is null)` via the admin client. **Phase 2 (API/client):** resolve the cap from env in the route, call the helper before `createPhotoJob`, return `429 daily_cap_reached` at/over cap, and add the one-line client `code → message` mapping.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Cap counting + configuration | `CLOUD_DAILY_CAP` env + tested `countCloudJobsToday` helper | Predicate correctness for the `failed`/`prediction_id` matrix |
| 2. Route enforcement + rejection | `429 daily_cap_reached` guard + client message | Guard ordering (must run before any work); `0`-cap kill-switch via `>=` |

**Prerequisites:** S-04 done (it is). Local Supabase + a Replicate token for the manual end-to-end check.
**Estimated effort:** ~1 session across 2 small phases (≈4 files, no migration).

## Open Risks & Assumptions

- **TOCTOU overrun:** concurrent submits at the boundary can exceed the cap by a few; bounded by concurrency, accepted at v1 scale (provider billing alert backstops).
- **Accepted edge:** if `predictions.create` succeeds but storing `replicate_prediction_id` fails, that costly run won't count — no invocation ledger in v1.
- **Performance:** the global count seq-scans `jobs` (the existing index leads on `user_id`); negligible at PRD `small/low` scale, revisit with a `created_at` index only if volume grows.

## Success Criteria (Summary)

- A submission over the cap is rejected with a clear message, and no row/object/prediction is created for it.
- `CLOUD_DAILY_CAP=0` blocks all cloud submissions; a normal cap leaves the S-04 happy path intact.
- `failed` jobs that never reached Replicate do not consume quota; jobs that did (even if later failed) do.
