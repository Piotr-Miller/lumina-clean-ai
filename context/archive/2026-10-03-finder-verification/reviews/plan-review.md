<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Finder verification — verify-before-publish pass, pre-registered gate and measurement

- **Plan**: `context/changes/finder-verification/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-04
- **Verdict**: REVISE → triaged 2026-10-04 (all 6 fixed); the owner decided no further plan review
- **Findings**: 1 critical, 3 warnings, 2 observations
- **Note**: third review of the same date, run in a fresh session. It replaces the re-review whose F1–F7 were all
  triaged as FIXED. Those fixes are recorded in `plan.md` and `change.md`, and this review checked that they are
  present in the plan text.

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | WARNING |
| End-State Alignment    | PASS    |
| Lean Execution         | PASS    |
| Architectural Fitness  | FAIL    |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

## Grounding

- **Paths**: all 16 checked files that the plan modifies exist, and none of the 9 files it creates exists yet.
- **Symbols**: 6 of 6 found (`assignFindingIds(mergeFindings(…))` `pipeline.ts:594`, `offDiffFindingPaths`,
  `parseDiffPaths` `source-provider.ts:54`, `createDiffScopedSource` `:129`, `createDiffScopedSourceForDiff`
  `:191`, `ENDPOINT_NAMES` `finder-gate-core.mjs:18`). `typescript` ^5.9.3 is a package dependency.
- **Brief ↔ plan**: consistent.
- **Definitions**: 16 rows. 11 have origin user or product; 5 are plan-chosen and confirmed at the seal. E1/E2 on
  files with zero units are undefined (F2).
- **Lessons**: 27 of 37 entries apply to plan-review.

## Findings

### F1 — The quote `superRefine` turns one bad verdict into a failed review

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §3 (wire schema)
- **Detail**: The plan adds a `superRefine` that requires a non-empty quote for `confirmed` and `refuted`. A
  refine emits nothing into JSON Schema, so the model never sees the rule. `schemas.ts:56–66` records this exact
  failure: valid JSON fails validation as `AI_NoObjectGeneratedError`, and the envelope repair cannot help. One
  `refuted` verdict with `quote: ""` (plausible when the contradiction is an absence) therefore invalidates the
  whole verifier output. That costs a re-roll, then exit 1. The attempt fails G1, and in production the whole
  review fails. `applyVerdicts` already handles this case per finding: a quote under 10 characters fails the quote
  check and becomes `unverifiable: quote-not-in-excerpt`. The refine adds only this failure mode, and the seal
  freezes it.
- **Fix**: Drop the `superRefine`. Keep `quote` a required string (empty allowed). `applyVerdicts` handles empty
  quotes: `confirmed` → `quote-not-in-excerpt`, `refuted` → `quoteVerified: false`. Add a test: one `confirmed`
  with `quote: ""` among valid verdicts → only that finding becomes unverifiable, and the others publish.
- **Decision**: FIXED — owner 2026-10-04: `superRefine` dropped; `quote` required, empty allowed; empty quote handled per finding in `applyVerdicts`; test added (Phase 1 §3, Testing Strategy).

### F2 — On #240, the unit-span check can't reach zero, and E1 is undefined

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Location**: Phase 1 §2 (E1, E2); Phase 3 §1 (unit-span check)
- **Detail**:
  - **The comparison set.** The check compares E2's units with "the top-level function, class and variable
    statements" of `ts.createSourceFile`. E2 counts a `const` as a unit only when its value is an arrow function.
  - **On #240 at `54d3557`.** At least 7 const statements are not functions: `STEP`, `SPINNER_ON_DARK`,
    `LOCAL_DEFAULTS`, `BREAD_DEFAULTS`, `LOCAL_DEBOUNCE_MS`, `DISCLOSE_PIXEL_RATIO`, and `STRINGS`
    (`enhance-strings.ts:18–268`). Read literally, each one is a mismatch, so criterion 3.1 ("zero mismatches")
    is out of reach. The implementer must choose between narrowing the check and widening E2, and widening E2
    moves E1's `h` and the snapping on #269.
  - **E1 with zero units.** E1 is "lines 1 … min(40, h − 1), h = first line of the first unit", which has no
    value for a file with zero units. #240 has three such files: `enhance-strings.ts` and both test files, which
    hold only `describe(…)`.
  - **Python.** The check covers TS/JS only, but #269's rows lean on Python (`decode-inputs.py` 10,
    `contact-sheet.py` 8).
- **Fix A ⭐ Recommended**: Narrow the check to E2's own grammar (FunctionDeclaration, ClassDeclaration, and a
  VariableStatement whose initializer is an arrow or function expression), compared in both directions. Define E1
  for zero units as lines 1 … min(40, total). Add the same check for Python via `ast` (`end_lineno`).
  - Strength: makes 3.1 reachable without changing E2, and fills the one undefined E1 case on real files.
  - Tradeoff: object consts such as `STRINGS` stay unit-less (they fall back to the ±25 window).
  - Confidence: HIGH — top-level statements read from `54d3557`.
  - Blind spot: whether the ±25 window serves a `STRINGS` finding well.
- **Fix B**: Widen E2 to every top-level `const` / `let` / `interface` / `type`.
  - Strength: snapping can then name constants and types.
  - Tradeoff: changes E1 and snapping on #269 (backcheck re-run), and a 251-line `STRINGS` unit gets windowed.
  - Confidence: MED — the effect on #269's 10/20 figure is unmeasured.
  - Blind spot: new unit-end shapes (`} as const;`) need rules.
- **Decision**: FIXED via Fix A — owner 2026-10-04: unit-span check two-way on E2's grammar, plus Python via `ast`; E1 for zero units = lines 1 … min(40, total) (Phase 1 §2 table and tests, Phase 3 §1, criterion 3.1, brief).

### F3 — Phase 8's rebase orphans the commits that prove the order

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 0 §5, Phase 3 §4, Phase 8 §2
- **Detail**: The order freeze → prompt → seal → first paid call is proved by commit SHAs on
  `origin/feat/finder-verification` and their GitHub push times, as in the `finder-model-swap/gate.md`
  precedent. Phase 8 rebases this branch onto `origin/master`, which needs a force-push, and the rebase-merge then
  rewrites the SHAs a second time (memory: rebase-merge rewrites SHAs twice). After that, no ref reaches the
  commits that `gate.md` cites. The content hashes survive, but the timing proof is left resting on orphaned
  commits and on how long the activity API keeps its history.
- **Fix**: Before the Phase 8 rebase, push tags `finder-verification/freeze` and `finder-verification/seal` (and
  one per amendment) on the cited commits, and record the tag names in `gate.md`. Add this as a Phase 8 §2
  precondition.
- **Decision**: FIXED — owner 2026-10-04: freeze/seal/amendment tags pushed before the Phase 8 rebase, names recorded in `gate.md`; Phase 8 §2 precondition, new criterion and Progress 8.3 (Manual renumbered 8.5–8.8).

### F4 — Four success-criterion commands fail by construction

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Criteria 1.4, 1.5, 3.1, 3.2, 8.3
- **Detail**:
  - **8.3.** `git diff origin/master -- .github/workflows/review.yml` already shows +19/−5 from the two predecessor
    changes, and Phase 1 §4 adds a `verifier-model:` line on top. The check can never show "only the `false &&`
    line and one sentence".
  - **1.5, 3.1, 3.2.** These use `node …`, but the package sources are `.ts` and there is no `dist/`. Checked on
    2026-10-04: `node scripts/schema-dump.mjs` exits 1 and `npx tsx scripts/schema-dump.mjs` exits 0.
  - **1.4.** "No diff in `buildJudgeInstructions` / `buildJudgePrompt`" has no command, yet `prompts.ts` is going
    to change.
- **Fix**: For 8.3, diff the Phase 8 commit alone. For 1.5, 3.1 and 3.2, use `npx tsx …`. For 1.4, add a test that
  pins the sha256 of both builders' rendered output at `573ee33`.
- **Decision**: FIXED — owner 2026-10-04: 8.3 (now Progress 8.4) diffs the Phase 8 §2 commit alone; 1.5, 3.1, 3.2 use `npx tsx`; 1.4 pins the sha256 of both judge builders' output at `573ee33` (Phase 1 §4 tests).

### F5 — R4 doesn't define "K published in an attempt"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Requirement Definition
- **Location**: Definitions (R4 recall guard); Phase 2 §3 `recall-guard.mjs`
- **Detail**: Two cases are left open. In one attempt, two findings can match K, with one published and one
  refuted. And `matches.json` maps a finding to a single defect, so one broad finding that covers K1 and K2 can
  raise only one of them.
- **Fix**: State that K counts as published in an attempt when at least one matched finding is published, and let
  a match map to a list of defect ids.
- **Decision**: FIXED — owner 2026-10-04: K published in an attempt when ≥ 1 matched finding is published; a match maps to a list of defect ids (Definitions R4, Phase 2 §3, brief).

### F6 — Published findings keep gapped F-ids; the plan doesn't say so

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4 (Sequence)
- **Detail**: Ids are assigned before verification, so the judge and the comment see F1, F4, F7. An implementer
  who renumbers them breaks the link to `verification.verdicts`.
- **Fix**: State that published findings keep their pre-verification ids, and add a test.
- **Decision**: FIXED — owner 2026-10-04: published findings keep their pre-verification F-ids; test added (Phase 1 §4 Sequence and Tests).
