<!-- PLAN-REVIEW-REPORT -->

# Plan Review: e2e Flake Evidence Closure

- **Plan**: `context/changes/e2e-webserver-boot-flake/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-20
- **Verdict**: REVISE
- **Findings**: 1 critical, 4 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

Grounding: 10/10 existing paths ✓, 6/6 symbols ✓, brief↔plan ✓. Upstream `cloudflare/workers-sdk#14926` remains open as of 2026-08-20.

## Findings

### F1 — Helper type rejects half its planned call sites

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Response-assert helper
- **Detail**: The contract requires `APIResponse`, but three create-job assertions receive browser `Response` objects from `page.waitForResponse()`. `Response` lacks members required by the full `APIResponse` interface, including `dispose()` and `timing()`, so literal implementation fails typecheck.
- **Fix**: Define the parameter structurally as `Pick<APIResponse, "ok" | "status" | "url" | "text">` (or an equivalent local interface). Both Playwright response types satisfy it.
- **Decision**: ACCEPTED — folded into plan revision 2026-08-20

### F2 — A recovered retry still loses the flake evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Critical Implementation Details / Phase 2 artifact upload
- **Detail**: CI uses one retry and `trace: "on-first-retry"`. If the first attempt fails and its retry passes, the job is green, so the workflow's `if: failure()` upload never runs. Moreover, the trace covers the retry, not the original failed attempt. This contradicts the promise that any future assertion failure leaves an artifact.
- **Fix A ⭐ Recommended**: Use `trace: "retain-on-failure"` and upload the report after every non-cancelled E2E run.
  - Strength: Preserves the original failed attempt even when the retry passes.
  - Tradeoff: Uploads green HTML reports too, increasing artifact storage.
  - Confidence: HIGH — confirmed against the installed Playwright trace logic and current workflow.
  - Blind spot: Exact storage growth has not been measured.
- **Fix B**: Narrow the Desired End State to terminal failures that fail all retries.
  - Strength: Preserves the current low-storage behavior.
  - Tradeoff: Recovered flaky attempts remain undiagnosable—the class of event this change exists to capture.
  - Confidence: HIGH — matches the current configuration exactly.
  - Blind spot: None significant.
- **Decision**: ACCEPTED — folded into plan revision 2026-08-20

### F3 — The core failure-message path is not actually verified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Testing Strategy
- **Detail**: Green E2E runs exercise only the helper's success path. The suggested wrong-password preview also does not invoke it: sign-in errors redirect to a final HTTP 200 response, so `.ok()` succeeds and the later pathname assertion fails instead. Consequently, whitespace collapsing, truncation, unreadable-body fallback, and the enriched message can all be broken while every required check passes.
- **Fix ⭐ Recommended**: Add a hermetic Vitest test using structural fake responses, covering pass-without-body-read, label/status/URL, whitespace collapse, truncation, and rejected `text()` fallback.
  - Strength: Fast, deterministic coverage of the change's central deliverable; matches existing E2E-helper test precedent.
  - Tradeoff: Adds one small test file and a fake response object.
  - Confidence: HIGH — `tests/**/*.test.ts` is already included by Vitest.
  - Blind spot: Does not verify GitHub's artifact upload UI.
- **Decision**: ACCEPTED — folded into plan revision 2026-08-20

### F4 — Explicit `list` does not preserve current CI output

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Reporter
- **Detail**: With no explicit reporter, Playwright uses `dot` in CI and `list` locally. Therefore, adding `list` changes CI output rather than keeping it identical.
- **Fix**: Configure `dot` + HTML under CI and `list` + HTML locally, or explicitly document that increased CI verbosity is intentional.
- **Decision**: ACCEPTED — folded into plan revision 2026-08-20

### F5 — Phase 1's command does not check Markdown formatting

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Automated Verification
- **Detail**: `npm run lint` runs `eslint .`; it does not check Markdown with Prettier. Relying on the pre-commit hook is not an automated plan verification step.
- **Fix**: Replace or supplement the criterion with targeted `npx prettier --check` commands for `change.md` and `lessons.md`.
- **Decision**: ACCEPTED — folded into plan revision 2026-08-20
