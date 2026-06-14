---
date: 2026-06-14T16:42:26+02:00
researcher: Piotr Miller
git_commit: 82ee47374d4f7b667a498d4b80b84aa8ac1842f7
branch: change/retention-reaper
repository: lumina-clean-ai
topic: "Scheduled retention reaper for lingering source objects past 24h (Risk #5)"
tags: [research, codebase, retention, storage, pg_cron, pg_net, edge-function, risk-5]
status: complete
last_updated: 2026-06-14
last_updated_by: Piotr Miller
last_updated_note: "Resolved Open Question #1 — predicate is the hybrid (storage-first source-delete + paired pure-SQL row-flip); see Follow-up Research."
---

# Research: Scheduled retention reaper for lingering source objects past 24h

**Date**: 2026-06-14T16:42:26+02:00
**Researcher**: Piotr Miller
**Git Commit**: 82ee47374d4f7b667a498d4b80b84aa8ac1842f7
**Branch**: change/retention-reaper
**Repository**: lumina-clean-ai

## Research Question

How to build a **scheduled retention reaper** that deletes lingering private-storage source objects (raw user photos) for non-succeeded cloud jobs past the 24h retention NFR window — backstopping the inline on-failure deletion — plus the integration coverage for failure/abandon-path source deletion that test-plan §3 Phase 2 / Risk #5 calls for. Surfaced by a live prod incident: two `source.jpg` from 2026-06-06 failed-timeout jobs lingered ~7.7 days (since manually deleted + verified).

## Summary

**Recommendation: `pg_cron` → `pg_net` POST → a new `/reap` route on the `enhance` Edge Function → a new owner-agnostic `sweepAbandonedSourcesGlobally` in `photo-job.service.ts`.** This reuses three proven, already-shipped pieces with **zero new secrets**:

1. the Vault-secret `net.http_post` trigger pattern (`jobs_enqueue_webhook` + the GUC→Vault migration),
2. the `/start` bearer-auth + service-role router in `enhance/index.ts`,
3. the existing `sweepStalePendingJobsForOwner` flip-to-failed + **batched `storage.remove()`** helper.

The reaper is essentially **`sweepStalePendingJobsForOwner` minus the `user_id` filter, with a 24h threshold instead of 1h, invoked on a schedule instead of on create-job.**

**The load-bearing technical fact:** the reaper **cannot be pure SQL.** On current hosted Supabase, deleting a row from `storage.objects` does NOT remove the S3 object (it orphans it — and you keep paying), and a statement-level trigger now **actively rejects** raw `DELETE` on storage tables (`storage.allow_delete_query` guard). The real file delete must route through the Storage API (`supabase-js .remove()` / REST `DELETE /storage/v1/object/...`) under the service role — exactly what `bestEffortRemove` already does (`photo-job.service.ts:37`). SQL's only role is **selecting** stale rows and **scheduling**.

**The gap the reaper fills** (all current deletes fire only on a terminal _flip_, so they never re-touch an already-terminal or never-returning row):

- **(a) legacy** terminal-`failed` rows whose source predates the S-08 failure-path delete (the 2 prod orphans);
- **(b) abandoned** — a user leaves a non-terminal job and **never submits again**, so the owner-scoped, create-job-triggered `sweepStalePendingJobsForOwner` never runs for them (unbounded retention violation);
- **(c) best-effort delete failures** — `bestEffortRemove` swallows storage errors with a warn; nothing retries the orphan.

**Test layer (test-plan §2 Risk #5):** integration against **real Supabase storage** (extend `tests/jobs.rls.test.ts`); anti-pattern = mocking storage. This is test-plan §3 **Phase 2** territory (`#5`, not started).

**Design decision the plan must state explicitly:** this **reverses a conscious MVP scope cut.** `idea-notes.md:24` lists "Automatic raw-uploads retention cleanup (pg_cron)" under _NOT in MVP scope_, and S-08 (`context/archive/2026-06-07-cloud-job-retention-cleanup/`) explicitly chose inline-only "NOT a pg_cron reaper (explicit MVP non-goal)". The 7.7-day prod breach is the justification for reversing it now.

## Detailed Findings

### Current retention enforcement (5 delete sites, all flip-triggered)

`src/lib/services/photo-job.service.ts` — every source delete goes through `bestEffortRemove` → `storage.from('photos').remove([path])` (the Storage API, `:36-42`), and fires ONLY when a terminal transition actually flips a row:

| Site                 | Function                                                          | Trigger                                              | Guard                                                                |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| success              | `markJobSucceeded` (`:156`, delete `:176`)                        | `/callback` Replicate success                        | `.eq("status","processing")`                                         |
| fail in-flight       | `markJobFailed` (`:229`, delete `:249`)                           | `/start` or `/callback` error                        | `.in("status",["queued","processing"])`                              |
| client timeout       | `markPendingJobFailedForOwner` (`:267`, delete `:291`)            | `/api/enhance/cloud/timeout`                         | `.eq("user_id")` + `.in("status",[…])`                               |
| browser-closed stall | `sweepStalePendingJobsForOwner` (`:315-399`, batch delete `:375`) | **on create-job** (`cloud-create-job.handler.ts:92`) | `.eq("user_id")` + `.in("status",[…])` + `.lt("created_at", now-1h)` |

`STALE_PENDING_JOB_MS = 3_600_000` (1h, `:22`); `SWEEP_MAX = 100` (`:26`). The sweep already does the cross-row select → guarded flip-to-`failed`(`error_code:"abandoned"`) → single batched `storage.remove(paths)` — the exact shape the reaper needs, minus the owner filter and at 24h.

### The uncovered gap (precise)

The inline hooks only act on a _terminal flip_; an **already-terminal** row or a row whose **owner never returns** is invisible to all of them:

- **(a)** A pre-S-08 terminal-`failed` row never re-enters `markJobFailed` → its source is never deleted. (The 2 prod orphans `ba58f913`, `f6fcbb69`.)
- **(b)** Abandon-and-never-return: `sweepStalePendingJobsForOwner` is owner-scoped + create-job-triggered → never runs for a user who doesn't submit again. Retention window unbounded. (Structural, not yet observed in prod.)
- **(c)** `bestEffortRemove` swallows a storage `.remove()` error (`:38-41`) → no retry, orphan persists.

### Mechanism — pg_cron + storage delete (Context7 / Supabase docs)

- **pg_cron is available on hosted Supabase**; enable via Dashboard (Integrations → Cron) or `create extension pg_cron`. A cron job can call `pg_net` (`net.http_post`) to invoke an Edge Function; the **documented pattern reads both the URL and the auth secret from Vault** — identical to this repo's trigger. Constraints: ≤8 concurrent jobs, ≤10 min/job; `pg_net` default `timeout_milliseconds` is **2000** (set explicitly); runs logged in `cron.job_run_details`.
- **Storage delete crux (confirmed + now enforced):** Supabase docs — "Deleting the metadata doesn't remove the object… you'll still be billed"; "Deleting objects should always be done via the Storage API and **NOT via a SQL query**… results in the object being orphaned." A 2026-03 security update added a statement-level trigger that **rejects `DELETE` on storage tables** unless `storage.allow_delete_query=true` (which only the Storage API sets). → pure-SQL deletion is wrong AND errors.

### Reusable async infra (the pattern to copy)

- `supabase/migrations/20260531120000_jobs_enqueue_webhook.sql` — `create extension pg_net` (`:20`); `handle_queued_job()` is `security definer` + `set search_path=''`, reads URL+secret, `net.http_post(url := fn_url||'/start', headers := Bearer secret, body := {jobId})`; **inert NULL-secret guard** (`:35-38`) — no-ops in unwired envs.
- `supabase/migrations/20260608120000_jobs_webhook_vault.sql` — the canonical Vault read: `(select decrypted_secret from vault.decrypted_secrets where name='edge_function_url')` / `name='db_webhook_secret'` (`:33-34`). Hosted Supabase denies `app.settings.*` GUCs to the migration role, so **Vault is the only working secret channel** — the reaper cron must read the same two Vault entries.
- `supabase/functions/enhance/index.ts` — router dispatches on `pathname.endsWith("/start"|"/callback")` (`:484-497`); `/start` auth = constant-time `digestEquals` of `Authorization` vs `Bearer ${DB_WEBHOOK_SECRET}` (`:82-93`, `:172-181`); `buildAdminClient()` service-role from auto-injected env (`:98-105`); imports the shared `photo-job.service.ts` so logic doesn't drift between Deno + the app. `config.toml:383-384` — `verify_jwt=false` (self-authenticating). A `/reap` route is a one-line dispatch addition reusing all of this.

### Recommended mechanism (Option A) + sketch

`pg_cron` (daily, e.g. `'0 3 * * *'` UTC) → `net.http_post(<edge_function_url>/reap, Bearer <db_webhook_secret>)` (both from Vault, with the same inert NULL-secret guard) → `/reap` verifies the bearer (`digestEquals`), builds the service-role admin, calls `sweepAbandonedSourcesGlobally(admin, {olderThanMs: 24h, max})`, returns `{swept:n}` (never leaks paths). New artifacts: **1 migration** (`create extension pg_cron` + `cron.schedule(...)`), **1 `/reap` branch** in `enhance/index.ts`, **1 exported sweep fn** in `photo-job.service.ts`. No new secret/config.

```ts
// photo-job.service.ts — cross-user twin of sweepStalePendingJobsForOwner (:315)
export async function sweepAbandonedSourcesGlobally(
  admin: SupabaseClient,
  opts?: { olderThanMs?: number; max?: number },
): Promise<number>; // no user_id filter; 24h default; flip non-terminal→failed("abandoned") + batched storage.remove; best-effort/never-throw
```

**Rejected:** (B) pg_cron → plpgsql calling the Storage REST API via pg_net with a Vault **service-role key** — forces the service-role key into Postgres/Vault (the repo keeps it only in the function runtime, `supabase-admin.ts:23-27`), fire-and-forget can't do the guarded flip+delete atomically, and duplicates delete logic outside the shared module. (C) external scheduler (GH Actions / Cloudflare cron) — adds a new scheduling surface + a new secret location; no benefit since pg_cron is already available. Keep (C) only as a contingency.

## Code References

- `src/lib/services/photo-job.service.ts:36-52` — `bestEffortRemove`/`deleteJobSource` (Storage-API delete, the orphan-safe path).
- `src/lib/services/photo-job.service.ts:156-179,229-252,267-294` — the three flip-and-delete helpers.
- `src/lib/services/photo-job.service.ts:315-399` — `sweepStalePendingJobsForOwner` (the reaper template; batch delete `:375`; thresholds `:22,:26`).
- `src/lib/services/cloud-create-job.handler.ts:92` — the create-job sweep trigger (owner-scoped).
- `src/pages/api/enhance/cloud/timeout.ts:33-75` — the client-watchdog timeout route → `markPendingJobFailedForOwner`.
- `supabase/migrations/20260528120000_create_jobs_table.sql:19-24,85-97` — status enum + RLS (service-role bypasses).
- `supabase/migrations/20260528120100_create_photos_storage.sql:22-84` — private `photos` bucket + path-segment RLS.
- `supabase/migrations/20260531120000_jobs_enqueue_webhook.sql:20,25-49` — pg_net trigger + inert guard.
- `supabase/migrations/20260608120000_jobs_webhook_vault.sql:33-34` — Vault `decrypted_secrets` read.
- `supabase/functions/enhance/index.ts:82-93,98-105,172-181,484-497` — bearer auth, admin client, router (add `/reap` here).
- `tests/jobs.rls.test.ts:174-265` — real-storage retention contracts (`markJobSucceeded` only).
- `tests/photo-job-helpers.test.ts:241-399` — sweep unit coverage (mocked admin).

## Architecture Insights

- **All async infra lives in Postgres + the Edge Function** (pg_net trigger + Vault secrets + self-authenticating function). The reaper should stay inside that story (Option A) rather than introducing an external scheduler.
- **Service-role key is confined to the Edge Function runtime** (auto-injected) and the server app (`supabase-admin.ts`). Do NOT move it into Vault/Postgres for the reaper — keep it in the function.
- **One shared service module** (`photo-job.service.ts`) backs both the Astro app and the Deno function → the new sweep belongs there, not duplicated.
- **Storage deletes are intrinsically out-of-band** (Storage API, not SQL) and **best-effort** by design — which is exactly why a scheduled backstop (not just inline) is the right shape for retention.

## Historical Context (from prior changes)

- `context/archive/2026-06-07-cloud-job-retention-cleanup/change.md:17` + `plan.md:41` — S-08 **explicitly** chose "inline approach only… **NOT** a `pg_cron` reaper (explicit MVP non-goal)"; documented the residual "users who never return leave orphans (unavoidable without cron)." → the reaper is the deferred backstop, now justified.
- `idea-notes.md:24` — "Automatic raw-uploads retention cleanup (pg_cron)" under **NOT in MVP scope** (a scope cut alongside RAW support, Turnstile, etc. — not a hard constraint).
- `context/foundation/test-plan.md` §2 Risk #5 (`:55,:75-76`) — "the failure path is the gap"; **cheapest layer: Integration (real Supabase storage; extend the jobs.rls suite)**; anti-pattern: "Mocking storage." §3 Phase 2 (`:91`) covers `#5` (not started). §6.2 (`:162-169`) — don't mock Supabase; reference `tests/jobs.rls.test.ts`.
- `context/foundation/lessons.md:61-66` — the "async fire-and-forget needs a backstop" lesson defers pg_cron only for **pipeline retries** (client watchdog is that backstop) — orthogonal to storage retention; it does NOT forbid pg_cron for cleanup.
- `context/archive/2026-05-31-cloud-ai-realtime-result/research.md:121-122` — S-04 already flagged pg_cron as a non-goal, leaving failure-path retention to S-08.

## Related Research

- `context/archive/2026-06-07-cloud-job-retention-cleanup/research.md` — the S-08 inline-retention research this change extends.

## Open Questions (for /10x-plan)

1. ~~**Reaper selection predicate.**~~ **RESOLVED 2026-06-14 → the HYBRID (storage-first delete + paired row-flip). See "Follow-up Research" below.**
2. **Schedule + threshold.** Daily `0 3 * * *` UTC vs hourly; 24h NFR threshold for sources, but the _abandoned-row flip_ may want a separate (shorter) threshold than the _source delete_. Also `SWEEP_MAX`/batch bounds + pg_net `timeout_milliseconds`.
3. **One-time backfill.** The 2 known orphans are already gone, but should the first reaper run (or a one-shot migration) sweep any other pre-existing orphans? (Prod currently shows 0 lingering sources, so possibly moot — verify at impl time via the same `storage.objects … name like '%/source.%'` query.)
4. **Result objects.** Should the reaper also delete orphaned `result.png` for non-succeeded rows (S-08 mentions "delete the orphaned result on late-failure")? Scope decision.
5. **Local/CI testability.** pg_cron + pg_net + Vault are awkward in the ephemeral local stack. Likely split: unit/integration-test the `sweepAbandonedSourcesGlobally` service fn + the `/reap` route against real local Supabase storage (the §5 integration tests), and treat the cron wiring as a deploy-config/migration concern (smoke-verified, like the webhook). Confirm the local-stack story in planning.
6. **Idea-notes / scope-doc update.** Reverting the `idea-notes.md:24` non-goal — note it in the plan's docs-sync (and possibly the test-plan §3 Phase 2 / §5 status).

## Follow-up Research [2026-06-14] — Open Question #1 resolved: the predicate

**Decision: HYBRID — a storage-first source-delete pass + a paired pure-SQL row-flip pass.** Settled with the user before `/10x-plan`. This supersedes the original "storage-first vs join-to-jobs" framing: neither alone is sufficient.

### Why neither single shape works

Every existing source-delete fires _on a terminal flip_ (`markJobSucceeded`/`markJobFailed`/`markPendingJobFailedForOwner`/`sweepStalePendingJobsForOwner`). So the two gap classes that motivated this change — **(a) legacy terminal-failed orphans** and **(c) best-effort-delete failures** — are rows that are **already terminal**. A predicate that selects only _non-terminal stale_ jobs (the pure join-to-jobs shape) structurally cannot see them.

| Gap                                      | join-to-jobs (non-terminal only)           | storage-first (`source.*` > 24h)              |
| ---------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| (a) legacy terminal-failed               | ❌ row already terminal → not selected     | ✅ orphan = an object, status-agnostic        |
| (b) abandoned non-terminal               | ✅                                         | ✅                                            |
| (c) best-effort delete-fail              | ❌ row terminal, delete "already happened" | ✅                                            |
| DB consistency (flip abandoned → failed) | ✅                                         | ❌ a delete alone leaves the row `processing` |

Storage-first is the **complete predicate for the retention NFR** ("no `source.*` older than 24h exists" — literally the invariant, and literally the `storage.objects … name like '%/source.%'` query already used to verify `=0` on prod). But a storage-only delete leaves abandoned **rows** stuck non-terminal (a "processing" job whose source is gone — a stale spinner if the user returns, and wrong cap accounting). So it must be **paired** with a row-flip.

### The two passes

1. **Source-delete (storage-first, the retention guarantee).** Select `storage.objects` where `bucket_id='photos' and name like '%/source.%' and created_at < now() - <retention>` → delete each via the **Storage API `.remove()`** (the SQL-delete-on-storage path is blocked by the statement-level trigger — load-bearing constraint, see Architecture Insights). Catches gaps a + b + c uniformly because it never consults job status.
2. **Row-flip (pure SQL, DB consistency + cap correctness).** `UPDATE jobs SET status='failed', error_code='abandoned', … WHERE status IN ('queued','processing') AND created_at < now() - <stale-threshold>`. This is the owner-agnostic generalization of `sweepStalePendingJobsForOwner`'s flip, **minus the user_id filter**, and touches only the `jobs` table.

### Load-bearing consequence for the plan (mechanism split)

The two passes have **different privilege needs**, and that cleanly splits the work:

- The **row-flip is pure SQL on a normal table** → `pg_cron` can run it **directly in-database**, no Edge Function, no `pg_net`, no Storage API.
- Only the **source-delete needs the Storage API** (`.remove()`), which lives in the Edge Function runtime (service-role) → that's the only part that needs `pg_cron → pg_net → /reap`.

So the recommended shape sharpens from the Summary's single-POST design to: **`pg_cron` job runs the flip UPDATE inline, then `pg_net` POSTs `/reap` only to perform the storage `.remove()` of `source.*` > 24h.** Ordering is benign either way (flip-then-reap means just-abandoned sources are caught the same run since they're > threshold; reap-then-flip leaves at most one cycle of lag) — but flip-first is tidier. `/10x-plan` decides whether to keep the flip in the cron SQL or fold it into `/reap` for single-call locality; the predicate decision here does **not** force that.

This turns Open Question **#2** (schedule/threshold) into a real two-knob decision — the flip's `<stale-threshold>` and the source-delete's `<retention>` (24h NFR) are now explicitly separate inputs, exactly as #2 anticipated — and leaves #3–#6 untouched.
