<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Atomic Global Cloud AI Daily Cap

- **Plan**: `context/changes/atomic-cloud-daily-cap/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-28
- **Verdict**: REVISE
- **Findings**: 2 critical, 5 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

14/14 existing paths ✓ (the migration is correctly planned as a new file), 7/7 symbols ✓, brief↔plan ✓, Progress 4/4 phases and 29/29 criteria ✓; #191 Status cell ✗ (F2).

## Findings

### F1 — Phase 2 undercounts the type-contract blast radius

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Service, Command type, Hermetic tests
- **Detail**: The plan makes `cap` required and changes `createPhotoJob` to return `CreatePhotoJobResponse | null`, but omits the typechecked callers `scripts/f01-smoke.ts:116` and `scripts/spikes/d1-live-submit.ts:67`. Adding `cap` alone is also insufficient: all eight callers in `tests/jobs.rls.test.ts` dereference the now-nullable result. Existing handler tests at `tests/cloud-create-job.handler.test.ts:152-175` still assert the obsolete `insert` spy for Bread parameters. `npm run typecheck` cannot pass as planned.
- **Fix**: Expand Phase 2 to include both scripts, require explicit fail-fast null narrowing for every existing non-cap caller, and replace all insert-spy assertions with assertions over the RPC parameters.
- **Decision**: ACCEPTED

### F2 — Phase 3 and Phase 4 cannot execute sequentially as written

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §6 and Phase 4
- **Detail**: Phase 3 requires `production-config.md` to contain the migration's applied date and verification before Phase 4 applies it. Phase 4 then requires a post-merge smoke and says to record that result after the implementing PR is already merged. `github-issues.md` has no #191 row with a Status cell, says status synchronization happens on archive, and the roadmap's `## Done` section records archived outcomes; setting these to done during Phase 3 is premature.
- **Fix ⭐ Recommended**: Split the lifecycle into static documentation and active tracker setup in Phase 3; pre-merge migration apply/verify plus its recorded evidence in Phase 4A; merge/deploy; explicit post-merge smoke recording in Phase 4B; and `/10x-archive` ownership of done-ledger and issue-status updates.
  - Strength: Matches branch protection, CI deployment, and archive semantics.
  - Tradeoff: Requires an explicit post-merge follow-up rather than one PR containing future evidence.
  - Confidence: HIGH — CI deploys the Worker and Edge Function but no production migrations.
  - Blind spot: The plan must choose whether post-merge evidence lands in a follow-up PR or another durable operational record.
- **Decision**: ACCEPTED

### F3 — The route fan-out does not guarantee contention at the guarded write

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §5 — Concurrent oracle
- **Detail**: Each route request performs a stale-job sweep and fast-path count before minting a URL and calling the RPC. Without a barrier, later requests may see the winner's committed row during the fast-path count and return 429 without reaching `admit_cloud_job`. One 200 plus seven 429s is therefore an outcome test, not deterministic proof that all eight requests contended at the database gate.
- **Fix A ⭐ Recommended**: Treat the service fan-out as the atomicity oracle, the hermetic `{ data: false }` test as route-mapping proof, and label the route fan-out as an outcome-level composition test.
  - Strength: The three tests jointly prove the behavior without adding production seams.
  - Tradeoff: Does not prove that all eight route requests reached the RPC.
  - Confidence: HIGH — confirmed from the current handler sequence.
  - Blind spot: Retains the narrow Worker-clock/database-clock midnight edge.
- **Fix B**: Add an injectable barrier around the fast-path boundary so all eight route requests pass the count before admission proceeds.
  - Strength: Produces a true route-level contention oracle.
  - Tradeoff: Introduces test synchronization machinery into the handler boundary.
  - Confidence: MEDIUM — feasible, but the seam design needs care.
  - Blind spot: The barrier could over-couple the test to implementation order.
- **Decision**: ACCEPTED

### F4 — The privileged RPC boundary is not fully fail-closed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migration and primitive tests
- **Detail**: Under the specified PL/pgSQL body, `count >= NULL` evaluates to NULL, so an `IF` does not reject and the function inserts. The current Astro env field accepts any number while the RPC expects `int4`, making fractional or out-of-range configuration a runtime fault. Denial testing remains manual, and production verification names `anon`/`authenticated` but not `PUBLIC` despite the function being `SECURITY DEFINER`.
- **Fix**: Require `int: true`, `min: 0`, and an int4-safe maximum in the Astro env schema; reject or raise on `p_cap IS NULL`; automate RPC-denial tests for anon/authenticated; and assert no `PUBLIC` execute grant locally and in production.
- **Decision**: ACCEPTED

### F5 — The promised local race-loss warning would be silent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Service and Manual Verification
- **Detail**: The plan calls only `captureWarning`, but that hook defaults to a no-op and production wires it to Sentry rather than the console. Consequently, the criterion "warning appears in the local log" cannot pass.
- **Fix**: Follow the existing warning pattern by calling both `console.warn` and `captureWarning`, then add a unit assertion for the warning message and reset the injected capture hook after the test.
- **Decision**: ACCEPTED

### F6 — The documentation sweep can pass while live claims remain stale

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Roadmap and verification grep
- **Detail**: The proposed three-string grep misses the S-05 body recommending a route-level pre-insert count (`roadmap.md:152-164`), parked monetization guidance built around `countCloudJobsToday` and the handler (`roadmap.md:328-329`), and both language variants of `context/mvp-check-report.md` attributing the cap to `countCloudJobsToday + isOverDailyCap` (`:31`, `:93`).
- **Fix**: Enumerate and supersede these passages explicitly, then replace the narrow grep with file-specific assertions identifying `admit_cloud_job` as enforcement and the JS count as the fast path.
- **Decision**: ACCEPTED

### F7 — “EXPLAIN must choose the index” is nondeterministic

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Manual Verification
- **Detail**: The proposed partial index is valid and eligible for the exact predicate, but after a local reset the table is small and PostgreSQL may correctly prefer a sequential scan. The criterion can fail despite a correct index.
- **Fix**: Separate eligibility from planner preference: verify eligibility with `enable_seqscan=off`, then seed representative data, run `ANALYZE`, and use ordinary `EXPLAIN` for the performance check.
- **Decision**: ACCEPTED

### F8 — Change metadata still says no approach was chosen

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `change.md` Notes
- **Detail**: The change is `planned`, but its note still says “No implementation approach has been chosen yet,” contradicting the completed plan.
- **Fix**: Replace that sentence with the selected guarded-RPC/advisory-lock approach while retaining that no schema or production change has yet been made.
- **Decision**: ACCEPTED

## Resolution — 2026-08-28

All eight findings were verified against the working tree and **ACCEPTED**. The plan
was revised the same day; per-finding resolutions, including which alternative was
taken where the review offered a choice, are recorded in `plan.md` § Review Response.

Two notes on the choices:

- **F2** — the recommended split was taken: Phase 3 (static docs + tracker
  registration), Phase 4 (pre-merge apply/verify/record), Phase 5 (post-merge smoke
  - `/10x-archive`, in a follow-up PR). The open sub-question the finding flagged is
    answered: post-merge evidence lands in a **follow-up PR** carrying both the smoke
    record and the archive move, matching the repo's archive-orphan precedent
    (#91 → #92) and keeping the archive stamp behind the live proof.
- **F3** — **Fix A** was taken. Fix B was rejected: an injectable barrier at the
  handler boundary is production synchronization machinery existing only to serve a
  test, which is a worse trade than labelling honestly what each of the three tests
  proves.

**F6 extended.** Two further stale passages were found beyond the four the finding
named: `roadmap.md:328` (Per-user rate limiting) and the S-05 body both still cite
"a provider billing alert" as the v1 backstop, which `production-config.md` §7
established never existed as a self-service feature. Both are in Phase 3's scope.
