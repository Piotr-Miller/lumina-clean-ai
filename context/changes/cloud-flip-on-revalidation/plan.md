# Cloud flip-ON re-validation (D.1) — Implementation Plan

## Overview

Close the deferred **D.1** flip-ON criterion shared by **S-08** (cloud-job-retention-cleanup) and **S-09** (cloud-source-url-ttl-fix), both archived/immutable. With the cloud code now flip-ON-ready (S-05 ✓ spend cap, S-08 ✓ retention/F8/F9, S-09 ✓ source-URL TTL), exercise the retention + cold-boot behavior end-to-end — **local-harness-first, then a controlled prod flip** — and record durable evidence. Along the way, produce the missing local cloud-run runbook.

## Current State Analysis

- **Cloud ships OFF in prod** (`CLOUD_PIPELINE_ENABLED=false`, `CLOUD_DAILY_CAP=0` Worker secrets; Edge Function cloud secrets unset). The code path no-ops on the OFF flag (`enhance/index.ts:195`).
- **Code is ready.** F9 (`markJobSucceeded` `.eq("status","processing")` guard) and F8 (`sweepStalePendingJobsForOwner` + delete-on-flip) landed in S-08; S-09 raised `SOURCE_URL_TTL_SECONDS` to 3600 and the client `PROCESSING_WATCHDOG_MS` to 300_000.
- **Local prerequisites mostly present.** `supabase/functions/.env` already holds `REPLICATE_WEBHOOK_SIGNING_SECRET` (`whsec_…`). Local `app.settings.*` GUCs are settable via `ALTER DATABASE postgres SET` (the hosted-Supabase restriction is **prod-only** — `deferred-2.4-db-webhook-settings.md`). Missing: `REPLICATE_API_TOKEN` (user provides) and a public HTTPS tunnel for Replicate callbacks.
- **Existing harnesses** (`scripts/`): `f01-smoke.ts` (createPhotoJob → PUT → markJobSucceeded + Realtime), `spikes/phase3-callback-test.ts` (deterministic **signed** `/callback` driver with an `objectExists()` storage check), `spikes/bread-spike.ts` (live cold-vs-warm latency against real Bread).
- **Client watchdog** (`src/components/hooks/useCloudJob.ts`): `QUEUED_WATCHDOG_MS=30_000`, `PROCESSING_WATCHDOG_MS=300_000` → on timeout POSTs `src/pages/api/enhance/cloud/timeout.ts` → `markPendingJobFailedForOwner` (owner+status-guarded). This is the late-`/callback` race driver.
- **Gaps:** no documented local cloud-run runbook, no tunnel wrapper, no automated local-GUC setup.

## Desired End State

D.1 is closed with recorded evidence:

- **Local (deterministic, repeatable):** a failed job deletes its source; the create-job sweep reclaims a backdated stale row (and releases its pre-model cap slot); a late-`/callback` to an already-terminal row is idempotent (`already_terminal`, no resurrection, no orphan), with the F5/F9 result-cleanup branch covered by existing S-08 unit/impl-review evidence.
- **Local (live):** a real Bread submit goes `queued→processing→succeeded` via Realtime with the source deleted + result present; the local cap rejects beyond its limit; an opportunistic cold hit confirms the 3600s source URL survives (TTL-margin reasoning recorded if a cold boot can't be triggered).
- **Prod:** a controlled flip (`CLOUD_DAILY_CAP=3`) runs one real job + a cap-reject + a retention spot-check; an explicit operator gate chooses leave-ON (go-live) or kill-switch back to OFF.
- **Recorded:** `results.md` (per-assertion evidence), `production-config.md` flip-ON state updated, roadmap Done note. The local-run runbook exists.

### Key Discoveries:

- `supabase/functions/.env:1` already carries `REPLICATE_WEBHOOK_SIGNING_SECRET` — the deterministic callback harness needs no new secret.
- `scripts/spikes/phase3-callback-test.ts:16-17,125-132` crafts valid signed webhooks and checks `objectExists` — the spine for assertions 2a/2c with zero Replicate cost.
- `enhance/index.ts:107-143` (`enhanceFunctionBaseUrl`/`toPublicStorageUrl`) already rewrites BOTH the callback URL and the signed source URL to the `EDGE_FUNCTION_URL` tunnel origin — one cloudflared tunnel covers source-fetch + callback.
- The hosted custom-GUC block is **prod-only** (`deferred-2.4-db-webhook-settings.md:33-37`): three resolution options, of which direct-connection is the cheapest to attempt first.
- `countCloudJobsToday` excludes `failed AND replicate_prediction_id IS NULL` (`photo-job.service.ts:108-109`) — the sweep’s pre-model cap-slot release is observable.

## What We're NOT Doing

- **Not changing any S-08/S-09 application code** — this is validation, not a code change (except a *fallback-only* prod webhook migration if direct-connection GUC is denied).
- **Not editing the archived S-08/S-09 plans** (immutable) — D.1 evidence lives in this change.
- **Not committing any secret** — `REPLICATE_API_TOKEN` goes only into gitignored `supabase/functions/.env` (local) and `supabase secrets`/`wrangler secret` (prod).
- **Not forcing a cold boot or temporarily lowering the TTL** — cold-boot proof is opportunistic; TTL-margin reasoning is the documented fallback (per the "deterministic blocking, live best-effort" bar).
- **Not auto-deciding go-live** — whether prod stays ON is an explicit operator gate in Phase 4.
- **Not building a permanent tunnel/secrets automation** beyond the documented runbook steps.

## Implementation Approach

Escalate from cheapest+most-deterministic to most-expensive+outward-facing: stand the local stack up (Phase 1), prove the three retention invariants deterministically with no Replicate spend (Phase 2), then add the real model + tunnel for the happy-path and cold-boot (Phase 3), and only then flip prod under a low cap with a kill-switch (Phase 4). Each live/prod step is a manual gate; the deterministic harness is the blocking evidence and the live/prod runs are confirmatory.

## Critical Implementation Details

- **Test WARM, not just cold.** The insert-triggered DB webhook can outrace the client upload; the source is signed with bounded retry (`signSourceWithRetry`). Validate the live happy-path against a **warm** function (second submit of a session), per the lesson — a cold-only pass hides the race.
- **One tunnel origin, set once per session.** cloudflared mints a new random URL each run; `EDGE_FUNCTION_URL` must be re-set to `https://<tunnel>/functions/v1/enhance` AND the local DB GUC `app.settings.edge_function_url` must match the same tunnel so `/start`'s callback and the source-URL rewrite agree.
- **Prod project identity.** Before trusting any prod result, confirm the deployed Worker talks to `tebdkqpgjjypdethpezo` (curl the served HTML for the supabase ref) — Worker runtime secrets do not auto-repoint (lessons.md).
- **Deno migration caveat (fallback only).** If Phase 4 falls back to a native-webhook migration, it touches `supabase/migrations/**` (a trigger rewrite), validated by `supabase db reset` locally + `deno check` is N/A (SQL) — but re-run the local Phase-2/3 assertions after the trigger change.

## Phase 1: Local harness bring-up + runbook

### Overview

Stand up the full local cloud pipeline (Supabase stack, GUCs, Edge Function with secrets, flag ON) and capture the steps as the missing local-run runbook. No Replicate token required yet — the kickoff path is exercised in later phases.

### Changes Required:

#### 1. Local cloud-run runbook

**File**: `context/changes/cloud-flip-on-revalidation/local-runbook.md` (new)

**Intent**: Capture the previously-undocumented local cloud-pipeline setup so the harness is reproducible (and promotable to repo docs later).

**Contract**: Ordered steps — `npx supabase start` → `npx supabase db reset` (applies the webhook trigger) → set local GUCs (`ALTER DATABASE postgres SET app.settings.edge_function_url`, `…db_webhook_secret`) → populate `supabase/functions/.env` (`DB_WEBHOOK_SECRET`, `CLOUD_PIPELINE_ENABLED=true`, later `REPLICATE_API_TOKEN`, `EDGE_FUNCTION_URL`) → `supabase functions serve enhance --env-file supabase/functions/.env` → run the app (`npm run dev`) with a local `CLOUD_DAILY_CAP`. Includes the cloudflared tunnel step (Phase 3) and a teardown note. Document the warm-vs-cold testing caveat.

#### 2. Local GUC + env setup

**File**: `supabase/functions/.env` (local, gitignored) + local DB settings

**Intent**: Wire the local environment so an authenticated cloud submit fires `/start`.

**Contract**: `DB_WEBHOOK_SECRET` present in both the function `.env` and the DB GUC `app.settings.db_webhook_secret` (must match); `app.settings.edge_function_url = http://host.docker.internal:54321/functions/v1/enhance` (token/tunnel deferred to Phase 3); `CLOUD_PIPELINE_ENABLED=true`. No repo-tracked file changes (env is gitignored).

### Success Criteria:

#### Automated Verification:

- `npx supabase status` shows the stack up; `npx supabase db reset` applies migrations cleanly (trigger `jobs_enqueue_webhook` present).
- `select current_setting('app.settings.edge_function_url', true) as edge_url, (current_setting('app.settings.db_webhook_secret', true) is not null) as secret_set;` returns the local URL + `true`.

#### Manual Verification:

- With the function served and flag ON, an authenticated local submit INSERTs a `queued` row and `/start` is invoked (visible in `functions serve` logs) — confirming the webhook→function wiring. **Expected token-less outcome:** `/start` reaches `predictions.create`, fails (no `REPLICATE_API_TOKEN` yet), and `markJobFailed` flips the row to `failed` with the source deleted — i.e. the row ends `failed`, NOT stuck `queued` (this incidentally previews the failed-source-delete path; full `processing→succeeded` needs the token in Phase 3).
- `local-runbook.md` reproduces the setup from a clean `supabase start` following only its steps.

---

## Phase 2: Deterministic retention assertions (harness-driven, token-free)

### Overview

Prove the three S-08 retention invariants without any Replicate spend, using a small orchestrator built on the existing signed-callback harness + direct service/DB calls, with storage inspection as the oracle. This is the **blocking** evidence for D.1.

### Changes Required:

#### 1. D.1 retention harness

**File**: `scripts/spikes/d1-retention-check.ts` (new; mirrors `phase3-callback-test.ts` conventions)

**Intent**: One runnable script that drives and asserts assertions 2a/2b/2c against the local stack and exits non-zero on any failure, so the result is a deterministic pass/fail.

**Contract**: Uses the service-role admin client + the signed-webhook crafting from `phase3-callback-test.ts`. Three checks, each seeded with a fresh `createPhotoJob` + a real uploaded source object, asserting via `objectExists`:

- **2a — failed-job source delete:** advance a job to `processing`, call `markJobFailed`; assert the row is `failed` AND the source object is gone.
- **2b — create-job sweep:** insert a `queued`/`processing` row with `created_at` backdated > `STALE_PENDING_JOB_MS` (1h) + a source object; call `sweepStalePendingJobsForOwner` (or hit `create-job` for the same owner); assert the row flips to `failed`/`error_code='abandoned'` and the source is removed. For the cap-slot release: seed this as the **only** pre-model-failable (`replicate_prediction_id IS NULL`) stale row in the window and assert `countCloudJobsToday` measured **immediately before vs after** the single sweep call drops by exactly one — assert the **delta**, never an absolute (the count is global/cross-user/whole-UTC-day).
- **2c — late-`/callback` idempotency (+ cited cleanup coverage):** the genuine F5/F9 result-orphan cleanup (`markJobSucceeded`→false → `deleteJobResult`, `enhance/index.ts:449-451`) fires only when the row flips to `failed` DURING the handler's upload window — it is **not black-box reproducible**, because a row already `failed` at read short-circuits at the `already_terminal` guard (`enhance/index.ts:403-404`) before any upload. Split accordingly:
  - **2c-i (deterministic, blocking):** seed a `processing` job with a stored `replicate_prediction_id`; flip it to `failed` via `markPendingJobFailedForOwner` (watchdog sim); deliver a crafted **valid signed success** `/callback`; assert `200 {ignored:"already_terminal"}`, the row stays `failed` (no resurrection), and **no result object is created**. Proves the idempotency guard end-to-end.
  - **2c-ii (cited coverage, non-blocking):** the actual cleanup branch is already covered by the S-08 unit test (`markJobSucceeded` returns false off-`processing`, `tests/photo-job-helpers.test.ts`) + the impl-reviewed `deleteJobResult` call in the handler; a live mid-handler race (slow-output timing window) is best-effort only, never a gate.

### Success Criteria:

#### Automated Verification:

- `npx tsx scripts/spikes/d1-retention-check.ts` exits 0: 2a failed-source-delete, 2b sweep + cap-slot release, 2c-i late-callback idempotency (`already_terminal`, no resurrection, no orphan) all PASS (re-runnable; each seeds + cleans its own job).
- Re-running the script twice in a row is green both times (idempotent, no cross-run residue).

#### Manual Verification:

- Spot-check one assertion's storage state in Supabase Studio (object truly absent), confirming the script's oracle matches reality.

---

## Phase 3: Live happy-path + cold-boot (real Replicate + tunnel)

### Overview

With the Replicate token + a cloudflared tunnel, run the real browser→pipeline→Bread→Realtime flow and confirm the happy-path retention + the S-09 cold-boot source-URL survival.

### Changes Required:

#### 1. Tunnel + live env

**File**: `supabase/functions/.env` (local) + DB GUC + cloudflared

**Intent**: Make Replicate able to fetch the source and POST the callback to the local function.

**Contract**: Start `cloudflared tunnel --url http://127.0.0.1:54321`; set `EDGE_FUNCTION_URL=https://<tunnel>/functions/v1/enhance` in the function env AND update `app.settings.edge_function_url` to the same tunnel origin; set `REPLICATE_API_TOKEN`. Re-serve the function. (Runbook documents the per-session URL refresh.)

#### 2. Live submit + observation

**File**: app UI (`/` cloud toggle) — or a script that does `createPhotoJob` + a real source PUT and lets the DB webhook fire `/start`

**Intent**: Drive a job through the REAL pipeline (webhook → `/start` → Replicate → `/callback`) and observe the terminal reconciliation + Realtime push.

**Contract**: Submit a night JPG with cloud selected via the UI — the browser PUTs the source, the `queued` INSERT fires the webhook → `/start`, Replicate runs, `/callback` lands. Do **NOT** use `f01-smoke.ts`'s shape: it calls `markJobSucceeded` directly and bypasses the pipeline (keep it only as a Realtime-observation reference). Observe `queued→processing→succeeded` (Realtime), the result render, the source object deleted, the result present. Repeat once **warm** (second submit of the session — warm exposes the webhook-vs-upload race a cold run hides; the bounded source-sign retry must absorb it). Submit beyond the local `CLOUD_DAILY_CAP` → `daily_cap_reached` 429. Cold-boot: after model idle, submit one job and confirm the source URL still resolves (job succeeds) — the 3600s TTL outlived the boot.

### Success Criteria:

#### Automated Verification:

- `deno check supabase/functions/enhance/index.ts` still passes (no code drift introduced during setup).

#### Manual Verification:

- A warm live submit completes `queued→processing→succeeded` via Realtime with source deleted + result present (happy-path).
- The local daily cap returns `daily_cap_reached` (429) beyond its limit.
- Opportunistic cold hit: a job submitted after model idle still succeeds (source URL survived) — OR, if a cold boot can't be triggered in a reasonable window, record the TTL-margin reasoning (3600s ≈ 12× the worst observed ~300s boot) in `results.md`.

---

## Phase 4: Prod controlled flip-ON + close-out

### Overview

Resolve the prod GUC blocker, set prod secrets under a low cap, flip ON, verify one job + cap-reject + a retention spot-check, then make the explicit leave-ON-vs-OFF decision and record D.1 closure.

### Changes Required:

#### 1. Prod DB-webhook GUC (direct-connection first, native-webhook fallback)

**File**: prod DB settings (no repo change if direct-connection works) — OR `supabase/migrations/<ts>_native_jobs_webhook.sql` (fallback only)

**Intent**: Make the prod INSERT trigger able to reach the Edge Function `/start`.

**Contract**: First attempt `ALTER DATABASE postgres SET app.settings.edge_function_url='https://tebdkqpgjjypdethpezo.supabase.co/functions/v1/enhance'` + `…db_webhook_secret` over a **direct 5432 connection** (not the SQL editor/pooler); verify via the `current_setting(...)` probe. If denied, **fallback**: a migration replacing the custom-GUC trigger with the Supabase-native pattern (`TG_ARGV` URL + Vault secret), then re-run the Phase-2 deterministic harness against a local `db reset` to confirm no regression.

#### 2. Prod Edge Function + Worker secrets

**File**: prod Edge Function secrets + Worker runtime secrets (no repo change)

**Intent**: Turn cloud ON in prod under a bounded cap.

**Contract**: `supabase secrets set` (prod): `CLOUD_PIPELINE_ENABLED=true`, `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`, `DB_WEBHOOK_SECRET` (confirm present/valid). `wrangler secret put` (Worker): `CLOUD_PIPELINE_ENABLED=true`, `CLOUD_DAILY_CAP=3`. Redeploy if needed; confirm the deployed app talks to `tebdkqpgjjypdethpezo`.

#### 3. D.1 results + tracker close-out

**File**: `context/changes/cloud-flip-on-revalidation/results.md` (new); `context/foundation/production-config.md`; `context/foundation/roadmap.md`

**Intent**: Durably record the per-assertion evidence and the flip-ON state.

**Contract**: `results.md` lists each D.1 assertion (2a/2b/2c, live happy-path, cap-reject, cold-boot) with PASS/evidence and the final prod cloud state (ON or OFF-after-validation). `production-config.md` §2 / Pending updated to reflect flip-ON performed + cloud state. `roadmap.md` gets a Done/notes mention that D.1 (S-08+S-09 flip-ON gate) is re-validated.

### Success Criteria:

#### Automated Verification:

- Prod GUC probe `select current_setting('app.settings.edge_function_url', true) …` returns the prod URL + secret-set `true` (whichever resolution path was used).
- If the fallback migration was used: `npx supabase db reset` applies it cleanly locally and `npx tsx scripts/spikes/d1-retention-check.ts` is still green.

#### Manual Verification:

- One real prod cloud job completes `queued→processing→succeeded` (Realtime) with source deleted + result present.
- A prod submit beyond `CLOUD_DAILY_CAP=3` returns `daily_cap_reached` (429).
- Prod retention spot-check: submit one cloud job, then let the client processing watchdog (~300s) time out (or close the tab to abandon it) → `markPendingJobFailedForOwner` flips it `failed` → confirm its source object is removed in prod storage.
- **Operator gate:** decide leave-ON (go-live) vs kill-switch back (`CLOUD_DAILY_CAP=0` and/or `CLOUD_PIPELINE_ENABLED=false`); the chosen state is applied and recorded.
- `results.md` + `production-config.md` + `roadmap.md` reflect the outcome and D.1 closure.

**Implementation Note**: After each phase's automated verification passes, pause for human confirmation of the manual items before proceeding. Phase 4's prod secret-setting + flag flip are the outward-facing, billable steps — do not execute them without explicit go-ahead at the gate.

---

## Testing Strategy

### Deterministic (blocking — Phase 2):

- `scripts/spikes/d1-retention-check.ts` asserts 2a (failed-source-delete), 2b (sweep + cap-slot release), 2c-i (late-callback idempotency — `already_terminal`, no resurrection/orphan), each with storage-object/row oracles; re-runnable and idempotent. The true F5/F9 cleanup branch (markJobSucceeded→false → deleteJobResult) is covered by the existing S-08 unit test + impl-review (not black-box reproducible).

### Live / confirmatory (best-effort — Phases 3–4):

- Warm browser submit → `queued→processing→succeeded` via Realtime (source gone, result present).
- Daily-cap 429 beyond the configured cap.
- Opportunistic cold hit → source URL survives (else TTL-margin reasoning recorded).
- Prod: one job + cap-reject + retention spot-check.

### Definition of done:

D.1 closes when the Phase-2 deterministic harness + the live warm happy-path + the cap-reject all PASS; cold-boot is best-effort (live proof OR documented TTL-margin). Prod is exercised; leave-ON is a separate operator choice.

## Performance Considerations

Negligible. The deterministic harness is local-only. Live runs incur a few real Bread predictions (cold boot can be multi-minute — expected, per S-09). The prod cap of 3 structurally bounds spend; `CLOUD_DAILY_CAP=0` is the instant kill-switch.

## Migration Notes

No migration unless the prod GUC direct-connection attempt is denied; the fallback native-webhook migration rewrites the `jobs_enqueue_webhook` trigger (TG_ARGV URL + Vault secret) and must be re-validated by the Phase-2 harness after a local `db reset`. No schema/data change either way.

## References

- Change identity + decisions: `context/changes/cloud-flip-on-revalidation/change.md`
- Flip-ON runbook (read-only): `context/archive/2026-06-04-production-deployment/go-live.md` → "Flip-ON runbook"
- GUC blocker: `context/archive/2026-06-04-production-deployment/deferred-2.4-db-webhook-settings.md`
- Durable prod config: `context/foundation/production-config.md` §2
- Harness precedent: `scripts/spikes/phase3-callback-test.ts`, `scripts/f01-smoke.ts`
- Watchdog: `src/components/hooks/useCloudJob.ts`, `src/pages/api/enhance/cloud/timeout.ts`
- Lessons: insert-webhook-outraces-upload (test WARM); Realtime watchdog catch-up; size-TTLs-to-cold-boot; Worker-secrets-vs-build-env / verify-which-project; hosted-Supabase custom-GUC restriction

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Local harness bring-up + runbook

#### Automated

- [ ] 1.1 `supabase status` up; `supabase db reset` applies migrations incl. `jobs_enqueue_webhook` trigger
- [ ] 1.2 GUC probe returns the local `edge_function_url` + `secret_set = true`

#### Manual

- [ ] 1.3 Authenticated local submit INSERTs `queued` and `/start` fires (functions-serve logs); token-less run ends `failed` at predictions.create with source deleted (expected)
- [ ] 1.4 `local-runbook.md` reproduces setup from a clean `supabase start`

### Phase 2: Deterministic retention assertions (harness-driven)

#### Automated

- [ ] 2.1 `npx tsx scripts/spikes/d1-retention-check.ts` exits 0 — 2a failed-source-delete, 2b sweep + cap-slot release, 2c-i late-callback idempotency (`already_terminal`, no resurrection) all PASS
- [ ] 2.2 Re-run is green twice (idempotent, no cross-run residue)

#### Manual

- [ ] 2.3 Studio spot-check confirms one assertion's storage state (object truly absent)

### Phase 3: Live happy-path + cold-boot

#### Automated

- [ ] 3.1 `deno check supabase/functions/enhance/index.ts` still passes (no setup drift)

#### Manual

- [ ] 3.2 Warm live submit completes `queued→processing→succeeded` via Realtime (source gone, result present)
- [ ] 3.3 Local daily cap returns `daily_cap_reached` (429) beyond the limit
- [ ] 3.4 Cold-boot: opportunistic cold hit succeeds (source URL survived) OR TTL-margin reasoning recorded in `results.md`

### Phase 4: Prod controlled flip-ON + close-out

#### Automated

- [ ] 4.1 Prod GUC probe returns prod `edge_function_url` + `secret_set = true` (direct-connection or fallback)
- [ ] 4.2 If fallback migration used: `supabase db reset` clean + `d1-retention-check.ts` still green

#### Manual

- [ ] 4.3 One real prod cloud job completes `queued→processing→succeeded` (source gone, result present)
- [ ] 4.4 Prod submit beyond `CLOUD_DAILY_CAP=3` returns `daily_cap_reached` (429)
- [ ] 4.5 Prod retention spot-check: a watchdog-timed-out (or abandoned) prod job flips `failed` and its source is removed
- [ ] 4.6 Operator gate: leave-ON vs kill-switch decided + applied
- [ ] 4.7 `results.md` + `production-config.md` + `roadmap.md` updated; D.1 closed
