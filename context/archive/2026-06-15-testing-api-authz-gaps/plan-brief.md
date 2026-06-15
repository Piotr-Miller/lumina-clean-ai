# API Authorization Test Gaps (Risk #2 + Risk #4) — Plan Brief

> Full plan: `context/changes/testing-api-authz-gaps/plan.md`
> Research: `context/changes/testing-api-authz-gaps/research.md`

## What & Why

Close the two remaining Phase-2 coverage gaps from the frozen test plan: prove
an **anonymous request can't reach Cloud AI** (Risk #2, gate-bypass) and a user
**can't advance another user's job** via a client-supplied jobId (Risk #4,
IDOR). Both are regression-lock risks on a live MVP — the production code is
already correct; we pin the behavior with tests that have real teeth and lock
the invariants against future drift.

## Starting Point

Risk #2's auth gate already lives in an env-free core (`cloud-create-job.handler.ts`)
with a hermetic harness — but the harness only tests the cap path, never
`user: null`. Risk #4's `timeout` route is a single-file route that correctly
calls the owner-scoped `markPendingJobFailedForOwner`, but nothing tests the
route's helper-selection at the boundary (only the helper in isolation, and RLS
on a user-scoped client — neither catches a future route wiring a client jobId
to an id-only helper).

## Desired End State

A hermetic case proves `user: null` → 401 before any insert/signed-URL work. The
`timeout` route is split into a thin env-wrapper + env-free core (mirroring
create-job), and a two-user integration test proves user B sending user A's
jobId leaves A's row untouched, with a positive control proving the owner's own
call still works. Both guards are proven to have teeth via a one-off mutation.

## Key Decisions Made

| Decision                | Choice                                                    | Why (1 sentence)                                                                                                                         | Source   |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Risk #2 layer           | Hermetic (extend existing handler test)                   | Gate is already in the env-free core; new signal is route wiring, and full-stack 401 is already E2E-covered.                             | Research |
| Risk #4 shape           | Extract `timeout.handler.ts` core + integration           | Only a real row proves the owner filter has teeth against the RLS-bypassing service-role client, AND it locks the route's helper choice. | Plan     |
| Risk #4 reject contract | Assert live no-op (200 `{flipped:false}` + row unmutated) | Tests actual prod behavior; the silent no-op avoids leaking foreign-jobId existence.                                                     | Plan     |
| Teeth proof             | One-off reorder/filter-removal mutation per guard         | The exact discipline that shipped #3/#5; cheap and targeted, no full Stryker gate.                                                       | Plan     |
| #4 test placement       | Extend `jobs.rls.test.ts`                                 | Already Docker-bound + excluded from `test:unit`/Stryker; new file would need two exclude-globs kept in sync.                            | Plan     |

## Scope

**In scope:**

- One hermetic anon-gate case in `tests/cloud-create-job.handler.test.ts`.
- Extract-core refactor of `timeout.ts` → `timeout.handler.ts` + thin wrapper.
- Two-user cross-user IDOR cases (negative + positive control) in `jobs.rls.test.ts`.
- One-off teeth proof per guard; test-plan §3/§6.4/§6.6 status refresh.

**Out of scope:**

- Any change to production authorization behavior (refactor is runtime-parity).
- Changing the timeout reject contract to 403/404.
- A full Stryker pass as a gate; an integration test for Risk #2.

## Architecture / Approach

Mirror the proven create-job split: a thin `astro:env/server` wrapper builds the
admin client and delegates to an env-free core that Vitest can load under Node.
Risk #2 needs no production change (its core already exists). Risk #4 needs the
new core so the integration test can drive the route's request→response logic
(session `user.id` → owner-scoped helper) against a real local Supabase with two
users.

## Phases at a Glance

| Phase                         | What it delivers                                  | Key risk                                                                    |
| ----------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Risk #2 hermetic case      | Anon → 401 before side-effects, proven with spies | Trivially-green test — mitigated by the teeth proof                         |
| 2. Risk #4 core + integration | Route-boundary IDOR test + extract-core refactor  | Refactor regresses the route — mitigated by runtime parity + E2E stall spec |

**Prerequisites:** Local Supabase stack (Docker) for Phase 2 (`npx supabase start` + `db reset`); none for Phase 1.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- The `timeout.ts` extract-core refactor assumes runtime parity (same deliberate
  env-presence-guard divergence as create-job); validated by the E2E stall spec.
- The integration cases add a few seconds to the Docker-bound `jobs.rls.test.ts`
  run — acceptable, it already runs in the CI `integration` job.

## Success Criteria (Summary)

- An anonymous create-job request is provably rejected (401) before any storage
  or DB side-effect — at the cheap hermetic layer.
- User B cannot advance/fail user A's job through the `timeout` route; A's row is
  provably unmutated, with a positive control proving the path still works for
  the owner.
- Both guards proven to have teeth by a documented, reverted one-off mutation.
