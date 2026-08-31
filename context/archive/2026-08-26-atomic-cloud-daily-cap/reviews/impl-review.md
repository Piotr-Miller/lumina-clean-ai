<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Atomic Global Cloud AI Daily Cap

- **Plan**: `context/changes/atomic-cloud-daily-cap/plan.md`
- **Scope**: Phases 1–4 plus completed Phase 5 items 5.1–5.3 (31/32 Progress items; archive item 5.4 pending)
- **Date**: 2026-08-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Plan brief names the weak fan-out as the oracle

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/atomic-cloud-daily-cap/plan-brief.md:47`
- **Detail**: Lines 47, 113–116, and 126 still call the service-layer fan-out the atomicity oracle. The measured result was only 7/10 detection against the lockless control. The warmed direct-RPC fan-out is the actual oracle; service and route fan-outs are composition tests.
- **Fix**: Update all three passages to name the warmed RPC fan-out as the oracle and the service/route tests as composition.
- **Decision**: FIXED (2026-08-31) — `plan-brief.md` lines 47, 113-116 and the Success Criteria summary now name the warmed direct-RPC fan-out as the oracle and the service/route fan-outs as composition, with the 7/10 measurement and the pointer to `plan.md` § Implementation Note — Phase 2.

### F2 — Phase 5 smoke is complete but records say outstanding

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/foundation/production-config.md:136`
- **Detail**: The passed smoke is recorded at `production-config.md:169–191` and Progress 5.1–5.3 is checked. However `production-config.md`, `roadmap.md:295,297`, `change.md:86–87`, and `plan-brief.md` still describe the smoke as outstanding. Dates remain 2026-08-30, and `plan-brief.md` also says #191 lacks a mapping row although `github-issues.md` now contains one. Only archive step 5.4 is genuinely pending.
- **Fix**: Reconcile these records to “production smoke passed; archive and issue closure pending,” and update their dates.
- **Decision**: FIXED (2026-08-31) — all six pointers reconciled to "smoke passed 2026-08-31; only `/10x-archive` + closing #191 remain": `production-config.md` §7 lead-in, `roadmap.md` Blockers (now "none") and Status (now `implemented`), `change.md` Phase 4 note, and both `plan-brief.md` passages including the stale "#191 has no Final-mapping row" claim.

### F3 — Hosted callback fallback guidance contradicts evidence

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `context/foundation/production-config.md:57`
- **Detail**: `production-config.md:57` and `supabase/functions/enhance/index.ts:151–158` say the hosted `SUPABASE_URL` fallback is categorically non-HTTPS. The 2026-08-31 smoke records the opposite current observation: `EDGE_FUNCTION_URL` was absent, yet both jobs received valid HTTPS callbacks. The explicit override was restored and should remain, while `assertHttpsCallback` is the enforcement point.
- **Fix**: Describe the fallback as historically unreliable but observed working on 2026-08-31; retain `EDGE_FUNCTION_URL` as defence in depth and `assertHttpsCallback` as the invariant.
  - Strength: Reconciles current evidence without weakening the conservative production configuration.
  - Tradeoff: Requires careful separation of historical and current runtime behaviour.
  - Confidence: HIGH — the conflicting statements and smoke evidence are in the same state record.
  - Blind spot: Why the hosted fallback behaviour changed is unknown.
- **Decision**: FIXED (2026-08-31) via the recommended option — `production-config.md:57` and the `enhance/index.ts` comment now scope the D.1 failure as historical and record the 2026-08-31 counter-observation, while keeping `EDGE_FUNCTION_URL` REQUIRED as policy and naming `assertHttpsCallback` the invariant. Neither text guesses why the runtime differs; both say the cause is unknown.

## Verification

| Check                                                                      | Result                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npx supabase db reset`                                                    | PASS — all 11 local migrations applied, including `20260828120000_atomic_cloud_daily_cap.sql`                    |
| `npx vitest run tests/jobs.rls.test.ts`                                    | PASS — 32/32 real-Postgres tests after exporting the documented local Supabase variables                         |
| `npm run test:unit`                                                        | PASS — 403/403 tests                                                                                             |
| `npm run typecheck`                                                        | PASS                                                                                                             |
| `npm run lint`                                                             | PASS — 0 errors, 55 existing warnings                                                                            |
| `npm run format:check`                                                     | PASS                                                                                                             |
| `npm run check:skills`                                                     | PASS — 36 public skill file pairs byte-identical                                                                 |
| `npm run test:e2e`                                                         | PASS — 6/6 tests on the production-parity workerd server after exporting the documented local Supabase variables |
| `npx stryker run --mutate "src/lib/services/photo-job.service.ts" --force` | PASS — forced fresh scoped run, exit 0; no qualifying survived mutant in the changed admission path              |
| Built-bundle content check                                                 | PASS — `dist/server` contains `admit_cloud_job` and the guarded-decline branch                                   |
| Archive boundary                                                           | PASS — no `context/archive/` path changed                                                                        |
| Working tree after review                                                  | Clean                                                                                                            |

Production Phase 4 verification and Phase 5 smoke evidence were assessed from the recorded repository evidence; this review performed no production mutation.
