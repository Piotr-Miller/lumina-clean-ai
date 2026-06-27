<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Enable the Bread chroma-denoise post-pass in production

- **Plan**: context/changes/chroma-postpass-enable/plan.md
- **Mode**: Deep
- **Date**: 2026-06-25
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

6/6 paths ✓ (astro.config.mjs, index.astro, EnhanceWorkspace.tsx, useCloudJob.ts, chroma-denoise.ts, cloud-result-postprocess.test.ts), symbols ✓ (`CHROMA_POSTPASS_ENABLED`, `maybePostprocessCloudResult`, `envField.boolean`), brief↔plan ✓, no `docs/reference/contract-surfaces.md` (check skipped). Sub-agent verified: SSR-prop seam exists (`index.astro:5,34-40` → `EnhanceWorkspace.tsx:14-23,45-51`); removing the const touches exactly one live importer (`useCloudJob.ts:6,330`), no tests, `cloud-result-postprocess.client.ts:75` is comment-only; `default:false` makes the env field optional (precedent `CLOUD_PIPELINE_ENABLED`, build never sets it).

## Findings

### F1 — Phase 4 "one spec ON, others OFF" isn't achievable with the current E2E setup

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Completeness / Blind Spots
- **Location**: Phase 4 — ON-path automated test
- **Detail**: Plan says the served app "for this spec runs with `CHROMA_POSTPASS_ENABLED=true` ... keep the other specs OFF". But `playwright.config.ts:32-37` starts ONE shared webServer for the whole run, and the flag is read at SSR from a `context:"server"` secret resolved from `.dev.vars` at server start (`playwright.config.ts:30-31`; env written at `ci.yml:242`). A per-spec value is impossible as configured — the flag is fixed for the entire `playwright test` run. The implementer would hit this mid-build.
- **Fix A ⭐ Recommended**: Add a local/CI-only per-request override seam in `index.astro` (query-param or header) so one spec opts into flag-ON while the default stays OFF.
  - Strength: Keeps other specs OFF on one shared server; mirrors the existing `E2E_ALLOWED_OUTPUT_ORIGIN` local-only seam pattern.
  - Tradeoff: Adds a test-only override surface to `index.astro` that MUST be local/CI-gated, never honored in prod.
  - Confidence: HIGH — `E2E_ALLOWED_OUTPUT_ORIGIN` is the precedent for exactly this.
  - Blind spot: The override must be guarded so prod can't be flipped via a query param.
- **Fix B**: Run the whole e2e gate with the flag ON (append `CHROMA_POSTPASS_ENABLED=true` to the `.dev.vars` write at `ci.yml:242`) + make north-star tolerant of a processed `blob:` result.
  - Strength: No new prod-facing surface; simplest wiring (one line in ci.yml).
  - Tradeoff: Every spec runs ON — must audit specs that assert the raw signed-URL shape; loses OFF-path coverage in CI.
  - Confidence: MED — haven't audited whether north-star asserts a raw-result URL.
  - Blind spot: Other specs' result-URL assertions.
- **Decision**: FIXED — applied Fix A; Phase 4 now plans a local/CI-only per-request override seam in `index.astro` so the flag-ON spec can opt in while the shared E2E server keeps other specs OFF.

### F2 — Contradiction: "not changing the tuned defaults" vs Phase 1 NO-GO retune

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: "What We're NOT Doing" vs Phase 1, change #2
- **Detail**: "What We're NOT Doing" lists "Not changing ... the tuned defaults (3, 0.9, 2.5)", but Phase 1's NO-GO branch explicitly retunes `DEFAULT_CHROMA_PARAMS`. The two contradict — an implementer reading the guardrail could skip the retune.
- **Fix**: Reword the NOT-doing item to "not changing the algorithm or the 12 MP guard; defaults may be retuned only if the real A/B is NO-GO (Phase 1)".
- **Decision**: FIXED — the scope guardrail now allows retuning the defaults only if the real A/B is NO-GO in Phase 1.

### F3 — "Retire the const" should also fix the stale doc-comment reference

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, change #4
- **Detail**: `cloud-result-postprocess.client.ts:75` mentions `CHROMA_POSTPASS_ENABLED` in a JSDoc comment (not an import — confirmed only live importer is `useCloudJob.ts:6`). After removing the const, that comment goes stale.
- **Fix**: Add "update the JSDoc on the `enabled` field in `cloud-result-postprocess.client.ts:75`" to Phase 2.4's contract.
- **Decision**: FIXED — Phase 2.4 now explicitly updates the `enabled` field JSDoc in `cloud-result-postprocess.client.ts:75` when the const is removed.

### F4 — Telemetry success path: breadcrumb/metric, not a Sentry event per result

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Telemetry
- **Detail**: Phase 3 says success emits a "breadcrumb/message". A `captureMessage` on every success = one Sentry event per cloud result (quota/noise). At `CLOUD_DAILY_CAP=3/day` it's harmless now, but the intent should be explicit.
- **Fix**: Specify success → breadcrumb (or a metric/measurement), fallback → `captureMessage`. Keep full events for the degraded path only.
- **Decision**: FIXED — Phase 3 now specifies success as breadcrumb/metric with duration and reserves `captureMessage` events for fallback only.
