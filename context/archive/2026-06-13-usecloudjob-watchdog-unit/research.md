---
date: 2026-06-13T17:33:55+02:00
researcher: Piotr Miller
git_commit: a7edc251f5d4671404c186a21a40b66729d98bd9
branch: change/testing-e2e-north-star
repository: lumina-clean-ai
topic: "Deterministic unit test for useCloudJob's #6 decision logic (catch-up read, re-read-before-fail, idempotent out-of-order apply)"
tags: [research, codebase, useCloudJob, watchdog, realtime, testability, risk-6]
status: complete
last_updated: 2026-06-13
last_updated_by: Piotr Miller
---

# Research: Deterministic unit test for `useCloudJob`'s #6 decision logic

**Date**: 2026-06-13T17:33:55+02:00
**Researcher**: Piotr Miller
**Git Commit**: a7edc251f5d4671404c186a21a40b66729d98bd9
**Branch**: change/testing-e2e-north-star
**Repository**: lumina-clean-ai

## Research Question

How can the **decision logic** of `src/components/hooks/useCloudJob.ts` (the test-plan §2 Risk #6 defenses — catch-up read after Realtime `SUBSCRIBED`, re-read-before-fail at the queued deadline, idempotent/monotonic out-of-order event apply) be made **deterministically unit-testable** in this repo? Evaluate three approaches — pure-reducer extraction (prod refactor), `renderHook`+RTL/jsdom (test-only), and a hybrid — against the repo idiom, dependency cost, and regression risk, and recommend one.

Surfaced by the five-anti-patterns review of the E2E suite: the originally-sketched E2E "variant B" (force the catch-up branch from the browser) is **infeasible** because the UI has no resume/deep-link path by `jobId` (`useCloudSubmit.ts:32` inits `jobId` to `null`, set only from a submit; no `searchParams`/`localStorage` anywhere in `src/components`). The catch-up/re-read DECISION therefore has **no deterministic test at any layer** today.

## Summary

**Recommendation: Approach 3 (Hybrid) — lift the branch-free decision predicates into a pure, Node-testable module; leave the async Realtime/timer wiring intact and E2E-covered.**

The three Risk #6 behaviors are **logic decisions over `{terminal, sawProcessing, status, read-result}`**, not React-rendering concerns. The repo's unit idiom is decisively **pure functions / stubbed globals in `environment: "node"`** (`vitest.config.ts:7-9`; `globals: false`), with an established **"extract the pure decision, test it hermetically, leave the live wiring to E2E"** precedent (`src/lib/services/cloud-create-job.handler.ts` + `tests/cloud-create-job.handler.test.ts`, documented in `test-plan.md` §6.4). There is **no** `@testing-library/react`, `jsdom`, or `happy-dom` in `package.json`.

The hybrid:

- hits behavior **(c) idempotent/monotonic** fully and behavior **(b) re-read-before-fail decision** deterministically, with **zero new deps and no env change**;
- carries the **lowest regression risk** on a churn-heavy, correctness-critical file that has **two attached lessons** (`lessons.md:82-87`), because it lifts only **branch-free predicates** and leaves the subtle async double-guard ordering (`onQueuedDeadline` re-checks `terminal`/`sawProcessing` both before and after the `await`) **byte-for-byte intact**;
- matches the exact blessed seam already used for the daily-cap route.

The residual — behavior **(a) "catch-up actually fires on SUBSCRIBED"** and the live re-read _call_ — stays E2E-covered (`north-star-cloud-result.spec.ts`, `cloud-stall-surfaces-timeout.spec.ts`), which is the documented split.

Approach 1 (full reducer) is the **correct escalation** if catch-up/re-read regressions recur and the _async sequencing itself_ needs unit coverage — but its extra risk isn't justified while E2E pins that path. Approach 2 (`renderHook`) is the **worst fit**: 3+ new devDeps, a DOM-env exception against the deliberate Node-only stance, fake-timers-plus-promises flake, and brittle Supabase-chain mocks — to assert through render what is fundamentally pure decision logic.

## Detailed Findings

### Where the decision logic lives (`src/components/hooks/useCloudJob.ts`)

All three #6 behaviors are decided inside the **first `useEffect`** (`useCloudJob.ts:127-284`), operating on **closure-local mutable state** (not `useState`):

- `terminal` (`:134`), `sawProcessing` (`:135`), `timers` (`:139-143`) — the monotonic/idempotent guards + timer handles; the actual state machine.
- `applyStatus` (`:175-190`) — the fold: arm-long-budget-once (`:177-181`), terminal guard + clear-timers (`:182-186`), commit to React state (`:187-189`).
- `syncFromRead` (`:195-205`) — authoritative one-shot read; returns row status.
- `onQueuedDeadline` (`:213-219`) — re-read-before-fail: only `null`/`queued` after re-read calls `failByTimeout` (`:217`), gated by `terminal/sawProcessing` checks **both** at `:214` (before await) **and** `:216` (after await).
- `failByTimeout` (`:150-164`) — terminal/cancel guard + POST `/api/enhance/cloud/timeout` intent.
- SUBSCRIBED catch-up (`:245-251`) — `syncFromRead()` on `status === SUBSCRIBED`.
- Derived `phase` (`:324-332`) and `displayError` (`:338-345`) — **already pure** expressions over React state.

Mapping to the behaviors:

- **(a) catch-up read** → `:245-251` → `syncFromRead` → `applyStatus`.
- **(b) re-read-before-fail** → `onQueuedDeadline` `:213-219`.
- **(c) idempotent/monotonic** → `terminal` guard `:176`, `sawProcessing`-once `:177`, succeeded-wins `:324-332`.

### Approach comparison

| Dimension                        | 1. Pure reducer (refactor)                                                                                                                | 2. renderHook + RTL/jsdom                                                                                                                                       | 3. Hybrid (lift predicates)                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| New devDeps                      | none                                                                                                                                      | **3+** (`@testing-library/react`, `@testing-library/dom`, `jsdom`/`happy-dom`) — none present (`package.json:44-69`)                                            | none                                                                                          |
| Env change                       | none (Node)                                                                                                                               | forces DOM env for this file (pragma or config split) vs `node` (`vitest.config.ts:7`)                                                                          | none (Node)                                                                                   |
| Hits (a)(b)(c) deterministically | Excellent (every decision a single `reduce()`)                                                                                            | Indirect (through render + fake timers; failure could be mock/timer/React, not the decision)                                                                    | (c) fully + (b)'s decision; (a) partially (fold yes, "fires on SUBSCRIBED" stays E2E)         |
| Regression risk on the hook      | **High** — re-encodes the async double-guard ordering the lessons protect (`:214`/`:216`) + timer-clear-on-processing interleave (`:179`) | Low to prod (no refactor) but **high test fragility** (full Supabase-chain mock; `setAuth().then()`→`.subscribe()` microtask vs `vi.advanceTimersByTime` flake) | **Lowest** — lifts branch-free predicates only; async ordering untouched                      |
| Fit with repo idiom              | Good in spirit, heaviest refactor of a lessons-flagged file                                                                               | **Poor** — only React-render + only DOM-env test in the suite                                                                                                   | **Best** — identical to the `isOverDailyCap` seam in `cloud-create-job.handler.test.ts:24-30` |

### Proposed module (signature-level only) — Approach 3

New file `src/components/hooks/cloud-job-decisions.ts` (pure, no React/Realtime imports):

```ts
import type { PhotoJobStatus } from "@/types";
import type { CloudJobPhase } from "./useCloudJob"; // or co-locate

// (c) succeeded-wins + loading-stays-processing — lift of :324-332
export function deriveCloudPhase(input: {
  jobId: string | null;
  status: PhotoJobStatus | null;
  hasResult: boolean;
  timedOut: boolean;
  loadError: string | null;
}): CloudJobPhase;

// displayError mapping — lift of :338-345
export function deriveDisplayError(input: {
  phase: CloudJobPhase;
  status: PhotoJobStatus | null;
  timedOut: boolean;
  loadError: string | null;
  errorMessage: string | null;
}): string | null;

// (b) re-read-before-fail predicate — lift of the :217 condition
export function shouldFailAfterQueuedReRead(readStatus: PhotoJobStatus | null): boolean; // null || "queued"

// (c) arm-long-budget-once — lift of :177
export function shouldArmProcessingBudget(next: PhotoJobStatus, sawProcessing: boolean): boolean;

// (c) terminal classifier — lift of :182
export function isTerminalStatus(next: PhotoJobStatus): boolean; // "succeeded" | "failed"
```

The hook's `:324`/`:338` reads become `deriveCloudPhase(...)`/`deriveDisplayError(...)`; `:177` becomes `if (shouldArmProcessingBudget(next, sawProcessing))`; `:217` becomes `if (shouldFailAfterQueuedReRead(current)) failByTimeout();`. The mutable `terminal`/`sawProcessing`/timers and all async wiring stay put.

### Test cases unlocked — `tests/cloud-job-decisions.test.ts` (Node, no new deps)

1. **(c) succeeded-wins-over-timeout** — `deriveCloudPhase({status:"succeeded", hasResult:true, timedOut:true}) === "succeeded"` (the `:321-323` race the comment names).
2. **(c) succeeded-but-loading-stays-processing** — `{status:"succeeded", hasResult:false} → "processing"`.
3. **(c) loadError → failed**; **status `failed` → failed**.
4. **idle** — `jobId:null → "idle"`.
5. **displayError mapping** (`:338-345`) — row-`failed` → `errorMessage ?? GENERIC`; timeout-only → `TIMEOUT_MESSAGE`; loadError → `loadError ?? GENERIC`; non-failed phase → `null`.
6. **(b) re-read-before-fail** (load-bearing) — `shouldFailAfterQueuedReRead`: `"queued"→true`, `null→true`, `"processing"→false`, `"succeeded"→false`, `"failed"→false`. **A row that advanced to `processing` is never failed.**
7. **(c) arm-once** — `shouldArmProcessingBudget("processing", false)===true`; `(…, true)===false`; `("queued", false)===false`.
8. **terminal classifier** — true for `succeeded`/`failed`, false for `queued`/`processing`.

These are also **mutation-test** targets under the existing Stryker scope (matching the `photo-job.service.ts` precedent in CLAUDE.md).

## Code References

- `src/components/hooks/useCloudJob.ts:127-284` — the subscribe+watchdog effect (all decision logic).
- `src/components/hooks/useCloudJob.ts:175-190` — `applyStatus` (idempotent/monotonic fold).
- `src/components/hooks/useCloudJob.ts:213-219` — `onQueuedDeadline` (re-read-before-fail; double-guard at `:214`/`:216`).
- `src/components/hooks/useCloudJob.ts:245-251` — SUBSCRIBED catch-up read.
- `src/components/hooks/useCloudJob.ts:324-345` — pure `phase` + `displayError` derivations (lift targets).
- `src/components/hooks/useCloudSubmit.ts:32,50` — `jobId` is in-memory only (no resume path → E2E variant B infeasible).
- `src/components/enhance/EnhanceWorkspace.tsx:44-49` — wires `cloudSubmit.jobId` into `useCloudJob`.
- `src/lib/supabase-browser.ts:29` — `createBrowserClient(url, anonKey, accessToken?)`; surfaces used: `.realtime.setAuth`, `.channel().on().subscribe`, `.from().select().eq().maybeSingle()`, `.storage.from().createSignedUrl()`, `.removeChannel`, `.realtime.disconnect`.
- `src/pages/api/enhance/cloud/timeout.ts:18,33,61-69` — body `{ jobId: uuid }`; returns `{ flipped: boolean }` (200) / `unauthorized` (401) / `invalid_body` (400); calls owner-scoped guarded `markPendingJobFailedForOwner` (status in `["queued","processing"]`).
- `src/lib/services/cloud-result.client.ts:45` — `loadCloudResult(afterUrl): Promise<{width,height,blob}>`; throws on non-OK fetch / decode failure.
- `src/types.ts:13` — `PhotoJobStatus = "queued" | "processing" | "succeeded" | "failed"`; `:16-28` `PhotoJob`.
- `vitest.config.ts:7-9` — `environment: "node"`, `globals: false`, `include: ["tests/**/*.test.ts"]`.
- `package.json:44-69` — no `@testing-library/react` / `jsdom` / `happy-dom`.
- `tests/cloud-timings.test.ts` — only the exported timing-constant invariants.
- `tests/cloud-job-render.test.ts` — only `loadCloudResult` (stubbed `Image`/`fetch`).
- `src/lib/services/cloud-create-job.handler.ts:10-49` + `tests/cloud-create-job.handler.test.ts:24-30` — the blessed "pure decision unit, wiring at the boundary, live path via E2E" precedent.

## Architecture Insights

- **The repo's unit philosophy is "pure decision, hermetic test, live wiring elsewhere."** `cloud-create-job.handler.ts` extracts the env-free core so Vitest can drive it under Node with a stub admin; the daily-cap _decision_ (`isOverDailyCap`) is the unit, the route is the thin wrapper, and the real SQL is integration/E2E-covered. Approach 3 applies the identical seam to the watchdog — no new idiom to justify.
- **Node-only is deliberate, not incidental.** Every unit test is `environment: "node"` with stubbed globals (`Image`, `fetch`) rather than a DOM env. Introducing `renderHook` would make this hook the single standing exception.
- **The risky part of #6 is the async ordering, not the predicates.** `onQueuedDeadline` re-checks guards before _and_ after its `await` (`:214`/`:216`) precisely because state can change during the read; `applyStatus` interleaves the timer-clear-on-processing (`:179`) with the commit. The two attached lessons exist to protect that ordering. The hybrid lifts only the **branch-free booleans** and leaves the ordering untouched — which is why its regression risk is lowest.

## Historical Context (from prior changes)

- `context/archive/2026-05-31-cloud-ai-realtime-result/change.md:25-27` — S-04 Phase 5 introduced the two-phase watchdog (`QUEUED_WATCHDOG_MS`/`PROCESSING_WATCHDOG_MS`), **re-check-before-failing**, and **catch-up read on SUBSCRIBED**. (`PROCESSING_WATCHDOG_MS` was later raised 180s → 300s; see `lessons.md:89-94`.)
- `context/archive/2026-05-31-cloud-ai-realtime-result/plan.md:344-363` — S-04 **deferred** unit-testing the watchdog: "None automated (Deno Edge Function + external Replicate + Realtime). Covered by manual E2E." Only the render adapters (`loadCloudResult`) were planned as units. **This change fills that deferred gap.**
- `context/foundation/lessons.md:82-87` — "A Realtime-driven watchdog must catch up on subscribe and re-read before failing — never fire blindly on a timer" (idempotent + monotonic; `terminal` guard + `sawProcessing`-once). The rule this test pins.
- `context/foundation/lessons.md:61-66` — the async fire-and-forget timeout-backstop lesson (watchdog status filter must cover `queued` AND `processing`).
- `context/foundation/lessons.md:19-24,26-31` — Realtime `setAuth`-before-subscribe (already honored at `useCloudJob.ts:232-245`); env-free-module testability pattern.
- `context/foundation/test-plan.md` §2 Risk #6 (Risk Response Guidance) — **"Likely cheapest layer: Unit (watchdog/timing state machine with an injected clock + out-of-order events)"**; **anti-pattern: "Asserting the timer's numeric value instead of the _decision_ (fail vs re-read vs render) under a late or out-of-order event."** The hybrid's test cases assert decisions, never timer numbers.
- `context/foundation/test-plan.md` §6.4 — the env-free-core pattern + `cloud-create-job.handler.test.ts` reference.

## Related Research

- `context/changes/testing-e2e-north-star/research.md` — the E2E stub-seam research; this change is the unit-layer follow-up surfaced by the E2E suite's anti-pattern review (where variant B was ruled infeasible).

## Open Questions

1. **Module name / location.** `src/components/hooks/cloud-job-decisions.ts` (co-located with the hook) vs `src/lib/services/…` (next to `cloud-create-job.handler.ts`). The hook co-location reads more naturally for hook-internal predicates; the services dir matches the handler precedent. Decide in `/10x-plan`.
2. **`CloudJobPhase` type ownership.** Currently exported from `useCloudJob.ts:9`. Importing it back from the new module creates a mild cycle; consider moving the type into the decisions module (or `types.ts`) and re-exporting from the hook.
3. **Scope of the lift.** Minimum viable = the 5 predicates above (recommended). Optional stretch = also lift the `applyStatus` _fold_ shape (still pure if the timer/setState side-effects are returned as intents) to edge toward Approach 1 — only if the plan judges (a)'s residual E2E-only coverage insufficient.
4. **Stryker scope.** Add the new module to a scoped mutation run? `cloud-job-decisions.ts` is exactly the kind of risk-critical pure logic CLAUDE.md's mutation-testing note targets — likely yes, on demand.
