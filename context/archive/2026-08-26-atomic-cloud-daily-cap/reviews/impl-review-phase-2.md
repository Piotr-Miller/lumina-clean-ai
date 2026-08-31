<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Atomic Global Cloud AI Daily Cap

- **Plan**: `context/changes/atomic-cloud-daily-cap/plan.md`
- **Scope**: Phase 2 of 5 (`14b1802` + `cade95f`)
- **Date**: 2026-08-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations
- **Triage**: all four addressed 2026-08-29 — F1/F2/F4 accepted, F3 accepted in part (see each Decision)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Invalid RPC data is misreported as a daily-cap event

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/photo-job.service.ts:137`
- **Detail**: The plan defines only `false` as a normal admission rejection, but `if (admitted !== true)` also maps an unexpected `null` RPC result onto the race-loss path. The current function cannot return null, so null would indicate database-contract drift rather than an exhausted cap. The service nevertheless emits the cap warning, returns `null`, and causes the route to return a misleading 429 instead of the existing infrastructure-failure 500. Throwing would remain fail-closed for spend.
- **Fix**: Handle `admitted === false` as rejection; throw an invalid-RPC-response error for anything other than `true` or `false`. Change the null unit test to expect rejection.
- **Decision**: ACCEPTED — fixed in the post-review commit. `false` rejects; anything else throws. Two unit tests added: the throw, and that the cap warning does NOT fire for a fault (the warning is the operator-facing race signal; firing it for contract drift would cost it its meaning).

### F2 — Two descriptions still name the obsolete service-layer oracle

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `context/changes/atomic-cloud-daily-cap/plan.md:767`; `tests/cloud-create-job.handler.test.ts:205`
- **Detail**: Both passages still say the service fan-out proves atomicity. That contradicts the shipped RPC oracle, the Phase 2 implementation note, and `tests/README.md`, which correctly identify the warmed direct-RPC fan-out as the atomicity oracle and the service fan-out as composition. The stale descriptions undermine the phase's explicit goal of naming each layer's claim honestly.
- **Fix**: Identify the warmed RPC fan-out as the atomicity oracle and the service fan-out as corroborating composition in both passages.
- **Decision**: ACCEPTED — both passages corrected. `plan.md` § Testing Strategy now lists the warmed RPC-layer fan-out as the oracle with a dated supersession note, and the handler test's doc block names it instead of the service fan-out. The Phase 2 §6 phase block is deliberately left as written — it records what was PLANNED, and § Implementation Note — Phase 2 supersedes it.

### F3 — The warmed oracle is credible but remains probabilistic

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `tests/jobs.rls.test.ts:862`
- **Detail**: The warm-up is load-bearing rather than superstition: the direct RPC test removes the service layer's signed-URL delay, and the recorded negative control—one cold false pass followed by warmed detection—matches that mechanism. However, the warm-up results are discarded, and `Promise.all` does not prove distinct backend sessions or overlapping SQL execution. A constrained future pool could serialize a lockless function and restore a false pass.
- **Fix**: Capture and assert all warm-up responses, then consider several warmed measurement rounds.
  - Strength: Makes a failed warm-up visible and further reduces false-pass probability.
  - Tradeoff: Slightly longer integration runs.
  - Confidence: MEDIUM — improves the oracle without making scheduling deterministic.
  - Blind spot: A pool could still serialize every round.
- **Decision**: ACCEPTED IN PART. The warm-up responses are now asserted (no errors, all `false`), so a silently failing warm-up can no longer hide a cold pool behind a green test — re-calibrated after the change: still FAILS 3/3 against the lock-less control, passes against the real function. The _several measurement rounds_ half is DECLINED: each round needs its own baseline and winner cleanup, making the test's bookkeeping its own failure source, while the single warmed round already measured 10/10 (probe) and 3/3 (shipped test). F3's stated blind spot — a pool that serializes every round — is not addressed by adding rounds.

### F4 — Benign Phase 2 extras were not recorded in planned scope

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `tests/README.md:69`
- **Detail**: Unplanned work included `tests/README.md`, the `countCloudJobsToday` non-authoritative documentation, moving the misplaced Risk #2 test block, and appending Phase 1 commit stamps. These changes are accurate and low-risk, but they are extras relative to Phase 2's file list.
- **Fix**: Add these support edits to the Phase 2 implementation note so the scope record matches the diff.
- **Decision**: ACCEPTED — the four support edits are now listed in `plan.md` § Implementation Note — Phase 2 → Support edits outside the Phase 2 file list.

## Verification

| Check                                                  | Result                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `npm run typecheck`                                    | PASS                                                                                 |
| `npm run lint`                                         | PASS — 0 errors, 55 warnings                                                         |
| `npm run test:unit`                                    | PASS — 402/402 tests                                                                 |
| `npx vitest run tests/jobs.rls.test.ts`                | PASS — 32/32 tests after exporting the running local-stack environment               |
| `npm run test:e2e`                                     | PASS — 6/6 tests; production build served on workerd                                 |
| Fresh mutation run over `photo-job.service.ts:110-150` | PASS — 16/16 mutants killed, isolated cache used to prevent stale incremental reuse  |
| Built-content verification                             | PASS — current `admit_cloud_job` call and rejection warning present in `dist/server` |

Manual criteria 2.7–2.9 were completed on 2026-08-29: after repairing missing local Vault wiring and a stale callback tunnel, a real Replicate job reached `succeeded` in 172s with the result present and source deleted; a production Worker started with `CLOUD_DAILY_CAP=0` returned the exact existing 429 body from a zero-row baseline (normal local cap 5); and an 8-way forced service fan-out printed seven race-loss warnings while admitting one job.

No security, authorization, data-loss, performance, resource-leak, or architectural defect was found. The previously settled `SECURITY INVOKER`/`DEFINER` question and the running-stack `supabase/.temp/**` formatting failure were not reopened.
