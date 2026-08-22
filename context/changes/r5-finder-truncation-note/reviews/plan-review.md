<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Finder Truncation Note (R5)

- **Plan**: `context/changes/r5-finder-truncation-note/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-22
- **Verdict**: RETHINK
- **Findings**: 1 critical, 3 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 8/8 existing paths ✓, referenced symbols ✓, Progress contract ✓,
brief↔plan mismatch noted in F2.

## Findings

### F1 — Migration guard remains non-decision-bearing

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Verification contract
- **Detail**: The revised plan defers the total-M3 ceiling to Phase 2 without
  requiring it to reject the named full migration from the archived M3 total
  48 to approximately 58. The hand-read labels every M3 finding as
  “M1-shaped claim rewritten? yes/no”, but the labelled count is only recorded
  as a read-off; it has no pre-registered pass/fail threshold. Phase 4 acts
  when the success bar fails or a guard trips, so ten confirmed rewrites can
  still pass if the unspecified M3 bound accepts 58. The original failure mode
  therefore remains possible despite the new instrumentation.
- **Fix**: Pre-register `m1_to_m3_rewrites = 0` as a hard guard; any
  hand-confirmed “yes” trips it. Keep the aggregate M3 band as a secondary
  serving-drift guard.
  - Strength: Observes the named semantic failure directly and makes it
    decision-bearing.
  - Tradeoff: The semantic label requires manual adjudication against a frozen
    definition.
  - Confidence: HIGH — the plan currently specifies a read-off but no failure
    condition.
  - Blind spot: Human subjectivity remains, controlled by freezing the label
    definition before spend and hand-reading every M3 finding.
- **Decision**: FIXED — `m1_to_m3_rewrites = 0` pre-registered as a HARD guard (any hand-confirmed rewrite is decision-bearing like a failed success bar); label definition frozen verbatim in Phase 2 before spend; aggregate M3 band demoted to secondary serving-drift guard and required to reject 58 (bound strictly < 58).

### F2 — Tool-enabled compatibility is declared but not carried through

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Finder truncation note; plan brief — Claim scope
- **Detail**: Production exposes `getFileContext` and its trusted
  instructions tell the finder to fetch context before guessing. The planned
  note instead directs the model to state “could not verify” for unseen
  material without preserving that tool-first behavior, which can short-circuit
  retrieval. The brief also says the tool-enabled interaction is unmeasured
  while still calling the local run “the identical production path.” The
  selected narrow-claims resolution is therefore only partially reflected.
- **Fix**: Qualify the note: when `getFileContext` is available, fetch the
  named file before falling back to “could not verify.” Replace “identical
  production path” with “same prompt-building path under a tool-less
  configuration,” and make the passive check record note activation, tool
  calls, and any M1→M3 rewrite.
  - Strength: Preserves the one-arm budget while making the shipped prompt
    compatible with the production tool loop.
  - Tradeoff: Adds conditional wording and corresponding prompt tests.
  - Confidence: HIGH — production tool wiring and tool-specific instructions
    are present in the current code.
  - Blind spot: The pinned finder has historically made few or no tool calls,
    so the passive check may still yield no interaction evidence.
- **Decision**: FIXED — note wording made tool-neutral (verify with the means available, then could-not-verify); buildInstructions' fileContextTool branch gains a fetch-first sentence for metadata-named files; brief now says 'same prompt-building path under a tool-less configuration'; passive live check specified to record note firing, tool calls, and the rewrite check.

### F3 — Ceiling exhaustion cannot reach the INCONCLUSIVE close-out

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Runs and grading; Progress 3.1
- **Detail**: The Phase 3 contract correctly declares the arm INCONCLUSIVE if
  the 28-attempt or $5.50 ceiling fires before 20 gradeable runs, but the
  automated success criterion and Progress item 3.1 still require 20 gradeable
  runs. Under the ceiling path, Phase 3 can never complete and Phase 4 cannot
  record the intended inconclusive decision.
- **Fix**: Make the Phase 3 success criterion and Progress contract
  disjunctive: either 20 gradeable runs, or a ceiling-triggered INCONCLUSIVE
  record containing every available result plus final attempt/cost totals.
- **Decision**: FIXED — Phase 3 success criterion and Progress 3.1 made disjunctive: 20 gradeable runs OR a ceiling-triggered INCONCLUSIVE record with every available result plus final attempt/cost totals; Phase 4 records that outcome.

### F4 — Ground-truth hash check is ordered before its file exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Runs and grading
- **Detail**: The plan says to confirm the graded file's
  `groundTruth.sha256` before grading, but that file is created by the
  grader. The current grader records the hash it reads; it does not compare it
  to the frozen value before starting.
- **Fix**: Verify the live ground-truth file's SHA-256 against the frozen value
  immediately before invoking the grader, then verify the hash recorded in the
  graded output afterward.
- **Decision**: FIXED — hash discipline reordered: live ground-truth file sha256 verified against the frozen value immediately BEFORE each grader invocation; the graded output's recorded groundTruth.sha256 verified AFTER; new Progress item 3.2.
