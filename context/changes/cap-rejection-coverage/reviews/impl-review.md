<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Risk #3 — Cloud Daily-Cap Route Rejection Coverage

- **Plan**: context/changes/cap-rejection-coverage/plan.md
- **Scope**: Full plan (Phases 1-3 of 3)
- **Date**: 2026-06-10
- **Verdict**: APPROVED (1 warning worth acting on)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — env-presence 500 guard reordered; "byte-identical" doc claim is now inaccurate

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/enhance/cloud/create-job.ts:26-30 ; src/lib/services/cloud-create-job.handler.ts:23 (the claim)
- **Detail**: Verified against the pre-refactor route (953a1b9^): original order was 401 (no user) → 400 (bad JSON) → 400 (zod) → 500 (env missing) → try{…}. The refactor moved the env-presence 500 into the wrapper, which runs BEFORE delegating to the core's 401/400/400. So when SUPABASE_URL or the service key is unset, an anonymous or malformed-body request now returns 500 where it previously returned 401/400. Inherent consequence of the plan's "env guard stays in the wrapper" design — but the handler comment claims runtime is "byte-identical to the pre-refactor single-file route," which is false for the env-missing edge. NOT a security regression: env-missing is a deploy-time misconfiguration, never attacker-reachable per-request; in a configured production deploy the guard never fires. No test covers the env-missing path (the core is env-free, so it structurally can't).
- **Fix A ⭐ Recommended**: Correct the doc claim — in cloud-create-job.handler.ts:23 drop "byte-identical" and note the env-presence 500 now precedes auth/validation, observable only when env is unset (never in a configured deploy).
  - Strength: Honest about the one real divergence; zero behavior change to a shipped, tested path; matches the plan's deliberate wrapper-owns-env design.
  - Tradeoff: Accepts a non-byte-identical refactor (only in the misconfig edge).
  - Confidence: HIGH — the divergence is fully characterized and inert in prod.
  - Blind spot: None significant.
- **Fix B**: Restore strict ordering — move the env check into the core path (pass raw env in, or delegate first and run the env guard after validation) so 401/400/400 precede the 500 exactly as before.
  - Strength: Truly byte-identical; the comment becomes accurate as-is.
  - Tradeoff: Re-couples env shape into the core or complicates the wrapper; buys correctness only for an unreachable-in-prod edge.
  - Confidence: MED — straightforward but adds surface for a non-issue.
  - Blind spot: Whether any caller/test depends on the misconfig status code (none found).
- **Decision**: FIXED via Fix A — corrected the doc claim in cloud-create-job.handler.ts (dropped "byte-identical", documented the env-guard ordering divergence as inert in a configured deploy).

### F2 — `json` response helper duplicated in wrapper and core

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/pages/api/enhance/cloud/create-job.ts:9-14 ; src/lib/services/cloud-create-job.handler.ts:27-32
- **Detail**: Identical `json(body, status)` in both modules. The wrapper needs it only for the env-missing 500 (before the core is invoked), so the duplication is justified — but the envelope shape is a CLAUDE.md hard rule, and two copies can drift (e.g. a future Content-Type/header change applied to one only).
- **Fix**: Optional — export `json` from the handler module (or a small `@/lib/http.ts`) and import it in the wrapper. Not blocking.
- **Decision**: FIXED — exported `json` from cloud-create-job.handler.ts and imported it in the wrapper; removed the duplicate. Lint clean, 104/104 tests green.

### F3 — Hermetic stub resolves every query chain to one combined object

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; no action needed now
- **Dimension**: Pattern Consistency
- **Location**: tests/cloud-create-job.handler.test.ts:54-75
- **Detail**: (Same item raised in the Phase 2 review.) The stub feeds both the sweep (reads `data`) and the cap count (reads `count`) from one resolved object, and doesn't exercise the count-error→500 branch. Faithful for the cap-ordering signal under test; those other paths are covered in jobs.rls.test.ts / photo-job.service.test.ts. Flagged only to keep the coverage boundary explicit.
- **Fix**: None now. Split the stub into per-call resolved values if the handler's query usage ever changes.
- **Decision**: SKIPPED — accepted coverage boundary (recommendation itself was "None now"); the unexercised paths are covered in jobs.rls.test.ts / photo-job.service.test.ts.

## Notes

- Plan Adherence: drift sweep found full MATCH on all 13 plan intents across the 3 phases — core export/shape, branch order, no astro:env import, thin wrapper, all 4 test cases + hermetic header, §6.4 recipe, §6.6 note.
- Verified-good (positive): 401 gate intact; userId from session not body; error envelopes leak no internals (raw err only to console); count-query throw correctly routes to the 500 catch; sweep failure is double-guarded and cannot corrupt the cap decision; reject-before-insert ordering holds.
- Scope: benign EXTRAs only — required `json` dup (F2), extra not-called assertions in test cases (b)/(d) that strengthen coverage.
- Architecture matches the `supabase-admin.ts` env-as-parameter precedent and the "server-only clients in their own module" lesson.
- Success Criteria: `test:unit` 104/104 green; eslint clean on changed files; production `build` was the Phase 1 criterion, green at commit 953a1b9. Manual checks 1.5/2.4/3.2 all confirmed.
