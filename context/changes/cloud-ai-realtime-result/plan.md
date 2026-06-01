# Cloud AI Realtime Result (S-04 · north star) Implementation Plan

## Overview

Build the async Cloud-AI pipeline and Realtime result delivery. After S-03 leaves a `queued` job + private source, a Database Webhook fires a Supabase Edge Function that runs the Replicate "Bread" model with a webhook callback; on completion the function stores the result and flips the job `succeeded`/`failed`; Supabase Realtime pushes the row to the browser, which renders the enhanced image in the existing before/after slider with download — no manual refresh, within ~30s p95. This replaces S-03's static "Submitted" placeholder with a live result.

## Current State Analysis

- **Data layer ready (F-01).** `jobs` has the `queued|processing|succeeded|failed` enum, `replica identity full` + `supabase_realtime` membership (lesson #2 ✓), `jobs_select_own` SELECT RLS, and **no user UPDATE/DELETE policy** → all status writes go through the service-role admin client. `markJobSucceeded` exists (updates row + deletes source = 24h-retention enforcement). `PhotoJob` entity is complete (`src/types.ts:16-28`).
- **S-03 leaves** a `queued` job (id, user_id, source_path) + source at `{uid}/{jobId}/source.{ext}` in the private `photos` bucket, and a client cloud flow ending at a "submitted" terminal (`EnhanceWorkspace.tsx:172-184`) that discards the returned `jobId` (`useCloudSubmit.ts:46`).
- **Net-new (nothing exists):** `supabase/functions/`, the Database Webhook, Replicate integration, a browser Supabase client, and any client-side Supabase env exposure (`SUPABASE_URL`/`KEY` are server-only secrets).
- **Bread (external, de-risked):** `mingcv/bread` version `057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54`, input `image` (uri) + `gamma` (≤1.5) + `strength` (≤0.2), output a single URI string, ~3s on a T4, ~$0.0006/run. (Research §External.)
- Full grounding in `context/changes/cloud-ai-realtime-result/research.md`.

## Desired End State

- A signed-in user submits a photo (S-03), sees an "Enhancing in the cloud…" state, and within ~30s the enhanced result appears in the before/after slider with a working download — pushed via Realtime, no refresh. On pipeline failure or a ~60s timeout, they see a clear error with Try-again / Start-over.
- A `jobs` row transitions `queued → processing → succeeded` (or `failed`), with `result_path`, `replicate_prediction_id`, `completed_at` set; the result object lives at `{uid}/{jobId}/result.{ext}` in `photos`; the source is deleted on success.
- The pipeline runs entirely on the Supabase ops surface (one Edge Function, two routes) and is gated by a `CLOUD_PIPELINE_ENABLED` flag so production Replicate spend stays off until S-05's daily cap lands.

**Verification:** Phase-0 spike confirms latency + color in/out; local E2E (submit → result via Realtime; forced failure → error) under `supabase start` + `supabase functions serve` + `npm run dev`; unit tests on the new pure helpers/adapters; `npx astro check` + `npm run build` + lint clean on touched files.

### Key Discoveries:

- **Service-role writes, user-JWT reads/Realtime** — schema-enforced (no user UPDATE policy). Edge Function = sole writer; browser subscribes + mints signed read URLs under the user JWT.
- **Replicate needs a fetchable source URL** — the Edge Function mints a short-TTL signed READ URL for the private `source_path` and passes it as Bread's `image`.
- **Lesson #3:** the browser must `await client.realtime.setAuth(jwt)` before `.subscribe()` or the RLS-scoped UPDATE silently never arrives. Proven sequence in `scripts/f01-smoke.ts:60-93`.
- **Two render mismatches:** cloud result is a URL not a Blob (`fetch().blob()` for `DownloadButton`); carries no width/height (client-decode via `new Image()`, the `useLocalEnhance.ts:22-33` pattern) — `BeforeAfterSlider` requires both.
- **Edge Function auth:** must set `verify_jwt = false` (DB-webhook + Replicate callback carry no Supabase JWT); the function authenticates calls itself (shared secret for `/start`, Replicate signature for `/callback`).

## What We're NOT Doing

- No daily cap / rate limiting — S-05 (this slice ships behind a flag with the pipeline OFF in prod until then).
- No pg_cron / scheduled reaper (stated non-goal) — stuck jobs are failed by a client-side watchdog; a closed tab may leave a row `processing` (accepted v1, cosmetic).
- No magic-bytes validation in the Edge Function (stated non-goal).
- No history UI, no retries beyond user-initiated "Try again" (re-submit mints a fresh job, per S-03's one-shot design).
- No second storage bucket — result lives in the existing private `photos` bucket.
- No automated Edge-Function/integration test harness — pure logic is unit-tested; the pipeline + Realtime are manual E2E.
- No production enablement of the pipeline in this slice (flag stays OFF in prod until S-05).

## Implementation Approach

Six phases. **Phase 0** is a throwaway spike that answers the two external-provider unknowns (cold-start vs ≤30s p95; color in/out) before any pipeline code. **Phase 1** adds the pure, unit-testable service groundwork both pipeline halves need. **Phases 2–3** build the pipeline on the Supabase surface (one Edge Function, `/start` kickoff then `/callback` completion) — the roadmap's "(a) pipeline" half. **Phases 4–5** build the client — Realtime subscription plumbing, then result render + failure UX — the "(b) realtime + render" half. The pipeline is gated by `CLOUD_PIPELINE_ENABLED` throughout so it can be exercised locally while staying off in prod until S-05.

## Critical Implementation Details

- **Edge Function config:** add `[functions.enhance] verify_jwt = false` to `supabase/config.toml` — both invokers (DB webhook, Replicate) lack a Supabase user JWT. The function does its own auth: `/start` checks a shared secret (the DB-webhook Authorization bearer = service-role or a dedicated secret), `/callback` verifies the Replicate signature.
- **DB webhook local URL gotcha:** Postgres runs in Docker; the trigger's target must be `http://host.docker.internal:54321/functions/v1/enhance/start` locally (not `localhost`), and the prod project URL in prod. The trigger uses `supabase_functions.http_request(...)` / `net.http_post` (pg_net) and must pass an Authorization bearer the `/start` route checks.
- **Replicate from Deno:** import the client via `esm.sh` (`import Replicate, { validateWebhook } from "https://esm.sh/replicate@<pin>"`) for `predictions.create` + `validateWebhook`, or call `POST /v1/predictions` with raw `fetch`. `/callback` must read the **raw body** before parsing to verify the signature.
- **Deno import boundary (F1) — single source of truth:** the Edge Function builds its own service-role supabase-js client via `esm.sh`, then calls the **same shared helpers the app uses** — `getJobById`/`markJobProcessing`/`markJobFailed`/`markJobSucceeded`/`createSignedReadUrl` in `src/lib/services/photo-job.service.ts`, plus `src/lib/services/bread.ts` — passing its Deno client in (the helpers already take the `SupabaseClient` as a parameter and import **only types**, per lesson #4). This works precisely because those modules have **type-only** imports: a `supabase/functions/enhance/deno.json` import map maps `@/types` → the relative source path and `@supabase/supabase-js` → `esm.sh`, so Deno resolves them. Keeping ONE implementation of the status transitions + the 24h-source-delete retention logic avoids app-vs-Deno drift. Do **not** re-implement job updates inline in the function. The real Deno-import verification lives in **Phase 2** (where the function + `deno.json` exist), not Phase 1. **Prerequisite for sharing:** keep `photo-job.service.ts` free of any value (non-type) import that wouldn't resolve under Deno; if a helper ever needs a runtime dep, isolate it so the shared surface stays type-only.
- **Signed-read TTL:** source URL for Replicate ~300s (long enough for Bread to fetch); result URL for the client ~300s, re-minted on demand by the browser.
- **`updated_at`** is auto-touched by a DB trigger — never set it manually in any helper.
- **Lesson #5 (Windows CRLF):** lint = `npx prettier --write <touched>` then `npx eslint <touched>`; never repo-wide `lint:fix`. **Lesson #6:** verify client changes under `npm run dev` AND `npm run build && npx wrangler dev`.

### Pipeline config & secrets contract (F2 — concrete names)

Locked so the implementer wires names, not guesses. (Verify exact `pg_net` syntax against the local stack during Phase 2.)

- **Edge Function name:** `enhance` → invoked at `…/functions/v1/enhance`; routes are sub-paths `…/functions/v1/enhance/start` and `…/functions/v1/enhance/callback` (the function inspects `new URL(req.url).pathname`).
- **`supabase/config.toml`:** add
  ```toml
  [functions.enhance]
  verify_jwt = false
  ```
- **Edge Function secrets** (separate store; set via the supabase CLI, never committed):
  `supabase secrets set REPLICATE_API_TOKEN=… REPLICATE_WEBHOOK_SIGNING_SECRET=… DB_WEBHOOK_SECRET=… CLOUD_PIPELINE_ENABLED=true` (local). `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** into the runtime (do not set). `.env.example` documents the same four keys (placeholders).
- **DB-side settings for the trigger** (function base URL + bearer), read by the trigger via `current_setting(...)`. Set per-environment with `ALTER DATABASE postgres SET "app.settings.edge_function_url" = '…'` and `… "app.settings.db_webhook_secret" = '…'` (or Supabase Vault). Local URL = `http://host.docker.internal:54321/functions/v1/enhance`; prod = `https://<project-ref>.supabase.co/functions/v1/enhance`.
- **Webhook trigger template** (migration; requires `create extension if not exists pg_net with schema extensions;`):
  ```sql
  create or replace function public.handle_queued_job() returns trigger
    language plpgsql security definer as $$
  begin
    perform net.http_post(
      url    := current_setting('app.settings.edge_function_url') || '/start',
      headers:= jsonb_build_object(
                  'Authorization', 'Bearer ' || current_setting('app.settings.db_webhook_secret'),
                  'Content-Type', 'application/json'),
      body   := jsonb_build_object('jobId', NEW.id));
    return NEW;
  end; $$;
  create trigger jobs_enqueue_webhook
    after insert on public.jobs for each row
    when (new.status = 'queued')
    execute function public.handle_queued_job();
  ```
  (Equivalent to a Studio-created Database Webhook, which generates a `supabase_functions.http_request(...)` trigger — either is acceptable; the explicit `net.http_post` form keeps it in a migration.)

---

## Phase 0: Bread de-risking spike (throwaway)

### Overview

Hit the real Replicate Bread model before building anything, to answer PRD Open Question #2 and the color/format unknown. No production code.

### Changes Required:

#### 1. Spike script + findings note

**File**: `scripts/spikes/bread-spike.ts` (throwaway), `context/changes/cloud-ai-realtime-result/spike-findings.md` (new)

**Intent**: Run the pinned Bread version against a representative low-light **color** JPG (warm and cold/idle), capture latency and the output, and confirm a usable color result. Lock the version hash and the `gamma`/`strength` mapping. Record go/no-go on the ≤30s p95 SLA.

**Contract**: Uses `REPLICATE_API_TOKEN` (local only). Calls `predictions.create` (or `replicate.run`) with `{ image: <public test url>, gamma, strength }`, measures `created_at`→`completed_at`, downloads `output`. Findings note records: warm latency, cold/idle latency, color in→color out (yes/no + any format handling), chosen `gamma`/`strength` defaults, and the SLA verdict. If cold-start blows the budget, note the chosen mitigation (warm-up / model swap / relaxed SLA) before Phase 2.

### Success Criteria:

#### Automated Verification:

- Spike script runs and prints latency + output URL: `npx tsx scripts/spikes/bread-spike.ts` (or `node` equiv)

#### Manual Verification:

- Warm prediction completes well under 30s; cold/idle latency recorded against the ≤30s p95 budget with an explicit go/no-go
- A color JPG input returns a usable, visibly-enhanced color image (not grayscale)
- `spike-findings.md` records the locked version hash, `gamma`/`strength` defaults, and the SLA verdict

**Implementation Note**: After this phase, pause for confirmation of the SLA/color verdict before building the pipeline. (Throwaway script may be deleted or left under `scripts/spikes/`.)

---

## Phase 1: Service-layer groundwork

### Overview

Add the pure, unit-testable helpers + DTOs both pipeline halves need, plus the env-flag and config/secrets scaffolding. No external calls, no Edge Function yet.

### Changes Required:

#### 1. Job-state helpers + signed-read

**File**: `src/lib/services/photo-job.service.ts`, `src/types.ts`

**Intent**: Add the status transitions and lookups **both** the Edge Function (via the Deno import map, F1) and the app `/timeout` route call (all via a service-role client passed in as a param, since there's no user UPDATE policy), plus a signed READ-URL helper for the private bucket (the Edge Function uses it for the Replicate source input). Keep this module's imports **type-only** (`import type … from "@/types"` / `"@supabase/supabase-js"`) so it resolves under Deno via the import map.

**Contract**: New exports — `markJobProcessing(admin, { jobId, replicatePredictionId? })` (status→`processing`); `markJobFailed(admin, { jobId, errorCode, errorMessage })` (status→`failed` + `completed_at`; no source cleanup, per v1); `getJobById(admin, jobId): Promise<PhotoJob | null>` (reads the row incl. `source_path`/`user_id`); `createSignedReadUrl(admin, path, expiresInSeconds)` → signed URL string. **Plus `markPendingJobFailedForOwner(admin, { jobId, userId, errorCode, errorMessage }): Promise<boolean>`** for the timeout route (F3) — a SINGLE atomic guarded update (`.update({status:'failed', error_code, error_message, completed_at}).eq("id", jobId).eq("user_id", userId).in("status", ["queued","processing"])`) that returns whether a row was actually flipped, so a row that already went `succeeded`/`failed` between the watchdog firing and the write is **never** overwritten (no read-then-write race). New DTOs in `src/types.ts`: `MarkJobProcessingCommand`, `MarkJobFailedCommand`, `MarkPendingJobFailedCommand`. Do not set `updated_at` (DB trigger owns it). Mirror `markJobSucceeded`'s structure/error-throwing.

#### 2. Bread input mapping (pure)

**File**: `src/lib/services/bread.ts` (new)

**Intent**: A pure module mapping a source URL + chosen params to Bread's input object and naming the pinned version — importable by both the Edge Function (via the shared logic) and unit tests, free of `astro:env`/Deno globals (lesson #4).

**Contract**: Export `BREAD_VERSION` (the locked hash from Phase 0) and `buildBreadInput(imageUrl): { image, gamma, strength }` using the Phase-0 defaults. Keep it **strictly dependency-free** (no `@/` imports, no npm/Deno-specific APIs) so it imports cleanly from BOTH Astro/Vitest (`@/`) and the Deno Edge Function (relative path or `deno.json` import map) — shared across the Deno boundary alongside the type-only `photo-job.service.ts` helpers (see Critical Implementation Details · Deno import boundary).

#### 3. Pipeline env flag + secrets/config scaffolding

**File**: `astro.config.mjs` (env schema), `.env.example`, `.dev.vars` (gitignored — document only), `supabase/config.toml`

**Intent**: Declare the cost-guard flag and the new secrets, and prepare the Edge Function config. The flag gates the expensive Replicate call so prod stays off until S-05.

**Contract**: Add `CLOUD_PIPELINE_ENABLED` (server boolean, default off in prod) — read by the `/start` route. Add `.env.example` placeholders: `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`, `DB_WEBHOOK_SECRET` (the bearer `/start` checks), `CLOUD_PIPELINE_ENABLED`. In `supabase/config.toml` add `[functions.enhance] verify_jwt = false`. (Function name + exact secret/setting names + the trigger template are locked in **Pipeline config & secrets contract** above; Edge Function secrets are set via `supabase secrets set`, separate from Worker secrets — documented, not committed.)

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes on touched files (prettier --write then eslint)
- Unit tests pass: `npx vitest run tests/photo-job-helpers.test.ts tests/bread.test.ts` — helpers build correct update payloads (mocked admin client); `buildBreadInput` maps params + version correctly

> Note: the cross-Deno-boundary import check (does the function's `deno.json` import map resolve the shared `photo-job.service.ts` + `bread.ts`?) lives in **Phase 2** (`supabase functions serve enhance` boots), where the function + import map actually exist — not here.

#### Manual Verification:

- `CLOUD_PIPELINE_ENABLED` + new secret placeholders present in `.env.example`; `[functions.enhance] verify_jwt = false` present in config.toml
- `npm run build` succeeds

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: Pipeline kickoff — Edge Function `/start` + DB webhook

### Overview

Wire the `queued`-row insert to a Supabase Edge Function that starts the Replicate prediction. End state: inserting a `queued` job drives it to `processing` and creates a Bread prediction (visible in Replicate), with `replicate_prediction_id` stored.

### Changes Required:

#### 1. Edge Function `/start` route

**File**: `supabase/functions/enhance/index.ts` (new), shared helpers under `supabase/functions/enhance/`

**Intent**: Receive the DB-webhook POST, authenticate it (shared `DB_WEBHOOK_SECRET` bearer), honor the `CLOUD_PIPELINE_ENABLED` flag, set the job `processing`, mint a signed READ URL for the source, and create the Replicate prediction with a webhook callback pointing at this function's `/callback` route.

**Contract**: `serve()` routes on path/method. `/start`: verify the Authorization bearer == `DB_WEBHOOK_SECRET` (401 otherwise); if `CLOUD_PIPELINE_ENABLED` is not true, no-op 200 (job stays `queued`, no spend); build a service-role client from `Deno.env` (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` auto-injected); `getJobById` → `createSignedReadUrl(source_path, 300)` → `predictions.create({ version: BREAD_VERSION, input: buildBreadInput(signedSourceUrl), webhook: <fn-url>/callback?jobId=<jobId>, webhook_events_filter: ["completed"] })` → `markJobProcessing(jobId, prediction.id)`. (F4: the `jobId` is carried in the callback URL for a direct lookup; the stored `prediction.id` is the integrity cross-check `/callback` verifies.) On any error → `markJobFailed` (the shared helper). Return 200 quickly (pg_net is async/non-blocking). **Per the Deno import boundary (Critical Implementation Details):** the function builds its own `esm.sh` service-role client and **calls the shared `photo-job.service.ts` helpers** (`getJobById`/`markJobProcessing`/…) + `bread.ts`, passing that client in — it does NOT re-implement updates inline. Create `supabase/functions/enhance/deno.json` (import map mapping `@/types`→relative source path, `@supabase/supabase-js`→`esm.sh`) in this phase and verify it resolves (automated check below).

#### 2. Database Webhook trigger

**File**: `supabase/migrations/<ts>_jobs_enqueue_webhook.sql` (new)

**Intent**: Fire the Edge Function `/start` when a `queued` job is inserted.

**Contract**: `AFTER INSERT ON public.jobs FOR EACH ROW WHEN (new.status = 'queued')` → calls `supabase_functions.http_request(...)` / `net.http_post` to `<fn-url>/start` with an Authorization bearer = `DB_WEBHOOK_SECRET` and the row id in the body. Target URL is environment-specific: `http://host.docker.internal:54321/functions/v1/enhance/start` locally, the project URL in prod (read from a Postgres setting/Vault rather than hardcoded). Follows the F-01 RLS/grant model — no new table.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset` (or `db push`) succeeds
- Edge Function serves locally without error: `npx supabase functions serve enhance` boots — which also proves the `deno.json` import map resolves the shared helpers (`bread.ts` + the type-only `photo-job.service.ts`) under Deno (F1/F3: the real cross-boundary import check, replacing the vacuous Phase-1 one)

#### Manual Verification:

- With `CLOUD_PIPELINE_ENABLED=true` + secrets set, inserting a `queued` job (via the S-03 submit flow or SQL) flips it to `processing` and a Bread prediction appears in the Replicate dashboard with the stored `replicate_prediction_id`
- With the flag off, the job stays `queued` and no Replicate call is made
- A POST to `/start` without the correct bearer returns 401

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Pipeline completion — Edge Function `/callback`

### Overview

Handle Replicate's completion webhook: verify, store the result, and flip the job terminal. End state: a finished prediction yields a `succeeded` job with a result object in the bucket (or `failed` with error fields).

### Changes Required:

#### 1. Edge Function `/callback` route

**File**: `supabase/functions/enhance/index.ts` (extend)

**Intent**: Receive Replicate's `completed` webhook, verify its signature, and finalize the job: on success download the output image and upload it as the result, then `markJobSucceeded`; on failure `markJobFailed`.

**Contract**: `/callback`: read the **raw body**, verify via `validateWebhook(request, REPLICATE_WEBHOOK_SIGNING_SECRET)` (401 on invalid); parse payload `{ id, status, output, error }`. **Map to the job by `jobId` from the callback query string** (`?jobId=…`, set by `/start`) for a direct `getJobById` lookup, **and verify** the payload's prediction `id` matches the row's stored `replicate_prediction_id` (reject/ignore on mismatch — integrity check). On `status==="succeeded"`: `fetch(output)` → upload bytes to `photos` at `{uid}/{jobId}/result.{ext}` (service-role) → `markJobSucceeded({ jobId, resultPath, replicatePredictionId })` (deletes source). On `status==="failed"`: `markJobFailed({ jobId, errorCode: "replicate_failed", errorMessage })`. Always return 200 to Replicate (idempotent; it retries on non-2xx). Determine the result extension from the source/output content-type.

### Success Criteria:

#### Automated Verification:

- Unit test passes: `npx vitest run tests/replicate-webhook.test.ts` — signature-verify + payload→action mapping on extracted pure logic (valid/invalid sig, succeeded vs failed)
- Edge Function still serves locally: `npx supabase functions serve enhance` boots

#### Manual Verification:

- A real Bread completion calls back, the job flips to `succeeded`, `result_path` is set, the result object exists at `{uid}/{jobId}/result.{ext}`, and the source object is deleted
- A forced/failed prediction flips the job to `failed` with `error_code`/`error_message`
- A callback with an invalid signature returns 401 and does not mutate the job
- End-to-end (no client yet): S-03 submit → row reaches `succeeded` with a result object, within the latency budget

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Realtime subscription plumbing

### Overview

Give the browser a JWT-authenticated Realtime subscription to its own job and surface raw status transitions — without the polished result render yet. End state: on a job completing, the workspace observably reacts to the pushed `succeeded`/`failed` event (minimal UI state / debug).

### Changes Required:

#### 1. Expose client Supabase config + the user JWT to the island

**File**: `src/pages/index.astro`, `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: Pass the browser the three things it needs to subscribe: Supabase URL, anon key, and the user's access token — as island props (one seam, alongside the existing `isAuthenticated`).

**Contract**: `index.astro` frontmatter builds the SSR client and calls `supabase.auth.getSession()` to read `session.access_token`; passes `supabaseUrl`, `supabaseAnonKey` (resolved from `astro:env/server`), and `accessToken` (only when signed in) as props. `EnhanceWorkspace` accepts them and forwards to the cloud hook. The anon key is publishable (RLS-gated); the access token is a short-lived user JWT.

#### 2. Browser Supabase client + subscription hook

**File**: `src/lib/supabase-browser.ts` (new), `src/components/hooks/useCloudJob.ts` (new), `src/components/hooks/useCloudSubmit.ts` (capture `jobId`)

**Intent**: A browser `@supabase/supabase-js` client factory and a hook that subscribes to the user's job row and exposes its live status. Capture the `jobId` that `submitCloudJob` already returns (currently discarded).

**Contract**: `createBrowserClient(url, anonKey)` → plain supabase-js client (NOT `@supabase/ssr`). `useCloudJob({ url, anonKey, accessToken, jobId })`: on a non-null `jobId`, `await client.realtime.setAuth(accessToken)` (lesson #3) **before** `.channel(...).on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: \`id=eq.${jobId}\` }, cb).subscribe()`; expose `{ status, resultPath, errorMessage }` from `payload.new`. Cleanup: `channel.unsubscribe()` on unmount and on `reset()` (the leaky resource analogous to `useLocalEnhance`'s object URLs; `handleReset` already calls `cloudSubmit.reset()`). `useCloudSubmit` stores + exposes `jobId` from `submitCloudJob`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes on touched files
- Build succeeds: `npm run build`

#### Manual Verification:

- Signed-in submit under `npm run dev` (pipeline flag on, local stack running): the workspace observably transitions when the job reaches `succeeded`/`failed` (e.g. a status line / console) — proving the JWT-scoped subscription receives the event
- The channel unsubscribes on Start-over and on unmount (no duplicate handlers on resubmit; verify via logging)
- An anonymous/edge case (no access token) does not attempt to subscribe

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Result render + failure UX

### Overview

Turn the pushed event into the finished experience: render the result in the before/after slider with download, show the processing/error states, and add the client watchdog + mark-failed route so a stuck job always resolves to a visible outcome.

### Changes Required:

#### 1. Result render (URL → slider + download)

**File**: `src/components/hooks/useCloudJob.ts` (extend), `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: On `succeeded`, mint a signed read URL for `result_path`, decode it for the slider's required dimensions, fetch it as a Blob for download, and render via the existing components — replacing the "submitted"/"Enhancing…" state.

**Contract**: On `succeeded`: `client.storage.from("photos").createSignedUrl(resultPath, 300)` → `afterUrl`; decode dimensions (`new Image()` → `naturalWidth/Height`, `useLocalEnhance.ts:22-33` pattern); `fetch(afterUrl).then(r => r.blob())` for `DownloadButton`; build filename via `deriveDownloadName()`. `EnhanceWorkspace` renders `<BeforeAfterSlider beforeSrc={sourceUrl} afterSrc={afterUrl} width height />` + `<DownloadButton blob filename />`, mirroring the Local `done` branch and reusing `sourceUrl` already held in workspace state. Re-mint the read URL on demand if it expires.

#### 2. Processing + failure UX

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: Replace S-03's static "Submitted" cloud terminal with: a processing spinner ("Enhancing in the cloud…") after submit; the slider+download on success; the existing red error line + Try-again (re-submit) + Start-over on failure/timeout. Render gates on engine + auth + the cloud job status (preserve the F6 state-reset discipline from S-03).

**Contract**: Extend the cloud branch state machine: `submitting`→`processing` (spinner) → `succeeded` (slider/download) | `failed` (error + Try again/Start over). Try again re-runs the S-03 submit (fresh job). Keep the per-engine render gating so a stale local/cloud result never crosses.

#### 3. Client watchdog + mark-failed route

**File**: `src/components/hooks/useCloudJob.ts` (timer), `src/pages/api/enhance/cloud/timeout.ts` (new)

**Intent**: If no terminal event arrives within ~60s, the browser flips its own still-pending job to `failed` so the user always sees an outcome (the pre-mortem's silent-stall fix), then shows the error.

**Contract**: `useCloudJob` starts a ~60s timer on subscribe; on expiry without a terminal event, `POST /api/enhance/cloud/timeout { jobId }`. The route (CLAUDE.md JSON conventions: `prerender=false`, zod body, `{ error: { code, message } }`) authenticates via `context.locals.user`, builds the admin client, and calls **`markPendingJobFailedForOwner(admin, { jobId, userId: user.id, errorCode: "timeout", errorMessage })`** (the single atomic guarded update from Phase 1 §1 — F3). The helper's boolean return distinguishes "flipped to failed" from "already terminal" (a Replicate success that landed first is left untouched — no race). Returns 200 either way; the client shows the timeout error only when its own subscription hasn't already delivered a terminal event.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build succeeds: `npm run build`
- Linting passes on touched files
- Unit tests pass: `npx vitest run tests/cloud-job-render.test.ts` — the result-URL→Blob + dimension-decode adapter logic (mocked fetch/Image); existing tests still green

#### Manual Verification:

- **Happy path:** signed-in submit → "Enhancing…" → before/after slider + working download appears via Realtime, no refresh, within the latency budget
- **Failure:** a forced pipeline failure shows the error line + Try again/Start over; Try again starts a fresh job
- **Timeout:** with the callback suppressed, the job flips to `failed` after ~60s and the user sees the timeout error (route rejects if not owner / already terminal)
- **No-bypass / gating:** anonymous users never subscribe; Local flow + HEIC reject unchanged
- **Dev + workerd parity:** full flow under `npm run dev` and `npm run build && npx wrangler dev` (Lesson #6)

**Implementation Note**: Final phase — after automated checks pass, pause for manual confirmation, then the cross-phase manual rollup.

---

## Testing Strategy

### Unit Tests:

- `photo-job.service` new helpers — correct update payloads / lookups (mocked admin client).
- `bread.ts` — `buildBreadInput` mapping + pinned version.
- Replicate webhook — signature verify + payload→action mapping (extracted pure logic; valid/invalid sig, succeeded/failed).
- Cloud-job render adapters — result-URL→Blob + dimension decode (mocked `fetch`/`Image`).

### Integration Tests:

- None automated (Deno Edge Function + external Replicate + Realtime). Covered by manual E2E against the local stack.

### Manual Testing Steps:

1. `supabase start`; set Edge Function secrets (`REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET`, `DB_WEBHOOK_SECRET`, `CLOUD_PIPELINE_ENABLED=true`); `supabase functions serve enhance`; `npm run dev`.
2. Sign in, submit a low-light JPG via Cloud → watch `queued→processing→succeeded` (Studio) and the slider appear in-page via Realtime.
3. Verify result object at `{uid}/{jobId}/result.{ext}` + source deleted.
4. Force a failure (bad input / invalid token) → job `failed` → error UX.
5. Suppress the callback → ~60s watchdog → `failed` + timeout error.
6. Re-run under `npm run build && npx wrangler dev`.

## Performance Considerations

Bread ≈3s warm on a T4; ample headroom under ≤30s p95 (Phase 0 confirms cold-start). pg_net DB webhook is async (doesn't block the insert). Bytes flow browser→Supabase and Replicate→Edge Function→Supabase; the Cloudflare Worker never proxies image bytes. Signed-read TTLs short (~300s), re-mint on demand.

## Migration Notes

One new migration (the `queued` Database Webhook trigger). No changes to the `jobs`/storage schema (F-01 covers it). New runtime surfaces: a Supabase Edge Function + its secret store (separate from Worker secrets). Pipeline ships behind `CLOUD_PIPELINE_ENABLED` (OFF in prod until S-05).

## References

- Research: `context/changes/cloud-ai-realtime-result/research.md`
- F-01 contract: `src/lib/services/photo-job.service.ts:66-98` (`markJobSucceeded`); `supabase/migrations/20260528120000_create_jobs_table.sql`
- S-03 client seam: `src/components/hooks/useCloudSubmit.ts`, `src/components/enhance/EnhanceWorkspace.tsx:172-184`
- Realtime precedent: `scripts/f01-smoke.ts:60-93` (subscribe + setAuth + unsubscribe)
- Lessons: `context/foundation/lessons.md` (#2 replica identity, #3 realtime.setAuth, #4 admin-client env-param, #5 CRLF, #6 workerd parity)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 0: Bread de-risking spike

#### Automated

- [x] 0.1 Spike script runs and prints latency + output URL — 3d5a7fd

#### Manual

- [x] 0.2 Warm < 30s; cold/idle latency recorded with go/no-go on ≤30s p95 — 3d5a7fd
- [x] 0.3 Color JPG in → usable color image out — 3d5a7fd
- [x] 0.4 spike-findings.md records version hash, gamma/strength defaults, SLA verdict — 3d5a7fd

### Phase 1: Service-layer groundwork

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — 03a05d5
- [x] 1.2 Linting passes on touched files — 03a05d5
- [x] 1.3 Unit tests pass: helpers payloads + `buildBreadInput` mapping/version — 03a05d5

#### Manual

- [x] 1.4 Flag + secret placeholders in `.env.example`; `verify_jwt = false` in config.toml — 03a05d5
- [x] 1.5 `npm run build` succeeds — 03a05d5

### Phase 2: Pipeline kickoff — Edge Function /start + DB webhook

#### Automated

- [x] 2.1 Migration applies cleanly against local Supabase — 9d890e4
- [x] 2.2 Edge Function serves locally (`supabase functions serve enhance`) — `deno.json` import map resolves shared helpers — 9d890e4

#### Manual

- [x] 2.3 Flag on: inserting a `queued` job → `processing` + Bread prediction created with stored `replicate_prediction_id` — 9d890e4
- [x] 2.4 Flag off: job stays `queued`, no Replicate call — 9d890e4
- [x] 2.5 `/start` without the correct bearer returns 401 — 9d890e4

### Phase 3: Pipeline completion — Edge Function /callback

#### Automated

- [ ] 3.1 Unit test: signature-verify + payload→action mapping (valid/invalid, succeeded/failed)
- [ ] 3.2 Edge Function still serves locally

#### Manual

- [ ] 3.3 Real completion → job `succeeded`, `result_path` set, result object exists, source deleted
- [ ] 3.4 Forced failure → job `failed` with `error_code`/`error_message`
- [ ] 3.5 Invalid signature → 401, no mutation
- [ ] 3.6 End-to-end (no client): submit → row `succeeded` with result object within budget

### Phase 4: Realtime subscription plumbing

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes on touched files
- [ ] 4.3 Build succeeds: `npm run build`

#### Manual

- [ ] 4.4 Signed-in submit: workspace observably transitions on the pushed `succeeded`/`failed` event (JWT-scoped subscription receives it)
- [ ] 4.5 Channel unsubscribes on Start-over + unmount (no duplicate handlers)
- [ ] 4.6 No access token → no subscription attempt

### Phase 5: Result render + failure UX

#### Automated

- [ ] 5.1 Type checking passes: `npx astro check`
- [ ] 5.2 Build succeeds: `npm run build`
- [ ] 5.3 Linting passes on touched files
- [ ] 5.4 Unit tests pass: result-URL→Blob + dimension-decode adapters; existing tests green

#### Manual

- [ ] 5.5 Happy path: submit → "Enhancing…" → before/after slider + download via Realtime, no refresh, within budget
- [ ] 5.6 Failure: forced failure → error line + Try again/Start over; Try again starts a fresh job
- [ ] 5.7 Timeout: callback suppressed → ~60s watchdog → `failed` + timeout error (route rejects non-owner / already-terminal)
- [ ] 5.8 Anonymous never subscribes; Local flow + HEIC reject unchanged
- [ ] 5.9 Full flow works under `npm run dev` and `npm run build && npx wrangler dev`
