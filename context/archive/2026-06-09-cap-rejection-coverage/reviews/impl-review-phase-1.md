<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Risk #3 — Cloud Daily-Cap Route Rejection Coverage

- **Plan**: context/changes/cap-rejection-coverage/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-06-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success Criteria (verified)

- 1.1 Type checking — `npm run build` succeeded (server built, no type errors).
- 1.2 Linting — `npx eslint` on both touched files: clean (exit 0).
- 1.3 Existing suite — `npm run test:unit`: 100/100 pass.
- 1.4 Production build — `npm run build`: complete.
- 1.5 Manual route check — confirmed by user (200 under cap / 429 over cap, identical behavior).

## Findings

### F1 — Env-presence 500 now precedes auth/parse/zod

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/enhance/cloud/create-job.ts:26-37
- **Detail**: Old order was auth(401) → parse(400) → zod(400) → env-presence(500). New order is env-presence(500) → [core: auth → parse → zod → sweep → cap → insert]. The plan's Overview claims "byte-identical runtime behavior"; that holds in production (env is a deploy-time secret with a default cap, never missing at runtime). The only divergence is the unreachable "misconfigured env + anonymous/bad-body" case: old returned 401/400, new returns 500. The shift is forced by the wrapper/core split (the core needs a built admin client, which needs env present) and is arguably more correct — a misconfigured server is a 500 regardless of caller. Flagged to the user before the Phase 1 commit; recorded here formally.
- **Fix**: Accept as-is — only sane realization of the plan's structure, benign, unreachable in prod. Restoring exact order would mean duplicating auth/parse/zod into the wrapper, defeating the extraction. No code change recommended.
- **Decision**: PENDING

### F2 — `json` helper duplicated in wrapper and core

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/enhance/cloud/create-job.ts:8-13 ; src/lib/services/cloud-create-job.handler.ts:21-26
- **Detail**: The 5-line `json(body, status)` helper now exists in both files — the wrapper keeps a copy for its env-presence 500 response. The plan explicitly sanctioned this ("The json helper moves here (or to a shared util)"), so it is not drift. Minor DRY only.
- **Fix**: Optional — export `json` from the handler and import it in the wrapper, or lift to a shared `@/lib/http` util. Or accept the two tiny copies. Not worth a refactor unless a third caller appears.
- **Decision**: PENDING
