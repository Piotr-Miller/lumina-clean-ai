<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder Tool-Loop Evals + Model Decision

- **Plan**: `context/changes/finder-tool-loop-evals/plan.md`
- **Scope**: Phase 4 of 4
- **Date**: 2026-08-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Checked-in fallback contradicts the no-change decision

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `packages/code-reviewer/src/config.ts:6`
- **Detail**: The live repository variable correctly remains `z-ai/glm-4.6`, but `DEFAULT_MODEL` remains the declined `anthropic/claude-sonnet-5`. If `OPENROUTER_REVIEW_MODEL` is missing or empty, model resolution falls back to Sonnet, measured at approximately 57.6× the matched GLM cost. This also leaves Phase 4's manual fallback-alignment criterion unsatisfied (`plan.md:443-444`), although Progress row 4.7 is marked complete.
- **Fix**: Set `DEFAULT_MODEL` to `z-ai/glm-4.6` and add a literal config-default assertion for the chosen production model.
- **Decision**: ACCEPTED — fixed as prescribed, with the owner's approval since it touches production
  code. `DEFAULT_MODEL` is now `z-ai/glm-4.6`, and `config.test.ts` gains two LITERAL assertions
  (finder and judge) replacing a check that was tautological — `resolveModels().reviewModel ===
DEFAULT_MODEL` passes whatever the constant says, so it could never have caught this drift. Both
  constants carry comments tying them to the repository variables they must match. Worth recording
  that the divergence PREDATES this change (config.ts has read sonnet-5 throughout; the variable has
  read glm-4.6 since 2026-08-08); what this change contributed was measuring what the fallback would
  cost if it fired.

### F2 — Phase 4 evidence contains incorrect and stale counts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/finder-tool-loop-evals/verification.md:266`
- **Detail**: The record claims eight live runs, but the cited scratch branches contain exactly seven AI Code Review runs: three on PR #123, one on #124, and three on #125. GitHub corroborates all seven run IDs and no eighth run. The decision/README also say five models were evaluated, while the two matrices cover six unique models: GLM 4.6, DeepSeek v3.2, Haiku 4.5, Sonnet 5, GLM 5.2, and DeepSeek v4 Flash. Criterion 4.3 still says “pending the flip decision” after the final no-change decision.
- **Fix**: Correct the live-run and evaluated-model totals everywhere and replace the stale 4.3 text with the final no-change result.
- **Decision**: ACCEPTED — all three errors confirmed and fixed. Verified mechanically rather than
  by re-reading: `gh run view` on each id returns exactly **7** runs (3 on #123, 1 on #124, 3 on
  #125), and enumerating provider labels across both committed snapshots returns exactly **6**
  unique models (the write-up had dropped `deepseek-v3.2` from round 1). Corrected in
  verification.md (heading, deviation 12, criteria 4.4/4.5 rows), decision.md and the eval README.
  The stale 4.3 row now records the no-change branch of the criterion. **The "eight" also appears in
  commit message 2caf9b8, which is immutable history** — the corrected figure lives in the files.
  This is the second count error in this change's prose (after "of five"), both in summaries written
  over data that was itself correct; counts are now derived mechanically.

### F3 — Required live telemetry was summarized, not recorded

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `context/changes/finder-tool-loop-evals/verification.md:278`
- **Detail**: The Phase 4 plan required the per-step telemetry lines and delivered, non-refused context to be recorded from the Actions log. The saved evidence contains run IDs and aggregate summaries, not the step lines themselves. Production telemetry proves requested paths only; delivery is inferred convincingly from Sonnet quoting out-of-hunk content, and `verification.md:326-329` acknowledges that the original criterion cannot be satisfied literally.
- **Fix A ⭐ Recommended**: Append the actual step excerpts for the seven runs, distinguish directly observed requests from inferred delivery, and record 4.4 as a documented criterion deviation.
  - Strength: Makes the existing evidence accurate and reproducible without widening production scope.
  - Tradeoff: Delivery remains inferred rather than directly logged.
  - Confidence: HIGH — the Actions logs and resulting review output remain available.
  - Blind spot: A refusal cannot be excluded from the step logs alone.
- **Fix B**: Add delivered/refused telemetry to production and repeat the scratch probe.
  - Strength: Satisfies the original criterion directly.
  - Tradeoff: Expands production scope and requires another paid, outward-facing scratch PR cycle.
  - Confidence: MEDIUM — the eval provider already contains a working instrumentation pattern.
  - Blind spot: The new production telemetry would need its own implementation review.
- **Decision**: ACCEPTED — **Fix A** applied. The complete `finder step` output of all seven runs is
  appended to verification.md verbatim, and criterion 4.4 is recorded as a **deviation, not a pass**:
  the log proves requested paths only, delivery is inferred from sonnet-5 quoting out-of-hunk text.
  The appended lines also surfaced something the summary had hidden — run 31533093356 step 4 requests
  `review.yml:75-40`, an INVERTED range, which `createDiffScopedSource` answers with a refusal. So at
  least one of sonnet-5's four calls was certainly refused, which no summary had recorded. Fix B
  (production delivered/refused telemetry) was declined here: it is a production change needing its
  own review, and bundling it into a phase whose outcome is "change nothing" is the scope creep the
  reviewer's own tradeoff note warns about.

### F4 — Round-two providers silently widen the documented paid run

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `packages/code-reviewer/evals/README.md:56`
- **Detail**: Phase 4's documented extra decision cycle added two providers to the main promptfoo configuration. The README still describes four models and 48 finder calls, but the documented unfiltered command now runs six models: 72 finder calls plus graders. This increases paid scope unexpectedly. The extra work itself is transparently recorded in `verification.md:302-311`, and its snapshot correctly lives under the change folder.
- **Fix A ⭐ Recommended**: Keep the six-provider config and update the README's matrix, counts, cost guidance, and first-round/round-two filter commands.
  - Strength: Preserves reproducibility in one configuration.
  - Tradeoff: An unfiltered full run remains wider and more expensive.
  - Confidence: HIGH — this is primarily a documentation correction.
  - Blind spot: Future provider additions can cause the same drift.
- **Fix B**: Move the round-two providers into a dedicated promptfoo config.
  - Strength: Restores the original four-provider default paid scope.
  - Tradeoff: Introduces a second configuration whose shared cases and settings must be maintained.
  - Confidence: HIGH — it cleanly separates the two decision cycles.
  - Blind spot: The two configurations could drift over time.
- **Decision**: ACCEPTED — **Fix A** applied. The README's matrix table now lists all six providers
  with a Round column, states plainly that an unfiltered run is 6 × 4 × 3 = **72** finder calls, and
  carries three explicit commands (round 1 / round 2 / everything). The cost line is replaced with
  MEASURED figures — round 1 $0.6263, round 2 ~$0.08, unfiltered ~$1.50–2.00 — instead of the stale
  $1–2 estimate. Fix B (a second config) was declined: two configs sharing four cases, a grader and
  a fixture tree would drift, and the drift would be silent.

## Verification

- `npm test` in `packages/code-reviewer`: PASS — 17 test files, 357 tests.
- `npm run typecheck` in `packages/code-reviewer`: PASS — `tsc --noEmit`.
- `npx promptfoo validate config -c evals/promptfooconfig.yaml`: PASS.
- Mutation testing: SKIPPED — no reviewed Phase 4 file is a risk-critical module from `context/foundation/test-plan.md` §4.
- Scratch cleanup: PASS — PRs #123, #124, and #125 are closed and unmerged; their remote branches are absent.
- Production model control: `OPENROUTER_REVIEW_MODEL=z-ai/glm-4.6`; no outward mutation was performed during review.
- Snapshot safety scan: no common secret patterns found in `results/2026-08-11-round2-new-candidates.json`.

## Review Scope Notes

- Reviewed implementation commits: `2caf9b8` and epilogue `f108cf6`.
- Unrelated worktree changes in `.claude/settings.local.json` and `context/changes/impl-review-ci-agent/` were excluded.
- No implementation files were edited during review.
