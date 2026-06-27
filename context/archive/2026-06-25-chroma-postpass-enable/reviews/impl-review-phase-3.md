<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Enable chroma post-pass — Phase 3 (telemetry)

- **Plan**: context/changes/chroma-postpass-enable/plan.md
- **Scope**: Phase 3 of 5 (Sentry telemetry around the post-pass in useCloudJob.ts)
- **Date**: 2026-06-26
- **Verdict**: APPROVED AFTER TRIAGE (initial: NEEDS ATTENTION — 1 warning, now fixed)
- **Findings**: 0 critical, 1 warning (fixed), 0 observations

## Verdicts

| Dimension           | Verdict             |
| ------------------- | ------------------- |
| Plan Adherence      | PASS                |
| Scope Discipline    | PASS                |
| Safety & Quality    | PASS                |
| Architecture        | PASS                |
| Pattern Consistency | PASS                |
| Success Criteria    | PASS (after F1 fix) |

## Grounding

Independent sub-agent audit of the uncommitted telemetry change (`useCloudJob.ts`), with `cloud-result-postprocess.client.ts`, `sentry.client.config.ts`, `sentry-scrub.ts`. SOUND: scrub-safe payloads (3.7 — `fallbackReason` bounded by construction, no signed-URL/PII reach it; global `scrubEvent` runs); no render-path regression (Sentry calls don't `await`/reorder the object-URL mint + setResult; no-op when SDK uninit); zero bundle cost (browser SDK already loaded via sentry.client.config); dormant-when-OFF (enabled:false → neither branch fires). Automated this session: typecheck ✓, lint ✓ (0 errors), unit ✓ (208), build ✓; re-verified typecheck + lint after the F1 fix.

## Findings

### F1 — Success = breadcrumb → run-rate not queryable, defeating the telemetry gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/components/hooks/useCloudJob.ts (success branch)
- **Detail**: The plan's goal (plan.md:38/215) and criterion 3.5 require a run-rate signal, and Phase 5 is explicitly "telemetry-gated on run-rate + fallback-rate." Success was implemented as `Sentry.addBreadcrumb`, which only rides on a _later_ event — so on the normal success-with-no-error path it's never transmitted, leaving success run-rate unobservable (fallback-rate was fine via `captureMessage`). The breadcrumb's quota rationale (F4) is moot at `CLOUD_DAILY_CAP=3/day` (≤3 events/day). (@sentry/astro v10 dropped the client metrics API, so F4's "metric" alternative was never actually available.)
- **Fix**: Success branch changed to `Sentry.captureMessage("chroma post-pass applied", { level: "info", extra: { width, height, durationMs } })` — same scrub-safe payload; quota a non-issue at the cap; sampling noted as a future step if the cap rises.
- **Decision**: FIXED — success is now a low-volume `captureMessage(level:"info")`; run-rate is queryable, delivering the run-rate half of the Phase-5 gate. typecheck + lint re-verified green.

## Note on change.md status

Left `status: implementing` (phase-3-of-5 review; mid-implementation). The skill's default `impl_reviewed` flip is for full-plan reviews.
