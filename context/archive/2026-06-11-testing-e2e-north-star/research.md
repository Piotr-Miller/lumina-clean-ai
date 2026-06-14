---
date: 2026-06-11T23:12:42+02:00
researcher: Claude (Opus 4.8)
git_commit: 40ef97e21d1252894618f11379dccd410f8c344f
branch: master
repository: LuminaClean_AI
topic: "North-star E2E (risks #1+#6): stub boundary, local pipeline wiring, watchdog budgets, PR-gate vs smoke split"
tags: [research, codebase, e2e, playwright, edge-function, replicate, realtime, watchdog, testing-e2e-north-star]
status: complete
last_updated: 2026-06-11
last_updated_by: Claude (Opus 4.8)
---

# Research: North-star E2E (risks #1+#6) — stub boundary, local wiring, budgets, gate split

**Date**: 2026-06-11T23:12:42+02:00 · **Researcher**: Claude (Opus 4.8) · **Git Commit**: `40ef97e` · **Branch**: master · **Repository**: LuminaClean_AI

## Research Question

The four questions from `change.md`: (1) where can a stubbed/warm pipeline be injected, given Replicate is called server-side (Deno Edge Function) and `page.route()` cannot intercept it; (2) how much of signed upload → DB webhook → Edge Function → Replicate → callback → Realtime actually runs against `npx supabase start` + `npm run dev` today; (3) the watchdog budgets and decision points that set the spec's waits and deliberate-break targets; (4) which scenario is the PR gate vs the scheduled/manual live smoke.

## Summary

**The stub seam exists today, requires zero app-code change, and is already proven twice in-repo**: run the Edge Function locally (`supabase functions serve`) and deliver a **crafted svix-signed `/callback`** — the pattern of `scripts/spikes/phase3-callback-test.ts`. The PR-gating spec drives a REAL UI submit (create-job → signed PUT; the DB webhook stays deliberately unwired so the row sits `queued`), flips the row to `processing` + `replicate_prediction_id` via service role **within 30 s** (the queued-watchdog budget), then POSTs the signed callback; the function itself fetches the output, uploads the result object, marks the row `succeeded`, and Supabase Realtime pushes the UPDATE that must render the before/after slider **without refresh**. One fidelity caveat: the callback's `output` URL must pass the SSRF allowlist (`replicate.delivery` only) and is **really fetched** — the plan must choose between a pinned real `replicate.delivery` asset (network-dependent), a one-line env-extendable allowlist seam, or the no-function fallback seam (service-role DB+storage drive; UI-contract-only). Budgets: queued→processing **30 s**, processing→terminal **300 s** (the lessons.md "180 s" is stale — S-09 retuned it), cold-start hint at **25 s**. Live Replicate (cold boot 118–135 s, tail >300 s, tunnel required) is **not PR-gate material** — it stays a scheduled/manual smoke per the existing local runbook.

## Detailed Findings

### Q1 — The stub boundary (Edge Function ↔ Replicate)

**Function anatomy** (`supabase/functions/enhance/index.ts`):

- Router dispatches `POST …/start` → `handleStart` and `POST …/callback` → `handleCallback` (index.ts:477-490); platform JWT is off (`verify_jwt = false`, `supabase/config.toml:383-384`) — the function authenticates each branch itself.
- `/start` auth: `Authorization: Bearer ${DB_WEBHOOK_SECRET}` compared constant-time (index.ts:82-93, 174-181). Caller: pg_net trigger on `jobs` INSERT `status='queued'` (`supabase/migrations/20260531120000_jobs_enqueue_webhook.sql:40-55`), URL+secret sourced from **Vault** (`edge_function_url`, `db_webhook_secret` — `20260608120000_jobs_webhook_vault.sql:33-46`); either missing → trigger silently no-ops, row stays `queued`.
- `/callback` auth: svix-style HMAC over `webhook-id`/`webhook-timestamp`/raw-body (index.ts:329-358; verifier `src/lib/services/replicate-webhook.ts:72-106`) + ±300 s replay window (replicate-webhook.ts:114-132). **No `CLOUD_PIPELINE_ENABLED` check on `/callback`** — the flag gates `/start` only (index.ts:196-198; OFF → `200 {skipped}`, row untouched).
- Replicate call: `REPLICATE_PREDICTIONS_URL` is a **hardcoded const** `https://api.replicate.com/v1/predictions` (index.ts:51) — not env-overridable today. Body: pinned Bread version (`src/lib/services/bread.ts:15`), input = signed source READ URL, TTL 3600 s (index.ts:50, 218), signed with a 6×750 ms "Object not found" retry (index.ts:53-60, 152-170) — the warm-race guard. Webhook registered only when the callback URL is `https://` (index.ts:231-239; `EDGE_FUNCTION_URL` override at 112-120).

**Stub seams, ranked** (agent verdict, verified against code):

1. **WINNER — crafted signed `/callback` against local `functions serve`** (zero code change; proven by `scripts/spikes/phase3-callback-test.ts` and `scripts/spikes/d1-retention-check.ts:63-77`):
   - Precondition row: `status='processing'` AND non-null `replicate_prediction_id` (`markJobSucceeded` guards `.eq("status","processing")` — `src/lib/services/photo-job.service.ts:165-166`; callback cross-checks prediction id, index.ts:394-400).
   - Request: `POST {FUNCTION_URL}/callback?jobId=<id>` (jobId = query string, index.ts:362-365) with headers `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<HMAC>` (signing recipe phase3-callback-test.ts:48-51) and body `{"id":"<pred>","status":"succeeded","output":"<url>"}`.
   - **Caveat (the one open decision):** the success `output` URL must pass the SSRF allowlist — https + `replicate.delivery`/`*.replicate.delivery` (index.ts:419-421; replicate-webhook.ts:229-237) — and the function **really fetches it** (index.ts:428; 30 s timeout / 25 MB cap, index.ts:67-68), then uploads the bytes to `photos/{user_id}/{job_id}/result.<ext>` and deletes the source (index.ts:435-439; photo-job.service.ts:156-179). Options: (a) pinned real `replicate.delivery` asset (one exists: `scripts/spikes/bread-spike.ts:25-26`; network-dependent), (b) one-line env-extendable allowlist (test-only seam), (c) seam 2 below. **The `status:"failed"` path needs no output fetch at all** (index.ts:411-414) — fully offline today.
   - Note: `phase3-callback-test.ts:37`'s default output (`picsum.photos`) predates the SSRF guard — pass an allowed URL as argv.
2. **Runner-up — no-function drive (service-role DB + storage):** upload genuine image bytes to `photos/{uid}/{jobId}/result.jpg`, then guarded UPDATEs `processing` → `succeeded` + `result_path`. Fully offline, no serve/secrets/tunnel; exercises submit → Realtime → render but **zero Edge Function code**. Right if the gate is strictly the UI contract.
3. **Env-overridable predictions URL + local Replicate mock:** needs a code change (index.ts:51), a mock reachable from the edge container (`host.docker.internal`), and `/start` wiring — and since the local callback URL is http, `/start` never registers a webhook anyway, so the test must deliver the callback itself: seam 3 degenerates into seam 1 plus `/start` coverage. Do later only if `/start` coverage becomes a gate requirement.

**Function env inventory** (names only; local supply = `supabase/functions/.env`, gitignored at `.gitignore:17`, **no `.env.example` for it**): `DB_WEBHOOK_SECRET`, `CLOUD_PIPELINE_ENABLED`, `REPLICATE_API_TOKEN`, `EDGE_FUNCTION_URL`, `REPLICATE_WEBHOOK_SIGNING_SECRET`; plus auto-injected `SUPABASE_URL` (= `http://kong:8000` in the local container — index.ts:124-131) and `SUPABASE_SERVICE_ROLE_KEY`. Values are read at serve startup — **restart after edits** (`context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md:88`). For the PR gate, a locally **generated** `whsec_…` works (signer and verifier read the same file) — with the explicit lessons.md caveat that a self-signing harness can never validate the PROD secret (lessons.md:117-122); that is the live smoke's job.

### Q2 — What runs locally today

Out of the box (`npx supabase start` + `db reset` + `npm run dev`): the whole stack, schema (jobs + photos bucket + RLS + trigger + Realtime publication with **REPLICA IDENTITY FULL**, `20260528120000_create_jobs_table.sql:124-137`), the app, and the Vitest suites. **Not wired by default:** the DB webhook (Vault/GUC secrets unset → trigger no-ops) and the Edge Function (separate `npx supabase functions serve enhance --env-file supabase/functions/.env` terminal). The full manual wiring is documented in `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md` (GUC route works locally — local postgres IS superuser; hosted denies `ALTER DATABASE SET app.settings.*`, hence the Vault migration — `context/archive/2026-06-04-production-deployment/deferred-2.4-db-webhook-settings.md`). Live-Replicate Phase 3 additionally needs a cloudflared tunnel re-synced into BOTH the function env and the DB setting each session (runbook:62-70).

**Crucial for the chosen seam:** the PR-gate spec deliberately does NOT wire the webhook — the row staying `queued` after submit is the intended starting state, and `/callback` ignores `CLOUD_PIPELINE_ENABLED` entirely. The only local moving parts are `functions serve` + a generated signing secret.

**Cap:** `CLOUD_DAILY_CAP` is an Astro server env (schema default **50** — astro.config.mjs; local override in `.env`/`.dev.vars`). A handful of E2E submits won't trip it locally; `0` is the documented kill-switch and the cheap way to test the 429 path. Count predicate: UTC day + `NOT (failed AND replicate_prediction_id IS NULL)` (`context/archive/2026-06-03-cloud-daily-cap/plan.md:44-51`) — stub-failed rows without a prediction id don't consume cap.

### Q3 — Watchdog budgets, Realtime mechanics, UI anchors

**Budgets** (`src/components/hooks/useCloudJob.ts`): `QUEUED_WATCHDOG_MS = 30_000` (:77), `PROCESSING_WATCHDOG_MS = 300_000` (:78 — **lessons.md:93's "180s" is stale**; S-09 retune, `context/archive/2026-06-06-cloud-source-url-ttl-fix/plan.md:80-84`; invariants pinned by `tests/cloud-timings.test.ts:14-24`), `SLOW_HINT_MS = 25_000` (:80), result signed-URL TTL 300 s (:52). Stale doc-drift also in `src/pages/api/enhance/cloud/timeout.ts:23` ("~60s").

**Realtime**: channel `job-<id>`, `postgres_changes` UPDATE filter `id=eq.<jobId>` (useCloudJob.ts:237-244); `realtime.setAuth(accessToken)` resolves **before** `.subscribe()` (:232-236); **catch-up read** on SUBSCRIBED (:245-251, the read at **:250**); **re-read-before-fail** at the queued deadline (:213-219, conditional at **:217**); monotonic `applyStatus` (terminal guard :176, `sawProcessing`-once arms the 300 s budget :177-181, terminal latch :182-186); phase derivation is **succeeded-wins** (:324-332). JWT reaches the island as an SSR prop (`src/pages/index.astro:13-22, 34-40`); anonymous → no subscribe (useCloudJob.ts:128).

**Submit sequence**: "Process with Cloud AI" → `useCloudSubmit` statuses `idle|submitting|submitted|error` (`src/components/hooks/useCloudSubmit.ts:5, 34-56`) → `submitCloudJob`: POST create-job `{fileExtension, mimeType}` then raw PUT to the signed URL (`src/lib/services/cloud-upload.client.ts:69-93`). The insert-vs-upload race is handled **server-side** by the bounded sign retry (lessons.md:75-80).

**UI anchors for assertions** (exact, verified):
| State | Anchor |
|---|---|
| waiting | text `"Enhancing in the cloud…"` (`EnhanceWorkspace.tsx:253-257`) + button "Start over" |
| cold-boot hint (≥25 s) | text `"The first run after idle can take a few minutes."` (EnhanceWorkspace.tsx:259-261) |
| **success** | `role="slider"` `aria-label="Before and after comparison — drag or use arrow keys to compare"` (`BeforeAfterSlider.tsx:54-62`); imgs `alt="Your photo — enhanced"`/`"— original"`; button **"Download"** (`DownloadButton.tsx:30-33`); no success heading exists |
| failure/timeout | `role="alert"` (`EnhanceWorkspace.tsx:282-287`); timeout copy `"Cloud processing took too long. Please try again."` (useCloudJob.ts:83); failed copy `"Cloud processing failed. Please try again."` (:85); buttons "Try again"/"Start over" (EnhanceWorkspace.tsx:237-251) |

**Success render is not just the row flip**: the browser mints a 300 s signed URL for `result_path` and **decodes the bytes** (`src/lib/services/cloud-result.client.ts:27-56`) under storage RLS `photos_select_own` (`20260528120100_create_photos_storage.sql:46-53`) — the result object must be a real decodable image under the signed-in user's uid prefix, or the UI surfaces the result-load error instead of the slider.

**Fixture**: client gate = `validateImageFile` (`src/lib/engines/image-helpers.ts:35-58`): JPEG/PNG, ≤25 MB, no dimension check on the cloud path, no client-side conversion. **Use a small RGB JPG (~96×96 — the smallest Bread-verified shape)**; an **RGBA PNG is the repo's documented deliberate-failure fixture** (Bread rejects 4-channel: `context/archive/2026-06-07-cloud-flip-on-revalidation/results.md:17`).

**Deliberate-break targets** (inversion must turn the spec red): (1) catch-up read `useCloudJob.ts:250`; (2) blind the queued-deadline re-read `:213-219`/`:217`; (3) monotonic guards `:176-186`; (4) succeeded-wins derivation `:324-332`; (5) `setAuth` before subscribe `:232-236`; (6) `cloudResultReady` render guard `EnhanceWorkspace.tsx:80-88`; (7) server-side `signSourceWithRetry` `enhance/index.ts:158-170`.

### Q4 — PR gate vs scheduled/manual smoke

| Scenario                                                                                                                                                                                          | Layer                                                 | Why                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **PR gate 1 — north-star happy path (stubbed)**: real submit → service-role flip to `processing` (<30 s!) → signed callback → function uploads result → Realtime → slider renders without refresh | seam 1 (or seam 2 if the plan picks UI-contract-only) | deterministic, seconds of wall-clock, protects #1's "result appears" + #6's render path                                |
| **PR gate 2 — stall → terminal failure**: submit with pipeline unwired → queued watchdog fires at 30 s → `role="alert"` timeout copy + row flipped via `/api/enhance/cloud/timeout`               | no stub at all (the unwired pipeline IS the stall)    | protects #1's "never hangs forever"; costs ~30 s wall-clock — acceptable but plan may park it in a non-default project |
| **Scheduled/manual smoke — live cold boot**: runbook Phase 3 (tunnel + real token + real signing secret)                                                                                          | live                                                  | the only place the PROD-secret class of failure (lessons.md:117-129) is observable; never a PR gate                    |

The 25 s cold-start hint and the deeper #6 sub-cases (late/out-of-order events) stay unit-level (Phase 3 of the test-plan rollout) — E2E asserts the rendered outcomes, not the timer internals.

## Code References

- `supabase/functions/enhance/index.ts:51` — hardcoded Replicate URL (the no-go for env stubbing today)
- `supabase/functions/enhance/index.ts:174-181, 329-358` — /start bearer + /callback svix verification
- `supabase/functions/enhance/index.ts:419-439` — SSRF allowlist + output fetch + result upload (the seam-1 caveat)
- `src/lib/services/replicate-webhook.ts:72-132` — signature + freshness verifier (signing recipe for the stub)
- `scripts/spikes/phase3-callback-test.ts:48-51, 82-114` — proven signed-callback harness + row seeding pattern
- `src/components/hooks/useCloudJob.ts:77-78, 213-219, 245-251, 324-332` — budgets, re-read, catch-up, phase derivation
- `src/components/enhance/EnhanceWorkspace.tsx:227-287` — cloud-state render branches (assertion anchors)
- `src/components/enhance/BeforeAfterSlider.tsx:54-62` — the success slider (role + aria-label)
- `supabase/migrations/20260608120000_jobs_webhook_vault.sql:33-46` — Vault-sourced webhook config (unset = inert)
- `supabase/migrations/20260528120000_create_jobs_table.sql:124-137` — Realtime publication + REPLICA IDENTITY FULL
- `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md` — the manual local pipeline runbook (GUC + serve + tunnel)

## Architecture Insights

- The pipeline's auth model is per-branch (bearer for machine-to-machine `/start`, svix HMAC for provider `/callback`) with `verify_jwt=false` — so a test can impersonate either caller **legitimately** given the local secrets; that's what makes seam 1 a zero-code stub.
- The function (not the provider) owns result materialization: callback → fetch output → upload to storage → flip row. A stub that goes through `/callback` therefore exercises retention (source delete) and storage RLS for free.
- The client is deliberately defensive (catch-up read, re-read-before-fail, monotonic apply, succeeded-wins) — each defense maps 1:1 to a lessons.md incident and is an explicit deliberate-break target for VERIFY.
- Self-signing locality boundary (lessons.md): the PR gate can prove the _mechanism_ (signature verification, terminal transitions) but structurally cannot prove _prod config_ (real secret, EDGE_FUNCTION_URL) — that split is exactly the PR-gate/live-smoke split.

## Historical Context (from prior changes)

- `context/archive/2026-05-31-cloud-ai-realtime-result/` — pipeline design decisions (service-role writes / JWT reads, SSR-prop JWT, setAuth-before-subscribe)
- `context/archive/2026-06-06-cloud-source-url-ttl-fix/plan.md:37-39, 80-84` — TTL 3600 s + watchdog 300 s retune (the stale-lesson correction)
- `context/archive/2026-06-07-cloud-flip-on-revalidation/` — flip-ON findings F1 (signing secret) / F2 (EDGE_FUNCTION_URL), local-runbook, RGBA-failure fixture evidence
- `context/archive/2026-06-03-cloud-daily-cap/plan.md:44-57` — cap predicate + kill-switch semantics
- Open changes checked: `edge-function-url-hardening` (#15, status new) and `disable-workers-dev-subdomain` (#14) — **no overlap/conflict** with this change; the allowlist seam decision should be made aware of #15's pending hardening of the same file.

## Related Research

- `context/changes/testing-e2e-north-star/change.md` — the brief this answers
- `tests/e2e/seed.spec.ts` + `tests/e2e/RULES.md` — the two quality levers the future specs are generated from
- `context/foundation/test-plan.md` §2 (risks #1/#6 Guidance rows), §3 Phase 4

## Open Questions

1. **Seam-1 success-path output URL**: pinned real `replicate.delivery` asset (network-dependent) vs one-line env-extendable allowlist (test-only code change in `enhance/index.ts:419-421` — coordinate with #15) vs seam 2 (UI-contract only, zero function coverage). Plan must pick.
2. **The <30 s flip choreography**: the spec must flip `queued→processing` before the queued watchdog fires — Playwright-side service-role call right after submit. Confirm no race with the PUT (upload completes in ms locally).
3. **CI shape**: extend the existing `integration` job (already boots Supabase; add `functions serve` + Playwright) vs a separate `e2e` job. Supabase image caching lesson applies either way.
4. **Stall spec placement**: 30 s wall-clock in the PR gate vs a separate non-default Playwright project (`--project=slow`)?
5. **1×1 JPG model acceptance unverified** — irrelevant for the stub (model never called), but the live smoke should use the 96×96+ RGB JPG.
