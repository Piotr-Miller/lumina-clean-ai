<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Finder Fabrication Ablation Campaign

- **Plan**: `context/changes/finder-fabrication-triggers/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-20
- **Verdict**: RETHINK
- **Findings**: 6 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | FAIL    |
| Plan Completeness     | FAIL    |

## Grounding

9/9 existing paths ✓, 4/5 symbol contracts ✓, brief↔plan ✓, Progress 5/5 phases and 18/18 criteria ✓.

## Findings

### F1 — Final decision thresholds are not executable

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Pre-registration
- **Detail**: The plan defines a numeric escalation trigger, but final falsifiers remain qualitative: “unchanged”, “drop sharply”, and “claims persist”. It never specifies what result at `n=20` supports, falsifies, or leaves H* inconclusive. The final decision could therefore be chosen after seeing the data.
- **Fix**: Add a complete numeric read-off table for every rung at screen and escalated sample sizes, followed by an explicit rule combining rung outcomes into the final H* verdict.
  - Strength: Makes every conclusion mechanically derivable from pre-registered numbers.
  - Tradeoff: Requires a statistical choice before implementation.
  - Confidence: HIGH — the current prose has no executable final threshold.
  - Blind spot: The appropriate effect-size boundary still needs selection.
- **Decision**: FIXED (2026-08-20) — numeric read-off table added to Phase 2 (ELIMINATED / DROP ≤ B−4 / UNCHANGED ±3 / INCREASED at cumulative n=20, per predicted component) plus an explicit H\* combining rule.

### F2 — G1 can allow CI rungs without a reproducing CI baseline

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — G1 INVALID-PREMISE gate
- **Detail**: G1 stops only when both variants score `0/20`. If CI scores zero while the instrument variant reproduces, the campaign proceeds even though every rung uses CI. A downward effect cannot be measured from a zero CI baseline, and the escalation rule's “baseline rate” becomes ambiguous.
- **Fix A ⭐ Recommended**: Require the CI baseline to meet a pre-registered minimum reproducibility/power threshold before running CI rungs.
  - Strength: Preserves the production-faithful design.
  - Tradeoff: May stop despite signal in the instrument variant.
  - Confidence: HIGH — rung directionality requires measurable CI signal.
  - Blind spot: The exact minimum rate still needs statistical selection.
- **Fix B**: Pre-register a branch that moves rungs to the instrument variant when CI fails.
  - Strength: Preserves the chance to characterize the defect.
  - Tradeoff: Measures an input production did not receive.
  - Confidence: MEDIUM — it salvages signal but changes the selected base.
  - Blind spot: Comparability with production behavior becomes inferential.
- **Decision**: FIXED (2026-08-20) — user-specified variant of Fix A: G2 requires CI baseline ≥ 5/20 (3/20 scales to 1.2/8 and could never trigger the 2-run screen drop; 5/20 → expected 2/8, so 0/8 escalates); below → pre-registered INSUFFICIENT-CI-SIGNAL stop with the instrument asymmetry recorded. No instrument branch.

### F3 — R1 does not make everything visible

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — R1 prediction and falsifier
- **Detail**: Lifting the cap reveals the complete diff, but not unchanged off-diff code. The `logSafePath` definition behind M3 remains invisible. Therefore an unchanged aggregate M2+M3 rate cannot falsify H*: M3 can legitimately persist.
- **Fix A ⭐ Recommended**: Make R1 cap-specific and add a locality rung that injects the relevant off-diff definitions, then evaluate M1, M2, and M3 separately.
  - Strength: Actually ablates both invisibility mechanisms.
  - Tradeoff: Adds another paid rung.
  - Confidence: HIGH — the off-diff definition remains absent after cap lift.
  - Blind spot: Injected context is an experimental input, not literal CI input.
- **Fix B**: Narrow the campaign's conclusion to cap-driven behavior and explicitly leave the diff-boundary branch of H* unanswered.
  - Strength: Keeps the campaign smaller.
  - Tradeoff: Does not deliver the stated H* verdict.
  - Confidence: HIGH — it aligns the claim with what R1 can observe.
  - Blind spot: M3 remains uncharacterized.
- **Decision**: FIXED (2026-08-20) via Fix A — R1's falsifier is now cap-specific (M1 component); new R-loc rung injects the off-diff defence definitions as a declared experimental input; every rung reads off its predicted mechanism component.

### F4 — Rung rubrics are frozen after baseline results are visible

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Rung ground-truth deltas
- **Detail**: The plan promises every gate and rubric before the first paid run, but rung-specific inventory and rubric deltas are written in Phase 4, after baseline results have been observed.
- **Fix**: Generate all free rung manifests, inventories, and rubric wording in Phase 2 and freeze them before Phase 3. Phase 4 may append only measurements and gate read-offs.
- **Decision**: FIXED (2026-08-20) — rung ground-truth freeze moved into Phase 2 as its own change item; Phase 4 is now runs + read-offs only.

### F5 — `capDiff` cannot be imported under the declared scope

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details and Phase 1 — Fabrication probe
- **Detail**: The plan requires importing `capDiff` while forbidding changes under `src/**`. However, `capDiff` is private in `packages/code-reviewer/src/pipeline.ts`, and the existing probe explicitly documents that decision.
- **Fix**: Permit an export-only `pipeline.ts` change, add a parity/unit test, and revise “no production pipeline changes” to “no production behavior changes.”
- **Decision**: FIXED (2026-08-20) — Phase 1 change #5 (export-only + parity test); scope rule reworded.

### F6 — Run and dollar ceilings cannot currently be enforced

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Escalation rule and ceiling; Phase 3 — Baseline runs
- **Detail**: `40 + 24 + 60 = 124`, already above the stated ceiling of 120 and leaving no margin. It is unclear whether escalation adds 20 runs or 12 runs to reach cumulative `n=20`. Baselines are invoked as `--n 20`, yet the dollar ceiling is supposed to be fixed after the first run. Provider errors, retries, ungradeable results, and grader spend have no complete denominator or replacement policy.
- **Fix**: Define escalation as cumulative `n=8 + 12 = 20`, yielding 100 planned finder attempts plus a stated 20-attempt reserve. Run one counted calibration attempt before the remaining baseline batch. Count every paid attempt, including failures, against ceilings; define the minimum number of gradeable runs; and include measured grader cost in the stopping calculation.
  - Strength: Makes both statistical denominators and spend mechanically enforceable.
  - Tradeoff: Requires resumable batches and explicit failure accounting.
  - Confidence: HIGH — the current arithmetic exceeds its own ceiling.
  - Blind spot: Grader cost variance remains unknown until a first gradeable row.
- **Decision**: FIXED (2026-08-20) — user-specified: hard ceiling 140 paid finder attempts (120 planned + 20-error reserve); every arm reaches its EXACT gradeable target (20 / 8 / cumulative 20); provider errors consume reserve, never denominators; either ceiling exhausted before target → INCONCLUSIVE; calibration = first CI-baseline observation (1+19), graded immediately, fixing the finder+grader $ ceiling before further calls.

### F7 — Standalone grader has no pre-spend executable contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Window-relative fabrication grader
- **Detail**: The plan does not define grading granularity, batching, structured-output schema, timeout/retry behavior, provider-error capture, or grader telemetry. Phase 1 verifies only probe dry-runs, so broken grader wiring could first surface after 40 paid finder runs.
- **Fix**: Specify a flat provider-compatible schema, dump and validate its emitted JSON Schema, capture raw provider failures and usage, and add hermetic tests for prompt construction, parsing, and aggregation before Phase 3.
  - Strength: Detects wiring and schema failures before finder spend.
  - Tradeoff: Adds a small test surface for campaign tooling.
  - Confidence: HIGH — none of these contracts appears in the plan.
  - Blind spot: Semantic grader quality still requires paid output plus hand-read validation.
- **Decision**: FIXED (2026-08-20) — flat structured-output schema + pre-spend schema-dump check, provider-failure/usage capture, hermetic grader tests added to Phase 1 changes and success criteria.

### F8 — Production-faithful conflicts with the tool-less direct probe

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Implementation Approach and Phase 2 — Pinned settings
- **Detail**: Production supplies diff-scoped source context and uses an outer retry plus deduplication and stable IDs. Direct tool-less `createReviewer` changes the prompt, prevents M3 resolution by construction, and omits the pipeline's outer retry, deduplication, and stable-ID assignment. Historical zero tool calls do not guarantee zero calls on altered rung inputs.
- **Fix A ⭐ Recommended**: Reproduce the production source/tool, retry, and finding-normalization contracts.
  - Strength: Results describe the behavior that actually ships.
  - Tradeoff: Tool loops increase variance and potential cost.
  - Confidence: HIGH — these are concrete pipeline differences.
  - Blind spot: The model may still never call the tool.
- **Fix B**: Keep the isolated tool-less probe but remove production-equivalence claims and scope conclusions to single-attempt finder draws.
  - Strength: Produces a cleaner and cheaper distribution measurement.
  - Tradeoff: Cannot directly characterize production M3 behavior.
  - Confidence: HIGH — it accurately describes the proposed instrument.
  - Blind spot: Translation to CI remains inferential.
- **Decision**: FIXED (2026-08-20) via Fix B — production-faithfulness claims struck; conclusions scoped to single-attempt tool-less draws (all archived collapse evidence shares this mode; glm-4.6 0/4 tool calls live; preDedup count 10); the CI-recipe INPUT remains the production-faithful element; R-loc probes the context question experimentally.
