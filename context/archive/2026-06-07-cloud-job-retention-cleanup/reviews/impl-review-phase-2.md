<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-08 — 24h-retention cleanup for failed/abandoned cloud jobs

- **Plan**: context/changes/cloud-job-retention-cleanup/plan.md
- **Scope**: Phase 2 of 3 (Edge Function — `/callback` result-orphan cleanup + `/start` timeout)
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical  0 warnings  2 observations
- **Phase commit**: 2a66545

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (2.1 deno check deferred to CI by explicit decision) |

## Evidence

- **Plan Adherence** — all three planned changes present and as specified: `import deleteJobResult` (index.ts:26); `AbortSignal.timeout(OUTPUT_FETCH_TIMEOUT_MS)` on the `/start` `predictions.create` fetch (index.ts:251); `resultPath` hoist + lost-race delete + catch delete (index.ts:379, 435, 448-451, 458-460).
- **Scope Discipline** — diff is exactly the two planned files (`supabase/functions/enhance/index.ts`, `plan.md`). No pg_cron, no enum state, no watchdog/cap changes — every "What We're NOT Doing" guardrail respected.
- **Safety & Quality** — independent adversarial pass enumerated every post-upload exit in `handleCallback`: no reachable result-orphan on a non-flip (upload-error→catch deletes; flip=true keeps; flip=false deletes; throw→catch deletes); no double/wrong-object delete (lost-race branch returns inside `try`, best-effort non-throwing delete, distinct result vs source paths); `/start` timeout cannot strand a `processing` row (abort fires before `markJobProcessing`; catch flips `queued→failed` and deletes source); `resultPath` TS-narrows to `string` at all three call sites.
- **Success Criteria** — `npm run build` PASS; full unit suite 95 passed (regression guard for the shared boolean-return signature change); manual review (2.3) confirmed. `deno check` (2.1) not run locally (deno unavailable, installer blocked); runs in CI deploy job (`.github/workflows/ci.yml:46`) on push to master — left `[ ]` by explicit user decision, not rubber-stamped.

## Findings

### F1 — /start abort-after-create can orphan a Replicate prediction

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — informational; no decision needed
- **Dimension**: Safety & Quality
- **Location**: supabase/functions/enhance/index.ts:241-252
- **Detail**: If `AbortSignal.timeout` fires after Replicate created the prediction server-side but before the response is read, the row is flipped `failed` and a later `/callback` may arrive. It is safely absorbed — `markJobProcessing` never ran, so no `replicate_prediction_id` is stored and the callback fails the fail-closed prediction-id cross-check (index.ts:394) → `ignored`. Net: an orphaned Replicate prediction (cost already acceptable per the `countCloudJobsToday` billing model) but no DB/storage inconsistency. Intended consequence of binding the fetch; not introduced as a defect.
- **Fix**: None — accepted by design.
- **Decision**: ACCEPTED (by design)

### F2 — result/source deletes remain best-effort

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — informational; no decision needed
- **Dimension**: Reliability
- **Location**: supabase/functions/enhance/index.ts:450, 459 → src/lib/services/photo-job.service.ts:23-29
- **Detail**: `deleteJobResult` swallows storage errors with a `console.warn`. A storage outage at that instant leaves the result orphaned. This is exactly the plan's stated stance ("a missed delete is an operator-cleanup concern") and is backstopped by the Phase-3 retention sweep. Intended, not a defect.
- **Fix**: None — accepted by design.
- **Decision**: ACCEPTED (by design)
