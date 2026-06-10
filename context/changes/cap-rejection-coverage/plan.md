# Risk #3 — Cloud Daily-Cap Route Rejection Coverage Implementation Plan

## Overview

Prove that the cloud create-job route **rejects an over-cap submission at the route
boundary** — HTTP 429, `error.code = "daily_cap_reached"`, the exact user-facing message, and
**before any insert / signed-URL / Replicate work**. Today this guardrail (PRD FR-014, the live
`CLOUD_DAILY_CAP=3` cost protection) is verified **manually only**, because `create-job.ts` imports
`astro:env/server` and cannot load under Vitest (Lesson #4).

The plan unblocks the test by extracting an **env-free handler core** (option (a) from
`research.md` Open Questions #1), then pins the boundary with a **hermetic** test that stubs the
admin client. This is the Risk #3 slice of `test-plan.md §3` Phase 2.

## Current State Analysis

- **Route** `src/pages/api/enhance/cloud/create-job.ts:31–107` does, in order: auth (401) → body
  parse (400) → zod (400) → env presence (500) → build admin → `sweepStalePendingJobsForOwner`
  (non-fatal) → **cap guard** (`create-job.ts:84`, 429) → `createPhotoJob` insert (`:96`) → 200.
  The cap check provably precedes the insert; there is no re-check/lock between them.
- **The cap is app-level, not DB-enforced.** Exhaustive grep of `supabase/migrations/` shows no
  trigger/RPC/CHECK that counts or blocks (`research.md` §"No SQL-level cap enforcement"). So the
  count is just a number the route compares — a stub client cannot "lie" about a DB constraint here.
- **The two "mirror" pieces are already covered:** `isOverDailyCap` (unit,
  `tests/photo-job.service.test.ts:10–26`) and the `countCloudJobsToday` row/date predicate
  (integration, `tests/jobs.rls.test.ts:268–332`). **No test loads `create-job.ts` or asserts the
  429 rejection at the route.** That wiring is the only new signal.
- **The concurrent-insert race is out of scope** — a deliberately accepted v1 overrun
  (`context/archive/2026-06-03-cloud-daily-cap/change.md:21`). The test asserts the deterministic
  boundary + reject-before-insert, not atomicity.
- **Precedent for env-free factoring** already exists: `src/lib/supabase-admin.ts:29` takes env as a
  parameter precisely so tests can load it under Node without `astro:env/server`; `isOverDailyCap`
  is already env-free for the same reason.

## Desired End State

A new env-free module owns the create-job request→response logic and is exercised by a hermetic
Vitest test that fails if any of these regress: the over-cap 429 contract, the reject-**before**-insert
ordering, the route-level boundary (off-by-one), or the `cap=0` kill-switch. `create-job.ts` becomes
a thin `astro:env/server` wrapper with identical runtime behavior. `npm run test:unit` (no Docker)
covers the new test; the full suite + build stay green. `test-plan.md §6` records the recipe.

### Key Discoveries:

- Cap guard at `create-job.ts:84`; insert at `:96` — no lock between (`research.md` §"The route rejection boundary").
- 429 contract to assert verbatim: code `daily_cap_reached`, message `"The daily Cloud AI limit has been reached. Please try again tomorrow."`, envelope `{ error: { code, message } }`, **no `status` field** (`research.md` §"The over-cap rejection contract"; CLAUDE.md).
- 429 is a **documented exception** to CLAUDE.md's "400/500 only" rule (`astro.config.mjs:26–27`) — pin to 429, not 400.
- `isOverDailyCap(count, cap) => count >= cap` (`photo-job.service.ts:135`): `cap` allows exactly `cap` jobs, rejects the `(cap+1)`th; `cap=0` rejects the first (kill-switch).
- Unit-test runner excludes the Docker suite: `npm run test:unit` (`test-plan.md §6.1`); the new file is a plain unit/hermetic test under `tests/`.

## What We're NOT Doing

- **No integration test** for this slice — the count predicate is already integration-covered in
  `jobs.rls.test.ts`; re-running real SQL through the route adds no new signal (decision: hermetic).
- **No concurrent-atomicity / race assertion** — explicitly accepted overrun (out of scope).
- **No doc-drift fix** — the stale "20 ops/user/24h" phrasing in `CLAUDE.md`, `idea-notes.md:15`,
  and the migration index comment (`research.md` Open Questions #2) is left for a follow-up
  (decision: test-only scope).
- **No change to cap behavior, the count predicate, or the 429 contract** — this is regression
  coverage on shipped behavior, not a feature change.
- **No e2e / HTTP-driven route test** — that overlaps `test-plan.md` Phase 4.

## Implementation Approach

Extract the env-coupled bits (reading `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
`CLOUD_DAILY_CAP` from `astro:env/server`, building the admin client) into a thin wrapper that stays
in `create-job.ts`. Move the request→response logic into a new env-free module in `src/lib/services/`
that receives `{ user, request, admin, cap }` and returns a `Response`. Because the new module never
imports `astro:env/server`, Vitest can load it under Node. A stub admin client (the count query
resolves to a controlled `N`; `insert` and `createSignedUploadUrl` are spies) then lets the test
assert both the response contract and the absence of side-effects on the over-cap path.

## Critical Implementation Details

**State sequencing (load-bearing).** The whole point of Risk #3 is that the cap check happens
*before* the insert and signed-URL mint. The hermetic test must therefore assert not just the 429
body but that the insert spy and the `createSignedUploadUrl` spy were **never called** on the
over-cap path — a reordering bug (insert-then-check) would still return 429 but would leak a row and
a signed URL, and only the not-called assertion catches it.

## Phase 1: Extract env-free handler core

### Overview

Refactor `create-job.ts` into a thin `astro:env/server` wrapper delegating to a new env-free core,
with byte-identical runtime behavior. No test logic yet.

### Changes Required:

#### 1. New env-free handler module

**File**: `src/lib/services/cloud-create-job.handler.ts` (new)

**Intent**: Own the full create-job request→response logic, free of any `astro:env/server` import, so
Vitest can load it under Node. Carries the auth/parse/zod/sweep/cap/insert sequence and the `json`
envelope helper currently inline in the route.

**Contract**: Export `createCloudJobResponse(input): Promise<Response>` where
`input = { user: { id: string } | null; request: Request; admin: SupabaseClient; cap: number }`.
Branch order and responses identical to today's route: `!user` → 401 `unauthorized`; bad JSON → 400
`invalid_body`; zod fail → 400 `invalid_body`; then inside a try: best-effort
`sweepStalePendingJobsForOwner(admin, user.id)` (non-fatal), then
`if (isOverDailyCap(await countCloudJobsToday(admin), cap))` → 429 `daily_cap_reached` with the exact
message and no `status` field; else `createPhotoJob(admin, …)` → 200 `CreatePhotoJobResponse`; outer
catch → 500 `internal_error`. The `json(body, status)` helper moves here (or to a shared util).

#### 2. Thin route wrapper

**File**: `src/pages/api/enhance/cloud/create-job.ts`

**Intent**: Reduce the route to the env-coupled shell: read the three `astro:env/server` values, keep
the env-presence 500 guard, build the admin client, and delegate to `createCloudJobResponse`.

**Contract**: Keeps `export const prerender = false` and `export const POST: APIRoute`. Still imports
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUD_DAILY_CAP` from `astro:env/server` and
`createAdminClient`. The env-presence check (missing url/key → 500 `internal_error`) stays in the
wrapper. Calls `createCloudJobResponse({ user: context.locals.user, request: context.request, admin, cap: CLOUD_DAILY_CAP })`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (Astro `astro check`/tsc via build) or `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Existing test suite still green: `npm run test:unit`
- Production build succeeds: `npm run build`

#### Manual Verification:

- The cloud create-job route still works end-to-end against local infra (signed-in submit → 200 with
  `uploadUrl`/`uploadToken`; over-cap submit → 429 with the cap message) — the wrapper behaves
  identically to before the refactor.

**Implementation Note**: After Phase 1's automated checks pass, pause for manual confirmation that
the route still serves correctly before starting Phase 2.

---

## Phase 2: Hermetic route-boundary tests

### Overview

Add the regression coverage: a hermetic test that drives `createCloudJobResponse` with a stub admin
client and asserts the boundary set.

### Changes Required:

#### 1. New hermetic test file

**File**: `tests/cloud-create-job.handler.test.ts` (new)

**Intent**: Pin the route-level over-cap rejection contract and the reject-before-insert ordering
without loading `astro:env/server` and without real infra.

**Contract**: A stub admin client whose `from(table)` returns a thenable query builder — the count
query (`select(...).gte(...).or(...)`) resolves to `{ count: N, error: null }`; the sweep
select chain resolves to `{ data: [], error: null }` (sweep is internally fail-safe, so a no-op is
fine); `insert` is a `vi.fn()` spy returning `{ error: null }`. `storage.from(bucket)` exposes
`createSignedUploadUrl` as a `vi.fn()` returning `{ data: { signedUrl, token }, error: null }`.
Request bodies are real `Request` objects with a valid `{ fileExtension, mimeType }` JSON body.

Tests (boundary set):
- **Over-cap rejects with no side effects**: `N = cap`, `cap = 3` → 429; body `error.code === "daily_cap_reached"`, exact message, **no `status` key** in the parsed body; **insert spy not called** and **createSignedUploadUrl spy not called**.
- **Above cap rejects**: `N = cap + 1` → 429.
- **Last slot proceeds**: `N = cap - 1` → 200; body matches `CreatePhotoJobResponse` shape (`jobId`, `uploadUrl`, `uploadToken`, `sourcePath`); insert + createSignedUploadUrl each called once.
- **`cap = 0` kill-switch**: `N = 0`, `cap = 0` → 429 on the first request; insert not called.

A short note in the file header records why this is hermetic (route wiring is the new signal; the
count predicate is already covered in `jobs.rls.test.ts`) — mirroring the rationale comment in
`tests/photo-job.service.test.ts:4–9`.

### Success Criteria:

#### Automated Verification:

- New tests pass: `npm run test:unit`
- Full suite stays green (no regressions): `npm run test:unit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Open the new test and confirm the over-cap case asserts **insert not called** (the reject-before-insert guard), not merely the 429 status — a status-only assertion would miss an insert-then-check reordering.

**Implementation Note**: Optionally run Stryker narrowed to the handler to confirm the new tests
kill the cap-guard mutants surfaced on `photo-job.service.ts` — `npx stryker run --mutate "src/lib/services/cloud-create-job.handler.ts"`. Review survived mutants per CLAUDE.md (don't chase 100%).

---

## Phase 3: Cookbook + status sync

### Overview

Record the pattern so the next phase reuses it, and reflect that the Risk #3 slice has shipped.

### Changes Required:

#### 1. Cookbook recipe

**File**: `context/foundation/test-plan.md`

**Intent**: Fill in the §6.4 ("new API endpoint") TBD with the env-free-core + hermetic-stub-admin
pattern this change established, and add a §6.6 per-phase note.

**Contract**: §6.4 gains a concrete recipe: extract an env-free `createCloudJobResponse`-style core
from any route that imports `astro:env/server`; test route wiring hermetically with a stub admin
(asserting side-effect absence), reserving real-Supabase integration for rules that depend on actual
DB state. §6.6 gains a 2–3 line note for the Risk #3 slice. Reference test:
`tests/cloud-create-job.handler.test.ts`.

#### 2. Change status

**File**: `context/changes/cap-rejection-coverage/change.md`

**Intent**: Reflect completion of the Risk #3 slice.

**Contract**: Set `status: done` (or `implemented`) and `updated:` to the implementation date once
Phases 1–2 land and are verified.

### Success Criteria:

#### Automated Verification:

- Docs reference an existing file: `tests/cloud-create-job.handler.test.ts` exists.

#### Manual Verification:

- `test-plan.md §6.4`/§6.6 read accurately and point a future agent at the new test; `change.md`
  status reflects reality.

---

## Testing Strategy

### Unit Tests (hermetic):

- `createCloudJobResponse` over-cap → 429 + exact contract + no insert / no signed-URL (the core regression).
- Above-cap → 429; last-slot (`cap-1`) → 200; `cap=0` kill-switch → 429.

### Integration Tests:

- None added here. The count predicate's row/date scope is already integration-tested in
  `tests/jobs.rls.test.ts:268–332`; not duplicated.

### Manual Testing Steps:

1. Sign in, submit a cloud job under the cap → 200, upload proceeds.
2. With the cap reached (or `CLOUD_DAILY_CAP=0` locally) submit again → 429 with the cap message and
   no new `jobs` row / no signed URL minted.

## Performance Considerations

None. The refactor is behavior-preserving; the test is hermetic (no I/O).

## Migration Notes

No data or schema migration. Pure code refactor + new test + docs.

## References

- Related research: `context/changes/cap-rejection-coverage/research.md`
- Route under test: `src/pages/api/enhance/cloud/create-job.ts:31–107` (cap guard `:84`, insert `:96`)
- Service helpers: `src/lib/services/photo-job.service.ts:113–137` (`countCloudJobsToday`, `isOverDailyCap`)
- Env-free factory precedent: `src/lib/supabase-admin.ts:29`
- Existing unit/integration examples: `tests/photo-job.service.test.ts`, `tests/jobs.rls.test.ts`
- Risk row + guidance: `context/foundation/test-plan.md:53,77`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract env-free handler core

#### Automated

- [x] 1.1 Type checking passes (`npx tsc --noEmit` / `npm run build`) — 953a1b9
- [x] 1.2 Linting passes (`npm run lint`) — 953a1b9
- [x] 1.3 Existing test suite still green (`npm run test:unit`) — 953a1b9
- [x] 1.4 Production build succeeds (`npm run build`) — 953a1b9

#### Manual

- [x] 1.5 Cloud create-job route still works end-to-end (200 under cap, 429 over cap) — identical behavior — 953a1b9

### Phase 2: Hermetic route-boundary tests

#### Automated

- [x] 2.1 New tests pass (`npm run test:unit`)
- [x] 2.2 Full suite stays green (`npm run test:unit`)
- [x] 2.3 Linting passes (`npm run lint`)

#### Manual

- [x] 2.4 Over-cap case asserts insert-not-called (reject-before-insert), not status-only

### Phase 3: Cookbook + status sync

#### Automated

- [ ] 3.1 Docs reference an existing file (`tests/cloud-create-job.handler.test.ts` exists)

#### Manual

- [ ] 3.2 `test-plan.md §6.4`/§6.6 accurate; `change.md` status reflects reality
