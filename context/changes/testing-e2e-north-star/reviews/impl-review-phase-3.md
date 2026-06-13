<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: E2E North-Star (risks #1+#6) — Phase 3 (Stall spec)

- **Plan**: context/changes/testing-e2e-north-star/plan.md
- **Scope**: Phase 3 of 4
- **Date**: 2026-06-12
- **Commit**: 08a8f10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Success criteria (re-verified post-commit)

- 3.1 + 3.2: full Playwright gate at the committed state → 5 passed (42.2s); the stall spec 33.3s wall-clock.
- 3.3: deliberate break run in-session — queued-watchdog arming gutted (`useCloudJob.ts:222`) → red exactly at the alert assertion after the 40s budget (eternal spinner reproduced); reverted, `git diff src/` byte-clean.
- Lint + types clean on the new spec (`npx eslint`, `tsc --noEmit`).
- Mutation check: skipped — the commit touches no src/ risk module (tests + plan bookkeeping only).

Drift summary: 16/16 planned elements MATCH (drift agent) — flow, exact alert copy (incl. U+2026 ellipsis), 40s expect budget, per-file 60s timeout, webhook-unwired precondition header, jobId-only idempotent cleanup, shared env guard (review-F1 lineage), no fixture server (port-8787 rule respected). Three benign in-file EXTRAs (hydration-retry upload, pre-stall spinner anchor, fixture reuse), all exemplar-pattern boilerplate; no "What We're NOT Doing" boundary crossed. Strict-mode check: only one `role="alert"` reachable in this flow. No-flicker check: client `TIMEOUT_MESSAGE` and the server flip write byte-identical strings, so `toHaveText` cannot race the Realtime UPDATE.

## Findings

### F1 — Env guard fires only at cleanup, after data was created

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/cloud-stall-surfaces-timeout.spec.ts:54
- **Detail**: `adminClient()` is only invoked inside `afterEach`. With missing/remote env the test still runs the full ~35s UI flow and creates a real job row + storage object via the app — then throws in cleanup, where deletion is impossible (artifacts leak until the 1h stale-pending sweep). The north-star spec hoists the guard to the top of the test body, so the suite's hard-fail-before-data convention is uneven here.
- **Fix**: Call `adminClient()` as the first line of the test body (north-star pattern parity) — fail before any data exists.
- **Decision**: FIXED 2026-06-12 — guard hoisted to the first line of the test body with rationale comment; spec re-run green.

### F2 — Thin outer timeout margin on a cold CI server

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/cloud-stall-surfaces-timeout.spec.ts:40
- **Detail**: 60s test timeout − 30s watchdog − re-read/render leaves ~28s for `goto` + hydration. The hydration `toPass` alone may take up to 15s, and a cold Astro on-demand compile (CI `webServer` first hit, 4 specs in parallel) is absorbed silently into the same budget — a flake vector Phase 4's CI job would inherit. Internal layering (30s watchdog < 40s alert budget < 60s timeout) is sound; only the outer margin is thin.
- **Fix**: Bump `test.setTimeout` to 75_000 with a rationale comment, plus a one-line plan addendum (the plan's Phase 3 contract names 60_000 literally).
- **Decision**: FIXED 2026-06-12 — timeout raised to 75_000 with layering rationale (30 < 40 < 75); plan Phase 3 contract carries the addendum; spec re-run green.

### F3 — Cleanup comment says "the source object exists" — it usually doesn't

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (comment accuracy)
- **Location**: tests/e2e/cloud-stall-surfaces-timeout.spec.ts:62
- **Detail**: The timeout flip (`markPendingJobFailedForOwner`, photo-job.service.ts) deletes the source object server-side, so on a green run the storage prefix is typically already empty when cleanup runs. The code is correct (idempotent list-then-remove, and the comment even acknowledges tolerance); only the leading rationale sentence is wrong.
- **Fix**: Reword the comment — the prefix is swept defensively, the failure path usually already deleted the source.
- **Decision**: FIXED 2026-06-12 — cleanup comment now states the timeout flip's retention contract usually already deleted the source; the sweep is defensive.

### F4 — jobId-capture gap on a 500-after-insert (row leaks to the 1h sweep)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data hygiene)
- **Location**: tests/e2e/cloud-stall-surfaces-timeout.spec.ts:117
- **Detail**: If create-job 500s after inserting the row (or `.json()` throws), `jobId` stays null and the queued row leaks until the owner-scoped 1h stale sweep reclaims it. Exact pattern parity with the north-star spec, whose Phase 2 review accepted the same gap (its F5).
- **Fix**: Accept — awareness only.
- **Decision**: ACCEPTED 2026-06-12 — bounded residue, self-healing via the 1h sweep; consistent with the north-star decision.

### F5 — afterEach ignores supabase-js error returns (silent failed delete)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency (shared with north-star)
- **Location**: tests/e2e/cloud-stall-surfaces-timeout.spec.ts:70
- **Detail**: supabase-js never throws — cleanup destructures `{ data }` and ignores `error`, so a failed delete is silent. Identical to the north-star cleanup; a suite-wide property, not a regression introduced by this spec.
- **Fix**: Accept — awareness only (a shared cleanup helper would be the suite-wide fix if it ever matters).
- **Decision**: ACCEPTED 2026-06-12 — suite-wide property shared with north-star; a shared cleanup helper is the future fix if it ever bites.
