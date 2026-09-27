<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Calibrate Cloud Auto exposure and verify quality against Local

- **Plan**: `context/changes/cloud-quality-below-local/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-27
- **Verdict**: RETHINK
- **Findings**: 3 critical, 2 warnings, 0 observations

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | FAIL    |
| End-State Alignment    | FAIL    |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

## Grounding

18/18 existing paths checked; all four proposed paths absent with existing parents. The seven phase headings match Progress, each phase has the matching number of Progress rows, and the brief matches the plan. The grounded symbols include `recommendParams`, `sampleImageLuma`, `PARAM_RANGES`, `admit_cloud_job`, and `maybePostprocessCloudResult`. The guarded daily-cap write exists in `supabase/migrations/20260828120000_atomic_cloud_daily_cap.sql:83-118`. Replicate's input-file documentation supports the planned upload path (<https://replicate.com/docs/topics/predictions/input-files>). The lessons selection found 27 of 37 entries applicable to plan review. The definition audit found one unresolved contradiction among the 12 definition rows (F1).

Independent degenerate walkthrough: 12 validation photos rated “no harm” and zero rated “improvement” pass the plan's condition 1 despite the quality bar requiring improvement (F1). An unresolved final model error has no Cloud image but is simultaneously meant to receive a failing verdict and trigger “incomplete, no verdict” (F3). The Phase 2 EXIF probe uses validation ID S17-06 in `calibration.md`, which the Phase 3 log check forbids (F4). With post-pass ON, a size-guard or processor fallback yields a raw download, contrary to the definition (F5).

## Findings

### F1 — Auto can pass without improving any photo

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Requirement Definition
- **Location**: Definitions, condition 1 (`plan.md:62`)
- **Detail**: `quality-bar.md:8-20` says Auto improves legibility and that brightening alone does not pass. The plan passes condition 1 with zero harms and a passing S17-01 regression. Twelve “no harm” validation ratings and zero improvements therefore produce a pass, even though the quality bar's first condition is unproven. The plan labels this definition a user decision; its relationship to the earlier agreed quality bar needs an explicit decision.
- **Fix A ⭐ Recommended**: Agree and pre-register an improvement requirement before validation.
  - Strength: Tests the quality bar's stated condition.
  - Tradeoff: The maintainer must choose the threshold.
  - Confidence: HIGH — the two written criteria differ.
  - Blind spot: The intended improvement threshold is undecided.
- **Fix B**: Amend the quality bar so condition 1 is explicitly a no-harm check.
  - Strength: Preserves the plan's current scoring rule.
  - Tradeoff: Does not establish improved legibility.
  - Confidence: HIGH — this resolves the written contradiction.
  - Blind spot: Whether the narrower claim meets the product goal.
- **Decision**: **DECIDED 2026-09-27 — Fix A, refined by the maintainer**: before validation outputs are opened, each of the 12 inputs is labelled needs-improvement or control with a reason; condition 1 requires improvement on every needs-improvement photo (more legible significant detail, night character kept — brightening alone does not count), no harm on all 12, and the S17-01 regression. Applied to plan Definitions and Phase 5.

### F2 — Required measurements can remain pending as later phases proceed

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 implementation note (`plan.md:230-237`), transition into Phases 2–5
- **Detail**: The plan explicitly says a pending manual check does not block the next phase. `.agents/skills/rune-implement/SKILL.md:219-257` also permits that transition. Phase 2 can therefore use an unverified sampler; Phase 3 can tune without the full-resolution premise decision; Phase 4 can ship without accepted final pairs; and Phase 5 can validate without reference and production checks. These checks are causal preconditions of later work, not optional final acceptance.
- **Fix**: State explicit entry gates for each dependent phase and require their recorded evidence before starting it, while leaving unrelated manual checks pending.
  - Strength: Preserves the implementation workflow's commit behavior and the plan's measurement order.
  - Tradeoff: Dependent work pauses for maintainer ratings.
  - Confidence: HIGH — the workflow explicitly permits pending manual rows.
  - Blind spot: None significant.
- **Decision**: **DECIDED 2026-09-27 — applied**: Entry gates added to Phases 2–5 naming the manual rows each requires; the Implementation Note now exempts only those rows from "pending does not block".

### F3 — A final model error has incompatible scoring rules

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Definitions and Phase 5 (`plan.md:68, 470-488`)
- **Detail**: The Definitions score a final model-level error as harm and severe regression, so both conditions fail. Phase 5 also requires both images for all 12 photos or an incomplete validation with no verdict. A final model error produces no Cloud image; both instructions cannot be followed. The scoring script's input contract must account for this case.
- **Fix**: Make a final model error an explicit exception to the both-results rule, record it before unblinding, and have the scorer apply the specified failure.
  - Strength: Preserves the agreed failure policy.
  - Tradeoff: The scorer needs a non-image result record.
  - Confidence: HIGH — the rules directly conflict.
  - Blind spot: None significant.
- **Decision**: **DECIDED 2026-09-27 — applied**: a final model-level error is the one explicit exception to the both-results rule, recorded as a non-image result before the key is opened; the scorer accepts it and scores harm + severe regression, and refuses any other missing result.

### F4 — The EXIF probe fails the Phase 3 log check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phases 2–3 (`plan.md:264-272, 344-350`)
- **Detail**: Phase 2 records the S17-06 EXIF probe, a validation photo, in `calibration.md`. Phase 3's automated criterion says every run logged in that file must name a tuning ID. The criterion would reject the required earlier probe.
- **Fix**: Scope the check to Phase 3 sweep runs, or put the EXIF probe in a separate log.
- **Decision**: **DECIDED 2026-09-27 — applied**: the EXIF probe goes in its own `calibration.md` § EXIF probe section; the tuning-id check covers only the tuning run log.

### F5 — Enabled post-pass does not guarantee a JPEG

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Definitions and Phases 3–5 (`plan.md:65, 335-342, 445-449`)
- **Detail**: The plan says post-pass ON yields JPEG and OFF yields PNG. `src/lib/services/cloud-result-postprocess.client.ts:95-125` instead retains raw output when the 12 MP guard applies or processing fails. Direct tuning judges raw Bread output while validation judges the Download blob. If post-pass is enabled, the accepted tuning output may differ from what users receive; the flag alone cannot identify the actual artifact. `src/components/hooks/useCloudJob.ts:443` derives the download name from the actual blob type.
- **Fix**: Record the actual downloaded format and post-pass outcome for each run; check accepted final tuning pairs through the production result path before freezing them.
  - Strength: Tests the artifact users receive.
  - Tradeoff: Consumes app jobs during tuning.
  - Confidence: HIGH — fallback is explicit in code.
  - Blind spot: The current production flag value is unrecorded.
- **Decision**: **DECIDED 2026-09-27 — maintainer's variant of the fix**: the flag state is recorded separately — observed ON in the served page (`chromaEnabled: true`, 2026-09-27 13:54 UTC). Since it is ON, the six final tuning results are also evaluated through the app path, fallback cases included, before freezing; every run records the downloaded file, its format and whether the post-pass was applied; validation always rates the downloaded result; a flag change between tuning and validation is a change of experimental conditions. Correction to the finding: the 12 MP guard applies to the result's dimensions and never fires on Bread's ≤ 1536 px output; processor failure is the real fallback.
