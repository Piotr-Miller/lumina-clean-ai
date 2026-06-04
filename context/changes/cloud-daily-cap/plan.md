# Global Daily Cap on Cloud AI Requests — Implementation Plan

## Overview

Add a global daily cost cap to the Cloud AI submission path. The `create-job` route counts today's billable jobs (calendar day, UTC) before doing any work and, once the configured cap is reached, rejects the request with `HTTP 429 { code: "daily_cap_reached" }` — before any signed URL is minted, any storage write happens, or any Replicate prediction is created. This delivers PRD **FR-014** ("the system rejects any Cloud AI request that would exceed the global daily cap, with a clear user-facing message") and makes runaway cloud spend structurally impossible for the v1 small-user base.

This is roadmap slice **S-05**, sequenced immediately after S-04 because real Replicate calls are uncapped until it lands.

## Current State Analysis

- **`create-job` route** (`src/pages/api/enhance/cloud/create-job.ts`) is the cloud submission entry point. It already: gates anonymous users (401), defensively parses + zod-validates the body (400 `invalid_body`), checks the admin env (500), and builds a **service-role admin client** (`createAdminClient`, line 56) before calling `createPhotoJob`. Error bodies follow the `{ error: { code, message } }` envelope with no `status` field, per CLAUDE.md. **This is the enforcement point** the roadmap recommends — a count check slots in after the env check, before `createPhotoJob`.
- **`photo-job.service.ts`** holds all `jobs`-table access via an injected `admin: SupabaseClient` (RLS-bypassing). It imports **no** `astro:env/server` (Lesson #4 — keeps it Vitest-loadable). `replicate_prediction_id` is stamped by `markJobProcessing` when `/start` creates the prediction; neither `markJobFailed` nor `markPendingJobFailedForOwner` clears it. So a job that reached the model keeps its id even after failing/timing out.
- **`jobs` table** (`supabase/migrations/20260528120000_create_jobs_table.sql`): columns `status` (enum `queued|processing|succeeded|failed`), `replicate_prediction_id text`, `created_at timestamptz default now()`. Index `jobs_user_id_created_at_idx (user_id, created_at desc)` — leads on `user_id`, so it does **not** serve a global (all-users) time-range scan; the global count will seq-scan (fine at PRD `target_scale: small/low`).
- **Client surfacing** (`src/lib/services/cloud-upload.client.ts`): `submitCloudJob` reads the route's error `code` and maps it to user copy via `ROUTE_MESSAGES` (line 20), throwing the mapped string. The hook `useCloudSubmit` shows the thrown message. **Adding a cap message is one new map entry** — no new UI.
- **Env config** (`astro.config.mjs:17-26`): `CLOUD_PIPELINE_ENABLED` is an `envField.boolean(... default: false)` — the precedent for declaring a server-only, defaulted config value.
- **Conflict resolved:** PRD FR-014 (authoritative) specifies a **global** cap; Non-Goals defers per-user limits to v2. `idea-notes.md`, `CLAUDE.md`, and the migration index comment describe a *per-user* "20/user/24h" count — stale phrasing, not the contract we build.

## Desired End State

With the cloud pipeline enabled, the Nth+1 Cloud AI submission of a UTC day (where N = `CLOUD_DAILY_CAP`, counting all non-pre-model-failure jobs) is rejected at `create-job` with `429 { error: { code: "daily_cap_reached", message: ... } }`, and the user sees a clear "daily cloud limit reached" message in the existing cloud-submit error surface — without any signed URL being minted, any byte uploaded, or any Replicate prediction created. Submissions below the cap are unaffected. Setting `CLOUD_DAILY_CAP=0` rejects all cloud submissions (operator kill-switch). Verifiable by seeding the `jobs` table to the cap and confirming the next submit is rejected; and by unit tests over the count predicate.

### Key Discoveries:

- Enforcement point already builds the admin client needed for a global (cross-user) count: `src/pages/api/enhance/cloud/create-job.ts:56`.
- Count predicate must use `replicate_prediction_id` to separate billable from pre-model-failed jobs; the field's lifecycle (set in `markJobProcessing`, never cleared) makes this reliable: `src/lib/services/photo-job.service.ts:133-144`.
- Client error surface is a single `code → message` map: `src/lib/services/cloud-upload.client.ts:20`.
- Env-field precedent: `astro.config.mjs:24` (`CLOUD_PIPELINE_ENABLED`).
- Service file must stay free of `astro:env/server` (Lesson #4); pass the cap **in** as a function argument, resolved at the route.

## What We're NOT Doing

- **No per-user limits** (PRD Non-Goals → v2).
- **No new migration / SQL function / Edge Function change.** Counting is a `select ... count` from the existing route via the existing admin client. No advisory locks, no transactional count-and-insert.
- **No strict atomic enforcement.** A best-effort count-then-insert can let a few concurrent requests at the boundary overrun by a handful; bounded by concurrency, accepted at v1 scale (provider billing alert is the backstop).
- **No new index.** The global count seq-scans; acceptable at PRD `small/low` scale. (Documented in Performance Considerations.)
- **No admin UI / usage dashboard / cost view** (PRD → v2). The `CLOUD_DAILY_CAP=0` kill-switch is the only operator lever.
- **No change to the Edge Function `/start` or `/callback`** — keeps S-05 collision-free with S-07 and S-08.
- **No invocation ledger** to close the "predictions.create succeeds but `replicate_prediction_id` store fails" edge — accepted for v1.

## Implementation Approach

Two thin layers, bottom-up. Phase 1 adds the configurable cap value (env) and a pure, injectable count helper in the service layer, fully unit-tested against the agreed predicate. Phase 2 wires the helper into the `create-job` route as a pre-insert guard returning `429 daily_cap_reached`, and adds the one-line client message mapping. The split keeps the testable data/predicate logic isolated from the route/client wiring.

**The count predicate** (calendar day UTC + exclude pre-model failures):

```sql
created_at >= date_trunc('day', now() at time zone 'utc')
  AND NOT (status = 'failed' AND replicate_prediction_id is null)
```

In supabase-js this is a `count: "exact", head: true` select with a `.gte("created_at", <utc-day-start ISO>)` plus an `.or("status.neq.failed,replicate_prediction_id.not.is.null")` filter (the De Morgan equivalent of the `NOT (... AND ...)`).

## Critical Implementation Details

- **State sequencing** — the count MUST run *before* `createPhotoJob` (which both mints the signed upload URL and inserts the `queued` row). Counting after the insert would count the in-flight request itself and defeat the "reject before any work" contract.
- **UTC day boundary** — compute the day-start as a UTC `Date` (midnight UTC of "now"), not local time, so the window matches across the Cloudflare/Supabase boundary and resets predictably at 00:00 UTC. The Worker runtime's clock is UTC; do not rely on a local-timezone `setHours`.
- **`0` is a valid cap** — a `CLOUD_DAILY_CAP` of `0` must reject every submission (kill-switch). Use `count >= cap`, which yields `0 >= 0 → reject` on the first request. Do not treat `0`/falsy as "unset/unlimited".
- **Three primitives are new to this repo** — `.or("status.neq.failed,replicate_prediction_id.not.is.null")` (PostgREST `.not.is.null` filter), `{ count: "exact", head: true }`, and `envField.number` have no existing precedent here (today: only `.eq/.in/.single/.maybeSingle` and `envField.string/boolean`). All are valid supabase-js / Astro APIs and the De Morgan transform is correct (`NOT(failed AND null)` ≡ `status≠failed OR id IS NOT NULL`) — verify syntax against the docs while implementing. With `head: true` the response is `{ count, data: null }`: read `count`, not `data.length`.

## Phase 1: Cap counting + configuration (data/service layer)

### Overview

Declare the `CLOUD_DAILY_CAP` env field and add a pure, injectable count helper to `photo-job.service.ts` that implements the UTC-day + exclude-pre-model-failure predicate. Unit-test the predicate against seeded rows of every `status` × `replicate_prediction_id` combination.

### Changes Required:

#### 1. Env schema — new cap field

**File**: `astro.config.mjs`

**Intent**: Make the cap value operator-configurable per environment (and `0` a kill-switch), mirroring the existing `CLOUD_PIPELINE_ENABLED` precedent.

**Contract**: Add `CLOUD_DAILY_CAP: envField.number({ context: "server", access: "secret", default: 50 })` to the `env.schema` block. Server-only; default 50.

#### 2. Local/example env documentation

**File**: `.env.example` (and note for `.dev.vars`)

**Intent**: Document the new variable so Node dev and Cloudflare local dev know it exists; absence falls back to the schema default.

**Contract**: Add a commented `CLOUD_DAILY_CAP=50` line with a one-line note ("global Cloud AI jobs per UTC day; 0 disables cloud"). No value required for it to work (schema default applies).

#### 3. Count helper

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: Provide a pure, RLS-bypassing count of today's billable cloud jobs across all users, for the route's pre-insert cap check. Stays free of any `astro:env/server` import (Lesson #4) — the cap value is the route's concern, not this helper's.

**Contract**: `export async function countCloudJobsToday(admin: SupabaseClient): Promise<number>` — runs a head/exact count on `jobs` filtered by `created_at >= <UTC day start>` and the De Morgan form of `NOT (status='failed' AND replicate_prediction_id IS NULL)`. Throws (consistent with the other helpers) if the query errors; returns the integer count. Compute the UTC day-start inside the helper.

```ts
// De Morgan: NOT (failed AND id IS NULL)  ==  (status <> 'failed') OR (id IS NOT NULL)
const { count, error } = await admin
  .from(JOBS_TABLE)
  .select("id", { count: "exact", head: true })
  .gte("created_at", utcDayStartIso)
  .or("status.neq.failed,replicate_prediction_id.not.is.null");
```

#### 4. Cap-decision helper (pure, env-free)

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: Make the over-cap decision a pure, unit-testable function so the boundary semantics (`>=`) and the `cap=0` kill-switch are covered by an automated test — the route module itself can't be unit-tested because it imports `astro:env/server` (Lesson #4, `lessons.md:26`).

**Contract**: `export function isOverDailyCap(count: number, cap: number): boolean` → `count >= cap`. Trivial body; the value is the locked, tested contract that `0 >= 0 → true` (kill-switch) and `cap-1 < cap` (last allowed slot). The route composes `isOverDailyCap(await countCloudJobsToday(admin), CLOUD_DAILY_CAP)`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check` (or `npm run build`)
- Lint passes on touched files: `npx prettier --write` then `npx eslint` on the changed files (Windows CRLF baseline — Lesson: lint only this phase's files, not the repo)
- `isOverDailyCap` unit test passes (pure, no DB): `npx vitest run tests/photo-job.service.test.ts` — `isOverDailyCap(0, 0) === true` (kill-switch), `isOverDailyCap(49, 50) === false`, `isOverDailyCap(50, 50) === true` (boundary).
- Count-predicate test passes (live local Supabase — see Manual note; requires `npx supabase start`, NOT run in CI): seeding rows and asserting the count covers — only-today rows counted (a row dated yesterday excluded); `failed` + NULL `replicate_prediction_id` excluded; `failed` + non-NULL id **included**; `queued`/`processing`/`succeeded` included; `0` rows → `0`.

#### Manual Verification:

- With local Supabase running (`npx supabase start`), seeding rows of mixed status/date and calling the helper returns the expected billable count. (This is the same check as the count-predicate test above, runnable by hand where Docker/Supabase isn't available.)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Route enforcement + user-facing rejection (API/client layer)

### Overview

Wire `countCloudJobsToday` into the `create-job` route as a pre-insert guard, returning `429 daily_cap_reached` when the count meets/exceeds `CLOUD_DAILY_CAP`. Map the new code to user copy in the client. Test both the route rejection and the client mapping.

### Changes Required:

#### 1. Route cap guard

**File**: `src/pages/api/enhance/cloud/create-job.ts`

**Intent**: Reject over-cap submissions before any signed URL / storage / Replicate work. Resolve the cap from env here (the service helper stays env-free) and pass the admin client to the counter.

**Contract**: Import `CLOUD_DAILY_CAP` from `astro:env/server` and `countCloudJobsToday` + `isOverDailyCap` from the service. After the admin-env check and admin-client construction, before `createPhotoJob`: if `isOverDailyCap(await countCloudJobsToday(admin), CLOUD_DAILY_CAP)`, return `json({ error: { code: "daily_cap_reached", message: "The daily Cloud AI limit has been reached. Please try again tomorrow." } }, 429)`. A count-query throw falls through to the existing `catch` → 500. The `>=` boundary + `cap=0` kill-switch live in `isOverDailyCap` (tested in Phase 1).

#### 2. Client message mapping

**File**: `src/lib/services/cloud-upload.client.ts`

**Intent**: Surface the cap rejection as friendly copy through the existing error path — no new UI.

**Contract**: Add `daily_cap_reached: "..."` to `ROUTE_MESSAGES` (line 20) with copy like "The daily Cloud AI limit has been reached. Try the Local engine, or come back tomorrow." `routeErrorMessage` already maps any known `code`; the 429 status needs no special handling (the client branches on `code`, not status).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check` (or `npm run build`)
- Lint passes on touched files: `npx prettier --write` then `npx eslint` on the changed files (per the Windows CRLF lesson)
- Client test passes (`tests/cloud-upload.client.test.ts`): a 429 `daily_cap_reached` response makes `submitCloudJob` throw the mapped cap message. (Feasible — `cloud-upload.client.ts` is `astro:env`-free and already unit-tested.)
- (No automated route test: `create-job.ts` imports `astro:env/server`, so it can't be loaded in Vitest — Lesson #4. The 429 decision logic is covered by the Phase 1 `isOverDailyCap` test; the route wiring is verified manually below.)

#### Manual Verification:

- Route wiring (covers the 429 branch in place of an automated route test): with `CLOUD_PIPELINE_ENABLED=true` and `CLOUD_DAILY_CAP` set low (e.g. 1), submit one cloud job, then attempt a second: the second is rejected and the cap message appears in the UI; no new `jobs` row is created and no source object is uploaded for the rejected attempt.
- With `CLOUD_DAILY_CAP=0`, the first submission is rejected (kill-switch).
- A submission below the cap still completes end-to-end (no regression to the S-04 flow).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- **Cap decision** (Phase 1, pure unit test): `isOverDailyCap` boundary (`49,50`→false, `50,50`→true) + `cap=0` kill-switch (`0,0`→true). No DB.
- **Count predicate** (Phase 1, live local Supabase — requires `npx supabase start`, not CI): date boundary (today vs yesterday), and the full `status` × `replicate_prediction_id` matrix — especially `failed`+NULL (excluded) vs `failed`+non-NULL (included), plus `0` rows.
- **Route guard** (Phase 2): verified manually — `create-job.ts` imports `astro:env/server`, so it can't be loaded in Vitest (Lesson #4). The 429 decision is covered by the Phase 1 `isOverDailyCap` test; the route's pre-insert wiring (rejected request creates no row/object) is checked via the manual cap=1 / cap=0 steps.
- **Client mapping** (Phase 2): a 429 `daily_cap_reached` body resolves to the cap copy via `submitCloudJob`.

### Integration / Manual Testing Steps:

1. Set `CLOUD_PIPELINE_ENABLED=true`, `CLOUD_DAILY_CAP=1`. Submit one cloud job (succeeds/queues). Submit a second → rejected with the cap message; confirm no new row + no uploaded object.
2. Set `CLOUD_DAILY_CAP=0` → first submission rejected.
3. Seed a `failed` job with NULL `replicate_prediction_id`, set cap to 1, submit → still allowed (pre-model failure didn't consume quota). Seed a `failed` job with a non-NULL id → counts against the cap.
4. Restore a normal cap and confirm the S-04 happy path is unaffected.

## Performance Considerations

The global count seq-scans `jobs` for the UTC-day window (the `(user_id, created_at)` index leads on `user_id` and can't serve a non-user-scoped range scan). At the PRD's `target_scale: small/low` (a day's rows are tens, not millions) this is negligible — one cheap count per cloud submission. If volume ever grows, add a `created_at` (or partial) index in its own change; explicitly out of scope here.

## Migration Notes

No schema migration. The cap is enforced entirely in application code against the existing `jobs` table. Rollback = revert the route guard (the env var and helper are inert without the guard).

## References

- Roadmap slice S-05: `context/foundation/roadmap.md:139-150`
- PRD FR-014 (global cap, authoritative): `context/foundation/prd.md:129`
- Enforcement point: `src/pages/api/enhance/cloud/create-job.ts:56`
- Count field lifecycle: `src/lib/services/photo-job.service.ts:133-144`
- Client error surface: `src/lib/services/cloud-upload.client.ts:20`
- Env precedent: `astro.config.mjs:24`
- Lesson — service files stay free of `astro:env/server`: `context/foundation/lessons.md:26`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cap counting + configuration (data/service layer)

#### Automated

- [x] 1.1 Type checking passes (`npx astro check` / `npm run build`) — 2688d2a
- [x] 1.2 Lint passes on touched files (prettier --write then eslint, this phase's files only) — 2688d2a
- [x] 1.3 `isOverDailyCap` unit test passes (pure, no DB): cap=0 kill-switch + `>=` boundary — 2688d2a
- [x] 1.4 Count-predicate test passes (live local Supabase, requires `npx supabase start`, not CI): date boundary + status × prediction_id matrix + zero rows — 2688d2a

#### Manual

- [x] 1.5 Seeded-rows call to the helper returns the expected billable count against local Supabase (by-hand equivalent of 1.4) — 2688d2a

### Phase 2: Route enforcement + user-facing rejection (API/client layer)

#### Automated

- [x] 2.1 Type checking passes (`npx astro check` / `npm run build`) — f4d2093
- [x] 2.2 Lint passes on touched files (prettier --write then eslint, this phase's files only) — f4d2093
- [x] 2.3 Client test passes (429 `daily_cap_reached` → mapped cap message via `submitCloudJob`) — f4d2093

#### Manual

- [x] 2.4 Route wiring — cap=1: second submit rejected with message, no row/object created; below-cap submit still works end-to-end — f4d2093
- [x] 2.5 Cap=0 kill-switch rejects the first submission — f4d2093
- [x] 2.6 `failed`+NULL id does not consume quota; `failed`+non-NULL id does — f4d2093
