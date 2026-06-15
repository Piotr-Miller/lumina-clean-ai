<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: API Authorization Test Gaps (Risk #2 + Risk #4)

- **Plan**: context/changes/testing-api-authz-gaps/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2 of 2)
- **Date**: 2026-06-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations
- **Commits**: fda8e99 (Phase 1), 768b1b1 (Phase 2), a8d761a (epilogue)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

None.

## Evidence

- **Plan Adherence** — both phases match intent. Phase 1: `user: null` hermetic
  case (401 + `insert`/`createSignedUploadUrl` not-called). Phase 2:
  `timeout.handler.ts` extracted, route reduced to a thin wrapper, top-level
  sibling IDOR describe with negative + positive control. MATCH on all.
- **Safety & Quality** — adversarial parity check against the pre-refactor route
  (fda8e99) confirms wrapper+core reproduce every reachable path: identical
  status codes, error codes, exact messages, `200 {flipped}` shape, `userId` from
  session not body. The single divergence (env-presence 500 guard now in the
  wrapper before auth/parse) is documented and only observable when env is unset
  (never in a configured deploy). Auth gate is the core's first statement;
  owner-scoped write is a single atomic guarded UPDATE. No injection/secret/
  reliability issues.
- **Architecture** — faithful mirror of the cloud-create-job split: env-free core
  - thin env-wrapper, local `json` helper (no cross-handler coupling — plan-review
    F2 applied), JSDoc divergence note carried.
- **Pattern Consistency** — IDOR describe is a self-contained top-level sibling
  with its own `makeUser`/`created`/`afterEach`, matching this file's
  three-sibling pattern (plan-review F1 applied — no cross-run leak).
- **Success Criteria** — `npm test` 154/154 (Docker), `test:unit` 140/140, `tsc`
  clean, lint clean. Teeth proven per guard (auth-guard deletion → #2 red 500;
  `.eq("user_id")` removal → #4 negative red), both reverted.
- **Test correctness** — the IDOR negative case re-reads A's row (status still
  `processing`, `error_code` null), proving no-mutation rather than just the
  response shape; the positive control flips the owner's own job, excluding
  "green for the wrong reason."
- **Mutation check** — skipped: the final diff touches no §4 risk production
  module (`photo-job.service.ts` unchanged; the teeth mutation was reverted). Per
  CLAUDE.md, scoped Stryker is a targeted gate, not a default — teeth were instead
  proven via the one-off guard removals.
