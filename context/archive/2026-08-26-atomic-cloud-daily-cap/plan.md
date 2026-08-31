# Atomic Global Cloud AI Daily Cap — Implementation Plan

> Revised 2026-08-28 after `reviews/plan-review.md` (verdict REVISE; 2 critical,
> 5 warnings, 1 observation). All eight findings were verified against the working
> tree and accepted. See § Review Response for what changed.

## Overview

FR-014 stands as a hard invariant (decided 2026-08-26, `frame.md` § Contract
Decision). The shipped admission path does not satisfy it: `countCloudJobsToday`
and the `jobs` insert are two separate operations, so `N` simultaneous
submissions at `count = cap - 1` all pass the same count and all insert. The
overshoot is `N - 1`, bounded by demand concurrency — which is precisely the
burst scenario the cap exists to defend against.

This plan moves admission into **one guarded database write**, proves it at the
concurrent boundary against a real Postgres, applies the migration to production
_before_ the calling code deploys, and corrects every live document whose claims
the change inverts.

## Current State Analysis

**The race, exactly.** `cloud-create-job.handler.ts:101-125` evaluates
`isOverDailyCap(await countCloudJobsToday(admin), cap)` and then calls
`createPhotoJob`, which mints a signed upload URL and inserts
(`photo-job.service.ts:89-110`). Nothing serializes the two. There is no trigger
and no CHECK constraint behind them.

**Why a conditional INSERT is not enough.** The obvious fix — `INSERT … SELECT …
WHERE (SELECT count(*) …) < cap` — does **not** close this under READ COMMITTED.
Two concurrent statements each read a snapshot that excludes the other's
uncommitted row, so both see `cap - 1` and both insert. The `claimJobForProcessing`
precedent works only because it guards on a **row that already exists**, where the
row lock does the serializing. A count-over-a-set guard has no such row, so it
needs explicit serialization.

**The repo already has the seam.** `public.stale_source_object_paths`
(`supabase/migrations/20260614120000_reaper_stale_source_paths.sql`) is a
`SECURITY DEFINER` / `set search_path = ''` function revoked from
`public`/`anon`/`authenticated` and granted `execute` to `service_role` only. That
**grant model** and header-comment style is the template for this migration — but
its security context is NOT: the reaper needs owner privileges because it reads
`storage.objects`, which `service_role` cannot reach. `public.jobs` is already
reachable by `service_role` (INSERT/SELECT + BYPASSRLS), so this function is
`SECURITY INVOKER`. (Corrected 2026-08-28 after `reviews/impl-review-phase-1.md`
F1; see § Review Response — Phase 1.)

**The oracle already has a shape.** `tests/jobs.rls.test.ts:381` ("allows exactly
one concurrent claim and one write-once prediction identity") is the concurrency
pattern; the cap-count block at `tests/jobs.rls.test.ts:440-505` establishes the
**baseline-delta** technique the global count forces on any test that asserts an
absolute number.

**Admission has exactly one entry point.** `createPhotoJob` is the only writer of
new `jobs` rows — the Edge Function only ever _updates_. Authenticated INSERT was
revoked in `20260621185226`, so there is no client path either. One function to
change — but **eleven typechecked call sites**, including two under `scripts/`.

**`scripts/` is inside the typecheck graph.** `tsconfig.json` includes `**/*` and
excludes only `dist`, `supabase/functions`, `packages/code-reviewer`,
`context/changes`, `context/archive`, `_worktrees`, `.stryker-tmp`. Any signature
change to `createPhotoJob` must therefore fix `scripts/f01-smoke.ts:116` and
`scripts/spikes/d1-live-submit.ts:67` or `npm run typecheck` fails.

**The index does not serve the count.** `jobs_user_id_created_at_idx` is
`user_id`-leading; the create-table migration says so in a comment and defers a
cap index to "v2". Today that is a latency footnote. Once the count runs inside a
lock it is on the critical path of every admission.

### Key Discoveries

- Race site: `src/lib/services/cloud-create-job.handler.ts:101-125` (count) →
  `src/lib/services/photo-job.service.ts:89-110` (insert).
- Guarded-write precedent: `photo-job.service.ts:224-247` (`claimJobForProcessing`)
  — a `null` return meaning "someone else won" is the established shape.
- RPC + grant precedent: `supabase/migrations/20260614120000_reaper_stale_source_paths.sql`.
- Concurrency-test precedent: `tests/jobs.rls.test.ts:381`; baseline-delta
  precedent: `tests/jobs.rls.test.ts:476`.
- **The warn seam needs both calls.** `captureWarning` defaults to `() => undefined`
  (`photo-job.service.ts:43`) and production wires it to `Sentry.captureMessage`
  (`sentry.server.config.ts:11`) — never the console. Every existing swallow site
  in the service calls `console.warn` **and** `captureWarning`; a `captureWarning`-only
  call is invisible locally.
- `gamma`/`strength` are `double precision` (`20260628190000_add_bread_params_to_jobs.sql`).
- `CLOUD_DAILY_CAP` is declared in `astro.config.mjs:127` as a server/secret
  `envField.number` with `default: 50` and **no `int`, no `min`, no `max`**. Astro's
  `envField.number` supports `int`, `min`, `max`, `gt`, `lt` (verified against the
  Astro docs), so the constraint is available and simply unused today.
- **Six live artifacts carry claims this inverts, not four.** Beyond the frame's
  table: `context/foundation/test-plan.md` §6.6's 2026-06-10 note says outright
  _"no trigger/RPC/CHECK in `supabase/migrations/`"_; `roadmap.md:152-164` records
  _"enforce in the create-job route (pre-insert COUNT)"_; `roadmap.md:329`
  (monetization) routes future per-user entitlements through `countCloudJobsToday`
  plus the handler guard; `context/mvp-check-report.md:31` and `:93` (EN and PL)
  both attribute the cap to `countCloudJobsToday()` and `isOverDailyCap()`. Two
  further passages — `roadmap.md:328` (Per-user rate limiting) and the S-05 body —
  still cite "a provider billing alert" that `production-config.md` §7 proved never
  existed.
- `production-config.md` §7 is **already written and verified** (2026-08-26): the
  Replicate self-service spend limit was deprecated 2025-07-01; prepaid credit
  $19.77 with auto-reload disabled is the actual (incidental) ceiling. Not a work
  phase — only a cross-reference refresh plus the new migration record.
- **`github-issues.md` has no #191 row to update.** The Final-mapping table ends at
  #182/#188; #191 appears only in the `## Status updates` log. The file's own note,
  and `AGENTS.md`'s archive-workflow extension, assign Status-cell and done-ledger
  updates to `/10x-archive`.

## Desired End State

A cloud submission that would exceed `CLOUD_DAILY_CAP` is rejected **no matter how
many requests arrive simultaneously**, because admission is a single database
statement that holds a lock across count-and-insert. Verified by: a real-Postgres
fan-out of 8 concurrent admissions at `cap - 1` producing exactly one inserted row;
the function present, `SECURITY INVOKER`, and executable by `service_role` alone in
`luminaclean-prod`; and no live document in the repository still describing the cap
as a soft, app-level, non-atomic guard.

## What We're NOT Doing

- **Not** adding per-user caps (explicitly v2 in the roadmap).
- **Not** moving the cap _value_ into the database — `CLOUD_DAILY_CAP` stays the
  single source of truth; the database owns atomicity, not policy.
- **Not** changing the user-facing contract: same 429, same `daily_cap_reached`
  code, same message string.
- **Not** retrying or queueing a race loser — it is rejected, exactly like any
  other over-cap request.
- **Not** changing `countCloudJobsToday`'s predicate or its semantics. The pre-model
  failure exclusion is preserved verbatim in SQL.
- **Not** introducing a counter table (would require decrement logic on every
  terminal path — a behavioural change, not a drop-in; see `frame.md`).
- **Not** adding a test-only synchronization barrier to the handler boundary
  (plan-review F3 Fix B) — production sequencing machinery in service of a test is
  a worse trade than naming honestly what each test proves.
- **Not** editing `context/archive/2026-06-09-cap-rejection-coverage/research.md`.
  Archives are immutable; it is superseded, never rewritten.
- **Not** closing #191, flipping the Backlog Handoff row, or writing the `## Done`
  ledger entry inside this plan — `/10x-archive` owns those (Phase 5).
- **Not** re-investigating the Replicate backstop — `production-config.md` §7
  settled it on 2026-08-26.

## Implementation Approach

A `SECURITY INVOKER` function `public.admit_cloud_job(...)` takes a
**transaction-scoped advisory lock**, re-counts today's billable jobs with the
existing predicate expressed directly in SQL, inserts the row if and only if the
count is under the cap, and returns a boolean. `createPhotoJob` calls it instead of
`.insert()` and returns `null` on rejection — the same shape
`claimJobForProcessing` already uses for "someone else won".

The cheap pre-check in the handler **stays**, explicitly labelled non-authoritative.
It preserves the PRD property that an over-cap request is rejected before any
storage or model work, and it keeps the existing Risk #3 assertions
(`createSignedUploadUrl` not called) meaningful. The guarded write is the gate; the
pre-check is an optimization. That distinction must be written into the code,
because "which check is load-bearing" going unstated is the exact drift class this
change exists to end.

## Critical Implementation Details

**The advisory lock must be transaction-scoped.** Use `pg_advisory_xact_lock`,
never `pg_advisory_lock`. PostgREST pools connections; a session-scoped lock would
outlive the request, leak into an unrelated later request on the same connection,
and eventually deadlock the pool. The xact-scoped variant is released at commit,
which is why it is safe under Supavisor transaction pooling.

**The function must fail closed on a bad cap.** `count >= NULL` evaluates to NULL,
and a plpgsql `IF NULL THEN` does not branch — so a null `p_cap` would fall through
to the insert and admit every request. Reject explicitly on `p_cap IS NULL` (and on
a negative cap) before the count. `CLOUD_DAILY_CAP` cannot be null through the app
today, but a function that admits paid work must not depend on its caller getting
the argument right.

**Two clocks, and only one is authoritative.** The JS pre-check derives the UTC day
start from the Worker's clock; the RPC derives it from the database clock. Within
milliseconds of UTC midnight they can disagree, so the pre-check may admit a request
the RPC then rejects (or vice versa). This is correct and must not be "fixed": the
guarded write is the invariant by definition. Do not attempt to pass the JS-computed
day boundary into the RPC — that would hand the authoritative decision back to the
caller's clock.

**`search_path = ''` changes what compiles.** Every object needs qualifying:
`public.jobs`, and the enum literal cast as `'failed'::public.photo_job_status`.
`now()` and `date_trunc` resolve from `pg_catalog`, which is always implicitly
searched. The reaper migration's header comment documents this same constraint.

**Ordering against CI.** CI deploys the Worker and the Edge Function on merge to
master but **not** migrations. The function is additive and inert until the new
Worker calls it, so applying it to production first is safe and merging first is
not — that is the S-11 failure mode (jobs migrations never `db push`ed, blocking
production bug). Phase 4 is therefore a gate on merging, not a follow-up.

**`p_cap` is `integer`.** Test sentinels standing in for "effectively uncapped"
must stay below 2147483647; use a plain constant like `1_000_000`. The env schema
is constrained to the same range in Phase 1 so a fractional or out-of-range
`CLOUD_DAILY_CAP` fails at config load rather than as a runtime Postgres error.

---

## Phase 1: The atomic admission primitive

### Overview

Ship the database function, its index, and the env-schema constraint that keeps the
cap a valid `int4`. Prove behaviour and denial sequentially. Nothing calls the
function yet, so this phase is green standalone.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260828120000_atomic_cloud_daily_cap.sql`

**Intent**: Create the one guarded write that admits a cloud job, so the count and
the insert can no longer be interleaved by concurrent requests. Add the index the
now-on-the-critical-path count needs.

**Contract**:

```
public.admit_cloud_job(
  p_job_id       uuid,
  p_user_id      uuid,
  p_source_path  text,
  p_gamma        double precision,
  p_strength     double precision,
  p_cap          integer
) returns boolean
```

`language plpgsql`, `security invoker`, `set search_path = ''`, **volatile** (not
`stable` — it writes). `security invoker`, not `definer`: `service_role` already has
INSERT/SELECT on `public.jobs` plus BYPASSRLS, so owner privileges add no capability
— only blast radius if the execute grant is ever widened. Body order is load-bearing:

1. **Fail closed on a bad cap** — return `false` (or `raise`) when `p_cap IS NULL`
   or `p_cap < 0`, _before_ anything else. Do not rely on a comparison against NULL.
2. `pg_advisory_xact_lock(<constant>)`.
3. Count, then insert.

Use a hardcoded `bigint` literal for the lock key with a comment naming what it
protects — not `hashtext('…')`, so the key can never shift under a
schema/search-path or hashing change. One global key is intentional: it serializes
all admissions, which is the whole point at cap 3.

The count predicate must be the SQL twin of `countCloudJobsToday`:

```sql
select count(*) from public.jobs
where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  and (status <> 'failed'::public.photo_job_status
       or replicate_prediction_id is not null)
```

Return `false` without inserting when `count >= p_cap` (so `p_cap = 0` rejects the
first request — the kill-switch); otherwise insert `id` / `user_id` /
`status = 'queued'` / `source_path` / `gamma` / `strength` and return `true`.

Grants follow `20260614120000` exactly: `revoke all on function … from public`,
`revoke all … from anon, authenticated`, `grant execute … to service_role`. The
`from public` revoke is the load-bearing one — `EXECUTE` is granted to `PUBLIC` by
default, and `anon`/`authenticated` inherit `PUBLIC`, so revoking only those two is
not enough.

Index: partial on `created_at` with the billable predicate as the index predicate,
so the serialized count is an index scan rather than a sequential scan.

The header comment must state (a) why a conditional `INSERT … WHERE (count) < cap`
is insufficient under READ COMMITTED, (b) why the lock is xact-scoped, and (c) why
the null-cap guard exists. Someone will eventually try to "simplify" this into the
racy form; the comment is what stops them.

#### 2. Env schema constraint

**File**: `astro.config.mjs`

**Intent**: Make an invalid cap a config-load failure instead of a runtime Postgres
type error inside the admission path.

**Contract**: `CLOUD_DAILY_CAP` gains `int: true`, `min: 0`, and an int4-safe
`max` (2147483647). `default: 50` and the `server`/`secret` context are unchanged.
Astro's `envField.number` supports these options.

#### 3. Primitive behaviour + denial tests

**File**: `tests/jobs.rls.test.ts`

**Intent**: Prove the function's predicate fidelity and its grant model against a
real database before anything depends on it — the cases where a wrong predicate
silently changes who gets charged, and the case where the privileged function is
reachable by the wrong role.

**Contract**: A new top-level `describe("admit_cloud_job (FR-014 guarded admission)")`
following the file's sibling-describe convention (own `makeUser` / `created` /
`afterEach`). Drives `supabaseAdmin.rpc("admit_cloud_job", {...})` directly, using
the baseline-delta technique from the `countCloudJobsToday` block.

_Predicate cases (sequential)_: admits under cap; rejects at exactly `cap`;
`p_cap = 0` rejects the first request; `p_cap = null` rejects and inserts nothing;
a `failed` row with a null `replicate_prediction_id` does **not** consume a slot
while a `failed` row _with_ one does; a row from an earlier UTC day does not count;
a rejected call inserts nothing.

_Denial cases_: the anon client and a signed-in user client both fail to execute
the RPC and insert nothing. Assert "errors and no row appeared" rather than pinning
a specific PostgREST error code — the denial shape differs between a missing grant
and an unexposed function, and either is a pass.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Predicate + denial tests pass: `npx vitest run tests/jobs.rls.test.ts`
- Unit tests still pass: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Formatting passes: `npm run format:check`

#### Manual Verification:

- Index **eligibility**: with `enable_seqscan = off`, `EXPLAIN` on the count query
  chooses the new partial index (proves the predicate matches)
- Index **preference**: after seeding representative rows and running `ANALYZE`,
  a plain `EXPLAIN` chooses it (a fresh reset is too small to prove this, and a
  sequential scan there is the planner being right, not the index being wrong)
- `\df+` / catalog check confirms no `PUBLIC` execute grant on the function

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 2: Wire the admission path + the concurrent oracle

### Overview

Route every admission through the guarded write, keep the user-facing contract
byte-identical, make a race loss visible both locally and in Sentry, and prove the
concurrent boundary — naming honestly what each layer proves.

### Changes Required:

#### 1. Service

**File**: `src/lib/services/photo-job.service.ts`

**Intent**: Make `createPhotoJob`'s insert the guarded admission. Rejection stops
being impossible and becomes a normal, typed outcome.

**Contract**: `createPhotoJob(admin, cmd)` replaces `.from(JOBS_TABLE).insert(...)`
with `admin.rpc("admit_cloud_job", {...})`, reads `cmd.cap`, and returns
`Promise<CreatePhotoJobResponse | null>` — `null` when the RPC returns `false`,
matching `claimJobForProcessing`'s "someone else won" shape. An RPC _error_ still
throws (it is a fault, not a rejection).

On rejection, follow the file's existing swallow-site pattern: call **both**
`console.warn` and `captureWarning` with the same message, naming the cap value —
e.g. `createPhotoJob: daily-cap guarded write rejected admission (cap=N)`. A
`captureWarning`-only call is invisible locally, because the hook defaults to a
no-op and production maps it to `Sentry.captureMessage`. Keep the message free of
user ids; `sentry-scrub` covers the rest.

State in the doc comment that in the wired path this only fires when the handler's
pre-check already admitted the request, i.e. it is the race signal — and that this
function, not the handler's count, is the FR-014 enforcement point.

The mint-then-admit order is unchanged: a rejected admission leaves an unused
signed upload token and no object, which costs nothing.

#### 2. Command type

**File**: `src/types.ts`

**Intent**: Make the cap a required input to admission so no call site can
accidentally admit uncapped.

**Contract**: `CreatePhotoJobCommand` gains `cap: number` (required, not optional —
an optional cap is a bypass).

#### 3. Route handler

**File**: `src/lib/services/cloud-create-job.handler.ts`

**Intent**: Map a rejected admission onto the identical 429 the pre-check already
returns, and record in the code which of the two checks is the invariant.

**Contract**: Pass `cap` into `createPhotoJob`; `result === null` → the same
`daily_cap_reached` 429 body. Extract the response body once so the two return
sites cannot drift apart.

Rewrite the existing cap-check comment: it currently presents the count as _the_
FR-014 guard. It must now say the count is a **non-authoritative fast path** that
avoids storage work in the common case, and that the guarded write in
`createPhotoJob` is the enforcement point.

#### 4. Non-test callers outside `src/`

**Files**: `scripts/f01-smoke.ts:116`, `scripts/spikes/d1-live-submit.ts:67`

**Intent**: Keep `npm run typecheck` green. Both files are inside the tsconfig
graph, both call `createPhotoJob`, and `d1-live-submit.ts` destructures the result
directly — a nullable return breaks it outright.

**Contract**: Each call site supplies an explicit `cap` and narrows the nullable
result **fail-fast** — a rejected admission in a smoke script must abort with a
clear message, never proceed against a null. Do not silence the narrowing with a
non-null assertion; these scripts run against real projects and a silent
`undefined` downstream is worse than a stop.

#### 5. Hermetic test updates

**Files**: `tests/cloud-create-job.handler.test.ts`, `tests/photo-job.service.test.ts`

**Intent**: Keep the route-boundary contract covered now that admission goes
through `rpc` instead of `insert`.

**Contract**: `makeStubAdmin` gains an `rpc` spy (default `{ data: true, error: null }`)
returned alongside the existing spies. Over-cap assertions become "`rpc` not called"
— the reject-before-insert property is unchanged, only its observable moved.

The S-12 Bread-params tests at `tests/cloud-create-job.handler.test.ts:152-175`
currently assert `insert` was called with `{ user_id, status, gamma, strength }`.
They must assert the equivalent **RPC parameters** instead; left as-is they pin a
spy that is never called again and would pass vacuously or fail outright.

Add a case where the pre-check admits (`count = cap - 1`) but `rpc` resolves
`{ data: false }` → 429 with the byte-identical body, plus an assertion on the
emitted warning message. Inject a capture hook via `setObservabilityWarnCapture`
and **reset it in `afterEach`** — the hook is module-level state and would leak
into sibling tests.

In `photo-job.service.test.ts`, `CREATE_CMD` gains `cap`, the "insert job row"
failure case becomes the RPC-error case, and a new case asserts `null` on
`{ data: false }`.

#### 6. Concurrent oracle — three tests, three distinct claims

**File**: `tests/jobs.rls.test.ts`

**Intent**: Prove the invariant at the boundary Risk #3 names, without overclaiming
what any single test establishes.

**Contract**: Add `cap` to the 8 existing `createPhotoJob` call sites via a
file-level constant (e.g. `const UNCAPPED = 1_000_000`), and narrow the now-nullable
result at each — those tests dereference `.jobId` immediately, so `cap` alone does
not make them compile. A shared local helper that calls `createPhotoJob` and throws
on `null` keeps the churn to one place.

The three claims, kept distinct:

- **Service-layer fan-out — the atomicity oracle.** `Promise.all` of 8
  `createPhotoJob` calls at an effective `cap = baseline + 1` → exactly one non-null
  result, and a follow-up count confirms exactly one row inserted. This is the test
  that proves the guarded write, because every call reaches the RPC.
- **Hermetic `{ data: false }` case (§5) — the route-mapping proof.** Shows the
  route turns a rejected admission into the exact 429 contract.
- **Route-layer fan-out — an outcome-level composition test.** 8 concurrent
  `createCloudJobResponse` calls with a real admin client → exactly one 200 and
  seven 429s. It does **not** prove all eight contended at the database gate: each
  request runs a sweep and a fast-path count first, so a later request may observe
  the winner's committed row and return 429 without ever reaching
  `admit_cloud_job`. Label it as such in a comment. It still has teeth as a
  regression test — under the current racy code the eight counts would all resolve
  before any insert commits, and it would fail.

### Success Criteria:

#### Automated Verification:

- Type checking passes across the whole graph incl. `scripts/`: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass, incl. the RPC-parameter and warning-message assertions:
  `npm run test:unit`
- Integration suite passes incl. the service fan-out and the route composition test:
  `npx vitest run tests/jobs.rls.test.ts`
- E2E gate still green: `npm run test:e2e`
- Scoped mutation check on the changed risk module:
  `npx stryker run --mutate "src/lib/services/photo-job.service.ts"`

#### Manual Verification:

- Local stack: submit a real cloud job end-to-end — the north-star flow is unchanged
- Local stack with `CLOUD_DAILY_CAP=0`: submission returns the unchanged 429 copy
- The race-loss line appears in the local **console** on a forced concurrent
  rejection (now reachable, because the service calls `console.warn` too)

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 3: Correct the record

### Overview

Eight live passages across six files assert something this change makes false, plus
one immutable archive that can only be superseded. This cap's history is _repeated
documentation drift_ — `context/archive/2026-06-10-cap-doc-drift/` exists because the
same line was wrong twice — so this is a phase, not a footnote.

**Scope boundary:** this phase corrects _static documentation_ and _registers_ the
new slice. It does **not** mark anything done. The `## Done` ledger, the Backlog
Handoff `done` flip, and the #191 issue close belong to `/10x-archive` (Phase 5),
per `AGENTS.md`'s archive-workflow extension and `github-issues.md`'s own note that
issue state syncs on archive.

### Changes Required:

#### 1. Agent rules

**File**: `AGENTS.md`

**Intent**: Replace the paragraph describing the non-atomic `count → insert` and the
race as settled fact. It is accurate today and inverted the moment the guard lands,
and it is the single highest-risk stale line in the repo because it _instructs
readers not to look for the race_.

**Contract**: The § "Project: Astro + Supabase + Cloudflare → Product" paragraph.
State that the cap is enforced by `public.admit_cloud_job`, a `SECURITY INVOKER`
guarded write holding a transaction-scoped advisory lock across count-and-insert;
that the handler's `countCloudJobsToday` pre-check is a non-authoritative fast path;
and that the count predicate is unchanged. Keep the existing pointer to the
doc-drift archive — the history stays, the false claim goes.

#### 2. Product scope notes

**File**: `idea-notes.md`

**Intent**: Same inversion in the product-scope document — it currently says the cap
is enforced in the create-job handler, "**not** in a SQL trigger or constraint".

**Contract**: The "Basic cost protection" bullet under _Minimum Feature Set_.

#### 3. Roadmap — four separate passages

**File**: `context/foundation/roadmap.md`

**Intent**: Stop the ledger and its forward-looking guidance from pointing future
work at the wrong enforcement point, without rewriting what S-05 actually shipped.

**Contract**:

- **Slice table (`:38`)** — annotate the S-05 row: its delivered outcome (a clear
  user-facing message) stands; the FR-014 invariant is completed by the new slice.
- **S-05 body (`:152-164`)** — the Unknowns entry recommends _"enforce in the
  create-job route (pre-insert COUNT)"_ and the Risk line cites "the provider
  billing alert as backstop". Supersede both with a dated note; keep the historical
  recommendation visible as history rather than deleting it.
- **Parked → Per-user rate limiting (`:328`)** — drop the "plus a provider billing
  alert" clause; `production-config.md` §7 established that alert never existed.
- **Parked → Monetization (`:329`)** — the per-user-entitlements path is described as
  a `user_id` filter on `countCloudJobsToday` plus a handler-side quota check. After
  this change the guard is `admit_cloud_job`, so the migration path is a new
  parameter and predicate on the **function**, not a filter in the handler. Correct
  it, or a future implementer rebuilds the race in the monetization slice.
- **Add S-16 `atomic-cloud-daily-cap`** to the slice table (PRD ref FR-014) with a
  full body entry in the existing format, and a **Backlog Handoff** row registering
  it — status reflecting in-flight work, **not** `done`.

#### 4. Test plan — two separate false claims

**File**: `context/foundation/test-plan.md`

**Intent**: This file carries the drift _twice_, and it owns Risk #3's oracle —
leaving it stale would leave the next reader a test plan that argues against the
test that now exists.

**Contract**: (a) §2 Risk #3 Response Guidance — the "Must challenge" cell already
names _"cap is checked ⇒ no off-by-one / no race"_; update "What would prove
protection" and "Likely cheapest layer" to require the concurrent boundary, not just
the sequential rejection. (b) §6.6 — the 2026-06-10 note's claim _"no
trigger/RPC/CHECK in `supabase/migrations/`"_ is now false; **append** a dated note
recording the inversion rather than editing that note's account of what was true at
the time. (c) Add a §6.6 entry for this change, including which of the three
concurrency tests proves what.

#### 5. MVP check report — both language sections

**File**: `context/mvp-check-report.md` (`:31` EN, `:93` PL)

**Intent**: Both sections attribute the cap to `countCloudJobsToday() + isOverDailyCap()`
as the enforcement mechanism. Correcting only the English half would leave the
document self-contradictory.

**Contract**: Name `admit_cloud_job` as enforcement and the two JS helpers as the
fast path, in both sections. The line-number references to `photo-job.service.ts`
also move; re-derive rather than copying.

#### 6. Standing rule

**File**: `context/foundation/lessons.md`

**Intent**: Supersede the immutable archive's Architecture Insight (_"the cap is a
soft, app-level guardrail, not a hard invariant"_) with a rule that outranks it and
reaches future work automatically. `lessons.md` is read by plan, plan-review,
implement, and impl-review; an archive is read only by whoever lands on it.

**Contract**: A new rule in the file's Context / Problem / Rule / Applies-to format:
an admission gate that counts a set and then writes must be one guarded write — a
conditional `INSERT` with a count subquery does **not** close it under READ
COMMITTED. Cite this change, name the advisory-lock mechanism, and link the existing
_"Keep ownership enforcement in the write, not a read-then-write check"_ rule, which
is the same shape. Name the superseded archive insight explicitly so the tiebreaker
is written down.

#### 7. Issue tracker registration

**File**: `context/foundation/github-issues.md`

**Intent**: #191 exists only in the `## Status updates` log; the Final-mapping table
has no row for it, so there is no Status cell to set.

**Contract**: Add a Final-mapping row for **S-16 / #191 / `atomic-cloud-daily-cap`**
with a non-done status matching the in-flight state. Leave `done` and the closing
comment to `/10x-archive`.

### Success Criteria:

#### Automated Verification:

- Formatting passes: `npm run format:check`
- Linting passes: `npm run lint`
- Skill parity unaffected: `npm run check:skills`
- **File-specific assertions**, not a blanket grep — for each of `AGENTS.md`,
  `idea-notes.md`, `roadmap.md` (all four passages), `test-plan.md`,
  `mvp-check-report.md` (both sections): the passage names `admit_cloud_job` as
  enforcement and, where it mentions them, the JS helpers as the fast path. A
  three-string grep passes while `roadmap.md:329` and `mvp-check-report.md` stay
  stale, which is how this drift survived twice.

#### Manual Verification:

- Each corrected passage reads correctly in context — not just the sentence swapped
- The `lessons.md` rule names the superseded archive insight explicitly
- No file under `context/archive/` was modified: `git status` shows none
- The `## Done` ledger, the Backlog Handoff `done` flip, and #191's closure are
  deliberately **untouched** — they are Phase 5's

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 4: Production migration — pre-merge gate

### Overview

Apply and verify the migration on `luminaclean-prod` while master still runs the old
code, record that evidence in this PR, then merge. The function is additive and inert
until the new Worker calls it, which is what makes this order safe.

### Changes Required:

#### 1. Apply

**Target**: Supabase project `luminaclean-prod` (`tebdkqpgjjypdethpezo`)

**Intent**: Get the function into production ahead of the code that depends on it.

**Contract**: Apply `20260828120000_atomic_cloud_daily_cap.sql` via
`npx supabase db push` (or the Supabase MCP `apply_migration`). Do not merge the PR
before this completes and verifies.

#### 2. Verify

**Intent**: Prove presence _and_ the grant model — a function that exists but is
executable by `PUBLIC` is a different security posture than the one designed.

**Contract**: Read-only checks: the function exists with the expected signature and
`prosecdef = false`; execute is granted to `service_role` and **not** to `PUBLIC`,
`anon`, or `authenticated` (check `PUBLIC` explicitly — the other two inherit from
it); the partial index exists.

#### 3. Record

**File**: `context/foundation/production-config.md` §7

**Intent**: This evidence exists before the merge, so it belongs in the PR that
ships the code — unlike the smoke, which cannot.

**Contract**: Record the applied date and the verification result, and update §7's
closing pointer (currently "the application-side cap") to name `admit_cloud_job`.

### Success Criteria:

#### Automated Verification:

- Verification queries return the function, `prosecdef = false`, `service_role`-only
  execute with no `PUBLIC` grant, and the partial index

#### Manual Verification:

- Migration applied to `luminaclean-prod` and verified BEFORE the PR is merged
- Applied date + verification recorded in `production-config.md` §7 **in this PR**

**Implementation Note**: After this phase the PR merges and CI deploys. Phase 5 runs
against the deployed Worker.

---

## Phase 5: Post-merge smoke + archive (follow-up PR)

### Overview

The smoke can only run after the deploy, so its evidence cannot live in the PR that
ships the code. It lands in a follow-up PR that also performs the archive — so the
change is stamped archived only once its central claim is proven live, and the
archive commit reaches master through a real PR rather than being orphaned by the
squash-merge (precedent: #91 → orphaned → re-landed as #92).

### Changes Required:

#### 1. Production smoke

**Intent**: Confirm the live path end-to-end rather than inferring it from a green
CI run.

**Contract**: One real cloud job succeeds on production. Then `CLOUD_DAILY_CAP=0` →
a submission returns the 429 contract; restore to `3` and confirm a submission
succeeds again.

#### 2. Record + archive

**Files**: `context/foundation/production-config.md` §7, plus whatever `/10x-archive`
touches

**Intent**: Durable evidence in the same place every other production verification
lives (reaper, chroma flip, cloud flip-ON), and the bookkeeping the archive skill
owns.

**Contract**: Append the smoke result to §7. Then run `/10x-archive
atomic-cloud-daily-cap`, which moves the change folder, stamps it, closes the
roadmap item, flips the Backlog Handoff row to `done`, writes the `## Done` ledger
entry, sets #191's Status cell to `done`, appends the `## Status updates` row, and —
on explicit confirmation — closes issue #191.

### Success Criteria:

#### Manual Verification:

- One real cloud job succeeds on production after the deploy
- `CLOUD_DAILY_CAP=0` rejects with the 429 contract; restored to `3` afterwards
- Smoke result recorded in `production-config.md` §7
- `/10x-archive` completed in the same follow-up PR; #191 closed on confirmation

---

## Testing Strategy

### Unit Tests

- `isOverDailyCap` boundary table — unchanged (the pre-check still uses it)
- Handler: over-cap pre-check rejects with 429 and calls neither `rpc` nor
  `createSignedUploadUrl`
- Handler: pre-check admits but the guarded write rejects → identical 429 body plus
  the expected warning message (capture hook injected, reset in `afterEach`)
- Handler: S-12 Bread params reach the **RPC parameters** (rewritten from the
  insert-spy assertions)
- Service: RPC error throws; `{ data: false }` returns `null`

### Integration Tests (real local Supabase)

- `admit_cloud_job` predicate fidelity: under/at cap, `cap = 0`, `cap = null`,
  pre-model failure frees a slot, `failed` _with_ a prediction id does not, earlier
  UTC day excluded, rejection inserts nothing
- Denial: anon and authenticated clients cannot execute the RPC and insert nothing
- **RPC-layer fan-out (THE atomicity oracle)**: 8 concurrent
  `admit_cloud_job` calls at `cap - 1`, after a connection-pool warm-up →
  exactly one `true`, exactly one row inserted. _(Superseded the service-layer
  fan-out as the oracle on 2026-08-29 — that shape was measured NOT to detect a
  lock-less function reliably; see § Implementation Note — Phase 2.)_
- **Service-layer fan-out (composition)**: 8 concurrent `createPhotoJob` at
  `cap - 1` → exactly one non-null, exactly one row inserted. Proves
  `createPhotoJob` routes through the guarded write, not that the eight contended.
- **Route-layer fan-out (outcome-level composition)**: 8 concurrent
  `createCloudJobResponse` with a real admin client → exactly one 200, seven 429s

### Manual Testing Steps

1. `npx supabase db reset`, run the app locally, submit a cloud job — flow unchanged
2. Set `CLOUD_DAILY_CAP=0`, submit — the unchanged 429 message renders
3. Set `CLOUD_DAILY_CAP=1`, fire two submissions as fast as possible — exactly one
   succeeds and the console carries the guarded-write rejection warning
4. Confirm no `PUBLIC` execute grant on the function on the local stack

## Performance Considerations

Admission now serializes on one advisory lock. At `cap = 3` and the observed traffic
(8 active days in ~3 months, effectively one user) this is unmeasurable. The count
inside the lock is the thing worth indexing, which the new partial index covers —
without it, the serialized section would hold a sequential scan over a growing table.
Note that a freshly reset local database is too small for the planner to prefer the
index; that is correct behaviour, which is why eligibility and preference are
verified separately. If volume ever makes the single lock a bottleneck, the shard is
obvious (key the lock per UTC day), but that is not a change to make speculatively.

## Migration Notes

The migration is **additive only** — a new function and a new index. No column, no
data, no backfill. Rollback is `drop function public.admit_cloud_job(...)` plus
`drop index`, but note that rolling the _database_ back without rolling the _Worker_
back would 500 every cloud submission: revert the code first, then the migration.

Production application is manual and ordered before the merge — see Phase 4 and the
S-11 precedent in `frame.md`.

## Review Response

`reviews/plan-review.md` (2026-08-28, verdict REVISE). All eight findings verified
against the working tree and accepted:

| #   | Finding                                              | Resolution                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Type-contract blast radius undercounted              | ACCEPTED — Phase 2 §4 adds both `scripts/` callers; §6 requires fail-fast null narrowing at all 8 test call sites; §5 replaces the `:152-175` insert-spy assertions with RPC-parameter assertions. Confirmed `tsconfig.json` includes `scripts/`.                                   |
| F2  | Phases 3/4 cannot execute sequentially               | ACCEPTED (recommended fix) — split into Phase 3 (static docs + tracker registration), Phase 4 (pre-merge apply/verify/record), Phase 5 (post-merge smoke + archive, follow-up PR). Confirmed #191 has no Final-mapping row; done-ledger and issue close returned to `/10x-archive`. |
| F3  | Route fan-out does not guarantee contention          | ACCEPTED (Fix A) — service fan-out relabelled the atomicity oracle, hermetic `{ data: false }` the route-mapping proof, route fan-out an outcome-level composition test. Fix B rejected: a test barrier in the handler is production machinery serving a test.                      |
| F4  | RPC boundary not fail-closed                         | ACCEPTED — null/negative `p_cap` rejected before the count; `astro.config.mjs` gains `int`/`min`/`max` (options confirmed against Astro docs); denial tests automated; `PUBLIC` grant asserted locally and in prod.                                                                 |
| F5  | Local race-loss warning would be silent              | ACCEPTED — `console.warn` **and** `captureWarning`, matching the file's existing swallow sites; unit assertion on the message with the hook reset in `afterEach`.                                                                                                                   |
| F6  | Documentation sweep can pass while claims stay stale | ACCEPTED and extended — adds `roadmap.md:152-164`, `:329`, `mvp-check-report.md:31,93`, and two the review did not catch: `roadmap.md:328` and the S-05 body still cite the provider billing alert that §7 disproved. Blanket grep replaced with file-specific assertions.          |
| F7  | "EXPLAIN must choose the index" is nondeterministic  | ACCEPTED — eligibility (`enable_seqscan=off`) separated from preference (seed + `ANALYZE` + plain `EXPLAIN`).                                                                                                                                                                       |
| F8  | `change.md` says no approach chosen                  | ACCEPTED — note updated to record the guarded-RPC/advisory-lock approach.                                                                                                                                                                                                           |

## Review Response — Phase 1 Implementation

`reviews/impl-review-phase-1.md` (2026-08-28, verdict NEEDS ATTENTION; 0 critical,
1 warning, 2 observations). Each finding was reproduced against the local stack
before it was decided:

| #   | Finding                                          | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `SECURITY DEFINER` widens the privilege boundary | **ACCEPTED** — function switched to `security invoker`. Premise verified (`service_role` is `rolbypassrls = t` with `INSERT,SELECT` on `public.jobs`, so owner privileges add no capability). Consequence measured: with `execute` leaked to `authenticated`, the INVOKER form fails `permission denied for table jobs` and inserts **0** rows; the DEFINER form returns `true` and inserts **1**, with a caller-controlled `p_user_id`. All 29 integration tests pass under invoker, closing the review's stated blind spot. Nine plan passages updated, incl. Phase 4's expectation → `prosecdef = false`.                                                                                                                                                                             |
| F2  | `change.md` misstates the migration phase        | **ACCEPTED** — the note now says the migration exists and was verified locally in Phase 1, and that only its _production application_ is Phase 4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F3  | `npm run format:check` not reproducible          | **ACKNOWLEDGED, out of scope.** Reproduced, but pre-existing and not caused by this change: `supabase/.temp/**` is gitignored via the _nested_ `supabase/.gitignore`, which Prettier never reads — the same blind spot `eslint.config.js` already documents and works around. It fails on any branch while the local stack is running and is green whenever it is down. **CI is unaffected**: the `ci` job runs `format:check` and never starts Supabase (that is the separate `integration` job). Deleting `.temp` satisfies the literal command once but regenerates on every `supabase start`. A `.prettierignore` entry would fix it permanently, but `AGENTS.md` governs that file and says not to add subtrees to silence drift — so it belongs to its own change, not to Phase 1. |

**Where F1 came from**, recorded so it is not re-introduced: the plan copied
`20260614120000_reaper_stale_source_paths.sql` as its template. That precedent needs
`SECURITY DEFINER` for a real reason — it reads `storage.objects`, which
`service_role` cannot reach through PostgREST. `admit_cloud_job` only touches
`public.jobs`. The grant model transferred; the security context should not have.

## Review Response — Phase 1 Re-review

`reviews/impl-review-phase-1-rereview.md` (2026-08-28, verdict NEEDS ATTENTION;
0 critical, 2 warnings, 1 observation). The re-review confirmed F1 of the first
pass resolved. All three new findings accepted:

| #   | Finding                                             | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Denial tests do not detect a leaked `EXECUTE` grant | **ACCEPTED** — and confirmed by measurement before accepting. Both denial tests asserted only "an error occurred", which holds under a correct grant model AND a leaked one: with `execute` leaked, a `security invoker` call merely dies later, at `public.jobs`. Added `expectExecuteDenied`, which calls with `p_cap = -1` — the bad-cap guard returns before touching any table, so the EXECUTE grant is the only thing that can raise. Verified both directions: with the grant leaked to `anon` + `authenticated` the new probe FAILS both tests (`expected null not to be null`); with it correctly revoked all 29 pass. The positive-cap cases are retained — they cover the table-level backstop behind the grant. |
| F2  | `plan-brief.md` still prescribed `SECURITY DEFINER` | **ACCEPTED** — both references corrected, with the reason the reaper precedent does not transfer recorded in the Key Decisions row. `plan.md`'s remaining `SECURITY DEFINER` mentions are correct: they describe the reaper itself and the accepted F1 finding.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F3  | Progress rows still name the pre-remediation commit | **ACCEPTED, extended.** All nine Phase 1 rows now carry the closing commit alongside `978e1b8`; every one was re-verified at the phase tip, not just 1.1 and 1.2. The re-review named 1.1/1.2 but missed **1.9**, whose expected result actually inverted (`prosecdef` true → false) — that row is the one where the stale stamp was most misleading. The original review's catalog row is relabelled `PASS (PRE-REMEDIATION)` with the current value, and that document now carries a SUPERSEDED-IN-PART header.                                                                                                                                                                                                           |

**On the standing `format:check` condition**: unchanged and still out of scope —
see § Review Response — Phase 1, F3. The re-review reached the same conclusion.

## Implementation Note — Phase 2: the oracle the plan named does not work

Phase 2 §6 designated the **service-layer fan-out** the atomicity oracle, on the
reasoning that every one of the 8 `createPhotoJob` calls reaches the RPC, so all
8 must contend. Every call does reach it. They do not ARRIVE together: each
`createPhotoJob` awaits `createSignedUploadUrl` first, and that storage round-trip
staggers the eight requests past each other's count→insert window.

This was caught by running the tests against a **negative control** — the real
`admit_cloud_job` with `pg_advisory_xact_lock` removed and nothing else changed —
rather than by reading the code. Measured on the local stack, 2026-08-28/29:
first a standalone 10-round probe per shape, then the shipped tests themselves,
3 runs.

| fan-out shape                          | probe, 10 rounds | shipped tests, 3 runs |
| -------------------------------------- | ---------------- | --------------------- |
| RPC-layer, pool pre-warmed             | detected 10/10   | FAILED 3/3            |
| service-layer (`createPhotoJob`)       | detected 7/10    | FAILED 1/3            |
| route-layer (`createCloudJobResponse`) | not probed       | FAILED 2/3            |

Against the real function all three pass, in every probe round and every suite
run — so the added detection power costs no false positives.

The first version of the service fan-out, written exactly as the plan specified,
**passed against the lock-less build** on its first run. A 7-in-10 detector is a
coin flip on the single property this change exists to prove, and it would have
shipped as "the test that proves the guarded write".

**Resolution — adapted, not skipped.** The concurrency block now carries three
tests instead of two, and the oracle label moved:

1. **RPC-layer fan-out — the atomicity oracle.** 8 concurrent
   `supabaseAdmin.rpc("admit_cloud_job", …)` calls at `cap = baseline + 1`. No
   storage hop, so all eight land inside the same window. Verified end-to-end in
   the shipped test file: 3/3 runs FAIL against the lock-less build, 3/3 pass
   against the real one.
2. **Service-layer fan-out — service composition** (the plan's oracle, relabelled
   with its measured detection rate in a comment). It still proves `createPhotoJob`
   routes admission through the guarded write and returns `null` — not a job with
   no row — for every loser.
3. **Route-layer fan-out — outcome composition**, unchanged from the plan.

**The pool warm-up in the oracle is load-bearing, not hygiene.** On a cold
PostgREST pool the first requests of a run open connections one at a time, which
staggers the fan-out; the very first probe round returned 1 winner against the
lock-less function while rounds 2–10 returned 8. The oracle therefore fires a
throwaway `p_cap = 0` burst (always declines, inserts nothing, cannot move the
baseline) before it measures. Without it the failure mode is a **false pass on the
only test that can catch a non-atomic admission** — the shape `lessons.md` calls a
guard that cannot see the failure it exists to catch.

Generalisation worth keeping: a concurrency test's passing run proves nothing
about the test. Calibrate it against a build with the mechanism removed, and
record the detection rate next to the assertion.

### Support edits outside the Phase 2 file list

Recorded so the scope record matches the diff (`reviews/impl-review-phase-2.md`
F4). All are accurate and low-risk, none were in §§1–6:

- `tests/README.md` — its numbered "what the suite covers" list would have gone
  stale on _this phase's own tests_; adds the guarded-admission and concurrency
  entries and drops a pre-existing "six"/seven miscount.
- `photo-job.service.ts` — `countCloudJobsToday`'s doc comment now says it is the
  non-authoritative fast path, so the "which check is load-bearing" statement
  lives at both ends of the pair, not only in the handler.
- `tests/cloud-create-job.handler.test.ts` — a Risk #2 doc block was sitting above
  the S-12 describe; moved to the describe it actually documents (pre-existing
  misplacement, no behaviour change).
- Phase 1 Progress rows carried an uncommitted second SHA from the p1 re-review;
  it rode along in the Phase 2 commit rather than being left dirty.

### Post-review fixes (2026-08-29, `reviews/impl-review-phase-2.md`)

- **F1 ACCEPTED.** `admitted !== true` folded a null RPC result into the cap
  rejection, so database-contract drift would have surfaced as a 429 "try again
  tomorrow" instead of the 500 the outer catch exists to raise. Now `false`
  rejects and anything else throws; still fail-closed for spend. Two unit tests:
  the throw, and that the cap warning does NOT fire for a fault (that warning is
  the race signal — polluting it with non-cap events costs its meaning).
- **F2 ACCEPTED.** Both remaining "service fan-out proves atomicity" passages
  corrected (this file's Testing Strategy, and the handler test's doc block).
- **F3 ACCEPTED IN PART.** The warm-up's responses are now asserted, so a
  silently failing warm-up can no longer leave a cold pool behind a green test.
  The suggested _several measurement rounds_ is DECLINED: each extra round needs
  its own baseline and winner cleanup, which makes the test's bookkeeping its own
  failure source, and the single warmed round already measured 10/10 on the probe
  and 3/3 on the shipped test against the lock-less control. F3's own blind spot
  — a pool that serializes every round — is not addressed by adding rounds.
- **F4 ACCEPTED.** Recorded above.

## References

- Frame brief: `context/changes/atomic-cloud-daily-cap/frame.md`
- Plan review: `context/changes/atomic-cloud-daily-cap/reviews/plan-review.md`
- Race site: `src/lib/services/cloud-create-job.handler.ts:101-125`
- Insert path: `src/lib/services/photo-job.service.ts:89-110`
- Guarded-write precedent: `src/lib/services/photo-job.service.ts:224-247`
- Warn-seam pattern: `src/lib/services/photo-job.service.ts:43` + `sentry.server.config.ts:11`
- RPC + grant template: `supabase/migrations/20260614120000_reaper_stale_source_paths.sql`
- Concurrency-test precedent: `tests/jobs.rls.test.ts:381`
- Baseline-delta precedent: `tests/jobs.rls.test.ts:476`
- Non-`src` callers: `scripts/f01-smoke.ts:116`, `scripts/spikes/d1-live-submit.ts:67`
- Superseded insight: `context/archive/2026-06-09-cap-rejection-coverage/research.md:140-144`
- Backstop record: `context/foundation/production-config.md` §7
- Archive-workflow ownership: `AGENTS.md` § Archive workflow extensions

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The atomic admission primitive

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 978e1b8, d5c15ca
- [x] 1.2 Predicate + denial tests pass: `npx vitest run tests/jobs.rls.test.ts` — 978e1b8, d5c15ca
- [x] 1.3 Unit tests still pass: `npm run test:unit` — 978e1b8, d5c15ca
- [x] 1.4 Type checking passes: `npm run typecheck` — 978e1b8, d5c15ca
- [x] 1.5 Linting passes: `npm run lint` — 978e1b8, d5c15ca
- [x] 1.6 Formatting passes: `npm run format:check` — 978e1b8, d5c15ca

#### Manual

- [x] 1.7 Index eligibility confirmed with `enable_seqscan = off` — 978e1b8, d5c15ca
- [x] 1.8 Index preference confirmed after seeding + `ANALYZE` — 978e1b8, d5c15ca
- [x] 1.9 No `PUBLIC` execute grant on the function — 978e1b8, d5c15ca

### Phase 2: Wire the admission path + the concurrent oracle

#### Automated

- [x] 2.1 Type checking passes across the graph incl. `scripts/`: `npm run typecheck` — 14b1802
- [x] 2.2 Linting passes: `npm run lint` — 14b1802
- [x] 2.3 Unit tests pass incl. RPC-parameter and warning-message assertions — 14b1802
- [x] 2.4 Integration suite passes incl. service fan-out and route composition test — 14b1802
- [x] 2.5 E2E gate still green: `npm run test:e2e` — 14b1802, f4c3dce
- [x] 2.6 Scoped mutation check on `photo-job.service.ts` — 14b1802

#### Manual

- [x] 2.7 Local stack: a real cloud job completes end-to-end — 2026-08-29: after restoring the missing local Vault webhook wiring and replacing a stale callback tunnel, `d1-live-submit.ts` reached `queued` → `processing` → `succeeded` through real Replicate in 172s; result object present, source object deleted
- [x] 2.8 `CLOUD_DAILY_CAP=0` returns the unchanged 429 copy — 2026-08-29: with the normal local cap at 5 and the billable baseline at 0, an authenticated POST against the production Worker under the `--var CLOUD_DAILY_CAP:0` override returned `429` + `daily_cap_reached` + the unchanged message
- [x] 2.9 Race-loss line appears in the local console on a forced rejection — 2026-08-29: targeted 8-way `createPhotoJob` fan-out passed with one winner and seven `daily-cap guarded write rejected admission (cap=1)` stderr lines

### Phase 3: Correct the record

#### Automated

- [x] 3.1 Formatting passes: `npm run format:check` — 58bd9e3
- [x] 3.2 Linting passes: `npm run lint` — 58bd9e3
- [x] 3.3 Skill parity unaffected: `npm run check:skills` — 58bd9e3
- [x] 3.4 File-specific assertions pass for all eight corrected passages — 58bd9e3

#### Manual

- [x] 3.5 Each corrected passage reads correctly in context — 58bd9e3
- [x] 3.6 The `lessons.md` rule names the superseded archive insight — 58bd9e3
- [x] 3.7 No file under `context/archive/` was modified — 58bd9e3
- [x] 3.8 Done-ledger, Backlog Handoff `done`, and #191 closure left untouched — 58bd9e3

### Phase 4: Production migration — pre-merge gate

#### Automated

- [x] 4.1 Verification queries return the function, `prosecdef`, grants (no `PUBLIC`), and index — 2026-08-29: signature `admit_cloud_job(uuid,uuid,text,double precision,double precision,integer)`, `prosecdef=false`, `search_path=""`, EXECUTE false for `PUBLIC`/`anon`/`authenticated` and true for `service_role` (acl `{postgres=X/postgres,service_role=X/postgres}`), `jobs_billable_created_at_idx` present

#### Manual

- [x] 4.2 Migration applied to `luminaclean-prod` and verified BEFORE merge — 2026-08-29: `npx supabase db push --linked` after a dry run showing exactly one pending migration; prod history 11/11 in parity, recorded as `20260828120000 / atomic_cloud_daily_cap`
- [x] 4.3 Applied date + verification recorded in `production-config.md` §7 in this PR — 2026-08-29: applied-date paragraph + verification table appended to §7, resolving the forward reference the closing pointer now makes; extended to 10 rows on 2026-08-30 by phase-4 review F4 (`service_role`'s INSERT/SELECT grants on `public.jobs` — the precondition `SECURITY INVOKER` depends on — plus the INSERT column/type check). "In this PR" became factual with `fb51672` → **PR #198** (2026-08-30)

### Phase 5: Post-merge smoke + archive (follow-up PR)

#### Manual

- [x] 5.1 One real cloud job succeeds on production after the deploy — 2026-08-31: `3d19146a-8b06-49f2-92a1-65a6c89ceacd` went `queued → processing → succeeded` in 258.3s (10:16:42Z → 10:21:01Z, cold boot); `result.png` present, `source.jpg` deleted, slider rendered via Realtime without a refresh. First execution of `admit_cloud_job` in production
- [x] 5.2 `CLOUD_DAILY_CAP=0` rejects; restored to `3` afterwards — 2026-08-31: 429 with the unchanged `daily_cap_reached` body and **no row inserted** (day's count stayed at 1); after restoring `3`, `190832de-0f89-4b2c-9250-7b15ca081082` succeeded in 134.9s. Note: the `cap=0` leg rejects on the fast path and never reaches the RPC — scoped as such in §7
- [x] 5.3 Smoke result recorded in `production-config.md` §7 — 2026-08-31: replaced the "Still outstanding" paragraph with the smoke table + an explicit what-it-does-not-prove paragraph. Same pass corrected the `EDGE_FUNCTION_URL` record (found missing in pre-flight, re-set on prod at 10:55:31Z, then verified live by job `06ce207c-59e8-4e1d-9312-8eee2f1530ff` succeeding at 11:07:28Z — the re-set activates `toPublicStorageUrl`, so it needed a real job) and the contradictory comment in `enhance/index.ts`
- [x] 5.4 `/10x-archive` completed in the follow-up PR; #191 closed on confirmation — 2026-08-31: archived to `context/archive/2026-08-26-atomic-cloud-daily-cap/`; the #191 closure action is recorded in `context/foundation/github-issues.md` (§ Status updates), which stays outside the archive
