# useCloudJob #6 decision unit test — Plan Brief

> Full plan: `context/changes/usecloudjob-watchdog-unit/plan.md`
> Research: `context/changes/usecloudjob-watchdog-unit/research.md`

## What & Why

The test-plan §2 Risk #6 defenses in `useCloudJob.ts` (catch-up read after Realtime SUBSCRIBED, re-read-before-fail at the queued deadline, idempotent/monotonic out-of-order apply) have **no deterministic test at any layer** — the E2E covers the render path only non-deterministically, `cloud-timings.test.ts` covers only budget constants. This change lifts the **branch-free decision predicates** into a pure, Node-testable module and pins them with a unit suite that asserts the _decision_ (fail vs re-read vs render), exactly as R6 prescribes.

## Starting Point

The #6 decisions live as inline expressions inside the hook's first `useEffect` (`useCloudJob.ts:177/:182/:217`) and the bottom-of-hook `phase`/`displayError` derivations (`:324-345`) — already pure, but trapped behind React/Realtime. The repo's unit idiom is pure-functions in Node (`vitest.config.ts`), with a blessed "pure decision = unit, wiring = E2E" precedent (`cloud-create-job.handler.ts`). No RTL/jsdom in the repo.

## Desired End State

A new `tests/cloud-job-decisions.test.ts` runs green under `npm run test:unit`, deterministically asserting the #6 decisions (load-bearing: a row that advanced to `processing` is never failed at the queued deadline). `useCloudJob.ts` behaves identically — its five decision sites delegate to a new pure module `src/components/hooks/cloud-job-decisions.ts`. Lint, types, existing units, and the E2E gate stay green.

## Key Decisions Made

| Decision                  | Choice                                                     | Why (1 sentence)                                                                  | Source   |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Testability approach      | Hybrid — lift pure predicates                              | Lowest risk, zero new deps, fits repo idiom; reducer/renderHook rejected          | Research |
| Module location           | `src/components/hooks/cloud-job-decisions.ts` (co-located) | Predicates are hook-internal; the only consumer sits next to it                   | Plan     |
| Lift scope                | 5 predicates (MVP)                                         | Covers (b)+(c) deterministically without touching lesson-protected async ordering | Plan     |
| `CloudJobPhase` ownership | Move to new module, re-export from hook                    | Avoids hook↔module import cycle; keeps existing import paths working              | Plan     |
| Mutation testing          | Scoped Stryker on the new module, on-demand                | Risk-critical pure logic per CLAUDE.md mutation policy                            | Plan     |

## Scope

**In scope:** new pure module (5 predicates + `CloudJobPhase` + 2 failed-message constants); behavior-preserving rewire of 5 hook sites; new Node unit suite (8 cases); scoped Stryker target.

**Out of scope:** full reducer extraction (Approach 1); renderHook/RTL/jsdom (Approach 2); any behavior change to the hook; new/changed E2E; unit-testing "catch-up fires on SUBSCRIBED" (stays E2E).

## Architecture / Approach

New pure module holds the decision predicates; the hook imports and delegates, keeping all timers / Realtime auth ordering / the `onQueuedDeadline` double-guard around the `await` byte-for-byte intact. The risky async sequencing stays E2E-covered; only the branch-free booleans become unit-tested.

## Phases at a Glance

| Phase                    | What it delivers                                         | Key risk                                                                                                                            |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Extract + rewire      | Pure module + hook delegates to it (behavior-preserving) | Accidental behavior change in a churn-heavy, correctness-critical file — mitigated by literal 1:1 swaps + existing tests as the net |
| 2. Unit suite + mutation | 8 deterministic decision tests + scoped Stryker          | Tests that pass without teeth — mitigated by the mutation pass                                                                      |

**Prerequisites:** none (additive; the logic already exists in the hook).
**Estimated effort:** ~1 session across 2 small phases.

## Open Risks & Assumptions

- Assumes the five lifts are genuinely branch-free (they are: research mapped each to a single existing expression). Any hidden coupling would surface as an existing-test failure in Phase 1.
- The catch-up/re-read _wiring_ remains E2E-only by design; if those regress in a way the predicates don't capture, the E2E specs are the backstop.

## Success Criteria (Summary)

- A deterministic unit suite fails if the #6 decision logic regresses (esp. failing an already-advanced job).
- `useCloudJob.ts` behavior is unchanged (existing units + E2E green).
- The new module is on the scoped mutation target with survivors reviewed.
