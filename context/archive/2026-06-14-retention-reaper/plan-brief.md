# Scheduled Retention Reaper (Risk #5) — Plan Brief

> Full plan: `context/changes/retention-reaper/plan.md`
> Research: `context/changes/retention-reaper/research.md`

## What & Why

Raw user photos (`source.*`) must not linger in the private `photos` bucket past the ≤24h retention NFR. The inline on-failure delete only fires on a terminal flip, so it structurally misses three cases — legacy terminal-failed orphans (two lingered ~7.7 days on prod), abandon-and-never-return, and best-effort-delete failures. Add a scheduled reaper as the backstop.

## Starting Point

Five inline delete sites in `photo-job.service.ts` all run `storage.remove()` on a terminal transition; `sweepStalePendingJobsForOwner` (`:315`) is the owner-scoped, create-job-triggered template. The Vault-secret `pg_net` webhook trigger and the `/start` bearer-auth router already exist and are reused wholesale — zero new secrets.

## Desired End State

A `source.*` for a non-succeeded job is gone within ~24h (hourly run + 23h threshold). Non-terminal jobs >1h flip to `failed('abandoned')`, freeing daily-cap slots. The first run auto-backfills any pre-existing orphan. Provable via the `storage.objects … like '%/source.%'` count returning 0 and an integration test against real local storage.

## Key Decisions Made

| Decision             | Choice                                       | Why (1 sentence)                                               | Source   |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------- | -------- |
| Selection predicate  | Hybrid: storage-first delete + SQL row-flip  | Neither alone covers all three gaps + DB consistency           | Research |
| Schedule + threshold | Hourly, delete `source.*` >23h               | Only `interval + threshold ≤ 24h` actually honors the NFR      | Plan     |
| Flip threshold       | 1h (reuse `STALE_PENDING_JOB_MS`)            | Same "abandoned" semantics as the owner sweep; frees cap early | Plan     |
| Result objects       | Out of scope (source only)                   | Risk #5 is about raw user photos; result cleanup is separate   | Plan     |
| Cron registration    | Migration + inert Vault guard                | Versioned, repeatable, no-op in local/CI                       | Plan     |
| Storage SELECT       | `security definer` RPC                       | PostgREST can't reach `storage`; SQL can't delete the object   | Plan     |
| Testing              | Integration (real storage) + unit            | Closes Risk #5; mocking storage is the named anti-pattern      | Plan     |
| Docs                 | Full sync (idea-notes + test-plan + runbook) | Reverses a recorded MVP non-goal                               | Plan     |

## Scope

**In scope:** cross-user `sweepAbandonedSourcesGlobally`, the `stale_source_object_paths` RPC, a `/reap` Edge route, an hourly pg_cron schedule, unit + real-storage integration tests, docs-sync.

**Out of scope:** `result.*` cleanup, moving the service-role key into Vault, external schedulers, new secrets/prod config, pipeline-level retries.

## Architecture / Approach

`pg_cron` (hourly) → Vault-reading tick fn (inert if unset) → `net.http_post(<edge_function_url>/reap, Bearer <db_webhook_secret>)` → `/reap` verifies the bearer, builds the service-role admin, calls `sweepAbandonedSourcesGlobally`. That one shared-module fn does both passes: SQL flip of non-terminal >1h, then storage-first delete of `source.*` >23h (paths from the RPC, batched through `.remove()`). Best-effort, never throws, returns `{flipped, deleted}`; `/reap` returns `{swept}` without leaking paths.

## Phases at a Glance

| Phase                       | What it delivers                                     | Key risk                                                                                  |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Service fn + RPC + tests | Proven deletion logic, real-storage integration test | Avoid mutating `storage.objects.created_at`; drive staleness with `retentionMs` test opts |
| 2. `/reap` route            | Bearer-auth HTTP entry to the reaper                 | Deno-only static coverage (run `deno check` + serve smoke)                                |
| 3. pg_cron + docs           | Hourly schedule + reconciled docs                    | pg_cron availability in local/CI image (guarded); tick pins a 30s pg_net timeout          |

**Prerequisites:** local Supabase stack (Docker); existing Vault secrets for live prod wiring.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- pg_cron ships in the Supabase PG17 image; the schedule migration is guarded on `pg_available_extensions` so CI `db reset` never breaks if it doesn't.
- The `security definer` RPC reading `storage.objects` is granted to `service_role` only.
- Prod needs only pg_cron enablement + an Edge Function redeploy; the two Vault secrets already exist.

## Success Criteria (Summary)

- No `source.*` object older than ~24h survives a reaper cycle.
- Non-terminal jobs >1h end up `failed('abandoned')`, with correct daily-cap accounting.
- Risk #5 is covered by an integration test against real Supabase storage.
