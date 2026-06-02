# Cloud AI Realtime Result (S-04 · north star) — Plan Brief

> Full plan: `context/changes/cloud-ai-realtime-result/plan.md`
> Research: `context/changes/cloud-ai-realtime-result/research.md`

## What & Why

Build the async Cloud-AI pipeline and Realtime result delivery — the **north star**. After S-03 leaves a `queued` job + private source, a Database Webhook fires a Supabase Edge Function that runs the Replicate "Bread" model with a webhook callback; on completion the job flips `succeeded`/`failed` and Supabase Realtime pushes the row to the browser, which renders the enhanced image in the before/after slider with download — no refresh, within ~30s p95. This proves the core product hypothesis.

## Starting Point

F-01 pre-wired the data layer (jobs Realtime publication + `replica identity full`, `markJobSucceeded`, status enum) and S-03 ships the gated submit (a `queued` job + source upload), ending at a static "Submitted" placeholder. The entire pipeline is net-new: no `supabase/functions/`, no Database Webhook, no Replicate integration, and no browser Supabase client (URL/anon key are server-only secrets today).

## Desired End State

A signed-in user submits a photo, sees "Enhancing in the cloud…", and within ~30s the enhanced result appears in the before/after slider with download — pushed via Realtime. Failures and a ~60s timeout surface a clear error with Try-again. The job transitions `queued→processing→succeeded|failed` with the result stored in the private bucket and the source deleted on success. The pipeline runs entirely on Supabase, gated by a flag so prod Replicate spend stays off until S-05.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Bread latency/cost | ~3s warm on T4, ~$0.0006/run; version pinned | De-risks the ≤30s p95 (PRD OQ#2) with real numbers | Research |
| Pipeline topology | One Edge Function, two routes (`/start` + `/callback`) | One deploy unit, shared code/secrets, whole pipeline on the Supabase surface | Plan |
| Replicate→DB write | Service-role client in the Edge Function | Schema has no user UPDATE policy; external webhook has no authed user | Research |
| Source for Replicate | Edge Function mints a short-TTL signed READ URL | Bread needs a fetchable URL; source is private | Research |
| Client env exposure | Island props (url + anon key) from SSR | No config-schema change; anon key is publishable by design | Plan |
| JWT to client | SSR page prop (`session.access_token`) | Simplest; token lifetime ≫ watch window; lesson #3 needs `setAuth(jwt)` | Plan |
| Stuck-job timeout | Client watchdog → authed `mark-failed` route | No pg_cron (non-goal); user always sees an outcome | Plan |
| Cost guard | `CLOUD_PIPELINE_ENABLED` flag; OFF in prod until S-05 | Pipeline testable locally, zero prod spend before the cap | Plan |
| Wait/error UX | Processing spinner → slider, or error + Try again | Mirrors the Local flow's processing→done→error shape | Plan |
| Validate Bread first | Phase 0 throwaway spike | Answer cold-start + color in/out before building the pipeline | Plan |
| Testing | Unit pure logic + manual E2E | Edge Function/Replicate/Realtime are hard to unit-test; isolate the pure pieces | Plan |

## Scope

**In scope:** Bread spike; service helpers (`markJobProcessing`/`markJobFailed`/`getJobById`/`createSignedReadUrl`) + DTOs; one Edge Function (`/start` kickoff + `/callback` completion) with Replicate + signature verify; the `queued` Database Webhook; browser Supabase client + Realtime subscription; result render (slider + download); processing/failure/timeout UX; `mark-failed` route; `CLOUD_PIPELINE_ENABLED` flag + secret wiring.

**Out of scope:** daily cap (S-05); pg_cron reaper; magic-bytes validation; history UI; a second bucket; automated Edge-Function/integration tests; production enablement of the pipeline (flag stays OFF until S-05).

## Architecture / Approach

`queued` insert → **Database Webhook** (pg_net) → **Edge Function `/start`** (flag check → `processing` → signed source URL → Replicate `predictions.create({version, input, webhook:/callback, webhook_events_filter:["completed"]})`) → Replicate runs Bread (~3s) → **Edge Function `/callback`** (verify signature → download `output` → upload to `photos` → `markJobSucceeded`/`Failed`) → **Realtime** pushes the `jobs` UPDATE → browser (`setAuth(jwt)` + channel) mints a signed read URL → before/after slider + download. Service-role writes; user-JWT reads/Realtime. Two ops surfaces: `supabase` CLI (pipeline) vs `wrangler` (frontend).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 0. Bread spike | Latency + color verdict; locked version/params | Cold-start or grayscale-only could force a model rethink |
| 1. Service groundwork | Helpers + DTOs + env flag + config (unit-tested) | Keeping helpers `astro:env`-free for Deno/Vitest reuse |
| 2. Pipeline kickoff | DB webhook → `/start` → Replicate prediction created | DB-webhook local URL (`host.docker.internal`) + bearer auth |
| 3. Pipeline completion | `/callback` verify → result stored → `succeeded`/`failed` | Replicate signature verify; mapping prediction→job |
| 4. Realtime plumbing | JWT-scoped subscription receives the pushed event | `setAuth(jwt)` ordering (lesson #3); channel cleanup |
| 5. Result render + failure UX | Slider/download + processing/error/timeout + watchdog | URL→Blob + client-decode dims; timeout idempotency |

**Prerequisites:** S-03 done (✓). A Replicate account + API token; local Supabase (`supabase start`) + `supabase functions serve` for E2E.
**Estimated effort:** ~4–6 sessions across 6 phases (pipeline-heavy).

## Open Risks & Assumptions

- Cold-start of an idle Bread model is the one unmeasured number (Phase 0 settles it; mitigations on standby).
- Bread's `image` field is labelled "Grayscale" though it's a photo enhancer — Phase 0 confirms color in/out.
- A closed browser tab can leave a row `processing` (watchdog only fires while open) — accepted v1, cosmetic.
- Bread is an older community model; pinning the version hash mitigates drift/availability (roadmap blocker stands).

## Success Criteria (Summary)

- Signed-in submit → enhanced result appears via Realtime in the slider with download, no refresh, within ~30s p95.
- Failures and the ~60s timeout always resolve to a visible error (no silent infinite spinner).
- Pipeline runs on Supabase behind a flag; no prod Replicate spend before S-05; Local flow unchanged.
