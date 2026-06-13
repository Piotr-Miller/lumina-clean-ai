# useCloudJob #6 decision unit test (extract pure predicates) Implementation Plan

## Overview

Make the test-plan §2 Risk #6 decision logic of `src/components/hooks/useCloudJob.ts` deterministically unit-testable by lifting its **branch-free decision predicates** into a pure, Node-testable module (`src/components/hooks/cloud-job-decisions.ts`), then adding a Vitest unit suite that pins the **decisions** (fail vs re-read vs render), not timer numbers. The hook keeps all async Realtime/timer/fetch wiring; only behavior-preserving rewiring happens there.

This closes the gap surfaced by the E2E anti-pattern review: the catch-up-read / re-read-before-fail / idempotent-apply decisions had no deterministic test at any layer (the E2E covers the render path only non-deterministically; `cloud-timings.test.ts` covers only budget constants; `cloud-job-render.test.ts` only `loadCloudResult`).

## Current State Analysis

- The #6 decision logic lives in closures inside the first `useEffect` (`useCloudJob.ts:127-284`), over closure-local mutable state (`terminal` `:134`, `sawProcessing` `:135`, timers `:139-143`) — not React state.
- The decisions are already **pure expressions** at three sites: the `processing`-arms-once test (`:177`), the terminal classifier (`:182`), the re-read-before-fail condition (`:217`), and the bottom-of-hook `phase` (`:324-332`) + `displayError` (`:338-345`) derivations.
- Message constants `TIMEOUT_MESSAGE`/`GENERIC_FAILED_MESSAGE`/`RESULT_LOAD_MESSAGE` are module-local (`:83-85`). `displayError` uses `TIMEOUT_MESSAGE` + `GENERIC_FAILED_MESSAGE`; the loader effect uses `RESULT_LOAD_MESSAGE` (`:314`).
- Repo unit idiom is decisively pure-functions in `environment: "node"` (`vitest.config.ts:7-9`, `globals: false`); **no** `@testing-library/react`/`jsdom`/`happy-dom` (`package.json`). The blessed precedent is "extract the pure decision, test it hermetically, leave the wiring to E2E" (`src/lib/services/cloud-create-job.handler.ts` + `tests/cloud-create-job.handler.test.ts:24-30`, test-plan §6.4).
- `CloudJobPhase` is exported from `useCloudJob.ts:9`. The timing constants (`QUEUED_WATCHDOG_MS` etc.) are imported by `tests/cloud-timings.test.ts:2` — those exports must remain.
- Full grounding: `context/changes/usecloudjob-watchdog-unit/research.md`.

## Desired End State

`npm run test:unit` runs a new `tests/cloud-job-decisions.test.ts` green, deterministically asserting the #6 decisions (esp. the load-bearing "a row that advanced to `processing` is never failed at the queued deadline"). `useCloudJob.ts` is byte-identical in behavior — its three decision sites + two derivations call the new pure module; `npm run lint`, `npx tsc --noEmit`, the existing unit suite, and the E2E gate all stay green. The new module is on the scoped Stryker target list for on-demand mutation.

### Key Discoveries:

- The risky part of #6 is the **async ordering** (the double-guard around the `await` in `onQueuedDeadline` at `:214` and `:216`), protected by two lessons (`lessons.md:82-87`). The lift touches **only branch-free predicates** and leaves that ordering intact (research recommendation).
- `deriveDisplayError` needs `TIMEOUT_MESSAGE` + `GENERIC_FAILED_MESSAGE`; co-locate those two in the new module so the function (and its test) is self-contained. `RESULT_LOAD_MESSAGE` stays in the hook (loader effect).
- To avoid an import cycle (hook ↔ module), move the `CloudJobPhase` type into `cloud-job-decisions.ts` and re-export it from `useCloudJob.ts` (preserves existing `import type { CloudJobPhase } from "@/components/hooks/useCloudJob"` consumers).

## What We're NOT Doing

- **No full reducer extraction** (research Approach 1): not lifting the `applyStatus` fold / async sequencing — that would re-encode the lesson-protected double-guard ordering and raise regression risk on a churn-heavy file. The catch-up/re-read _wiring_ stays E2E-covered.
- **No `renderHook`/RTL/jsdom** (research Approach 2): no new test deps, no DOM env — against the repo's Node-only idiom.
- **No behavior change** to the hook: budgets, timers, Realtime auth ordering, watchdog logic all unchanged.
- **No new E2E** and no change to the existing specs.
- **Not** unit-testing "catch-up actually fires on SUBSCRIBED" (`:249`) or the live re-read call — those stay E2E-covered (`north-star-cloud-result.spec.ts`, `cloud-stall-surfaces-timeout.spec.ts`).

## Implementation Approach

Phase 1 is a behavior-preserving extraction: create the pure module, move the `CloudJobPhase` type + the two message constants, and rewire the five call sites in the hook to delegate. Existing tests + tsc + lint are the safety net (no new behavior, so they must stay green untouched). Phase 2 adds the deterministic unit suite that asserts the decisions, plus a scoped mutation check to prove the assertions have teeth.

## Critical Implementation Details

- **Behavior preservation is the whole game in Phase 1.** Each rewired site must be a literal 1:1 swap: `:177` `next === "processing" && !sawProcessing` → `shouldArmProcessingBudget(next, sawProcessing)`; `:182` `next === "succeeded" || next === "failed"` → `isTerminalStatus(next)`; `:217` `current === null || current === "queued"` → `shouldFailAfterQueuedReRead(current)`; `:324-332` → `deriveCloudPhase(...)`; `:338-345` → `deriveDisplayError(...)`. No surrounding logic (the guards, the await ordering, timer arming) moves.
- **Keep the existing exports.** `QUEUED_WATCHDOG_MS`, `PROCESSING_WATCHDOG_MS`, `SLOW_HINT_MS` stay exported from `useCloudJob.ts` (consumed by `tests/cloud-timings.test.ts`). `CloudJobPhase` must remain importable from `useCloudJob.ts` (re-export from the new module).

## Phase 1: Extract pure decision module + rewire hook (behavior-preserving)

### Overview

Create `cloud-job-decisions.ts` with the five predicates, the `CloudJobPhase` type, and the two failed-message constants; rewire the five call sites in `useCloudJob.ts` to delegate. No behavior change.

### Changes Required:

#### 1. New pure decision module

**File**: `src/components/hooks/cloud-job-decisions.ts` (new)

**Intent**: Hold the branch-free #6 decision predicates as pure functions so they are unit-testable under Node without React/Realtime. Owns the `CloudJobPhase` type and the two failed-message constants it maps to.

**Contract**: Pure module, no React/Supabase imports. Exports (signature-level — bodies are verbatim lifts of the cited hook expressions):

```ts
import type { PhotoJobStatus } from "@/types";

export type CloudJobPhase = "idle" | "processing" | "succeeded" | "failed";
export const TIMEOUT_MESSAGE = "Cloud processing took too long. Please try again.";
export const GENERIC_FAILED_MESSAGE = "Cloud processing failed. Please try again.";

export function isTerminalStatus(next: PhotoJobStatus): boolean; // lift of :182
export function shouldArmProcessingBudget(next: PhotoJobStatus, sawProcessing: boolean): boolean; // :177
export function shouldFailAfterQueuedReRead(readStatus: PhotoJobStatus | null): boolean; // :217 (null || "queued")
export function deriveCloudPhase(input: {
  jobId: string | null;
  status: PhotoJobStatus | null;
  hasResult: boolean;
  timedOut: boolean;
  loadError: string | null;
}): CloudJobPhase; // lift of :324-332
export function deriveDisplayError(input: {
  phase: CloudJobPhase;
  status: PhotoJobStatus | null;
  timedOut: boolean;
  loadError: string | null;
  errorMessage: string | null;
}): string | null; // lift of :338-345
```

`deriveCloudPhase`/`deriveDisplayError` reproduce the exact precedence in the hook (succeeded-wins; succeeded-but-loading stays `processing`; failed mapping order). `RESULT_LOAD_MESSAGE` is NOT moved (the loader effect keeps it).

#### 2. Rewire the hook to delegate

**File**: `src/components/hooks/useCloudJob.ts`

**Intent**: Replace the five inline decision expressions with calls to the new module, and source `CloudJobPhase` + the two constants from there — a behavior-preserving refactor.

**Contract**: Import `{ CloudJobPhase (type), deriveCloudPhase, deriveDisplayError, isTerminalStatus, shouldArmProcessingBudget, shouldFailAfterQueuedReRead, TIMEOUT_MESSAGE, GENERIC_FAILED_MESSAGE }` from `./cloud-job-decisions`. Re-export the `CloudJobPhase` type (`export type { CloudJobPhase } from "./cloud-job-decisions"`) so existing `import … from "@/components/hooks/useCloudJob"` consumers are unaffected. Swap the five sites per "Critical Implementation Details". Remove the now-duplicated local `CloudJobPhase` def (`:9`), `TIMEOUT_MESSAGE`/`GENERIC_FAILED_MESSAGE` (`:83-85`); keep `RESULT_LOAD_MESSAGE`. Keep all timing-constant exports. No change to timers, guards, await ordering, or Realtime wiring.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx tsc --noEmit`
- Lint passes on touched files: `npx eslint src/components/hooks/cloud-job-decisions.ts src/components/hooks/useCloudJob.ts`
- Existing unit suite still green (proves behavior preserved): `npm run test:unit`
- The hook still exports the timing constants + `CloudJobPhase` (assert `cloud-timings.test.ts` imports resolve and pass).

#### Manual Verification:

- Diff review confirms each rewired site is a literal 1:1 swap with no surrounding-logic change (timers, double-guard ordering, Realtime auth sequence untouched).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Deterministic unit suite + mutation check

### Overview

Add `tests/cloud-job-decisions.test.ts` asserting the #6 decisions, and run a scoped Stryker mutation pass on the new module to confirm the assertions have teeth.

### Changes Required:

#### 1. Unit test for the decision predicates

**File**: `tests/cloud-job-decisions.test.ts` (new, Vitest, Node)

**Intent**: Pin the #6 decisions (the test-plan R6 anti-pattern is asserting timer numbers; this asserts decisions). Covers the load-bearing "advanced row is never failed at the queued deadline".

**Contract**: Imports from `@/components/hooks/cloud-job-decisions`. Cases:

1. `deriveCloudPhase({status:"succeeded", hasResult:true, timedOut:true, …})` → `"succeeded"` (succeeded-wins-over-timeout).
2. `deriveCloudPhase({status:"succeeded", hasResult:false})` → `"processing"` (loading stays processing).
3. `deriveCloudPhase` with `loadError` set → `"failed"`; with `status:"failed"` → `"failed"`.
4. `deriveCloudPhase({jobId:null})` → `"idle"`.
5. `deriveDisplayError`: row-`failed` → `errorMessage ?? GENERIC_FAILED_MESSAGE`; timeout-only → `TIMEOUT_MESSAGE`; loadError → `loadError ?? GENERIC_FAILED_MESSAGE`; non-failed phase → `null`.
6. `shouldFailAfterQueuedReRead`: `"queued"`→true, `null`→true, `"processing"`→false, `"succeeded"`→false, `"failed"`→false.
7. `shouldArmProcessingBudget`: `("processing", false)`→true, `("processing", true)`→false, `("queued", false)`→false.
8. `isTerminalStatus`: true for `succeeded`/`failed`, false for `queued`/`processing`.

#### 2. Add the module to the scoped mutation target

**File**: `CLAUDE.md` (mutation-testing note) and/or on-demand invocation

**Intent**: Record `cloud-job-decisions.ts` as a §4-risk-class pure-logic mutation target so survived mutants surface real gaps.

**Contract**: Run `npx stryker run --mutate "src/components/hooks/cloud-job-decisions.ts"` on demand; review survivors per the CLAUDE.md mutation policy (add an assertion only for a user-visible/business-relevant mutant; consciously ignore equivalent/cosmetic). No CI wiring.

### Success Criteria:

#### Automated Verification:

- New suite green: `npx vitest run tests/cloud-job-decisions.test.ts`
- Full unit suite green: `npm run test:unit`
- Lint + types green: `npx eslint tests/cloud-job-decisions.test.ts && npx tsc --noEmit`

#### Manual Verification:

- Scoped Stryker run reviewed: `npx stryker run --mutate "src/components/hooks/cloud-job-decisions.ts"` — qualifying survived mutants either killed with an assertion or consciously ignored (rationale noted).

**Implementation Note**: final phase — run the epilogue after manual confirmation.

---

## Testing Strategy

### Unit Tests:

- The eight decision cases above (Phase 2), Node env, no new deps. Reference idiom: `tests/cloud-create-job.handler.test.ts` (pure decision), `tests/cloud-job-render.test.ts` (Node unit).

### Integration Tests:

- Unchanged. The Realtime wiring + live re-read stay E2E-covered (`tests/e2e/north-star-cloud-result.spec.ts`, `tests/e2e/cloud-stall-surfaces-timeout.spec.ts`).

### Manual Testing Steps:

1. Diff-review Phase 1 for literal 1:1 swaps (no behavior change).
2. Run the existing unit + E2E gate once to confirm no regression.
3. Review the scoped Stryker report on the new module.

## Performance Considerations

None — pure synchronous predicates; no hot path change in the hook.

## Migration Notes

None — additive module + behavior-preserving refactor; no data, schema, or API change.

## References

- Research: `context/changes/usecloudjob-watchdog-unit/research.md`
- Decision logic: `src/components/hooks/useCloudJob.ts:127-284`, derivations `:324-345`
- Pure-decision precedent: `src/lib/services/cloud-create-job.handler.ts` + `tests/cloud-create-job.handler.test.ts:24-30`
- R6 guidance: `context/foundation/test-plan.md` §2 Risk #6, §6.4
- Lessons: `context/foundation/lessons.md:82-87` (catch-up/re-read), `:26-31` (env-free testability)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract pure decision module + rewire hook (behavior-preserving)

#### Automated

- [ ] 1.1 Type check passes: `npx tsc --noEmit`
- [ ] 1.2 Lint passes on touched files
- [ ] 1.3 Existing unit suite still green: `npm run test:unit`
- [ ] 1.4 Hook still exports timing constants + `CloudJobPhase` (cloud-timings imports resolve + pass)

#### Manual

- [ ] 1.5 Diff review confirms literal 1:1 swaps (no surrounding-logic change)

### Phase 2: Deterministic unit suite + mutation check

#### Automated

- [ ] 2.1 New suite green: `npx vitest run tests/cloud-job-decisions.test.ts`
- [ ] 2.2 Full unit suite green: `npm run test:unit`
- [ ] 2.3 Lint + types green on the new test

#### Manual

- [ ] 2.4 Scoped Stryker reviewed — qualifying survivors killed or consciously ignored
