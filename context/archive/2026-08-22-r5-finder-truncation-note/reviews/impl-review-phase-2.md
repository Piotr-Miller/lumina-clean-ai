<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder Truncation Note (R5)

- **Plan**: context/changes/r5-finder-truncation-note/plan.md
- **Scope**: Phase 2 of 4 (`078a1e8`)
- **Date**: 2026-08-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Findings

### F1 — Outcome-sensitive grader errors lack a frozen policy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/r5-finder-truncation-note/verification.md:133
- **Detail**: The hand-read invalidates grading only when the aggregate misgrade rate reaches 15%. It does not define how a lower-rate but outcome-sensitive error affects the bars. A sampled clean finding confirmed as an M1 false negative could coexist with the recorded M1=0 result and produce an apparent success.
- **Fix**: Before spending, freeze an outcome-sensitive precedence rule: such an error makes the arm INCONCLUSIVE unless the relevant verdict population is fully reviewed and corrected.
  - Strength: Prevents the hand-read from disproving a result that the numeric read-off still declares successful.
  - Tradeoff: A false negative may expand the manual review substantially.
  - Confidence: HIGH — no raw-vs-corrected precedence currently exists.
  - Blind spot: Ten clean controls cannot estimate the complete false-negative population.
- **Decision**: FIXED — verification.md Amendment A1 (2026-08-23, pre-spend): outcome-sensitive hand-read precedence; any hand-read-discovered M1-class claim defeats a recorded M1=0 regardless of misgrade rate; INCONCLUSIVE unless the affected verdict population is fully reviewed and re-read.

### F2 — The $5.50 ceiling is recorded but not enforced

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: context/changes/r5-finder-truncation-note/verification.md:94
- **Detail**: The executable ledger counts finder attempts only. Grading pays once per finding and records cost after each call, but neither script stops against cumulative finder-plus-grader spend. A grading batch can therefore exceed the stated hard ceiling, especially if finding volume rises or a provider omits cost metadata.
- **Fix**: Add a cumulative finder-plus-grader cost ledger and pre-call budget guard; stop as INCONCLUSIVE when cost is unknown or insufficient headroom remains.
  - Strength: Makes the declared ceiling operational.
  - Tradeoff: Requires smaller resumable batches and a conservative policy for unknown cost.
  - Confidence: HIGH — the scripts checkpoint cost but contain no budget-enforcement branch.
  - Blind spot: A strict pre-call bound may require provider pricing limits not currently recorded.
- **Decision**: FIXED via Fix A — verification.md Amendment A2 (2026-08-23, pre-spend): procedural dollar ledger over ALL on-disk checkpoints (committed or not) with frozen projection/fallback rates; projected spend covers the ENTIRE upcoming invocation (grading: all findings lacking a persisted verdict); execute-tested one-liner (empty state 0.0000/5.5000 USD; accumulation branches verified against archived results); bounded-overshoot caveat recorded.

### F3 — Clean-control sampling is not reproducible

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/changes/r5-finder-truncation-note/verification.md:151
- **Detail**: “10 random clean findings” specifies neither a seed nor a deterministic selection rule, unlike the archived campaign's reproducible clean controls.
- **Fix**: Sort by result stamp, run, and finding index, then freeze an evenly-spaced selection of ten controls.
- **Decision**: FIXED — verification.md Amendment A3 (2026-08-23, pre-spend): deterministic ordering (file stamp, run index, finding index), zero-based positions, select floor(k·N/10) for k = 0..9; if N < 10 review all N.

### F4 — The falsifier's approximation has no boundary

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/r5-finder-truncation-note/verification.md:41
- **Detail**: `m1Runs ≈ 5/20` and `M1 findings ≈ 10` have no tolerance, so the falsifier cannot receive a deterministic read-off.
- **Fix**: Replace `≈` with a frozen numeric band and define the interpretation of results outside both the success and no-effect bands.
- **Decision**: FIXED (user-specified partition) — verification.md Amendment A4 (2026-08-23, pre-spend): exhaustive read-off — SUCCESS M1=0; PARTIAL m1Runs=1 (decision-bearing non-success); UNCHANGED/falsified m1Runs ∈ [2,8]; WORSE/falsified m1Runs ≥ 9; M1>0 with m1Runs=0 = aggregation-integrity error (stop and audit).

## Verification

- `npx prettier --check context/changes/r5-finder-truncation-note/verification.md context/changes/r5-finder-truncation-note/ground-truth/ci.md` — PASS
- Ground-truth SHA-256 — PASS: live and archived copies both equal `12fceadb423bb6130f1512773f360f3610515fbe6178d783cd46b7c34695e820`
- Archived baseline — PASS: 20 runs; M1 10, M2 6, M3 48, none 102; `m1Runs` 5; fabrication runs 17
- Archived per-run M3 distribution — PASS: matches the pre-registration and sums to 48
- Poisson(48) one-sided 90% quantile — PASS: 57
- Phase 2 scope — PASS: commit `078a1e8` changes exactly the two planned artifacts plus `plan.md` progress bookkeeping
- Mutation testing — skipped: Phase 2 touches no risk-critical module
- Manual criterion — supported by an independent read during this review and no recorded paid artifacts before the Phase 2 commit; an unrecorded external call cannot be disproved from repository state

## Repository State

- The review itself changed only this report file.
- The pre-existing uncommitted `plan.md` change appends `078a1e8` to Phase 2 Progress rows and was preserved unchanged.
