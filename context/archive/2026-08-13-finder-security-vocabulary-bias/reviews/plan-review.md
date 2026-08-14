<!-- PLAN-REVIEW-REPORT -->

> **Review 1 of 2 — reviews the ORIGINAL plan (pre-revision).** Its F1-F7 are the findings that reshaped
> the plan; every `Decision` field below records how each was dispositioned, and `plan.md`,
> `plan-brief.md`, `change.md` and the `lessons.md` entry all cite this numbering.
>
> The second review, of the REVISED plan plus the Phase 1 instrument, is
> [`plan-review-2.md`](plan-review-2.md) — a different F1-F5. This file was briefly overwritten by that
> one on 2026-08-14 and restored from `dcb32ec`; keep them at separate paths, because the two F-numberings
> are not interchangeable.

# Plan Review: Finder Precision on Hardening Diffs

- **Plan**: `context/changes/finder-security-vocabulary-bias/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-14
- **Verdict**: RETHINK
- **Findings**: 3 critical, 4 warnings, 0 observations
- **Resolution**: ALL 7 ADDRESSED — plan rewritten 2026-08-14 (not patched; F3 changed the plan's
  shape). Two dispositions deviate from the recommended fix, both argued in place: **F3** took Fix B
  over the starred Fix A, and **F4** took a third option neither offered. `lessons.md` gained "A guard
  metric that only exists on success cannot detect failure" from F1+F2, which were the same mistake in
  two forms and one of them a repeat. Per-finding detail in the `Decision` fields below.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | FAIL    |
| Plan Completeness     | FAIL    |

## Grounding

Grounding: 15/15 existing paths ✓, 10/10 symbols ✓, brief↔plan ✓, Progress 33/33 ✓

## Findings

### F1 — Schema-reliability guard measures the wrong signal

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 and Phase 3 measurement gates
- **Detail**: The plan uses `schema_validity` to detect whether requiring `evidence` increases structured-output failures. However, `packages/code-reviewer/evals/README.md:33` says `schema_validity` exists only on successful provider calls; schema-generation failures become provider-error rows and receive no metric. The guard could remain unchanged while actual finder failures increase materially.
- **Fix**: Replace the reliability threshold with provider-error or usable-output counts over all 20 attempts. Retain `schema_validity` only as the successful-output JSON-schema gate, and count provider errors as guard misses.
- **Decision**: FIXED IN PLAN (2026-08-14) — accepted as stated, and sharper than described: `code-review-evals/reviews/impl-review.md:65-73` already recorded that `schema_validity` is near-tautological because the provider serializes an already-zod-validated object, so the original guard could not fail in the direction it was chosen for. Phase 2 now defines `usable_output` = attempts producing a parseable review, over all 20, and Phase 3's Critical Implementation Details ties it to F7: a response missing a required field is unrepairable, so it lands as a provider-error row carrying no `schema_validity` at all.

### F2 — The vulnerable-fixture guard can be satisfied by `evidence` itself

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 vulnerable fixture and Phase 3 post-fix measurement
- **Detail**: The plan reuses `scoreIssueRecall`, which searches `JSON.stringify(review)` in `packages/code-reviewer/evals/assertions.mjs:236`. After Phase 3, that JSON includes an exact vulnerable source line in `evidence`. A planted-defect token can therefore satisfy `expectedIssues` even when the finding text never identifies the vulnerability. `reviewMustFail` only requires any critical/major finding, so an unrelated false finding could complete the false-positive combination. The fix could suppress the real vulnerability and still clear the ≥19/20 guard.
- **Fix**: Grade only the same finding's `description + suggestion`, excluding summary, file metadata, and `evidence`; require that matching finding to meet the intended severity condition.
  - Strength: Proves the defect was actually reported rather than merely quoted.
  - Tradeoff: A dedicated grader adds a small API; changing `scoreIssueRecall` globally changes historical metric semantics.
  - Confidence: HIGH — the current full-object search is explicit.
  - Blind spot: The semantic patterns still need manual validation against the fixture.
- **Decision**: FIXED IN PLAN (2026-08-14) — accepted in full; the strongest finding in this review. The research doc had already recorded that `scoreIssueRecall` is field-blind, and the plan added the one field that turns that property into a false pass. Phase 1 now specifies a dedicated grader scanning only the matching finding's `description` + `suggestion` and requiring that same finding to be `critical`/`major`. `scoreIssueRecall` is left untouched and named in "What We're NOT Doing", because changing it would silently alter the meaning of three committed historical matrices.

### F3 — The experiment has outcomes that cannot complete the plan

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 gate, Phase 3 failure route, Phase 4, and Progress
- **Detail**: Exactly `2/20` fabrications is neither pass (`≤1`) nor fail (`≥3`), and a schema-reliability regression of exactly `2` is neither pass (within 1) nor fail (`>2`). If the baseline is invalid, Phase 3 does not start; if the fix fails, it routes to an abandon path. Yet Progress has no skipped state and still requires every Phase 3 item plus Phase 4's successful live-probe checks. Negative results are called acceptable but cannot reach a truthful 33/33 completion or archival state.
- **Fix A ⭐ Recommended**: Define a total PASS/FAIL/INCONCLUSIVE decision table, a bounded rerun policy, and branch-neutral Progress criteria that can be truthfully completed for ship, abandon, or invalid-fixture outcomes.
  - Strength: Preserves the current single-change workflow and pre-registration.
  - Tradeoff: Conditional outcome criteria require careful wording.
  - Confidence: HIGH — the unowned numeric bands and incompatible Progress rows are explicit.
  - Blind spot: Progress has no skipped marker, so branch-specific tests cannot remain mandatory rows.
- **Fix B**: End this change after measurement and open a separate rollout change only when the experiment passes.
  - Strength: Each plan remains linear and mechanically completable.
  - Tradeoff: Adds another change/plan/PR handoff.
  - Confidence: HIGH — cleanly fits the repository's change workflow.
  - Blind spot: Issue/roadmap handoff details were not assessed.
- **Decision**: FIXED IN PLAN via **Fix B**, not the recommended Fix A (2026-08-14) — the diagnosis is accepted in full; the disposition deviates deliberately. Fix A keeps one change with conditional Progress rows, and conditional criteria are exactly the kind of bookkeeping that rots once an outcome is known. This repo has a direct precedent for the split: `finder-tool-loop-evals` was an experiment change whose deliverable was the decision "no model change", and it archived cleanly _because_ deciding was the deliverable. So this change now ends at a recorded decision, rollout is a separate change opened only on a PASS, and both numeric gaps are closed — a total PASS/FAIL/INCONCLUSIVE table (INCONCLUSIVE owns fabrications 2-4 and a reliability delta of exactly 2) with one bounded rerun that records a second INCONCLUSIVE as FAIL. Progress rows are reworded to be truthfully completable under PASS, FAIL, or INVALID-FIXTURE.

### F4 — Required text is not verified as a diff quote

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 3 schema field and verification
- **Detail**: `z.string().min(1)` proves only that `evidence` is non-empty. It accepts paraphrases, invented code, or unrelated text. The plan checks only a sample manually, so all automated criteria can pass while the desired "every evidence string quotes the diff" invariant remains false.
- **Fix A ⭐ Recommended**: Canonicalize diff lines and deterministically validate every evidence excerpt against the reviewed diff, with an all-row eval assertion and observable failure/retry behavior.
  - Strength: Turns the claimed grounding rule into an actual invariant.
  - Tradeoff: Quote normalization must handle diff prefixes and multiline excerpts; rejection may increase provider failures.
  - Confidence: MEDIUM — technically feasible, but normalization behavior needs design.
  - Blind spot: The effect on existing envelope repair must be measured.
- **Fix B**: Reframe `evidence` as a required audit hint rather than guaranteed quotation, and weaken the Desired End State accordingly.
  - Strength: Keeps the experiment lean.
  - Tradeoff: Gives up the structural-grounding guarantee.
  - Confidence: HIGH — accurately describes what the current schema enforces.
  - Blind spot: Invalid evidence can still reach artifacts outside sampled runs.
- **Decision**: FIXED IN PLAN via a **third option** (2026-08-14) — the finding is accepted; neither offered fix was taken. Fix A puts quote validation in the schema, where one bad quote rejects an entire review — which collides directly with F1's reliability concern and with the finder's existing 1-in-8 schema mismatch. Fix B gives up the signal entirely. Instead: the schema keeps `min(1)`, and quote fidelity becomes a **deterministic observational metric** (Phase 1, item 5) reporting the share of `evidence` strings that appear verbatim in the diff after canonicalization. The Desired End State is weakened as Fix B suggested — it no longer claims the invariant — but the number is measured on every row rather than sampled by hand, so "fabrication fell while quote fidelity stayed poor" becomes a readable outcome instead of an unnoticed one. Enforcement stays available as a follow-up once the real quote-fidelity rate is known.

### F5 — The named fabrication metric is not the registered “N of 20” rate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 fabrication assertion
- **Detail**: `1 - fabrications / findings.length` measures finding-weighted lexical precision. One fabricated claim scores `0` in a one-finding review but `0.9` in a ten-finding review, although both count as one failed run under the registered bar. Matching several defences in one finding can also push the score below zero unless deduplicated.
- **Fix**: Make `no_fabricated_absence` binary per run (`1` when none, otherwise `0`), deduplicate offending findings, and place counts/details in the reason or a separate observational metric.
- **Decision**: FIXED IN PLAN (2026-08-14) — accepted as stated. Phase 1 item 3 now specifies binary-per-run scoring, deduplication of findings matching several defences, and counts plus defence labels in the reason string. The negative-score case the finding names was a genuine bug in the original formula, not just a units mismatch.

### F6 — Evidence stripping is enforced at a caller, not the judge boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 judge payload
- **Detail**: The plan strips `evidence` in `pipeline.ts`, but `JudgePromptInput.findings` remains `IdentifiedFinding[]` and `buildJudgePrompt` serializes the complete objects in `prompts.ts:95-115`. The direct caller `scripts/judge-diagnose.mjs:55-92` bypasses the pipeline, and the judge APIs are publicly exported.
- **Fix**: Introduce an explicit judge DTO/allowlist and sanitize at the judge prompt boundary, while retaining full findings in `PipelineResult`.
  - Strength: One enforcement point covers current and future callers.
  - Tradeoff: Adds a small mapping/type boundary and requires diagnostic-script updates.
  - Confidence: HIGH — direct callers and full-object serialization are present.
  - Blind spot: No other direct judge serializers were found.
- **Decision**: FIXED IN PLAN (2026-08-14) — accepted as stated. Phase 3 item 3 moves sanitization into `buildJudgePrompt`, which now serializes a judge-facing projection rather than the finding object, with `JudgePromptInput` naming that projection in its type so the boundary is enforced by the compiler rather than by caller discipline. `PipelineResult` keeps full findings; `judge-diagnose.mjs` is updated. The plan-level reason to prefer the boundary is specific to this change: #127's downstream failure was an over-long judge generation, so a leak here re-creates the exact failure the fix must not inflate.

### F7 — Phase 3 omits its required test and support-file blast radius

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 Changes Required
- **Detail**: Making `Finding.evidence` required breaks typed factories or fixtures in `findings.test.ts`, `pipeline.test.ts`, `scorecard.test.ts`, `judge.test.ts`, `provider-attempts.test.ts`, `prompts.test.ts`, `render.test.ts`, `schemas.test.ts`, and `output-repair.test.ts`. Envelope repair deliberately invents no missing content, so a historical no-evidence response becomes unrepairable. Meanwhile, `findings.ts` and `render.ts` likely need regression tests but no production-code changes.
- **Fix**: Add the exact test/support paths to Phase 3, map each behavioral criterion to its test file, and document how envelope repair behaves when `evidence` is absent.
- **Decision**: FIXED IN PLAN (2026-08-14) — accepted as stated. Phase 3 item 7 enumerates all nine test files and maps each behavioural criterion to the file that owns it; item 5 records that repair's "never invents, never drops" contract makes a missing required field **unrepairable**, surfacing as a provider error. That last point is what connects F7 to F1: the unrepairable path is precisely why the reliability guard must count usable output over attempts instead of reading `schema_validity`.
