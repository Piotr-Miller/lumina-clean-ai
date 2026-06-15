# API Authorization Test Gaps (Risk #2 + Risk #4) Implementation Plan

## Overview

Close the two remaining Phase-2 coverage gaps from the frozen test plan
(`context/foundation/test-plan.md` §3 Phase 2):

- **Risk #2 (cloud gate-bypass)** — prove an anonymous request to the cloud
  create-job API is rejected with 401 **before** any storage/insert side-effect.
- **Risk #4 (IDOR)** — prove an authenticated user B cannot advance user A's job
  by supplying A's `jobId` to the `timeout` route, with A's row provably
  unmutated — exercised at the **route-core boundary**, not just the helper.

Both are **regression-lock** changes: the production code is already correct.
The work pins that behavior with tests that have real teeth and locks the
invariants against future drift.

## Current State Analysis

- **Risk #2** — `POST /api/enhance/cloud/create-job` is a thin env-wrapper
  (`src/pages/api/enhance/cloud/create-job.ts`) over an env-free core
  `createCloudJobResponse` (`src/lib/services/cloud-create-job.handler.ts:60`).
  The auth guard is the **first statement** of the core (`:63-65`), before
  parse → cap → signed-URL → insert. A hermetic harness already exists
  (`tests/cloud-create-job.handler.test.ts`) with stub-admin `insert` /
  `createSignedUploadUrl` spies — but **every case passes `user: USER`**; only
  the cap (429) reject-before-insert path is asserted. No `user: null` case.
- **Risk #4** — `POST /api/enhance/cloud/timeout`
  (`src/pages/api/enhance/cloud/timeout.ts`) is the **only** user-facing route
  that accepts a client-supplied `jobId`. It is currently a **single-file
  route** (no extracted core) that reads `astro:env/server`, builds the admin
  client inline, and calls the owner-scoped `markPendingJobFailedForOwner`
  (`timeout.ts:61-69`) with `userId: user.id` from the session. A foreign
  `jobId` no-ops (returns 200 `{ flipped: false }`) because the owner filter is
  in the same atomic UPDATE. Coverage today is helper-level (mocked,
  `photo-job-helpers.test.ts`) and RLS-level (`jobs.rls.test.ts:64-85`) — but
  **nothing exercises the route's helper-selection wiring**.
- **Test harness** — `tests/jobs.rls.test.ts` is the canonical integration suite
  (real local Supabase via Docker): `createTestUser`/`deleteTestUser`
  (`tests/helpers/test-users.ts`) build user-scoped clients; `supabaseAdmin`
  (`tests/env.ts`) is the shared service-role client. It is excluded from
  `test:unit` (`package.json`) and from `vitest.config.stryker.ts`, and runs in
  the CI `integration` job. The retention-reaper change (#5) extended this same
  file — the precedent we follow.

## Desired End State

- `tests/cloud-create-job.handler.test.ts` has a case proving `user: null` →
  401 `unauthorized` with **both** side-effect spies `not.toHaveBeenCalled()`.
  `npm run test:unit` covers it (no Docker).
- `timeout.ts` is split into a thin env-wrapper + env-free
  `src/lib/services/timeout.handler.ts` core (mirroring create-job), and
  `tests/jobs.rls.test.ts` proves at the route-core boundary that a foreign
  `jobId` from user B leaves user A's row unmutated, with a positive control
  proving the owner's own call still flips. `npm test` (Docker) covers it.
- Both new guards are proven to have teeth by a documented one-off mutation
  (auth-guard deletion for #2; owner-filter removal for #4) that turns the new
  assertions RED, then is reverted.
- The test plan's §3 Phase 2 row and §6.4 "IDOR endpoint pattern: TBD" are
  updated to reflect the shipped coverage.

### Key Discoveries:

- The Risk #2 gate already lives in an env-free core — **no production change**
  for #2, just one new test case mirroring the shipped cap-path proof
  (`tests/cloud-create-job.handler.test.ts:80-96`).
- `markPendingJobFailedForOwner` enforces ownership in the write
  (`.eq("id", …).eq("user_id", cmd.userId)`, `photo-job.service.ts:285-287`) —
  service-role bypasses RLS, so only a **real row** proves the filter has teeth.
- The create-job refactor (`cloud-create-job.handler.ts` ← `create-job.ts`) is
  the exact pattern to mirror for `timeout.handler.ts`, including the deliberate
  divergence: the env-presence 500 guard moves to the wrapper, _before_ the
  core's auth/parse checks (only observable when env is unset = deploy
  misconfig; documented at `cloud-create-job.handler.ts:22-29`).
- The live `timeout` reject contract is a **silent 200 `{ flipped: false }`**,
  not 403/404 — the test asserts the real contract + no mutation.

## What We're NOT Doing

- **Not** changing any production authorization behavior. The `timeout` route
  refactor is a pure extract-core refactor with runtime parity on every
  reachable path (same divergence as create-job).
- **Not** changing the `timeout` reject contract to 403/404 — the silent no-op
  is the intended, more-correct behavior (does not leak foreign-jobId existence).
- **Not** running a full Stryker mutation pass as a success criterion. Teeth are
  proven by a targeted one-off mutation per guard (the shipped #3/#5
  discipline). (`/10x-impl-review` may still fire a scoped `stryker run` on the
  touched §4 risk module per CLAUDE.md — that is the reviewer's step, not a gate
  here.)
- **Not** adding an integration test for Risk #2 — the full-stack 401 is already
  E2E-covered (`tests/e2e/seed.spec.ts:57`); a hermetic case closes the unit gap.
- **Not** creating a new test file for #4 — extending `jobs.rls.test.ts` avoids
  keeping two exclude-globs (`test:unit`, stryker) in sync.

## Implementation Approach

Two independent phases, cheapest-signal-first. Phase 1 is a single hermetic test
case (no production code touched). Phase 2 is a mechanical extract-core refactor
of `timeout.ts` (mirroring the proven create-job split) plus a two-user
integration test added to the canonical RLS suite. Each phase proves its new
guard has teeth with a one-off mutation that must turn the new assertions RED.

## Critical Implementation Details

- **Windows lint baseline** — `npm run lint` reports ~1022 pre-existing Prettier
  CRLF errors repo-wide (lessons.md). Verify lint per-file:
  `npx prettier --write <touched>` then `npx eslint <touched>`. Do **not** run
  `npm run lint:fix` repo-wide.
- **`timeout.handler.ts` divergence** — when extracting, the env-presence 500
  guard moves to the wrapper _before_ the core's auth/parse, exactly as
  create-job does. Carry the same JSDoc note so the ordering change is recorded
  as deliberate (only changes status 500-vs-401/400 when env is unset).
- **Integration test placement** — the #4 cases go in `tests/jobs.rls.test.ts`
  (Docker-bound, already excluded from `test:unit` + Stryker). A new file would
  silently run under `test:unit` (no Docker) and fail on missing env.

## Phase 1: Risk #2 — Hermetic anon-gate case

### Overview

Add a `user: null` case to the existing hermetic handler test proving the auth
gate rejects before any side-effect. No production change.

### Changes Required:

#### 1. Hermetic anon-gate test case

**File**: `tests/cloud-create-job.handler.test.ts`

**Intent**: Prove `createCloudJobResponse` rejects an anonymous request
(`user: null`) with 401 `unauthorized` **before** any insert / signed-URL work —
the Risk #2 route-wiring signal that today only exists in slow E2E.

**Contract**: A new `it(...)` (its own `describe` or appended to the existing
block) that calls `createCloudJobResponse({ user: null, request:
jsonRequest(VALID_BODY), admin, cap })` using the existing `makeStubAdmin`
harness, and asserts: `res.status === 401`; body equals
`{ error: { code: "unauthorized", message: "Sign in to use Cloud AI." } }`;
`"status" in body === false` (CLAUDE.md envelope); and **both**
`insert` and `createSignedUploadUrl` spies `not.toHaveBeenCalled()`. The
`count`/`cap` values are irrelevant (gate precedes the cap check) — reuse
`makeStubAdmin(0)`.

#### 2. Teeth proof (one-off mutation, reverted)

**File**: `src/lib/services/cloud-create-job.handler.ts` (temporary, not committed)

**Intent**: Confirm the new assertions actually catch a missing auth gate, not a
vibe-test.

**Contract**: Temporarily delete/short-circuit the `if (!user) return … 401`
guard (`:63-65`) so an anonymous request falls through; run the new case and
confirm it goes **RED** (it will then either reach `user.id` and throw → caught
→ 500, or attempt the cap/insert path — either way `status !== 401` and/or the
not-called assertions fire). Revert immediately. Record the observed RED in the
Phase-1 completion note.

### Success Criteria:

#### Automated Verification:

- New anon-gate case passes: `npm run test:unit`
- Full hermetic suite still green: `npm run test:unit`
- Type check passes: `npx tsc --noEmit`
- Lint clean on the touched file: `npx prettier --write tests/cloud-create-job.handler.test.ts && npx eslint tests/cloud-create-job.handler.test.ts`

#### Manual Verification:

- Teeth proof performed: deleting the `if (!user)` guard turns the new case RED; reverted afterward (observed result recorded in Progress note).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Risk #4 — Extract `timeout.handler.ts` core + cross-user integration test

### Overview

Refactor `timeout.ts` into a thin env-wrapper over an env-free core (mirroring
create-job), then add two-user cross-user IDOR cases to the canonical
integration suite proving the route-core picks the owner-scoped helper.

### Changes Required:

#### 1. Extract the env-free core

**File**: `src/lib/services/timeout.handler.ts` (new)

**Intent**: Lift the full request→response logic of the timeout route into an
env-free core so Vitest can drive the route-boundary contract under Node
(Lesson #4), receiving the already-built admin client as a parameter.

**Contract**: Export `failTimedOutJobResponse(input: FailTimedOutJobInput):
Promise<Response>` where `FailTimedOutJobInput = { user: { id: string } | null;
request: Request; admin: SupabaseClient }`. Carries the existing sequence:
auth(401 `unauthorized`) → JSON-parse(400 `invalid_body`) → zod
`timeoutRequestSchema` (400 `invalid_body`) → `try { markPendingJobFailedForOwner(admin,
{ jobId, userId: user.id, errorCode: "timeout", errorMessage: "Cloud processing
took too long. Please try again." }) → json({ flipped }, 200) } catch → 500
internal_error`. `userId` comes from `input.user.id`, never the body. **Define+export its own
`json` helper locally** (mirroring `cloud-create-job.handler.ts:33` — do NOT
import json across handlers, which would couple two unrelated route modules); the
wrapper imports `json` from `timeout.handler.ts`. Carry the existing JSDoc
(owner-scoped/lesson rationale) + the env-presence divergence note.

#### 2. Reduce the route to a thin env-wrapper

**File**: `src/pages/api/enhance/cloud/timeout.ts`

**Intent**: Keep only the env-coupled shell; delegate logic to the core. Runtime
parity with the pre-refactor route on every configured-deployment path.

**Contract**: `export const prerender = false` + `export const POST: APIRoute`.
Body: env-presence 500 guard (`if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)`)
→ `createAdminClient({ url, serviceRoleKey })` → `return failTimedOutJobResponse({
user: context.locals.user, request: context.request, admin })`. Mirrors
`create-job.ts` exactly. The `markPendingJobFailedForOwner` import and
`timeoutRequestSchema` move to the core.

#### 3. Cross-user IDOR integration cases

**File**: `tests/jobs.rls.test.ts`

**Intent**: Prove at the route-core boundary that user B supplying user A's
`jobId` cannot advance/fail A's job, with a positive control proving the owner's
own call still flips — locking the route against a future swap to an id-only
helper.

**Contract**: A new `describe("POST /api/enhance/cloud/timeout — cross-user IDOR
(route boundary)")` **nested inside the existing `describe("public.jobs RLS +
photo-job service")`** so it reuses that block's `makeUser` / `created` array /
`afterEach` teardown (a sibling top-level describe would NOT share that teardown
and would leak test users + storage objects across runs). It imports
`failTimedOutJobResponse` from `@/lib/services/timeout.handler`. Per case use
`makeUser(...)` for A (and B),
admin-insert a `processing` job owned by A (reuse the `supabaseAdmin.from("jobs").insert`
pattern at `jobs.rls.test.ts:69-74`, capturing the inserted `id`), build a
`Request` with body `{ jobId: <A's id> }`, and call the core with `admin:
supabaseAdmin`:

- **IDOR (negative):** `failTimedOutJobResponse({ user: { id: B.id }, request,
admin: supabaseAdmin })` → `res.status === 200`, body `{ flipped: false }`;
  then admin re-reads A's row and asserts `status === "processing"` and
  `error_code` is null/unset (provably unmutated).
- **Owner (positive control):** same A-owned `processing` job, `user: { id:
  A.id }` → `{ flipped: true }`; admin re-read shows `status === "failed"`,
  `error_code === "timeout"`. (Proves the test isn't trivially green.)
  Clean up via the existing `created`/`deleteTestUser` afterEach (and the storage
  walk it already does); correlate strictly by the captured `jobId`.

> Note (expected, not a failure): the owner positive control flips a real row,
> so `markPendingJobFailedForOwner` calls `deleteJobSource(source_path)` on a
> path with no uploaded object. `bestEffortRemove` (`photo-job.service.ts:42-48`)
> swallows that with a `console.warn` and never throws — the test passes; the
> warn line is benign. (Optional: seed a tiny JPG at the path, mirroring
> `jobs.rls.test.ts:188-194`, to silence it.)

#### 4. Teeth proof (one-off mutation, reverted)

**File**: `src/lib/services/photo-job.service.ts` (temporary, not committed)

**Intent**: Confirm the IDOR negative case actually depends on the owner filter.

**Contract**: Temporarily remove the `.eq("user_id", cmd.userId)` clause from
`markPendingJobFailedForOwner` (`:285-287`); run the integration suite and
confirm the **negative** case goes RED (B's call now returns `{ flipped: true }`
and A's row flips to `failed`). Revert immediately. Record the observed RED in
the Phase-2 completion note.

#### 5. Refresh the test-plan status

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect the shipped coverage so the plan stops advertising the gap.

**Contract**: In §3 Phase 2 row, update the Status note (`#2+#4 → testing-api-authz-gaps`)
to record #2+#4 done; in §6.4 replace the "Remaining Phase-2 endpoint patterns
(gate-bypass, IDOR): TBD" line with the shipped references
(`cloud-create-job.handler.test.ts` anon case; `jobs.rls.test.ts` cross-user
timeout cases + `timeout.handler.ts` core); add a §6.6 per-phase note. (Mirrors
how #3 and #5 were recorded.)

### Success Criteria:

#### Automated Verification:

- Full integration suite passes (Docker): `npx supabase start` → `npx supabase db reset` → `npm test`
- New cross-user IDOR cases (negative + positive control) pass within the above run
- Existing create-job hermetic test still green: `npm run test:unit`
- Type check passes: `npx tsc --noEmit`
- Lint clean on touched files: `npx prettier --write src/lib/services/timeout.handler.ts src/pages/api/enhance/cloud/timeout.ts tests/jobs.rls.test.ts && npx eslint src/lib/services/timeout.handler.ts src/pages/api/enhance/cloud/timeout.ts tests/jobs.rls.test.ts`

#### Manual Verification:

- Teeth proof performed: removing the `.eq("user_id")` filter turns the IDOR negative case RED; reverted afterward (observed result recorded in Progress note).
- Route refactor parity: the timeout-path E2E still passes — `npm run test:e2e` (`tests/e2e/cloud-stall-surfaces-timeout.spec.ts`) — or, if not run, the parity is justified in the Progress note against the create-job precedent.
- `test-plan.md` §3/§6.4/§6.6 updated to reflect shipped coverage.

**Implementation Note**: After automated verification passes, pause for manual confirmation that the teeth proof and refactor parity were verified.

---

## Testing Strategy

### Unit Tests (hermetic):

- Risk #2: `createCloudJobResponse({ user: null, … })` → 401 `unauthorized`,
  `insert` + `createSignedUploadUrl` not called. Reuse `makeStubAdmin`.

### Integration Tests (real local Supabase):

- Risk #4 negative: B's call with A's `jobId` → 200 `{ flipped: false }`, A's
  row unmutated.
- Risk #4 positive control: A's call with own `jobId` → `{ flipped: true }`, row
  flipped to `failed`/`timeout`.

### Manual Testing Steps:

1. Phase 1 teeth: delete the `if (!user)` guard → run `npm run test:unit` →
   confirm RED → revert.
2. Phase 2 teeth: remove `.eq("user_id", cmd.userId)` → run `npm test` → confirm
   the IDOR negative case RED → revert.
3. Phase 2 parity: `npm run test:e2e` stall spec still green after the route
   refactor.

## Performance Considerations

None. Two test additions + a no-op-runtime refactor. The integration cases add
a few seconds to the already-Docker-bound `jobs.rls.test.ts` run.

## Migration Notes

None — no schema, data, or contract changes.

## References

- Related research: `context/changes/testing-api-authz-gaps/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risk Response #2/#4), §3 Phase 2, §6.4, §6.6
- Mirror pattern (create-job split): `src/lib/services/cloud-create-job.handler.ts` ← `src/pages/api/enhance/cloud/create-job.ts`
- Hermetic harness to extend: `tests/cloud-create-job.handler.test.ts:54-96`
- Integration harness to extend: `tests/jobs.rls.test.ts:45-85`; helpers `tests/helpers/test-users.ts`, `tests/env.ts`
- Owner-scoped helper under test: `src/lib/services/photo-job.service.ts:285-287`
- Lessons: "client-supplied jobId must route through owner-scoped mutations"; "server-only service-role clients live in their own module" (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Risk #2 — Hermetic anon-gate case

#### Automated

- [x] 1.1 New anon-gate case passes: `npm run test:unit` — fda8e99
- [x] 1.2 Full hermetic suite still green: `npm run test:unit` — fda8e99
- [x] 1.3 Type check passes: `npx tsc --noEmit` — fda8e99
- [x] 1.4 Lint clean on touched file (`prettier --write` + `eslint` on `tests/cloud-create-job.handler.test.ts`) — fda8e99

#### Manual

- [x] 1.5 Teeth proof: deleting the `if (!user)` guard turns the new case RED; reverted (result recorded) — fda8e99

### Phase 2: Risk #4 — Extract `timeout.handler.ts` core + cross-user integration test

#### Automated

- [x] 2.1 Full integration suite passes (Docker): `npx supabase start` → `npx supabase db reset` → `npm test`
- [x] 2.2 New cross-user IDOR cases (negative + positive control) pass
- [x] 2.3 Existing create-job hermetic test still green: `npm run test:unit`
- [x] 2.4 Type check passes: `npx tsc --noEmit`
- [x] 2.5 Lint clean on touched files (`prettier --write` + `eslint` on `timeout.handler.ts`, `timeout.ts`, `jobs.rls.test.ts`)

#### Manual

- [x] 2.6 Teeth proof: removing `.eq("user_id")` turns the IDOR negative case RED; reverted (result recorded)
- [x] 2.7 Route refactor parity: justified against the create-job extract-core precedent (pure runtime-parity refactor; 154 tests green; nothing imports the route but HTTP callers) — E2E stall spec not run
- [x] 2.8 `test-plan.md` §3/§6.4/§6.6 updated to reflect shipped coverage
