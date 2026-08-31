<!-- IMPL-REVIEW-REPORT -->

# Implementation Re-review: Atomic Cloud Daily Cap

- **Plan**: `context/changes/atomic-cloud-daily-cap/plan.md`
- **Scope**: Phase 1 of 4
- **Date**: 2026-08-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation
- **Implementation commit**: `978e1b8`
- **Remediation commit**: `5783f25`

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

The earlier `SECURITY DEFINER` finding is resolved. The migration now uses
`SECURITY INVOKER`, matches the revised main plan, and passed the catalog, ACL,
integration, concurrency, and leaked-grant checks described below.

## Findings

### F1 — Denial tests do not detect leaked EXECUTE grants

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/jobs.rls.test.ts:714`, `tests/jobs.rls.test.ts:725`
- **Detail**: Both denial tests call the function with a positive cap. If
  `EXECUTE` accidentally leaks, the `SECURITY INVOKER` function still fails later
  on `jobs` table privileges, so the tests remain green without proving that
  execution itself was denied.
- **Fix**: Add denial calls with `p_cap = -1` and require an RPC error. The
  function handles the invalid cap before table access, so a leaked `EXECUTE`
  grant would instead return `false` and fail the assertion. Retain the positive
  cap cases if table-level defence-in-depth should remain covered separately.
- **Decision**: PENDING

### F2 — Active plan brief still prescribes SECURITY DEFINER

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/atomic-cloud-daily-cap/plan-brief.md:33`,
  `context/changes/atomic-cloud-daily-cap/plan-brief.md:42`
- **Detail**: The authoritative main plan and migration now correctly require
  `SECURITY INVOKER`, but the active plan brief still describes the rejected
  elevated posture.
- **Fix**: Replace both `SECURITY DEFINER` references with `SECURITY INVOKER` and
  briefly record why the retention reaper precedent does not transfer to this
  function.
- **Decision**: PENDING

### F3 — Progress and review evidence still show pre-remediation state

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/atomic-cloud-daily-cap/plan.md:859`,
  `context/changes/atomic-cloud-daily-cap/plan.md:860`,
  `context/changes/atomic-cloud-daily-cap/reviews/impl-review-phase-1.md:77`
- **Detail**: Progress items 1.1 and 1.2 still name `978e1b8`, although the
  migration and their verification were closed by remediation commit `5783f25`.
  The original review's evidence table also presents `prosecdef = true` as a
  passing catalog result without identifying it as pre-remediation evidence.
- **Fix**: Record `5783f25` as the closing commit for items 1.1 and 1.2, and
  relabel the original catalog row as pre-remediation or append the current
  `prosecdef = false` evidence.
- **Decision**: PENDING

## Verification

| Check                                          | Result        | Evidence                                                                                                                                                                                                     |
| ---------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx supabase db reset`                        | PASS          | The amended migration applied cleanly to the local stack.                                                                                                                                                    |
| `npx vitest run tests/jobs.rls.test.ts`        | PASS          | 29/29 integration tests passed.                                                                                                                                                                              |
| `npm run test:unit`                            | PASS          | 30 files and 396 tests passed.                                                                                                                                                                               |
| `npm run typecheck`                            | PASS          | TypeScript completed without errors.                                                                                                                                                                         |
| `npm run lint`                                 | PASS          | Zero errors; 55 pre-existing `no-console` warnings.                                                                                                                                                          |
| `npx supabase db lint --local --level warning` | PASS          | No schema errors found.                                                                                                                                                                                      |
| Targeted Prettier check                        | PASS          | All Phase 1 tracked implementation and plan files matched Prettier style.                                                                                                                                    |
| `git diff --check 4388560..HEAD`               | PASS          | No whitespace errors.                                                                                                                                                                                        |
| Function catalog and ACL                       | PASS          | `prosecdef = false`, volatile, empty `search_path`; `EXECUTE` only for `postgres` and `service_role`.                                                                                                        |
| `service_role` prerequisite                    | PASS          | `rolbypassrls = true` with `SELECT` and `INSERT` on `public.jobs`.                                                                                                                                           |
| Leaked-grant probe                             | PASS          | Temporarily granting `EXECUTE` to `authenticated` reached INVOKER table permissions, failed with `permission denied for table jobs`, and inserted no row; the transaction rolled back and no grant remained. |
| Index eligibility and preference               | PASS          | The billable-window predicate used `jobs_billable_created_at_idx`, including after a transactional 30,000-row seed and `ANALYZE`; seed data was rolled back.                                                 |
| Mutation testing                               | NOT TRIGGERED | Phase 1 changes SQL, configuration, and integration tests, not a risk module listed for Stryker in `context/foundation/test-plan.md` §4.                                                                     |
| Working tree after review                      | PASS          | Clean before this report was saved.                                                                                                                                                                          |

## Previously acknowledged condition

The exact repo-wide `npm run format:check` still fails on generated, gitignored
`supabase/.temp/start-secrets/.../index.ts` state created by the running local
Supabase stack. In the original Phase 1 review this was explicitly acknowledged
as out of scope because it predates the change and does not affect CI; targeted
format checks for the tracked Phase 1 files pass. The literal automated criterion
therefore remains a non-critical `Success Criteria` failure rather than a new
pending finding.
