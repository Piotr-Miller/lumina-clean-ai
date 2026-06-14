# Scheduled Retention Reaper for Lingering Source Objects (Risk #5) — Implementation Plan

## Overview

Add a **scheduled retention reaper** that backstops the inline on-failure source deletion, guaranteeing no raw user photo (`source.*`) lingers in the private `photos` bucket past the ≤24h retention NFR. It closes the three gaps the inline terminal hooks structurally cannot reach: **(a)** legacy terminal-`failed` orphans (predating the S-08 inline delete — the two 7.7-day prod orphans), **(b)** abandon-and-never-return (owner-scoped create-job sweep never runs for a user who doesn't submit again), and **(c)** best-effort-delete failures (`bestEffortRemove` swallows a storage error, nothing retries).

The reaper is a **hybrid** of two passes (predicate settled in `research.md` → Follow-up):

1. **Storage-first source-delete** — delete ANY `source.*` object older than the retention threshold via the Storage API `.remove()`. Status-agnostic, so it uniformly catches a + b + c. This is the literal NFR invariant.
2. **Row-flip (pure SQL)** — flip non-terminal jobs older than the stale threshold → `failed('abandoned')`, for DB consistency + daily-cap accuracy. It does **not** delete sources (pass 1 owns all deletes).

## Current State Analysis

- **Five inline delete sites**, all in `src/lib/services/photo-job.service.ts`, all routed through `bestEffortRemove` → `storage.from('photos').remove([path])` (`:36-42`), and all firing **only on a terminal flip**: `markJobSucceeded` (`:156`), `markJobFailed` (`:229`), `markPendingJobFailedForOwner` (`:267`), `sweepStalePendingJobsForOwner` (`:315`, batch delete `:375`). An already-terminal or never-returning row is invisible to all of them.
- **`sweepStalePendingJobsForOwner` is the template**: select stale non-terminal rows → guarded flip-to-`failed('abandoned')` → single batched `storage.remove(paths)`. The reaper is its cross-user twin, **minus the `user_id` filter**, with the flip and delete **decoupled** onto separate thresholds.
- **Async infra to reuse** (zero new secrets): the Vault-secret `pg_net` trigger (`supabase/migrations/20260608120000_jobs_webhook_vault.sql:33-34` reads `vault.decrypted_secrets` for `edge_function_url` + `db_webhook_secret`; `20260531120000_jobs_enqueue_webhook.sql:35-38` is the inert NULL-secret guard) and the `/start` bearer-auth router in `supabase/functions/enhance/index.ts` (`digestEquals` `:82-93`, `buildAdminClient` `:98-105`, router `:484-497`).
- **Load-bearing storage constraint**: deleting a `storage.objects` row via SQL does NOT remove the S3 object (orphans it, still billed) **and** is now actively rejected by a statement-level trigger (`storage.allow_delete_query` guard). The real delete MUST route through the Storage API (`.remove()`). SQL's only roles are **selecting** stale rows/paths and **scheduling**.
- **PostgREST does not expose the `storage` schema** by default (`db.schemas = public, graphql_public`), so the service fn cannot `.schema('storage').from('objects')`. The storage-first SELECT is therefore wrapped in a `security definer` RPC in `public`.
- **Postgres 17** local (`config.toml:36`); the Supabase image ships `pg_cron`, but the scheduling migration is guarded against its absence so CI `db reset` never breaks.

### Key Discoveries:

- `src/lib/services/photo-job.service.ts:315-399` — `sweepStalePendingJobsForOwner`, the exact shape to twin (select → guarded flip → batched `.remove`).
- `src/lib/services/photo-job.service.ts:22,26` — `STALE_PENDING_JOB_MS = 3_600_000` (1h) and `SWEEP_MAX = 100`, reused for the flip threshold and the per-run delete bound.
- `supabase/functions/enhance/index.ts:484-497` — the router; `/reap` is a one-branch addition reusing `digestEquals` + `buildAdminClient`.
- `supabase/migrations/20260608120000_jobs_webhook_vault.sql` — the canonical `vault.decrypted_secrets` read + inert guard the cron tick copies verbatim.
- `tests/jobs.rls.test.ts:174-265` — real-storage retention contracts to extend for the integration test (anti-pattern per test-plan §6.2: mocking storage).
- `lessons.md:54-58` (owner-scoped mutations) and `:61-66` (async fire-and-forget needs a backstop) — the reaper IS the scheduled backstop that lesson defers; it does not violate it.

## Desired End State

- A `source.*` object whose job is non-succeeded is deleted within **~24h** (hourly run + 23h threshold → worst case ≈ 24h).
- A non-terminal job older than 1h is flipped to `failed('abandoned')` on the next hourly run, freeing its daily-cap slot (when pre-model) and ending any stale spinner.
- The first scheduled run **auto-backfills** any pre-existing orphan >23h (storage-first is status-agnostic) — no one-shot migration needed.
- Verifiable: after a run, `select count(*) from storage.objects where bucket_id='photos' and name like '%/source.%' and created_at < now() - interval '23 hours'` returns 0; `cron.job_run_details` shows the hourly tick; an integration test against real local storage proves an old seeded source is removed.

## What We're NOT Doing

- **Not** deleting `result.*` objects — this change is scoped to `source.*` (the Risk #5 NFR for raw user photos). Orphaned `result.png` from a late-failure is a separate, later cleanup.
- **Not** moving the service-role key into Vault/Postgres — it stays confined to the Edge Function runtime. The cron reaches storage only via `/reap`.
- **Not** an external scheduler (GH Actions / Cloudflare cron) — pg_cron is already available; keep all async infra in Postgres + the Edge Function.
- **Not** adding new secrets or prod config — the reaper reuses the existing `edge_function_url` + `db_webhook_secret` Vault entries already set for the webhook.
- **Not** retrying the Cloud-AI pipeline or any pipeline-level dead-lettering (that backstop is the client watchdog; out of scope here).

## Implementation Approach

`pg_cron` (hourly) → a `security definer` tick function reads the two Vault secrets (inert no-op if absent) → `net.http_post(<edge_function_url>/reap, Bearer <db_webhook_secret>)` → the `/reap` route verifies the bearer, builds the service-role admin client, and calls `sweepAbandonedSourcesGlobally(admin, opts)`. That single shared-module function does both passes: a pure-SQL flip of non-terminal rows >1h, then a storage-first delete of `source.*` >23h whose paths come from the `stale_source_object_paths` RPC, batched through `.remove()`. It is best-effort and never throws; it returns `{ flipped, deleted }`, and `/reap` returns `{ swept }` without leaking paths.

Keeping the whole reaper in the one shared `photo-job.service.ts` (rather than splitting flip-into-SQL and delete-into-Edge) means a single testable unit, no logic duplicated into SQL, and parity between the Astro app and the Deno function — consistent with the existing module's role.

## Critical Implementation Details

- **Threshold decoupling**: the flip uses `STALE_PENDING_JOB_MS` (1h); the source-delete uses a new `ABANDONED_SOURCE_RETENTION_MS` (23h, chosen so hourly run + threshold ≤ 24h honors the NFR). These are independent inputs, both overridable via `opts` for tests.
- **Storage SELECT must be an RPC**: PostgREST does not expose `storage`, and raw SQL `DELETE` on `storage.objects` is rejected. The `security definer` RPC reads (SELECT only) `storage.objects` and returns paths; deletion stays in `.remove()`. The RPC is owned by `postgres`, `set search_path = ''`, and granted to `service_role` only.
- **Bounded delete with no silent cap**: cap the per-run delete set (reuse `SWEEP_MAX`-style bound); if the RPC returns the cap, `console.warn` that more remain (they drain next hour) — never silently truncate.
- **Never throws**: a reaper fault must not surface anywhere user-facing; mirror `sweepStalePendingJobsForOwner`'s try/catch → warn → return zero.
- **pg_cron guard**: wrap `create extension` + `cron.schedule` in a `DO` block gated on `pg_available_extensions` so a `db reset` on an image without pg_cron logs a notice instead of failing.

---

## Phase 1: Reaper service function + storage-path RPC + tests

### Overview

Build and fully prove the deletion logic before any scheduling exists. Add the cross-user sweep to the shared service module and the `security definer` RPC it depends on, covered by a unit test (mocked admin) and an integration test against **real local Supabase storage**.

### Changes Required:

#### 1. Storage-path RPC migration

**File**: `supabase/migrations/<ts>_reaper_stale_source_paths.sql`

**Intent**: Expose a read-only, service-role-only way for the service fn to enumerate stale `source.*` objects, since PostgREST can't reach the `storage` schema and SQL can't delete the objects anyway.

**Contract**: `public.stale_source_object_paths(older_than_seconds integer, max_rows integer) returns table(name text)` — `security definer`, `set search_path = ''`, body `select name from storage.objects where bucket_id = 'photos' and name like '%/source.%' and created_at < now() - make_interval(secs => older_than_seconds) order by created_at asc limit max_rows`. `revoke all ... from public, anon, authenticated; grant execute ... to service_role;`. Follows the RLS/grant model in `lessons.md:5-10` (service_role retains access; others revoked).

#### 2. Cross-user reaper in the shared service module

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: Add the owner-agnostic twin of `sweepStalePendingJobsForOwner`, doing the SQL flip (pass 2) and the storage-first delete (pass 1) as one best-effort, never-throwing call. Add the retention constant.

**Contract**:

```ts
const ABANDONED_SOURCE_RETENTION_MS = 82_800_000; // 23h — hourly run + 23h ≤ 24h NFR
export async function sweepAbandonedSourcesGlobally(
  admin: SupabaseClient,
  opts?: { staleMs?: number; retentionMs?: number; max?: number },
): Promise<{ flipped: number; deleted: number }>;
```

Pass 2 (flip): single guarded `update jobs set status='failed', error_code='abandoned', error_message=…, completed_at=now() where status in ('queued','processing') and created_at < now()-staleMs` (no `user_id`, no source delete). Pass 1 (delete): `admin.rpc('stale_source_object_paths', { older_than_seconds: retentionMs/1000, max_rows: max })` → `admin.storage.from('photos').remove(paths)`. Bound + warn-on-cap; whole body in try/catch returning `{flipped:0,deleted:0}` on fault. Defaults: `staleMs = STALE_PENDING_JOB_MS`, `retentionMs = ABANDONED_SOURCE_RETENTION_MS`, `max = SWEEP_MAX`.

#### 3. Unit test (mocked admin)

**File**: `tests/photo-job-helpers.test.ts`

**Intent**: Pin the decision logic without storage — flip predicate (status filter + threshold), the RPC→remove wiring, never-throws on a storage/RPC error, warn-on-cap. Mirrors the existing `sweepStalePendingJobsForOwner` mocked coverage (`:241-399`).

**Contract**: New `describe("sweepAbandonedSourcesGlobally")` asserting: flips only `queued`/`processing` past `staleMs`; calls `.remove` with the RPC's paths; returns `{flipped, deleted}`; swallows a thrown storage error (returns zeroed, no throw); warns when the path count hits `max`.

#### 4. Integration test (real local storage) — closes Risk #5

**File**: `tests/jobs.rls.test.ts`

**Intent**: Prove against real Supabase storage that a seeded old `source.*` object for a non-succeeded job is actually removed — the test-plan §2 Risk #5 contract (anti-pattern: mocking storage).

**Contract**: Drive storage staleness through the function's `retentionMs` option, not by mutating `storage.objects.created_at` (the current harness has no raw SQL client for storage metadata). Seed a `failed` job + upload a fresh `source.*` object, call `sweepAbandonedSourcesGlobally(admin, { retentionMs: 0, staleMs })`, and assert the object is gone (`list`/`download` 404). Add the boundary pair with a fresh source and `retentionMs: 3_600_000` to prove the RPC predicate does not select fresh objects. For the row-flip half, backdate `jobs.created_at` through the existing `seedJob()` pattern and assert a non-terminal seed flips to `failed('abandoned')`. Use unique ids (timestamp suffix) + cleanup, per test independence.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npx supabase db reset`
- [ ] Unit tests pass: `npm run test:unit`
- [ ] Integration suite passes (real local Supabase): `npm test` (full Vitest suite incl. `jobs.rls.test.ts`)
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Lint passes on touched files: `npx eslint src/lib/services/photo-job.service.ts tests/photo-job-helpers.test.ts tests/jobs.rls.test.ts`

#### Manual Verification:

- [ ] Against a local stack, calling the fn with `retentionMs: 0` removes an uploaded `source.*`; the fresh-boundary case with `retentionMs: 3_600_000` leaves it in place; succeeded-job results are untouched.
- [ ] The fn returns `{flipped, deleted}` and emits the cap warning when the seed exceeds `max`.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: `/reap` Edge Function route

### Overview

Expose the reaper over HTTP so the cron tick can invoke it, reusing the existing bearer-auth + admin-client plumbing.

### Changes Required:

#### 1. `/reap` route

**File**: `supabase/functions/enhance/index.ts`

**Intent**: Add a bearer-authenticated POST branch that runs the reaper and returns a count, mirroring `handleStart`'s auth exactly.

**Contract**: New `handleReap(req)` — check `DB_WEBHOOK_SECRET` present (500 if not), `digestEquals(Authorization, 'Bearer '+secret)` (401 on mismatch), `buildAdminClient()`, `await sweepAbandonedSourcesGlobally(admin)`, `jsonResponse(200, { swept })` where `swept = flipped + deleted` (never return paths). Add `if (req.method === "POST" && pathname.endsWith("/reap")) return await handleReap(req);` to the router (`:484-497`). Imports `sweepAbandonedSourcesGlobally` from the shared service module (same import the function already uses).

### Success Criteria:

#### Automated Verification:

- [ ] Deno static check passes: `deno check supabase/functions/enhance/index.ts`
- [ ] Unit + integration suites still green: `npm run test:unit` and the integration run

#### Manual Verification:

- [ ] `supabase functions serve enhance` + a `POST /reap` with the correct `Bearer` returns `{swept:n}`; a wrong/missing bearer returns 401; missing secret returns 500.
- [ ] A `POST /reap` with the bearer reaches the service and returns `{swept}`; storage deletion itself is proven by the Phase 1 opts-driven real-storage integration unless a literal old source object is available locally for an end-to-end default-threshold smoke.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: pg_cron scheduling migration + docs-sync

### Overview

Schedule the hourly reaper via pg_cron reusing the Vault-secret `pg_net` pattern, and reconcile the docs that recorded the old "no pg_cron cleanup" non-goal.

### Changes Required:

#### 1. pg_cron schedule migration

**File**: `supabase/migrations/<ts>_reaper_schedule.sql`

**Intent**: Register an hourly cron job that POSTs `/reap` with the Vault bearer, no-op in any environment where the secrets aren't set, and safe to apply where pg_cron is unavailable.

**Contract**: A `security definer`, `search_path=''` tick fn `public.handle_reaper_tick()` that reads `edge_function_url` + `db_webhook_secret` from `vault.decrypted_secrets` (verbatim from `20260608120000_jobs_webhook_vault.sql:33-39`), returns early if either is NULL/empty, else `perform net.http_post(url := fn_url || '/reap', headers := Bearer secret + Content-Type, body := '{}'::jsonb, timeout_milliseconds := 30000)`. Then a `DO` block: `if exists (select 1 from pg_available_extensions where name='pg_cron') then create extension if not exists pg_cron; if exists (select 1 from cron.job where jobname = 'reaper-hourly') then perform cron.unschedule('reaper-hourly'); end if; perform cron.schedule('reaper-hourly', '0 * * * *', 'select public.handle_reaper_tick()'); else raise notice 'pg_cron unavailable — reaper schedule skipped'; end if;`. The guarded `cron.unschedule` keeps the migration idempotent on re-reset without aborting first apply.

#### 2. Docs-sync

**Files**: `idea-notes.md`, `context/foundation/test-plan.md`, `context/foundation/production-config.md`

**Intent**: Reverse the recorded non-goal and reflect the new coverage + zero-new-config prod story.

**Contract**: `idea-notes.md:24` — remove/annotate "Automatic raw-uploads retention cleanup (pg_cron)" from NOT-in-scope (note it's now implemented as the reaper). `test-plan.md` — flip §3 Phase 2 / §5 Risk #5 status to reflect the integration coverage landed here. `production-config.md` — add a short note: pg_cron is enabled by migration; the reaper reuses the existing `edge_function_url` + `db_webhook_secret` Vault entries (no new prod config), and `cron.job_run_details` is the run log.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly on a fresh reset: `npx supabase db reset`
- [ ] Full suite still green: `npm run test:unit` + `npm test`
- [ ] No broken references in touched docs (manual grep / link check)

#### Manual Verification:

- [ ] On the local stack, `select * from cron.job where jobname='reaper-hourly'` shows the schedule (or the skip-notice path is confirmed when pg_cron is absent).
- [ ] With local Vault secrets set, a manual `select public.handle_reaper_tick();` issues the `/reap` POST (observe in `net._http_response` / served function logs); with secrets unset it no-ops.
- [ ] Docs read correctly: idea-notes no longer lists the reaper as out-of-scope; production-config explains the zero-new-config prod wiring.

**Implementation Note**: After automated verification passes, pause for manual confirmation. Note for prod: pg_cron may need one-time enablement (Dashboard → Integrations → Cron, or the migration's `create extension`); verify the first scheduled tick lands via `cron.job_run_details`.

---

## Testing Strategy

### Unit Tests:

- `sweepAbandonedSourcesGlobally` decision logic with a mocked admin: flip status/threshold predicate, RPC→`.remove` wiring, never-throws, warn-on-cap (`tests/photo-job-helpers.test.ts`).

### Integration Tests:

- Real local Supabase storage (`tests/jobs.rls.test.ts`): an uploaded `source.*` is removed when `retentionMs: 0` makes it eligible; a fresh `source.*` remains with `retentionMs: 3_600_000`; a succeeded job's result is untouched; a non-terminal seed with backdated `jobs.created_at` flips to `failed('abandoned')`. Closes test-plan §2 Risk #5.

### Manual Testing Steps:

1. Seed a local `source.*` orphan; run the fn directly with `retentionMs: 0` → object gone; run the fresh-boundary case with `retentionMs: 3_600_000` → object remains.
2. `supabase functions serve enhance` → `POST /reap` with/without bearer → 200 `{swept}` / 401 / 500.
3. `select public.handle_reaper_tick();` with Vault set → `/reap` POST observed; unset → no-op.
4. Confirm `cron.job` has `reaper-hourly`.

## Performance Considerations

The hourly tick is a single `pg_net` POST with `timeout_milliseconds := 30000` to match the synchronous `/reap` work budget. The flip is one bounded SQL UPDATE; the delete is bounded by `max` (drains over subsequent hours, with a warn). pg_cron limits: ≤8 concurrent jobs, ≤10 min/job — comfortably within budget. The run is a no-op (cheap) whenever there are 0 stale objects.

## Migration Notes

No data migration. Backfill of pre-existing orphans is automatic on the first scheduled run (storage-first is status-agnostic). Prod is currently 0 lingering sources, so the first run is expected to be a no-op there. The two Vault secrets already exist (set during cloud flip-ON), so prod needs only pg_cron enablement + a deploy of the updated Edge Function.

## References

- Research: `context/changes/retention-reaper/research.md` (predicate decision in the Follow-up section)
- Template: `src/lib/services/photo-job.service.ts:315-399` (`sweepStalePendingJobsForOwner`)
- Vault + pg_net pattern: `supabase/migrations/20260608120000_jobs_webhook_vault.sql`
- Router + bearer auth: `supabase/functions/enhance/index.ts:82-93,484-497`
- Risk #5: `context/foundation/test-plan.md` §2 / §3 Phase 2 / §5

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reaper service function + storage-path RPC + tests

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 4c8b412
- [x] 1.2 Unit tests pass: `npm run test:unit` — 4c8b412
- [x] 1.3 Integration suite passes (real local Supabase, incl. `jobs.rls.test.ts`) — 4c8b412
- [x] 1.4 Type checking passes: `npx tsc --noEmit` — 4c8b412
- [x] 1.5 Lint passes on touched files — 4c8b412

#### Manual

- [x] 1.6 Opts-driven source removal boundary passes; succeeded results untouched — 4c8b412
- [x] 1.7 Returns `{flipped, deleted}` and emits the cap warning past `max` — 4c8b412

### Phase 2: `/reap` Edge Function route

#### Automated

- [x] 2.1 Deno static check passes: `deno check supabase/functions/enhance/index.ts` — 16a7f74
- [x] 2.2 Unit + integration suites still green — 16a7f74

#### Manual

- [x] 2.3 `POST /reap` returns `{swept}` with bearer / 401 without / 500 on missing secret — 16a7f74
- [x] 2.4 `POST /reap` with bearer removes a seeded orphan end-to-end — 16a7f74

### Phase 3: pg_cron scheduling migration + docs-sync

#### Automated

- [x] 3.1 Migration applies cleanly on a fresh reset: `npx supabase db reset`
- [x] 3.2 Full suite still green (unit + integration)
- [x] 3.3 No broken references in touched docs

#### Manual

- [x] 3.4 `cron.job` shows `reaper-hourly` (or skip-notice confirmed when pg_cron absent)
- [x] 3.5 `select public.handle_reaper_tick();` issues `/reap` with Vault set; no-op when unset
- [x] 3.6 Docs read correctly (idea-notes, test-plan §5, production-config)
