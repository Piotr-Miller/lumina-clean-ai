<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Review Pipeline Reliability Implementation Plan

- **Plan**: `context/changes/review-pipeline-reliability/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-09
- **Verdict**: REVISE
- **Findings**: 2 critical, 3 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

Grounding: 8/8 paths ✓, 6/6 symbols/contracts ✓, brief↔plan ✓

## Findings

### F1 — Hidden output directory will produce no artifact

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Artifact upload step
- **Detail**: The plan uploads `packages/code-reviewer/.review-out/` with `if-no-files-found: ignore`. The composite genuinely writes there, but `actions/upload-artifact@v4` excludes files inside dot-directories by default. Because missing files are ignored, the workflow can remain green while uploading nothing. This directly prevents the artifact end state. Official reference: https://github.com/actions/upload-artifact/blob/v4/README.md#uploading-hidden-files
- **Fix**: Add `include-hidden-files: true` to the narrowly scoped upload step.
- **Decision**: FIXED — plan Phase 3 upload contract now mandates `include-hidden-files: true` with the dot-directory rationale inline; brief's artifact-upload decision row updated.

### F2 — Progress omits two Success Criteria bullets

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 and Phase 3 Success Criteria ↔ Progress
- **Detail**: The Progress contract requires every Success Criteria bullet to have a matching numbered row. Phase 1 contains a `- (none …)` bullet under Manual Verification but correctly has no manual Progress row; the canonical format says empty subsections should be omitted. Phase 3's future schema-flake observation has no `3.5` Progress entry. The latter is also not currently observable as written because `withOneRetry` catches the first failure silently, so ultimately-green GitHub logs will not contain that recovered schema error.
- **Fix**: Remove Phase 1's empty Manual Verification subsection and move Phase 3's non-blocking observation outside phase Success Criteria. If live retry observation is required, add retry telemetry and a matching `3.5` row instead.
- **Decision**: FIXED — both halves: Phase 1's empty Manual subsection removed (prose note instead); Phase 3's observation moved out of Success Criteria into a post-landing note. Additionally adopted the telemetry option: `withOneRetry` gains an `onRetry` hook (Phase 1) wired by the CLI to a stderr line (Phase 2), so a recovered flake IS observable in green-run logs — the note now points at that concrete signal. No `3.5` row added since the observation stays non-blocking/post-landing.

### F3 — `PipelineResult` is optional in one section and required in another

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries; Phase 2 — Pre-dedup finding count
- **Detail**: Key Discoveries calls the new field optional and non-breaking, while Phase 2 requires `preDedupFindingCount: number`. A required field is appropriate for the promised JSON contract, but it is source-breaking for existing typed fixtures in `packages/code-reviewer/src/cli.test.ts` and `packages/code-reviewer/src/render.test.ts`. Neither file appears in the plan. `schemas.test.ts`, mentioned conditionally, does not pin this interface.
- **Fix**: Make the field explicitly required, describe the JSON addition—not the TypeScript change—as non-breaking, and add `cli.test.ts` plus `render.test.ts` to Phase 2.
- **Decision**: FIXED — field stays required; Key Discoveries reworded (deliberate TS compile break, JSON addition non-breaking since only `jq .verdict` consumes the file); `cli.test.ts:19` + `render.test.ts:29` fixture updates added to Phase 2's test scope (fixture locations verified in-repo during triage).

### F4 — Prototype-only error construction cannot exercise `isInstance`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Tests
- **Detail**: The suggested `Object.create(NoObjectGeneratedError.prototype)` fixture will fail `NoObjectGeneratedError.isInstance`. The installed AI SDK brands instances with a private symbol initialized by the constructor, and `isInstance` checks that marker rather than the prototype chain.
- **Fix**: Remove the `Object.create` option and specify construction through the real `NoObjectGeneratedError` constructor with its required `response`, `usage`, and `finishReason` fields.
- **Decision**: FIXED — `Object.create` removed from the Phase 1 test contract and replaced with real-constructor construction; the symbol-marker rationale is now recorded in the plan so the implementer doesn't rediscover it.

### F5 — Invalid numeric `Retry-After` behavior is unresolved

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Delay policy and Testing Strategy
- **Detail**: The contract says every parseable numeric header is clamped to `[0, 30_000]`, which makes a negative value an immediate retry. The Testing Strategy instead says negative values may “fallback or clamp,” leaving the implementer to choose. An immediate retry defeats the backoff goal. The installed SDK's own retry implementation rejects negative delays and falls back.
- **Fix**: Define a usable numeric header as a non-empty, fully parsed, finite value ≥ 0; negative, non-finite, malformed, and HTTP-date values use the class default, while oversized positive values clamp to 30 seconds.
- **Decision**: FIXED — the proposed usability rule adopted verbatim in the Phase 1 delay-policy contract ("never an immediate retry" from a negative header stated explicitly); Testing Strategy's ambiguous "fallback or clamp" wording replaced to match.
