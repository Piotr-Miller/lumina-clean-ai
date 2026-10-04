<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder verification — verify-before-publish pass, pre-registered gate and measurement

- **Plan**: context/changes/finder-verification/plan.md
- **Scope**: Phase 2 review fixes + Phase 3 pre-seal (commits 0f2d3a9 through a8844a6); not a full-plan review
- **Base**: fa5afaafcf13290b4a4d99927c92cd64a17246d6 (explicit — parent of 0f2d3a9, "covering 0f2d3a9 through a8844a6")
- **Head**: a8844a606d31ca7b559320b6d1841d18deddd08a
- **Worktree**: excluded (.claude/settings.local.json, temp_steps.md, context/changes/cloud-exif-orientation/ — unrelated)
- **Checks ran at**: a8844a6 (current HEAD)
- **Manual acceptance**: 2 of 4 in scope confirmed (2.3, 3.4) — pending: 3.5, 3.6
- **Date**: 2026-10-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 3 observations
- **Triage**: 2026-10-04 by the owner — all eight fixed (F2 via Fix A); the verdict above still speaks only for a8844a6. No sealed hash changed (`verifier-prompt-hash.mjs` output byte-identical before and after)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — An OpenRouter 401/402 on a fixture row is scored as a quality failure, which can trigger MAIN

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: packages/code-reviewer/evals/finder-provider.ts:495-506; packages/code-reviewer/scripts/promptfoo-gate-rows.mjs:110-123
- **Detail**: Definitions "Measurement error" and gate.md §5 say an OpenRouter 401/402 is a measurement error and never a model failure. Phase 2 F3 implemented that only in the PR-series runner (`finder-gate-core.mjs` `accountErrorStatus`). The promptfoo adapter's catch block keeps only `error.message`, so the HTTP status is lost. `rowFailureOf` then turns a credit exhaustion on the finder or the verifier into a `finderError` / `verifierError` row. That fails `rowOk`, so G3f fails, and G3f is a quality gate that can start MAIN, the paid arm. Credits ran thin on 2026-09-08 (memory), so the scenario is realistic.
- **Fix**: In the adapter's catch, record `metadata.errorStatus` from `statusCode ?? cause.statusCode`, and have the rows script map 401/402 to `measurementErrorRows` (failed run), with a test on each side.
  - Strength: It reuses the runner's detection rule, and it closes the one path by which a billing failure could spend MAIN's budget.
  - Tradeoff: Two files plus tests, all in the same, already-tested area.
  - Confidence: HIGH — confirmed by reading both locations; the status is never captured.
  - Blind spot: promptfoo's own provider-error wrapping was not checked; promptfoo may already surface the status elsewhere in the row.
- **Decision**: FIXED (owner accepted, 2026-10-04): the adapter's catch records `metadata.errorStatus` from `statusCode ?? cause.statusCode`; `checkRow` maps 401/402 on either pass to `measurementError` ("OpenRouter account error (HTTP n) on the <pass>"), so the run is a failed run with no G3 verdict, never a G3f failure. `ACCOUNT_ERROR_STATUSES` is imported from `finder-gate-core.mjs`. Tests on both sides (adapter: finder 402, verifier 401, status on the cause, none without a status; rows: 401/402 on finder and verifier, a finder-only export, a 500 stays the pass's failure). Commit: `fix(finder-verification): resolve impl-review a8844a6 F1–F8 (p3)`.

### F2 — A runner exception is recorded as a model failure, and the series keeps spending

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate-core.mjs:523-524, 586-592
- **Detail**: Every exception from `runGateAttempt` that is not a verification abort or a 401/402 gets `measurementError: null`. That includes a TypeError in the wrapping, `capDiff` or `planExcerpts`, and a reader I/O error such as EACCES. The attempt is then recorded as `<pass>:error-<Name>`, counts against G1 (9/10) as a model failure, and the series continues. Definitions "Measurement error" lists "a runner crash" and "a bug in this change's code". (Interrupted attempts counting as failed is the owner's decision of 2026-10-04 and is not part of this finding.)
- **Fix A ⭐ Recommended**: Classify any error that is not an API call error (`APICallError` / an HTTP status), a timeout or an output-validation error (`FinderOutputError`, `NoObjectGenerated`) as a measurement error, which stops the series. Add tests for a TypeError and for a reader EACCES.
  - Strength: The record then matches the definition, and spending stops at the first harness bug, as F3 of phase 2 already does for 401/402.
  - Tradeoff: An unforeseen provider-side error class could be misread as a harness bug and stop a valid series. That fails safe: it costs a re-run, not a wrong verdict.
  - Confidence: MED — the set of model-attributable error classes has to be enumerated carefully.
  - Blind spot: The error classes the AI SDK raises for a malformed provider response were not listed.
- **Fix B**: Keep the classification, and have the owner reclassify from the record ("a bug … found in a record"), with the series stopping on any non-API error.
  - Strength: The smallest code change.
  - Tradeoff: The verdict depends on someone reading every error line before the gate result counts.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (owner, 2026-10-04): `isModelAttributableError` admits exactly an API call error with an HTTP status (own or cause's), a timeout, and `FinderOutputError` / `VerifierOutputError` / `AI_NoObjectGeneratedError`; every other error is `runner error, not attributable to the model (<name>: <message>)`, a measurement error that stops the series. The classes are listed in gate.md §5 and the plan's Definitions row. Tests: a TypeError (evaluated and thrown by a pass in a real attempt), an EACCES escaping the reader (stops the series, 2 attempts not-run), a reader whose every read fails with EACCES (unusable-source abort), a status-less connection failure, and the six attributable cases. Interpretation, flagged to the owner: a connection failure with no HTTP status is a measurement error (fail-safe: a re-run, never a wrong verdict). Commit: `fix(finder-verification): resolve impl-review a8844a6 F1–F8 (p3)`.

### F3 — The series identity does not pin the code under test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate-core.mjs:145-156; scripts/finder-gate.mjs:190
- **Detail**: `seriesIdentity` covers stages, models, endpoints, case, n, the diff, the rules and the source tree. It does not cover the finder or verifier prompts, `EXCERPT_LIMITS`, or the package code. The only commit recorded is the source root's. If a commit touching `prompts.ts` or `excerpts.ts` lands between invocations, a `--start k --append` continuation is accepted, and one series silently mixes two systems under test. gate.md §5 says a fix "is a fresh series", and Phase 4 §1 recomputes the sealed hashes only once, before T0.
- **Fix**: Add the outputs of `verifier-prompt-hash.mjs` (instruction, module and limits hashes) and the git tree of `packages/code-reviewer/src` to the identity, so that `--append` refuses a mismatch. Write them on every line.
  - Strength: Every line then proves it ran the sealed construction, the same mechanism F4 of phase 2 used for the inputs.
  - Tradeoff: A refactor of the hash script must be imported, not copied.
  - Confidence: HIGH — the pattern already exists in this file.
  - Blind spot: The finder prompt is not covered by the sealed hashes today; the source-tree hash covers it.
- **Decision**: FIXED (owner accepted, 2026-10-04): `seriesIdentity` and every line carry `codeHashes` (the sealed subset of `computeVerifierPromptHashes()`, now exported by `verifier-prompt-hash.mjs` and imported by the runner, in a fixed key order) and `packageSrcTree` (the git tree of `packages/code-reviewer/src`; uncommitted changes there refuse to start). `--append` refuses a mismatch. `recall-guard.mjs`'s one-series check includes both fields. The script's printed output is byte-identical to before. Tests: five mismatch cases refused, the subset and order, both lines carry the fields, the runner imports rather than copies. Commit: `fix(finder-verification): resolve impl-review a8844a6 F1–F8 (p3)`.

### F4 — gate.md §3, inside the section to be sealed, misdescribes D2's citations

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-verification/gate.md:264-266
- **Detail**: The text reads "Seven of its eight findings cite `localInput` (`bread-spike.ts` 178–196)". `backcheck-269-policy.json` shows that 5.1 cites line 214, which lies outside both `localInput` (178–196) and `deleteUpload` (198–213). So six findings cite `localInput`, 4.2 cites `deleteUpload`, and 5.1 cites 214. Once sealed, the text cannot be corrected without an amendment.
- **Fix**: Before the hash, rewrite the sentence to "six cite `localInput` (178–196); 4.2 cites `deleteUpload` (200–202); 5.1 cites line 214", stating what 5.1 receives, as given in the JSON.
- **Decision**: FIXED (owner accepted, 2026-10-04): gate.md §3 now reads "Six of its eight findings cite `localInput` (178–196); a seventh (5.1) cites line 214, outside both units. These seven receive `localInput`'s block (167–196) and none of `deleteUpload` (198–213)", taken from `backcheck-269-policy.json`. Commit: `fix(finder-verification): resolve impl-review a8844a6 F1–F8 (p3)`.

### F5 — Plan Phase 5 §3 contradicts the empty-K R4 rule, and recall-guard's exit code cannot tell the two cases apart

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: context/changes/finder-verification/plan.md:846-848; packages/code-reviewer/scripts/recall-guard.mjs:220-224
- **Detail**: These say an empty K list gives `NOT PROVEN` for information only, and the arm is labelled `PASS` with a note:
  - the Definitions row "R4 recall guard" (aligned in a8844a6);
  - gate.md §4 R4;
  - gate.md §5 "After CONTROL".

  Plan Phase 5 §3 still says "`PASS`: every gate passed and R4 `PASS`" and "`NOT PROVEN (R4)` … → stop; the owner decides", with no exception. `recall-guard.mjs` also prints "cannot be PASS" and exits 1 for an empty list, the same as FAIL. Anyone executing Phase 5 from the plan, or from the tool's exit status, would stop CONTROL even though the sealed rule passes it. gate.md is the sealed text and governs, but the plan is what `/rune-implement` executes.

- **Fix**: Add gate.md §5's empty-list branch to plan Phase 5 §3, and have `recall-guard.mjs` print `NOT PROVEN (empty K list — information only, gate.md §5)` with a distinct exit code. Add a test.
- **Decision**: FIXED (owner accepted, 2026-10-04): plan Phase 5 §3 carries gate.md §5's empty-list branch; `recall-guard.mjs` returns `notProvenReason` (`empty-list` | `none-raised`), prints `R4: NOT PROVEN (empty K list — information only, gate.md §5)` and exits 3 (`EXIT_EMPTY_LIST`), distinct from FAIL's and a non-empty NOT PROVEN's 1. gate.md §4 R4 names the exit code. Tests: empty list → line and exit 3; non-empty and nothing raised → plain NOT PROVEN, exit 1; FAIL 1, PASS 0; the reason field. Commit: `fix(finder-verification): resolve impl-review a8844a6 F1–F8 (p3)`.

### F6 — The plan's required budget statement is no longer true

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-verification/plan.md:703-705
- **Detail**: Phase 3 §3 requires gate.md to state that "if CONTROL spends its estimate, MAIN's first PR series alone takes T past $1.60". With the recomputed table, that series reaches $0.66 + $0.85 = $1.51, which is within $1.60. gate.md §7:508-509 correctly states that the first PR series can start and the second cannot ($1.91). gate.md is right; the plan text is stale. The table and A_max recompute exactly.
- **Fix**: Replace the plan sentence with gate.md §7's statement: the second PR series of MAIN crosses $1.60.
- **Decision**: FIXED (owner accepted, 2026-10-04): plan Phase 3 §3 now states gate.md §7's figures — MAIN's fixtures and first PR series can start (T ≈ $1.51), MAIN's second PR series takes T past $1.60 (≈ $1.91). Commit: `fix(finder-verification): resolve impl-review a8844a6 F1–F8 (p3)`.

### F7 — `unit-span-check.mjs` passes with fewer files when run outside the repo root

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-verification/unit-span-check.mjs:32, 42, 64
- **Detail**: `git diff -- .` and `git ls-files -- packages/...` resolve against the current directory. Run from `packages/code-reviewer`, the fixture lists come back empty and the PR lists shrink, yet the script still exits 0 with "zero mismatches". There is no file-count assertion. `verifier-prompt-hash.mjs:39-41` anchors at the top level, and `backcheck-269-policy.mjs` is protected by its diff sha256 check.
- **Fix**: Run git with `-C "$(git rev-parse --show-toplevel)"`, and assert the per-input file counts (19 files / 56 units) or fail.
- **Decision**: FIXED (owner accepted, 2026-10-04): every git call runs with `-C <top level>`, and the script fails unless it covered exactly 19 files / 56 units. Shown: the pre-fix script run from `packages/code-reviewer` read 0 files and exited 0; the fixed one reads 19 / 56 from either directory. Commit: `fix(finder-verification): resolve impl-review a8844a6 F1–F8 (p3)`.

### F8 — The refusal of a dirty source root has no test

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: packages/code-reviewer/scripts/finder-gate.mjs:117-123
- **Detail**: Phase 2 F4 promised that uncommitted changes under the source root refuse to start, and the code does it. It lives in the untested runner file, though, so nothing pins it. It also checks once per invocation and does not see ignored files. It is the only guard between an edited checkout and a series that claims a sealed tree.
- **Fix**: Move `sourceRootTreeOf` and the dirty check into `finder-gate-core.mjs` behind an injected `git`, and test refusal for tracked, staged and untracked changes.
- **Decision**: FIXED (owner accepted, 2026-10-04): `sourceRootTreeOf` moved into `finder-gate-core.mjs` as `committedTreeOf({git, dir, label})` with git injected; the runner uses it for `--source-root` and for the package `src/` (F3). Tests against a real scratch repository: a clean root returns its tree (subdirectory and repo root); a tracked unstaged change, a staged change, an untracked file and an untracked file in a new subdirectory each refuse, naming the file; a change outside the root does not. Commit: `fix(finder-verification): resolve impl-review a8844a6 F1–F8 (p3)`.

## Review Notes

- **Bookkeeping in diff**:
  - context/changes/finder-verification/plan.md
  - context/changes/finder-verification/change.md
  - context/changes/finder-verification/gate.md
  - context/changes/finder-verification/reviews/impl-review-phase-2-0f2d3a9.md
  - context/changes/finder-verification/backcheck-269-policy.{mjs,json}
  - context/changes/finder-verification/unit-span-check.{mjs,json}
- **All nine phase 2 findings are fixed and tested** (F1–F9 of `impl-review-phase-2-0f2d3a9.md`, verified one by one against HEAD), with one gap: F4's dirty-root refusal (this report's F8).
- **Everything reproduces**: the backcheck (9/8/2/1 rows; D13 guard delivered), the unit-span check (19 files, 56 units, 0 mismatches), every hash `verifier-prompt-hash.mjs` prints, the §7 table and A_max. The `EVID` table is byte-identical to `backcheck-269.py`'s. Both Phase 3 scripts write JSON that is not Prettier-formatted, so a re-run dirties the tree until `prettier --write`; after that the output is byte-identical to the committed files.
- **`change.md` has no record of the two Phase 3 owner decisions**: the limits stay with 9/20 accepted, and the empty-K reading. They exist only in gate.md and the a8844a6 commit message, and R4 at `change.md:86-89,122-126` still reads "cannot be PASS".
- **Spend cap overshoot by one attempt is by design**: `--max-spend` = min(1.60 − T, 2.00 − T − A_max) reserves A_max. It is not a finding.
- **Mutation check skipped**: no risk in `context/foundation/test-plan.md` maps to the `packages/code-reviewer` gate tooling.
- **Checks at a8844a6**:
  - package `npm test`: 29 files, 1047 tests, exit 0;
  - `typecheck`: exit 0;
  - `lint`: exit 0;
  - root `npm run format:check`: exit 0;
  - `finder-gate.mjs` without `--stages`: exit 2 ("missing --stages");
  - `backcheck-269-policy.mjs`: exit 0;
  - `unit-span-check.mjs`: exit 0;
  - `verifier-prompt-hash.mjs`: reproduces gate.md §1.
- Lessons: 34 of 37 entries apply to impl-review.
