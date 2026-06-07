# S-09 Source signed-URL TTL fix (cold-boot reliability) — Implementation Plan

## Overview

Align the Cloud-AI pipeline's timing budgets to the real Replicate cold-boot tail so a slow cold boot **succeeds** instead of dying at the source-fetch step (or being false-failed by the client). Two **decoupled** levers: a generous server-side source signed-URL TTL (so the URL is never the failure cause), and a UX-patience client watchdog (so a slow-but-working job isn't killed prematurely).

## Current State Analysis

- The Edge Function `/start` signs the source READ URL with `SOURCE_URL_TTL_SECONDS = 300` (`supabase/functions/enhance/index.ts:40`, applied via `signSourceWithRetry` → `createSignedReadUrl` at `:152`) and embeds it in the Replicate prediction (`buildBreadInput`, `:217-237`). The TTL is **fixed at creation and un-re-mintable** — Replicate holds the URL.
- Replicate (Cog) fetches that URL **at `predict()` start, after the container cold-boots** — potentially minutes after `predictions.create`. Phase-0 measured cold boot ≈ 118–135s, but **>300s was observed under platform load**, so the 300s URL expires before the cold worker fetches → prediction dies at source-fetch (400).
- The client watchdog `PROCESSING_WATCHDOG_MS = 180_000` (`src/components/hooks/useCloudJob.ts:67`) is **shorter** than that cold-boot tail, so even with a longer source TTL it would false-fail a slow-but-working job.
- Cold-start reassurance copy reads "...can take up to **~2 minutes**" (`src/components/enhance/EnhanceWorkspace.tsx:260`), gated on `SLOW_HINT_MS = 25_000`.
- Cloud ships **OFF** in prod (`CLOUD_PIPELINE_ENABLED=false`); S-09 is a flip-ON gate prerequisite (with S-05 ✓ + S-08), not a deploy blocker.

### Key Discoveries:

- Supabase `createSignedUrl(path, expiresIn)` has **no practical cap** (validated only against a safe-integer JWT bound; `3600` is the canonical docs value) — raising the TTL is unconstrained (research §C).
- The fix **cannot re-mint** after prediction creation; the only viable lever is a long-enough TTL up front (research, Architecture Insights).
- `SOURCE_URL_TTL_SECONDS` lives in the Deno Edge Function — **excluded from the vitest/tsc graph**, so it is validated by `deno check` + review, not a unit test (lessons.md Deno-coverage rule).
- The client budget constants in `useCloudJob.ts` are **module-local** (not exported) — a regression-guard unit test requires exporting them.
- Source TTL and the client watchdog are **different concerns** and must stay decoupled (generous TTL vs UX patience) — see research Architecture Insights.

## What We're NOT Doing

- **Not lazy-signing** the source URL (rejected — Replicate fetches on its own schedule; can't sign "just in time").
- **Not** changing `RESULT_URL_TTL_SECONDS` (independent; minted post-success, re-minted on demand).
- **Not** keep-warm / Replicate min-instances (deferred cost decision; the only true *latency* fix — out of scope).
- **Not** fixing F9 (`markJobSucceeded` status-guard against the watchdog resurrection race) — independent flip-ON pre-req; a longer watchdog *shrinks* that race but doesn't close it.
- **Not** flipping cloud ON or running a live cold-boot test now (cloud OFF) — the live >300s re-validation is a documented flip-ON gate step.
- **Not** touching the source-signing retry budget (`SOURCE_SIGN_MAX_ATTEMPTS`/`_DELAY_MS` — that absorbs the upload race, a different concern).

## Implementation Approach

Two small, independent phases. Phase 1 is the server lever (Deno Edge Function, `deno check`-validated). Phase 2 is the client lever (vitest-validated) plus the cold-start copy and a regression-guard test. Chosen values (this session): source TTL **3600s**, processing watchdog **300_000ms (5 min)**.

## Critical Implementation Details

- **Decoupling is the whole point.** `SOURCE_URL_TTL_SECONDS` (3600s) must be *generous* so it's never the failure cause; `PROCESSING_WATCHDOG_MS` (300s) is a *UX-patience* budget that fails truly-stuck jobs to a retry. They are intentionally **not** equal and the watchdog is intentionally **shorter** than the TTL — do not "align" them to the same number.
- The source TTL is consumed at the *start* of the cold boot but fetched *late* in it; it must still be valid when a cold worker finally runs `predict()`. 3600s covers queue + multi-minute cold boot + Replicate's 30-min run window with margin.

## Phase 1: Edge Function — source signed-URL TTL

### Overview

Raise the source READ URL TTL so a slow cold boot doesn't expire it before Replicate fetches.

### Changes Required:

#### 1. Source URL TTL constant

**File**: `supabase/functions/enhance/index.ts`

**Intent**: Raise `SOURCE_URL_TTL_SECONDS` from `300` to `3600` so the signed source URL outlives the worst-case Replicate cold boot (URL is fetched at `predict()` start, post-boot). Update the adjacent comment to record the rationale (cold-boot tail >300s observed; URL un-re-mintable; sized to cover queue + cold boot + 30-min run window; privacy mitigated by retention-on-terminal).

**Contract**: `const SOURCE_URL_TTL_SECONDS = 3600;` (`:40`). No signature change — flows unchanged through `signSourceWithRetry` (`:152`) → `createSignedReadUrl(admin, path, expiresInSeconds)` → Supabase `createSignedUrl`.

### Success Criteria:

#### Automated Verification:

- `deno check supabase/functions/enhance/index.ts` passes — **runs in CI's deploy job** (`deno` is NOT on the local PATH in this repo; to check locally, install deno or use the Supabase-bundled deno). `npm run lint` is the locally-runnable gate.
- `npm run lint` passes (touched-file scope)

#### Manual Verification:

- Review confirms TTL = 3600 and the rationale comment reflects the >300s cold-boot reality + the un-re-mintable constraint

---

## Phase 2: Client — watchdog + cold-start UX + regression guard

### Overview

Raise the client processing watchdog to a UX-patience budget that clears the typical cold boot, align the cold-start copy, and add an invariant test so the budgets don't silently regress.

### Changes Required:

#### 1. Processing watchdog budget

**File**: `src/components/hooks/useCloudJob.ts`

**Intent**: Raise `PROCESSING_WATCHDOG_MS` from `180_000` to `300_000` (5 min) so a slow-but-working cold boot isn't false-failed; update the budget-rationale comment block (`:53-65`) to reflect the >300s observed tail and that the watchdog is a UX-patience budget decoupled from the (now 3600s) source TTL.

**Contract**: `const PROCESSING_WATCHDOG_MS = 300_000;` (`:67`). `QUEUED_WATCHDOG_MS`, `SLOW_HINT_MS`, `RESULT_URL_TTL_SECONDS` unchanged.

#### 2. Export the timing budgets (for the regression guard)

**File**: `src/components/hooks/useCloudJob.ts`

**Intent**: Add named `export` to the timing-budget constants (`QUEUED_WATCHDOG_MS`, `PROCESSING_WATCHDOG_MS`, `SLOW_HINT_MS`) so a unit test can assert the design invariants. No behavior change.

**Contract**: `export const QUEUED_WATCHDOG_MS = …` etc. (purely additive `export` keyword).

#### 3. Cold-start reassurance copy

**File**: `src/components/enhance/EnhanceWorkspace.tsx`

**Intent**: Align the cold-start hint copy (`:260`) to the new budget so it doesn't understate the wait.

**Contract**: Replace "The first run after idle can take up to ~2 minutes." with copy reflecting ~5 minutes (e.g. "The first run after idle can take a few minutes."). Same gating on `cloudColdStartHint`.

#### 4. Invariant regression test

**File**: `tests/cloud-timings.test.ts` (new)

**Intent**: Lock the design invariants so a future edit can't silently break the cold-start handling. Assert the *relationships* (not just literal values): `SLOW_HINT_MS < PROCESSING_WATCHDOG_MS` (reassurance shows before the fail) and `QUEUED_WATCHDOG_MS < PROCESSING_WATCHDOG_MS` (two-phase ordering holds). Optionally assert `PROCESSING_WATCHDOG_MS >= 300_000` as the documented cold-boot floor.

**Contract**: Vitest unit test importing the exported constants from `@/components/hooks/useCloudJob`. (Source TTL is Deno-only — not assertable here; covered by Phase 1 `deno check`.)

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` passes, including the new `tests/cloud-timings.test.ts`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- The cold-start reassurance line renders the updated copy when a cloud job is slow (dev)
- The watchdog/SLOW_HINT change introduces no regression to the existing cloud-job render/subscribe behavior

**Implementation Note**: After Phase 2 automated verification passes, pause for human confirmation of the manual checks before considering the change done.

---

## Testing Strategy

### Unit Tests:

- New `tests/cloud-timings.test.ts` — asserts the budget invariants (`SLOW_HINT_MS < PROCESSING_WATCHDOG_MS`, `QUEUED_WATCHDOG_MS < PROCESSING_WATCHDOG_MS`, floor on `PROCESSING_WATCHDOG_MS`).
- Existing suites (`replicate-webhook`, `cloud-job-render`, etc.) must stay green — no behavior change expected.

### Integration / Manual Testing Steps:

1. `deno check supabase/functions/enhance/index.ts` — Edge Function still type-checks with the new TTL.
2. Dev render: trigger the cold-start hint path and confirm the copy reads the new wait.

### Deferred — flip-ON re-validation (NOT run now):

- Against the live cloud path (needs Replicate creds + a controlled `CLOUD_PIPELINE_ENABLED` flip), force/observe a real **>300s** cold boot and confirm: the prediction no longer 400s at source-fetch, and the client does not false-fail before completion. This is a **flip-ON gate step** (shared with S-08's cloud test harness), recorded in the production-deployment `go-live.md` flip-ON runbook.

## Performance Considerations

No runtime performance impact — these are timeout/TTL constants. The longer source-URL TTL slightly widens the signed-read exposure window for the private source object; mitigated because the source is deleted on terminal state (and S-08 closes the failed/abandoned gap). Keep-warm (the only true *latency* improvement) remains deferred.

## Migration Notes

None — constant + copy changes only; no schema/data/API change. Worker/Edge runtime secrets unchanged. The change is inert until cloud flips ON.

## References

- Research: `context/changes/cloud-source-url-ttl-fix/research.md`
- Lesson: `context/foundation/lessons.md:89-94` (size TTLs/timeouts to the cold-boot ceiling)
- Roadmap: `context/foundation/roadmap.md` → S-09; GitHub issue #12
- Flip-ON runbook + F9: `context/archive/2026-06-04-production-deployment/go-live.md`
- Signing helper: `src/lib/services/photo-job.service.ts:251-261`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Edge Function — source signed-URL TTL

#### Automated

- [x] 1.1 `deno check supabase/functions/enhance/index.ts` passes (CI deploy job; `deno` not on local PATH — install locally or use the supabase-bundled deno) — 167ac4f
- [x] 1.2 `npm run lint` passes (touched files) — 167ac4f

#### Manual

- [x] 1.3 Review confirms `SOURCE_URL_TTL_SECONDS = 3600` + rationale comment (>300s tail, un-re-mintable) — 167ac4f

### Phase 2: Client — watchdog + cold-start UX + regression guard

#### Automated

- [x] 2.1 `npm run test:unit` passes incl. new `tests/cloud-timings.test.ts`
- [x] 2.2 `npm run lint` passes
- [x] 2.3 `npm run build` passes

#### Manual

- [x] 2.4 Cold-start reassurance copy renders the updated wait in dev
- [x] 2.5 No regression in existing cloud-job render/subscribe behavior

### Deferred (flip-ON gate — not run in this change)

- [~] D.1 **(DEFERRED — S-09 flip-ON closure criterion; not run in this change)** Live >300s cold-boot re-validation: prediction no longer 400s at source-fetch; client does not false-fail before completion (needs Replicate creds + controlled flip-ON; shared with S-08 harness)
