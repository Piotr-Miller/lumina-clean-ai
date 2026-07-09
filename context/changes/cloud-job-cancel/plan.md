# Cloud Job Hard-Cancel Implementation Plan

## Overview

Give a signed-in user a way to **hard-cancel an in-flight Cloud AI job**: on demand, flip the job row to a terminal state, delete its orphaned `source.*` object, and stop the running Replicate prediction so paid compute halts. The affordance is folded into the existing mid-processing **"Start over"** button (which today only tears down the client subscription). This promotes the parked roadmap item _"Cancel in-flight cloud job on Start over (S-04)"_ into a post-MVP change — it increments the S-04 flow, it is not a new slice.

## Current State Analysis

- **No cancel path exists.** Mid-`processing`, the client "Start over" (`EnhanceWorkspace.tsx:242-258`, button `:504-507`) is **entirely client-side**: it nulls `cloudSubmit.jobId`, which tears down the `useCloudJob` Realtime subscription (`useCloudJob.ts:300-323`). No backend call is issued; the Replicate prediction runs to completion as an orphan (self-cleans its source via `markJobSucceeded`).
- **The client cannot mutate the row.** After `20260621185226_restrict_jobs_insert_to_service_role.sql`, an authenticated user has **SELECT-own only** on `jobs` (no UPDATE/DELETE policy, INSERT revoked). Any status flip must go through a service-role server route.
- **A near-perfect server template exists.** `POST /api/enhance/cloud/timeout` = thin env shell (`timeout.ts`) → env-free handler (`timeout.handler.ts`) → `markPendingJobFailedForOwner(admin, { jobId, userId, errorCode, errorMessage })`. That service fn (`photo-job.service.ts:328-355`) already does the **owner-scoped, guarded** (`.eq user_id`, `.in status [queued,processing]`) single-UPDATE flip to `failed` **and deletes the source** on a confirmed flip. It is parameterized by `errorCode` — so cancel needs **no new service function**.
- **The Replicate token lives ONLY in the Edge Function** (`enhance/index.ts:346`, Deno). The Astro Worker's env schema (`astro.config.mjs:71-108`) has no `REPLICATE_*`. So the Worker can flip the DB + delete the source (Supabase service-role) but **cannot call Replicate directly** — it must proxy to the Edge Function.
- **A cancel primitive already exists** in the Edge Function: `cancelReplicatePrediction(token, predictionId)` → `POST /v1/predictions/{id}/cancel`, best-effort (`enhance/index.ts:254-272`). Today it is only used to reap an unattached prediction in the `/start` catch.
- **The Edge routes are shared-secret sub-paths.** `/start`, `/callback`, `/reap` dispatch off `pathname.endsWith(...)` in `Deno.serve` (`enhance/index.ts:689-705`); `/reap` authenticates a `Bearer <DB_WEBHOOK_SECRET>` via `digestEquals` (`:674-687`). A `/cancel` sub-path follows the same shape.
- **Client knows `jobId`, not the prediction id.** `cloudSubmit.jobId` is available; `replicate_prediction_id` is server-only (`useCloudJob` never selects it). So the client sends `{ jobId }`; the Edge resolves the prediction id server-side.
- **Decision-helper pattern**: `cloud-job-decisions.ts` holds pure, Node-unit-tested predicates (`isTerminalStatus`, `shouldArmProcessingBudget`, …) consumed by `useCloudJob`, tested in `tests/cloud-job-decisions.test.ts`. A cancel-enablement predicate belongs here.

### Key Discoveries:

- `markPendingJobFailedForOwner` (`photo-job.service.ts:328-355`) is `errorCode`-parameterized and already deletes the source on flip → **reuse verbatim with `errorCode: "canceled"`**; no new service code.
- `timeout.handler.ts` is deliberately **env-free** (Lesson: server-only clients live in their own module) so Vitest drives it under Node with a real local Supabase — the cancel handler must preserve this (receive `admin` + Edge config as parameters, no `astro:env/server` import).
- Edge `/reap` auth (`enhance/index.ts:674-687`) is the exact pattern for `/cancel`'s shared-secret gate.
- Cloudflare Workers cancel background promises after the response is returned — the Astro route must **`await`** its best-effort Edge POST (bounded timeout), not fire-and-forget it, or the cancel is killed mid-flight.

## Desired End State

A signed-in user watching a `processing` cloud job clicks the (relabeled) cancel button and:

- The UI resets to the fresh upload screen **immediately** (optimistic — no "canceling…" state).
- The job row is flipped `failed` + `error_code: "canceled"` (owner-scoped, guarded), and its `source.*` object is deleted.
- The running Replicate prediction receives a cancel, halting compute (best-effort; the reaper + orphan-callback idempotency backstop any miss).
- A cancel that races a just-completed job is a silent no-op (guard leaves a `succeeded`/`failed` row untouched).

Verified by: new cancel-handler unit suite (auth/parse/owner-scope/flip), the Edge `/cancel` `deno check` + a local smoke, the decision-helper unit suite, the full existing E2E gate (unchanged), and a manual mid-processing cancel walkthrough confirming row state + source deletion + Replicate cancel.

## What We're NOT Doing

- **No `canceled` enum value** — reuse `failed` + `error_code: "canceled"` (the user never sees "failed"; the UI resets on cancel). Avoids a prod `ALTER TYPE` migration (which CI won't auto-apply) + TS/webhook fan-out.
- **No new service-layer function** — reuse `markPendingJobFailedForOwner` with `errorCode: "canceled"`.
- **No switched-away / `beforeunload` / `sendBeacon` cancel** — navigate-away/tab-close jobs stay covered by the existing 300s watchdog + hourly reaper. The switched-away gap stays open by decision.
- **No separate manual "purge temp bucket" ops button** — redundant with `retention-reaper`.
- **No "Canceling…" confirmation UI** — optimistic reset (fire-and-forget POST).
- **No new E2E spec** — the lean gate already covers the enhance/middleware path; cancel is covered by units + manual.
- **No client exposure of `replicate_prediction_id`** — the Edge resolves it from the row.
- **No `CLOUD_PIPELINE_ENABLED` gate on `/cancel`** — cancellation/cleanup must work even when the pipeline is paused (mirrors `/reap`).

## Implementation Approach

Three phases, vertical and independently landable:

1. **Server cancel route** — the DB/storage half. A new `POST /api/enhance/cloud/cancel` mirroring the `/timeout` shell+handler split, reusing `markPendingJobFailedForOwner` with `errorCode: "canceled"`. Fully unit-tested. Until Phase 2 it degrades gracefully to "flip + source-delete" (no compute kill).
2. **Edge `/cancel` sub-path** — the compute-kill half. A shared-secret Edge route that resolves `replicate_prediction_id` and calls the existing `cancelReplicatePrediction`; the Astro handler now `await`s a best-effort POST to it. Adds two Worker config values (`EDGE_FUNCTION_URL`, `DB_WEBHOOK_SECRET`).
3. **Client wiring** — fold cancel into the mid-processing button: a pure `shouldCancelInFlight` predicate, a thin best-effort `cancelCloudJob` POST, optimistic reset, relabel to "Cancel".

## Critical Implementation Details

- **Ordering**: flip the row terminal **first** (authoritative owner-scoped UPDATE), then attempt the Replicate cancel. A prediction that finishes anyway hits `/callback`, whose idempotency short-circuit no-ops on the already-terminal row — so double-terminalization is impossible.
- **Workers floating-promise**: the Astro route must `await` the best-effort Edge POST (with a bounded `AbortSignal.timeout`) before returning. A fire-and-forget fetch is cancelled when the Worker returns the response, silently skipping the compute kill.
- **Owner-scoping (IDOR lesson)**: cancel routes a client-supplied `jobId` — it MUST go through `markPendingJobFailedForOwner` (user_id-guarded in the same write), never an id-only service-role mutation.
- **Env-free handler (Lesson #4)**: the cancel handler takes `admin` and an optional Edge `{ url, secret }` as parameters; the route shell reads `astro:env/server`. Tests pass `edge: null` to exercise the DB half without a live Edge Function.

---

## Phase 1: Server Cancel Route (DB flip + source cleanup)

### Overview

A new owner-scoped `POST /api/enhance/cloud/cancel` that flips an in-flight job to `failed` + `error_code: "canceled"` and deletes its source, mirroring the `/timeout` route. No Replicate call yet; no UI yet.

### Changes Required:

#### 1. Cancel error copy

**File**: `src/lib/enhance-strings.ts`

**Intent**: Add the row-level cancel message so the handler's `error_message` write has a canonical source (i18n-ready), parallel to `cloudErrors.timeout`.

**Contract**: Add `cloudErrors.canceled` (e.g. "You canceled this job."). No consumer renders it (the UI resets on cancel) — it is the authoritative row copy for records/history.

#### 2. Env-free cancel handler

**File**: `src/lib/services/cancel.handler.ts` (new)

**Intent**: Own the auth → parse → zod → owner-scoped-flip request→response sequence for cancel, free of `astro:env/server` so Vitest drives it under Node (mirrors `timeout.handler.ts`).

**Contract**: Export `json(body, status)` (or import the shared one) and `cancelCloudJobResponse(input: { user: { id: string } | null; request: Request; admin: SupabaseClient; edge: { url: string; secret: string } | null })`. Sequence: `!user` → 401 `unauthorized`; non-JSON body → 400 `invalid_body`; zod `{ jobId: z.uuid() }` fail → 400 `invalid_body`; else `markPendingJobFailedForOwner(admin, { jobId, userId: user.id, errorCode: "canceled", errorMessage: STRINGS.cloudErrors.canceled })` → 200 `{ canceled: <boolean> }`; outer catch → 500 `internal_error`. The `edge` param is consumed in Phase 2 (Phase 1 passes/ignores it). Error envelope `{ error: { code, message } }`, no `status` in body.

#### 3. Thin route shell

**File**: `src/pages/api/enhance/cloud/cancel.ts` (new)

**Intent**: The env-coupled wrapper: read `astro:env/server`, guard env presence, build the admin client, delegate.

**Contract**: `export const prerender = false;` + `export const POST: APIRoute`. Read `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; missing → 500 `internal_error`. `createAdminClient(...)`; call `cancelCloudJobResponse({ user: context.locals.user, request: context.request, admin, edge: null })` (Phase 2 fills `edge`). Mirrors `timeout.ts` exactly.

#### 4. Handler tests — hermetic rejects + real-Supabase IDOR/flip proof

**Files**: `tests/cancel.handler.test.ts` (new, hermetic) + `tests/jobs.rls.test.ts` (new describe block)

**Intent**: Split by what each layer can honestly prove. A stub admin client cannot prove the RLS-bypassing `.eq("user_id")` guard has teeth — it stays green even against an id-only helper — so the load-bearing owner-scoping + persistence proof goes against a real local Supabase, mirroring the sibling `/timeout` route's IDOR block already in `jobs.rls.test.ts`. (The plan originally named a single hermetic file "against a real local Supabase"; corrected here per Phase 1 impl-review F1.)

**Contract**:

- `tests/cancel.handler.test.ts` (hermetic, runs under `test:unit`): anonymous → 401 (no DB touch); non-JSON / missing / non-uuid `jobId` → 400; an unexpected update error → 500 `internal_error` (no source delete); the canceled copy exists.
- `tests/jobs.rls.test.ts`, new describe `POST /api/enhance/cloud/cancel — cross-user IDOR + flip` (real local Supabase; runs under the CI `integration` job / `npm run test`, excluded from `test:unit`): user B supplying user A's `jobId` → 200 `{ canceled: false }` + A's row untouched; user A canceling their own `processing` job → 200 `{ canceled: true }` + row `failed`/`error_code:"canceled"`/`error_message` persisted + source deleted; an already-`succeeded` row → 200 `{ canceled: false }` + row unchanged. Pass `edge: null`.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run test:unit` passes — new hermetic `cancel.handler` suite green, existing suites untouched
- Integration cancel IDOR/flip block green: the new `jobs.rls.test.ts` describe passes under `npm run test` against a local Supabase (or the CI `integration` job); it is excluded from `test:unit`
- Lint clean on touched files (`npx prettier --write` + `npx eslint` on the new files — per the CRLF lesson, not repo-wide)

#### Manual Verification:

- (none — server-only phase, exercised by the hermetic unit suite + the real-Supabase integration block)

**Implementation Note**: No manual items; proceed to Phase 2 once automated checks pass.

---

## Phase 2: Edge `/cancel` Sub-path (true Replicate compute kill)

### Overview

Add a shared-secret `/cancel` route to the Edge Function that stops the Replicate prediction, and have the Astro cancel handler `await` a best-effort call to it. This is the half that requires the Replicate token (Edge-only).

### Changes Required:

#### 1. Edge `/cancel` route

**File**: `supabase/functions/enhance/index.ts`

**Intent**: Resolve a job's `replicate_prediction_id` under the service role and cancel the prediction, gated by the same shared secret as `/reap`.

**Contract**: Add `handleCancel(req)` mirroring `handleReap` (`:674-687`): require `DB_WEBHOOK_SECRET` (500 if unset); verify `Authorization` == `Bearer <secret>` via `digestEquals` (401 otherwise); parse `{ jobId }` from the body (400 on invalid). Build the admin client, read the row's `replicate_prediction_id`. If present AND `REPLICATE_API_TOKEN` is set, `await cancelReplicatePrediction(token, predictionId)` (existing best-effort primitive). Return 200 `{ canceled: <bool prediction-cancel-attempted> }`; a null prediction id (job still `queued`, no prediction yet) → 200 `{ canceled: false }`, not an error. Add the dispatch line to `Deno.serve` (`:689-705`): `POST … endsWith("/cancel") → handleCancel(req)`. Not gated on `CLOUD_PIPELINE_ENABLED` (mirror `/reap`).

#### 2. Astro handler fires the Edge cancel

**File**: `src/lib/services/cancel.handler.ts`

**Intent**: After a confirmed flip, best-effort-proxy the compute kill to the Edge Function (the only holder of the Replicate token).

**Contract**: When `edge` is non-null AND the flip returned `canceled: true`, `await fetch(`${edge.url}/cancel`, { method: POST, headers: { Authorization: `Bearer ${edge.secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(<bounded>) })` inside a try/catch that swallows failures (Sentry/`console.error` only). Awaited (Workers floating-promise rule), never fails the route. Response still `{ canceled }` from the DB flip.

#### 3. Route shell passes Edge config

**File**: `src/pages/api/enhance/cloud/cancel.ts`

**Intent**: Supply the Edge endpoint + shared secret from server env.

**Contract**: Add `EDGE_FUNCTION_URL` + `DB_WEBHOOK_SECRET` to the `astro:env/server` import and the astro.config.mjs `env.schema` (server-only secrets). Build `edge = EDGE_FUNCTION_URL && DB_WEBHOOK_SECRET ? { url: EDGE_FUNCTION_URL, secret: DB_WEBHOOK_SECRET } : null` and pass it. `null` (unconfigured) degrades to Phase-1 behavior.

#### 4. Handler test: Edge fire is best-effort

**File**: `tests/cancel.handler.test.ts`

**Intent**: Prove a failing/absent Edge call never changes the route outcome.

**Contract**: With a stub `edge` whose fetch rejects/times out, the response is still 200 `{ canceled: true }` and the row is still flipped. (Inject fetch or point `edge.url` at an unreachable host.)

### Success Criteria:

#### Automated Verification:

- `deno check supabase/functions/enhance/index.ts` passes (per the Deno-exclusion lesson; use the Supabase-bundled Deno if needed)
- `npm run typecheck` passes
- `npm run test:unit` passes (full suite, incl. the best-effort-Edge test)
- Lint clean on touched `src/` files

#### Manual Verification:

- `supabase functions serve enhance` + a probe: `POST …/enhance/cancel` with the right bearer + a real `processing` job's `{ jobId }` returns 200 and the Replicate prediction shows `canceled` (dashboard/`GET /v1/predictions/{id}`); a wrong/absent bearer → 401
- A job still `queued` (no prediction id) → 200 `{ canceled: false }`, no error

**Implementation Note**: After automated checks pass, pause for manual confirmation of the live Edge cancel before Phase 3. Requires the local stack + the seam env (test-plan §6.3 recipe).

---

## Phase 3: Client — fold cancel into the mid-processing button

### Overview

Wire the user-facing cancel: a pure enablement predicate, a best-effort client POST, optimistic reset, and a relabel of the processing-branch button.

### Changes Required:

#### 1. Cancel-enablement predicate

**File**: `src/components/hooks/cloud-job-decisions.ts`

**Intent**: The one decision the workspace gates the cancel behavior on, as a pure Node-testable predicate (matches the module's existing shape).

**Contract**: Export `shouldCancelInFlight(phase: CloudJobPhase, jobId: string | null): boolean` → `phase === "processing" && jobId !== null`. (A cancel fires the backend POST only for an in-flight job with a known id; every other branch keeps the pure client reset.)

#### 2. Best-effort cancel client

**File**: `src/lib/services/cloud-cancel.client.ts` (new)

**Intent**: Thin fire-and-forget POST to the cancel route, mirroring the `failByTimeout` fetch in `useCloudJob` (`:183-191`).

**Contract**: Export `cancelCloudJob(jobId: string): void` (or returning the promise) that `void fetch("/api/enhance/cloud/cancel", { method: POST, headers, body: JSON.stringify({ jobId }) }).catch(() => {})`. Best-effort: a failed POST leaves the row for the reaper (no user-visible error — the UI has already reset).

#### 3. Fold into the processing-branch button

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: The mid-processing "Start over" becomes a real cancel: fire the backend cancel for the in-flight job, then run the existing client reset. Other branches (succeeded/failed/pre-submit) keep plain `handleReset`.

**Contract**: Add `handleCancelInFlight()` — capture `const jobId = cloudSubmit.jobId` (before reset nulls it); if `shouldCancelInFlight(cloudPhase, jobId)` (with a `jobId !== null` type-narrow) then `cancelCloudJob(jobId)`; then call `handleReset()`. Wire the processing-branch button (`:504-507`) `onClick` to it. **Keep the E2E-frozen "Start over" label + icon** — user decision 2026-07-09: keep the familiar label and communicate the new behavior in the hint rather than renaming to "Cancel" (also preserves the E2E locator contract). Update `STRINGS.workspace.cloudSingleJobHint` to state that Start over **cancels the running cloud job AND deletes the uploaded photo** (keeping the honest "may still count toward the daily cap" caveat, since a job that reached the model still counts). Leave the succeeded (`:447-450`), failed (`:488-490`), and pre-submit (`:382-384`, `:403-405`, `:432-434`) buttons on `handleReset`. `useBeforeUnloadWarning` disarms automatically once `cloudPhase` leaves `processing` post-reset.

#### 4. Predicate unit tests

**File**: `tests/cloud-job-decisions.test.ts`

**Intent**: Cover `shouldCancelInFlight` in the existing suite's one-describe-per-function style.

**Contract**: `processing` + non-null jobId → true; `processing` + null jobId → false; each of `idle`/`succeeded`/`failed` (with any jobId) → false.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run test:unit` passes — new `shouldCancelInFlight` cases green
- Lint clean on touched files
- Full existing E2E gate green: `npm run test:e2e` (5 specs, no new ones — middleware/enhance path unchanged; run per test-plan §6.3 / e2e-local-run notes)

#### Manual Verification:

- Submit a cloud job; while `processing`, click **Cancel** → UI resets to the upload screen immediately; the `jobs` row is `failed` / `error_code: "canceled"`; the `source.*` object is gone (Storage); the Replicate prediction shows `canceled` (dashboard)
- Cancel a job still in the brief `queued` window → row flips, source deleted, no error (prediction id may be absent — Edge no-ops the compute cancel)
- Race check: let a job reach `succeeded` the instant before clicking Cancel → no crash, result still downloadable if not yet reset; the cancel is a silent no-op (`canceled: false`)
- Reset from succeeded/failed branches still behaves exactly as before (no backend call)

**Implementation Note**: After automated checks pass, pause for manual confirmation before archiving.

---

## Testing Strategy

### Unit Tests:

- `tests/cancel.handler.test.ts` — auth/parse/zod/owner-scope/flip + IDOR + already-terminal no-op + best-effort-Edge (Phase 2) against a real local Supabase (mirrors `tests/timeout.handler.test.ts`).
- `tests/cloud-job-decisions.test.ts` — `shouldCancelInFlight` truth table.

### Integration Tests:

- None new beyond the integration-backed handler suite. The Edge `/cancel` is validated by `deno check` + a local `supabase functions serve` smoke (no CI harness — the E2E gate stubs the cloud pipeline).

### Manual Testing Steps:

1. Mid-`processing` cancel: row → `failed`/`canceled`, source deleted, Replicate prediction `canceled`, UI reset.
2. `queued`-window cancel: flip + source delete succeed; Edge compute-cancel no-ops (no prediction id).
3. Success race: cancel just after `succeeded` → silent no-op, no crash.
4. Wrong/absent Edge bearer → 401 (Edge auth gate).
5. Non-processing branches: Start over / Choose another unchanged (no backend call).

## Performance Considerations

One guarded UPDATE + one storage delete per cancel (already the `/timeout` cost), plus one bounded, awaited Edge POST → one Replicate cancel call. No new hot path; cancels are rare and user-initiated.

## Migration Notes

- **No schema/data migration** (reuse of `failed` + `error_code` is the whole point).
- **Config (Phase 2)**: set two Worker runtime secrets — `EDGE_FUNCTION_URL` (public https Edge URL) and `DB_WEBHOOK_SECRET` (the existing shared secret the Edge already validates for `/reap`) — via `wrangler secret put`, and declare both in `astro.config.mjs` `env.schema`. Unset → the route degrades to Phase-1 DB-flip-only (no compute kill), never an error. Per the Worker-secrets lesson, set these against the live prod Worker + redeploy; CI does not sync runtime secrets.
- **Deploy**: merge to master deploys the Worker + Edge Function (migrations n/a here). Rollback = revert; a lingering unconfigured secret is inert.

## References

- Change identity & decisions: `context/changes/cloud-job-cancel/change.md`
- Server template: `src/pages/api/enhance/cloud/timeout.ts`, `src/lib/services/timeout.handler.ts`
- Owner-scoped flip (reused): `src/lib/services/photo-job.service.ts:328-355`
- Edge cancel primitive + `/reap` auth: `supabase/functions/enhance/index.ts:254-272`, `:674-705`
- Client teardown + timeout POST: `src/components/enhance/EnhanceWorkspace.tsx:242-258`, `src/components/hooks/useCloudJob.ts:178-192`
- Decision-helper pattern: `src/components/hooks/cloud-job-decisions.ts`, `tests/cloud-job-decisions.test.ts`
- Roadmap parked item promoted: `context/foundation/roadmap.md` ("Cancel in-flight cloud job on Start over (S-04)")
- Lessons applied: owner-scoped mutations (IDOR), env-free server modules (#4), Deno-exclusion `deno check`, Worker-secrets sequencing, Workers floating-promise.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server Cancel Route (DB flip + source cleanup)

#### Automated

- [x] 1.1 `npm run typecheck` passes — 33317ab
- [x] 1.2 `npm run test:unit` passes (new hermetic `cancel.handler` suite green, existing untouched) — 33317ab
- [x] 1.3 Lint clean on touched files — 33317ab
- [ ] 1.4 Integration cancel IDOR/flip block green (`jobs.rls.test.ts`, real local Supabase / CI `integration` job)

### Phase 2: Edge `/cancel` Sub-path (true Replicate compute kill)

#### Automated

- [x] 2.1 `deno check supabase/functions/enhance/index.ts` passes — 58a773a
- [x] 2.2 `npm run typecheck` passes — 58a773a
- [x] 2.3 `npm run test:unit` passes (full suite, incl. best-effort-Edge test) — 58a773a
- [x] 2.4 Lint clean on touched `src/` files — 58a773a

#### Manual

- [ ] 2.5 Live Edge `/cancel` smoke: correct bearer + real `processing` job → 200 + Replicate prediction `canceled`; wrong bearer → 401
- [ ] 2.6 `queued` job (no prediction id) → 200 `{ canceled: false }`, no error

### Phase 3: Client — fold cancel into the mid-processing button

#### Automated

- [x] 3.1 `npm run typecheck` passes — 85db0ae
- [x] 3.2 `npm run test:unit` passes (new `shouldCancelInFlight` cases green) — 85db0ae
- [x] 3.3 Lint clean on touched files — 85db0ae
- [ ] 3.4 Full existing E2E gate green (`npm run test:e2e`, 5 specs) — CI-verified (Docker down locally)

#### Manual

- [ ] 3.5 Mid-`processing` Cancel → UI resets, row `failed`/`canceled`, source deleted, Replicate prediction `canceled`
- [ ] 3.6 `queued`-window cancel → flip + source delete, no error
- [ ] 3.7 Success-race cancel → silent no-op, no crash
- [ ] 3.8 Succeeded/failed/pre-submit reset buttons unchanged (no backend call)
