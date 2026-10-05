<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder verification — verify-before-publish pass, pre-registered gate and measurement

- **Plan**: context/changes/finder-verification/plan.md
- **Scope**: Phase 2 of 9
- **Base**: 3e26005 (Progress — last Phase 1 commit)
- **Head**: 0f2d3a97b32eacb6f38f5ebe25510c91a6c9a6ae
- **Worktree**: excluded (.claude/settings.local.json, temp_steps.md, context/changes/cloud-exif-orientation/change.md — unrelated)
- **Checks ran at**: 0f2d3a9 (current HEAD)
- **Manual acceptance**: 1 of 1 confirmed (2.3)
- **Date**: 2026-10-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 4 observations
- **Triage**: 2026-10-04 by the owner — all nine fixed (F1, F2 via Fix A); the verdict above still speaks only for 0f2d3a9. No separate re-review of 5b29930: the owner will run one /rune-impl-review covering 0f2d3a9 through the end of Phase 3's pre-seal work, before the seal

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — A timed-out request that was retried leaves cost marked complete; `timedOut` field missing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate-core.mjs:262-277, 464-467
- **Detail**: Plan §2.1 records every request as `{…, reasoningTextChars, timedOut}`; `timedOut` appears nowhere in the package. An aborted request emits no `onStepEnd`, so a timeout followed by a successful retry leaves one priced request for the pass, and `costComplete` (`requests.every(cost !== null) && calledPasses.every(pass has a request)`) stays `true`. The Definitions row "Incomplete cost" says any request with no reported cost makes it incomplete, so G4b and `seriesSpend` can pass on an under-reported total. A finder timeout is not counted anywhere: R3 counts only verifier and judge timeouts. A verifier or judge timeout still fails the series through the timeout clause, so the gap is narrowest for those two passes. `promptfoo-gate-rows.mjs:321-322` already notes the same blind spot.
- **Fix A ⭐ Recommended**: Mark `costComplete = false` when any call has `outcome === "timeout"`, and add `timedOut` to the request record from the call log.
  - Strength: Matches the Definitions row literally, fails closed, and is a few-line change with a test.
  - Tradeoff: A finder timeout that retried successfully now fails G4b for that series, which is stricter than the timeout clause applied to the finder.
  - Confidence: HIGH — `calls[]` already carries `outcome: "timeout"`.
  - Blind spot: Whether OpenRouter bills an aborted request at all is unverified; if it never does, the cost is zero rather than unknown.
- **Fix B**: Keep `costComplete` as it is, report "possibly under-costed" per attempt, and record the reading in a gate.md amendment.
  - Strength: No behavioural change before the seal.
  - Tradeoff: Leaves an incomplete cost that the Definitions row says must fail.
  - Confidence: MED.
  - Blind spot: An amendment is needed before Phase 4.
- **Decision**: FIXED via Fix A (owner, 2026-10-04): `costComplete` is false when any call has outcome `timeout`; every request record carries `timedOut` from the call log. An incomplete cost fails G4b, which is not a quality gate. Tests: a finder timeout + priced retry → incomplete; a retried judge timeout → its requests `timedOut: [true, false]`, G4b fails.

### F2 — G4b, spend and gates summarise one invocation, not the PR series

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate.mjs:160-162, 217, 271
- **Detail**: `seriesSpend` starts at 0 and `summarizeSeries(evaluations)` sees only the attempts this run executed. Plan Definitions and gate §4 define G4b as the median over the PR series of 10, and the stop rule runs a probe first (G2-01, then `--start 2 --append`). After a continuation, the SUMMARY line's `valid`, G4b median and timeout counts leave out the earlier attempts. Interrupted attempts are only listed in `interruptedBefore`, never counted as failures in `gates`. The in-series `--max-spend` also ignores spend from the earlier invocation, so A_max/series caps from Definitions "Budget" can be exceeded across the probe and continuation.
- **Fix A ⭐ Recommended**: On `--append`, rebuild the gates and the starting `seriesSpend` from every attempt record in the file, counting interrupted attempts as failed with incomplete cost.
  - Strength: The SUMMARY is then the series verdict, and the budget cut matches Definitions.
  - Tradeoff: The per-attempt evaluation needs to be stored or re-derivable from the record; a modest refactor.
  - Confidence: MED — depends on records carrying enough to re-evaluate (they carry `verification` and costs).
  - Blind spot: Records written before the fix would not be re-evaluable; there are none yet (no paid run).
- **Fix B**: Label the output `gates (this invocation only)` and compute the series verdict from the whole JSONL with a separate script.
  - Strength: Smaller change in the runner.
  - Tradeoff: Two sources for one verdict, and the budget cut stays per invocation.
  - Confidence: HIGH that it's simple; MED that it stays honest.
  - Blind spot: The spend cap gap remains.
- **Decision**: FIXED via Fix A (owner, 2026-10-04): the loop moved to `runSeries` (core, tested); on `--append` the gates and the starting `seriesSpend` are rebuilt from every attempt record in the file, interrupted attempts counted as failed with incomplete cost; `gates.scope = "series"`. `--max-spend` caps the whole series (plan Definitions "Budget", gate.md §7).

### F3 — A measurement error does not stop the series, and 401/402 is not classified as one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate-core.mjs:477-484; packages/code-reviewer/scripts/finder-gate.mjs:185-266
- **Detail**: `measurementError` is non-null only for the verification abort and an unexpected status. A 401/402 OpenRouter account error becomes a model outcome (`finder:APICallError-402`) that counts against G1, but Definitions lists it as a measurement error. Memory records credits running thin on 2026-09-08. The attempt loop has no `break`, so after an unusable-source abort (finder already paid) every remaining attempt pays for the finder again. Definitions says "Measurement stops".
- **Fix**: Map `statusCode` 401/402 to `measurementError`, stop the loop on the first measurement error, and record the remaining attempts as `not-run (measurement error)`, with tests.
- **Decision**: FIXED (owner accepted, 2026-10-04): HTTP 401/402 → `measurementError: "OpenRouter account error (HTTP <n>)"`; the first measurement error stops the series and the remaining attempts are `not-run (measurement error)`; a continuation of a series that recorded one runs nothing.

### F4 — Series identity does not pin the inputs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate-core.mjs:131-139
- **Detail**: `seriesIdentity` covers stages, models, endpoints, case and n, but not `--diff`, `--rules` or `--source-root`, and records carry no input hash. `--append` with a different diff is accepted. An input hash mismatch is a measurement error in Definitions, and the freeze (Phase 0) depends on the exact bytes reaching the model. The gap predates this phase, but Phase 2 rewrote the identity and the paid phases rely on it.
- **Fix**: Add the sha256 of the diff and rules, plus the source-root `HEAD`, to `seriesIdentity` and to every record line; add a test that refuses an `--append` with different inputs.
- **Decision**: FIXED (owner accepted, 2026-10-04): `seriesIdentity` and every line carry `diffSha256`, `rulesSha256` and `sourceRootTree`; `--append` with different inputs is refused. Interpretation, flagged to the owner: the identity pins the source root's git TREE (`HEAD:<prefix>`), not its HEAD commit, because the G2 root `evals/fixtures/clean-change` lives inside this repo, whose HEAD moves with every unrelated commit; the HEAD commit is still written on every line as `sourceRootHead`. Uncommitted changes under the root refuse to start. **Owner-confirmed 2026-10-04:** the tree pin is accepted — `sourceRootTree` in the identity, `sourceRootHead` on every line, and uncommitted changes under the root refuse to start.

### F5 — Rows script skips every verifier check when `--expected-verifier-provider` is omitted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/promptfoo-gate-rows.mjs:175, 464
- **Detail**: Without the flag, `v = null`, and the verifier provider, A3, cost-completeness and `skipped-no-source` checks are all skipped. A `control-luna-verify` export can then exit 0. The adapter always writes `metadata.verifier`, so the script can tell (lessons: "a check that cannot say what it found is a safety defect").
- **Fix**: Exit 2 with a message naming the flag when any row carries `metadata.verifier` and the flag is absent.
- **Decision**: FIXED (owner accepted, 2026-10-04): `missingVerifierFlagError`; `main` exits 2 naming `--expected-verifier-provider` when any row (export or re-grade) carries `metadata.verifier` and the flag is absent.

### F6 — Verifier failures on fixture rows are labelled finder errors and hide verifier leaks

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/finder-provider.ts (catch block); packages/code-reviewer/scripts/promptfoo-gate-rows.mjs:95-97, 181-183
- **Detail**: A verifier throw reaches the row as `response.error`, so `finderErrorOf` lists it under finder-error rows. `verifierLeak` is gated on `finderError === null`, so an A3 leak on a verifier request that later failed never reaches `leakRows`. The row still fails, but the label is wrong.
- **Fix**: Tag the failing pass in metadata, and evaluate the verifier leak whenever `verifier.requests` is non-empty.
- **Decision**: FIXED (owner accepted, 2026-10-04): the adapter tags `metadata.failedPass` (`finder` | `verifier`) on the error path; the rows script reports `verifierError` / `verifierErrorRows` apart from finder errors (not a measurement error, counts for no metric), and evaluates the verifier A3 leak whenever the verifier sent a request.

### F7 — recall-guard input gaps

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/recall-guard.mjs:42-54, 83, 126
- **Detail**:
  - Duplicate attempt ids are not rejected: `byId` keeps the last, but valid attempts are counted twice, which inflates k.
  - The series file's identity (PR series, case, n = 10) is not checked, so a G2 file is accepted.
  - The whole-pipeline detection is reported as `{x: p, of: attempts.length}`. Its numerator counts valid attempts only, but its denominator counts every attempt (the test pins `x: 1, of: 3`). The plan says "published in x of 10". This is informational only.
- **Fix**: Refuse duplicate attempt ids and a non-PR-series identity, and compute detection x over all attempts (or label both terms), with tests.
- **Decision**: FIXED (owner accepted, 2026-10-04): `assertOnePrSeries` refuses duplicate attempt ids or numbers, stages other than `finder,verifier,judge`, and mixed series identities; detection is `{x, of, over: "all attempts"}` over all attempts. Consequence: a pre-verification finding of an INVALID attempt now needs a match entry too (detection counts it). **Owner-confirmed 2026-10-04:** the match-entry requirement for invalid attempts is accepted; with the empty #240 K list, every finding's match is simply empty.

### F8 — `--max-spend` defaults to unlimited

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate-core.mjs:84
- **Detail**: When the flag is left out, `maxSpend` is `Infinity`, so a paid series can start with no cap, though the whole change runs on a $2.00 budget. This predates the phase (`3e26005`:55), and the phase 4 procedure always passes the flag.
- **Fix**: Make `--max-spend` required, or require an explicit `--max-spend none`.
- **Decision**: FIXED (owner accepted, 2026-10-04): `--max-spend` is required; empty, negative, non-numeric and `Infinity` are refused.

### F9 — G2 path copies the pipeline's finder wiring with no parity test; the schema test checks only keys

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/scripts/finder-gate-core.mjs:384-405; packages/code-reviewer/src/pipeline.ts:321; packages/code-reviewer/evals/finder-provider.test.ts
- **Detail**: The G2 (`finder,verifier`) path rebuilds the pipeline's finder call by hand (`capProjectContext` → `capDiff(orderDiffForCap)` → `maxSteps`). That is why `capProjectContext` is now exported, and the export itself is justified. No test asserts that the G2 finder request equals `runReviewPipeline`'s, so the two can drift. Separately, the "published output satisfies review-result.schema.json" test checks only key names and required fields, not a real schema validation.
- **Fix**: Add a test that the G2 finder request equals the pipeline's finder request for the same input, and validate the published output against the JSON Schema with a real validator.
- **Decision**: FIXED (owner accepted, 2026-10-04): a test pins the G2 finder's options and request equal to `runReviewPipeline`'s; it exposed a real divergence (G2 passed an unresolved `timeoutMs`), fixed by resolving timeouts with the pipeline's own `resolveTimeouts` (now exported). The schema test validates with promptfoo's own ajv 8 (`strictSchema: true`), including two negative cases.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-verification/change.md, context/changes/finder-verification/gate.md, context/changes/finder-verification/plan.md
- Automated criteria at 0f2d3a9: `npm test` 1012/1012 pass; typecheck, lint, root `format:check` pass; `finder-gate.mjs` without `--stages` exits 2 with `finder-gate: missing --stages`.
- Mutation check skipped: no `context/foundation/test-plan.md` risk maps to `packages/code-reviewer`.
- Lessons: 34 of 37 entries carry `impl-review`/`all`. The priors used were the optional-field, silent-degradation, guard-metric, schema-subset and silent-check entries.
- Checked and fine: `verifierRoot` confinement (realpath + relative; `..`, symlinks and prefix collisions refused); no outer retry; format-repair costs recorded; overwrite/re-run refusal; R4 arithmetic (k=1→1, 2→2, 3→2, 10→6); hand-read reuse's four conditions; graded output is exactly `{summary, findings}`.
- Benign extras, which fail closed: `metadata.verification.publishedIds`, `measurementErrorRows`, hand-read-reuse's `needs-claim-decision` state, and recall-guard's refusal of an incomplete matches table.
- Stale plan citation: `findings.ts:63–65` (dedup key) is now at line 14 / 89; the content is unchanged.
