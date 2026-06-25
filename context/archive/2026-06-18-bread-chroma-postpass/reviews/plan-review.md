<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Bread chroma-denoise post-pass + pinned version resolution

- **Plan**: `context/changes/bread-chroma-postpass/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-20
- **Original verdict**: REVISE
- **Post-triage verdict**: SOUND
- **Findings**: 2 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Original | After fixes |
| --------------------- | -------- | ----------- |
| End-State Alignment   | FAIL     | PASS        |
| Lean Execution        | PASS     | PASS        |
| Architectural Fitness | WARNING  | PASS        |
| Blind Spots           | FAIL     | PASS        |
| Plan Completeness     | WARNING  | PASS        |

## Grounding

8/8 existing paths verified, 2 planned new paths identified, 5/5 symbols
verified, brief-to-plan consistent, and Progress matched all 5 phases with no
checkboxes outside the canonical Progress section.

## Findings

### F1 — Slider still showed the raw result

- **Severity**: CRITICAL
- **Impact**: LOW — quick decision; fix was obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 4
- **Detail**: The plan processed `loaded.blob` but retained the raw signed URL
  as `afterUrl`; `EnhanceWorkspace` renders that URL in the slider, so only the
  download would have been denoised.
- **Fix**: Use a managed object URL created from the processed JPEG as
  `afterUrl`, use the same Blob for download, and revoke the object URL across
  cancellation/job-change/unmount.
- **Decision**: FIXED

### F2 — Exposed token was treated as optional follow-up

- **Severity**: CRITICAL
- **Impact**: LOW — quick decision; credential rotation is mandatory
- **Dimension**: Blind Spots
- **Location**: Migration Notes / Phase 1 prerequisite
- **Detail**: The Replicate token was exposed in the planning conversation, but
  the plan described rotation conditionally and pointed at `.dev.vars`, which
  is not a current local consumer of this token.
- **Fix**: Make rotation blocking before Phase 1; update hosted Supabase,
  `.env`, and `supabase/functions/.env`; prove the old token is rejected.
- **Decision**: FIXED

### F3 — Flag-on Canvas test had no executable Node seam

- **Severity**: WARNING
- **Impact**: MEDIUM — real testability tradeoff required a small module split
- **Dimension**: Plan Completeness
- **Location**: Phase 4 tests
- **Detail**: Vitest runs in Node without a Canvas codec or React testing
  harness. A mocked Blob cannot prove real RGBA flattening or JPEG encoding.
- **Fix**: Add a DOM-free injectable orchestration seam for flag/limit/fallback
  tests, keep actual Canvas work in a client adapter, unit-test alpha forcing,
  and verify the real codec/browser path manually.
- **Decision**: FIXED

### F4 — Performance assumptions lacked limits and fallback

- **Severity**: WARNING
- **Impact**: HIGH — full-resolution main-thread work can freeze or exhaust a tab
- **Dimension**: Blind Spots
- **Location**: Phases 3–5 / Performance Considerations
- **Detail**: The Local engine uses native `ctx.filter`, so it is not a valid
  proxy for a multi-pass JavaScript chroma blur. Cloud results also had no pixel
  dimension guard.
- **Fix**: Cap at 12 MP, bound full-frame temporary storage to byte Cb/Cr plus
  one scratch buffer, fall back to raw on limit/error, and require a direct
  small/typical/12 MP benchmark. GO requires ~12 MP within 2 seconds on the
  reference desktop; otherwise record NO-GO and open a Worker/chunking follow-up.
- **Decision**: FIXED

### F5 — Resolver rewrote the test without validating compatibility

- **Severity**: WARNING
- **Impact**: MEDIUM — provider contract drift could break production
- **Dimension**: Blind Spots
- **Location**: Phase 1
- **Detail**: Updating the pinned hash and literal assertion together proves
  consistency, not that the new Bread version still supports
  `image`/`gamma`/`strength`.
- **Fix**: Fetch and validate the exact version's OpenAPI input schema before
  mutation; require exactly one source/test match; prepare both replacements
  before writing; cover incompatible and ambiguous cases with pure unit tests.
- **Decision**: FIXED

### F6 — Telemetry blast radius was incomplete

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; test files were known
- **Dimension**: Plan Completeness
- **Location**: Phase 2
- **Detail**: Exact payload assertions and the direct E2E processing stub were
  not listed, allowing test processing rows to keep `model_version = null`.
- **Fix**: Update `photo-job-helpers.test.ts`, `jobs.rls.test.ts`, and
  `tests/e2e/helpers/replicate-stub.ts`; require `modelVersion` and default the
  E2E stub to shared `BREAD_VERSION`.
- **Decision**: FIXED

## Triage Summary

- Fixed: F1, F2, F3, F4, F5, F6
- Skipped: none
- Accepted risk: none
- Dismissed: none
- Verdict after fixes: SOUND
