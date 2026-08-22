<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder Fabrication Ablation Campaign

- **Plan**: context/changes/finder-fabrication-triggers/plan.md
- **Scope**: Phase 1 of 5
- **Date**: 2026-08-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Verification Evidence

- npm run lint: passed.
- npm run typecheck: passed.
- npm test: 19 files and 540 tests passed.
- CI/instrument raw byte anchors: exactly 215,560 / 266,444.
- CI manifest: expected impl-reviewer.test.ts cut and impl-reviewer.ts over-cap.
- Emitted schema: flat; no oneOf, anyOf, or $ref.
- Mutation testing: skipped; no reviewed file is a risk module from the test plan.

## Findings

### F1 — Paid grader bypasses the executable pre-spend contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/scripts/fabrication-grade.mjs:37
- **Detail**: The provider-visible schema duplicates the M1/M2/M3 rubric despite the plan requiring grading semantics to come exclusively from the frozen ground-truth file. The CLI also reaches generateObject without dumping and validating the emitted schema. Tests validate pure helpers but never exercise the promised fake success/provider-failure path.
- **Fix**: Remove semantic rubric text from the schema, add a schema dump/assertion before any paid call, and extract an injectable grade-one-finding path with fake success and failure tests.
  - Strength: Makes the frozen ground truth authoritative and validates the actual paid-call wiring before Phase 3.
  - Tradeoff: Requires a focused grader refactor and several hermetic tests.
  - Confidence: HIGH — the missing runtime guard and test path are directly visible in the current control flow.
  - Blind spot: Provider behavior still needs the planned live calibration.
- **Decision**: FIXED — schema describe() made semantics-free, runtime `assertFlatVerdictSchema()` pre-spend guard added and logged in main(), injectable `gradeFinding()` extracted with fake success/provider-failure hermetic tests (15 tests pass).

### F2 — Run identity is not bound to all review and grading inputs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/fabrication-probe.mjs:195
- **Detail**: Failure to load the historical project rules silently substitutes empty context, while inputSha256 hashes only the diff. The grader then trusts the result, manifest, and selected ground truth without checking their variant, rung, model, or SHA relationship. Mismatched artifacts could therefore produce plausible but invalid grades.
- **Fix**: Fail closed when pinned rules cannot be loaded, hash all declared inputs, and validate result/manifest/ground-truth identity before the first grader call.
  - Strength: Preserves the campaign's byte-exact reproducibility claim.
  - Tradeoff: Expands manifest schemas and requires compatibility updates to tests and generated dry manifests.
  - Confidence: HIGH — neither the missing hash nor the cross-file checks exists currently.
  - Blind spot: The final ground-truth hash cannot be frozen until Phase 2.
- **Decision**: FIXED — probe fails closed on missing pinned rules; manifest + results carry `rulesSha256` and combined `inputsSha256`; grader's `assertRunIdentity` cross-checks variant/rung/model/inputSha256/inputsSha256 pre-spend and records ground-truth path + sha256 in graded output; dry manifests regenerated, byte anchors intact (215,560 / 266,444).

### F3 — Paid attempts are persisted only after the whole batch finishes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/fabrication-probe.mjs:252
- **Detail**: --n accepts any positive safe integer and results are written only after every paid finder call completes. The grader follows the same batch-only pattern. An interruption can lose completed attempts and their spend, encouraging a rerun that breaks the registered denominator or ceiling.
- **Fix**: Enforce arm-sized invocation limits and atomically checkpoint after every finder attempt and grader call, with resumable state.
  - Strength: Preserves attempt accounting and avoids paying twice after interruption.
  - Tradeoff: Adds checkpoint/resume state and partial-output handling.
  - Confidence: HIGH — both loops currently defer all writes until the end.
  - Blind spot: A persistent cross-invocation 140-attempt ledger still needs to be finalized with Phase 2's verification contract.
- **Decision**: FIXED — probe: `--n` capped at MAX_ARM_ATTEMPTS=20, manifest written before the loop, results atomically checkpointed (`plannedAttempts` + `complete` flag) after every paid attempt; grader: graded file atomically checkpointed after every paid call, resume skips settled verdicts (`reusableVerdict`), re-attempts errored ones, refuses complete files and mismatched `inputsSha256`; partial runs excluded from `aggregateGrades`. Cross-invocation ledger stays a Phase 2 item (blind spot).

### F4 — Unknown provider cost is recorded as zero

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/scripts/fabrication-grade.mjs:142
- **Detail**: Both scripts use asStepCost(...) ?? 0, overriding the helper's explicit convention that absent telemetry remains unknown rather than looking free. Grader usage is success-only and global, failed-call usage is discarded, and error.text is truncated despite the raw-failure contract.
- **Fix**: Follow the existing pipeline telemetry pattern: keep cost optional, persist usage per call including failures when available, and retain exact raw provider failure data with explicit size metadata.
  - Strength: Prevents the campaign's measured dollar ceiling from being understated exactly when provider telemetry fails.
  - Tradeoff: Output consumers must handle unknown cost and richer error records.
  - Confidence: HIGH — asStepCost documents this convention directly.
  - Blind spot: Some provider failures may expose no usage; those must remain explicitly unknown.
- **Decision**: FIXED — both scripts now follow the pipeline convention (assign only reported metrics; unknown cost never creates a key, `costUnknownSteps`/`costKnownCalls` make gaps explicit, console totals print `≥$` when partial); grader persists per-call usage on every verdict row including failures (`error.usage` recovered); `error.text` kept raw and untruncated with `textBytes` in both scripts.

### F5 — Generated outputs omit preregistered provenance and summaries

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/scripts/fabrication-probe.mjs:264
- **Detail**: Probe run records omit model, input SHA, and input byte size; some values exist only at result or manifest level. The grader emits global totals but no required per-run and per-file rate summaries.
- **Fix**: Add immutable provenance to every run and emit explicit per-run and per-file aggregation maps in graded output.
- **Decision**: FIXED — probe run records carry `provenance: { model, variant, rung, inputSha256, sentBytes }`; grader emits `perRun` + `perFile` maps (gradeable runs only, via new `summarizeByRunAndFile`) in every checkpoint write; hermetic test added (28 tests pass).

### F6 — Manual ground-truth verification was marked complete with a bad status

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/finder-fabrication-triggers/ground-truth/instrument.md:36
- **Detail**: The instrument inventory says the logSafePath call, comment, and definition are all over-cap. The call/comment hunks are over-cap, but the unchanged definition is off-diff entirely. Phase Progress item 1.5 requires every F1/F2/F7/F10 target to have the correct location status.
- **Fix**: Split D3's status into over-cap call/comment and off-diff definition, then re-review Progress item 1.5.
- **Decision**: FIXED — instrument.md D3 now splits over-cap call/comment from the off-diff definition (mirrors ci.md; grading unaffected — both shapes read M3 under this variant). Progress 1.5 re-reviewed: D1/D2/D4 statuses were already correct, so the item stands with D3 corrected.

### F7 — R-loc's injected context is absent from the window summary

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/fabrication-probe.mjs:181
- **Detail**: The appended R-loc block affects sentBytes and the input hash, but it is not represented as an in-window manifest entry and the grader's summary omits rlocContextBytes.
- **Fix**: Add a labeled manifest entry for the injected block with byte range, size, and hash, and include it in summarizeManifest.
- **Decision**: FIXED — `rlocContextBytes` replaced by a structured `rlocContext` entry (label, sent-relative byte range, size, sha256); `summarizeManifest` emits an "INJECTED into the sent input … (visible to the model)" line; hermetic test added; dry manifests regenerated with anchors intact.
