<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Enhance-flow UX fixes Implementation Plan

- **Plan**: `context/changes/enhance-ux-fixes/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-29
- **Verdict**: REVISE
- **Findings**: [0 critical] [2 warnings] [0 observations]

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

9/9 paths pass, 5/5 symbols pass, brief->plan pass

## Findings

### F1 - Convert-and-retry updates the submit file, but not the workspace source of truth

- **Severity**: WARNING
- **Impact**: HIGH - architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 - Convert-and-retry button + re-submit
- **Detail**: The plan updates `sourceFile` before the retry, but the visible source preview and before/after baseline are owned separately by `useLocalEnhance` via `sourceUrl` and only change through `enhancer.onAccepted(...)`. As written, the retry can submit a flattened JPEG while the UI still shows the original transparent PNG as the source image.
- **Fix A STAR Recommended**: Reuse the existing accept path for the converted file too: mint a new object URL, update both `sourceFile` and `enhancer.onAccepted(...)`, then trigger the pending resubmit.
  - Strength: Keeps cloud submit, preview, slider, and local-engine state aligned through the existing source-update seam.
  - Tradeoff: Adds a little object-URL lifecycle work to Phase 2.
  - Confidence: HIGH - the split source authorities are explicit in the current code.
  - Blind spot: The exact visual composite still needs manual verification.
- **Fix B**: Lift source state behind one workspace helper/hook and route both upload accept and convert-retry through it.
  - Strength: Removes the whole split-brain class of bugs.
  - Tradeoff: Broader refactor than this UX slice needs.
  - Confidence: MEDIUM - cleaner long term, but larger blast radius than the current plan claims.
  - Blind spot: Would need a quick sweep of all local/cloud source consumers.
- **Decision**: FIXED via Fix A

### F2 - Phase 1 never automatically verifies the server-side 429 classification seam

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 - Edge Function: distinct code for 429
- **Detail**: The desired behavior depends on the Edge Function persisting `error_code: "provider_rate_limited"` instead of `start_failed`, but the planned automated checks only cover `deriveDisplayError` and `deno check`. `deno check` proves syntax/import health, not that the new 429 branch classifies failures correctly.
- **Fix A STAR Recommended**: Extract the 429-vs-default classification into a tiny pure helper and unit-test that helper directly.
  - Strength: Gives deterministic automated proof of the new server/client contract without needing a real Replicate 429.
  - Tradeoff: Adds one extra seam in the implementation.
  - Confidence: HIGH - it closes the exact gap the current plan leaves open.
  - Blind spot: The surrounding Deno wiring still relies on `deno check` plus manual smoke.
- **Fix B**: Add a focused Deno-side probe/harness for the `/start` non-2xx branch.
  - Strength: Tests the real function path.
  - Tradeoff: More setup and more fragile tooling for a very small rule.
  - Confidence: MEDIUM - stronger end-to-end signal, but higher cost than the feature seems to justify.
  - Blind spot: No existing Deno test harness was identified in this change.
- **Decision**: FIXED (Fix A) — Phase 1 #1 now adds a pure, dependency-free `classifyStartFailure(status)` in `replicate-webhook.ts` (shared across the Deno boundary), used by the Edge Function and unit-tested in `tests/replicate-webhook.test.ts` (429→provider_rate_limited / else→start_failed). Added to Phase 1's automated criteria + Progress 1.3.
