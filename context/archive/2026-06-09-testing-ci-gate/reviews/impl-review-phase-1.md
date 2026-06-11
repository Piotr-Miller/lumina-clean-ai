<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Gate the floor — wire the existing Vitest suite (incl. Docker/RLS) into CI

- **Plan**: context/changes/testing-ci-gate/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-06-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Scope

Phase 1's only substantive artifact is `.github/workflows/ci.yml` (commits `7bf7ebb` + fix `a7086aa`); the rest of the diff is planning/review docs. Reviewed inline (single-file diff, validated on a real green Actions run) rather than via sub-agents.

## What was verified

- **Plan adherence** — all three changes match intent: parallel `integration` job (checkout → node → `npm ci` → `supabase start` w/ bounded retry → `db reset` → dequoted creds export → `npm test`); `deno check` moved to `ci` and removed from `deploy`; `deploy needs: [ci, integration]`. The `sed` dequote was an adaptation the first run forced — within the plan's Critical Implementation Details (which pre-authorized the export fallback), documented in commit `a7086aa` + inline comment.
- **Scope discipline** — every "What We're NOT Doing" boundary held: no new test logic, no Vault secrets, no Docker caching, no `test:integration` script, no hosted CI Supabase.
- **Safety** — `integration` uses zero secrets (fork-PR safe); the retry's final `supabase start` propagates its exit code (no `|| true` masking persistent failure); `pipefail` fails the export step loudly if `status` errors; no hardcoded secrets; no injection surface.
- **Empirically settled by the green run** — `db reset` tolerates the absent `seed.sql`; the `integration` job does not need `npx astro sync` (all 11 suites passed without it).
- **Success criteria** — 1.1–1.4 green on the real Actions run; manual 1.6–1.8 user-confirmed; 1.5 accepted structurally. Automated checks not re-run locally (no Docker/deno in this env) — observed green on the run.

## Findings

### F1 — integration job has no timeout-minutes; it now gates deploy

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: .github/workflows/ci.yml — `integration:` job
- **Detail**: The boot retry handles a transient `supabase start` failure, but if a container wedges _after_ the retry (or `npm test` hangs in a way the 30s per-test timeout doesn't catch), the job inherits GitHub's default 360-min job timeout. Because plan-review F1 put this job on the deploy critical path (`deploy needs: [ci, integration]`), a wedged boot would keep a deploy pending up to 6h rather than failing fast. A bounded `timeout-minutes:` complements the boot-retry mitigation. Not in the plan; surfaced by the F1 reliability-coupling concern.
- **Fix**: Add `timeout-minutes: 15` to the `integration` job (generous headroom over the observed ~2-4 min wall-clock). Optionally mirror on `ci`, though that's pre-existing and out of this phase's scope.
- **Decision**: FIXED — added `timeout-minutes: 15` to the `integration` job in `.github/workflows/ci.yml` (uncommitted; will land with the Phase 2 commit).
