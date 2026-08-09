# Review Pipeline Reliability Implementation Plan

## Overview

One coherent reliability pass over `packages/code-reviewer` and its CI workflow, closing the
deferred findings from the `ci-cd-code-review` impl-review (F3/F4) plus the quantified
schema-flake follow-up: make structured-output schema mismatches retryable-once, give the
single retry a bounded, `Retry-After`-aware delay, record (not change) the dedup-collapse
signal, and preserve `review.json` as a workflow run artifact for post-hoc inspection.

## Current State Analysis

- **Retry authority**: `packages/code-reviewer/src/retry.ts` is the single retry authority
  (both agents run `maxRetries: 0`; `provider-attempts.test.ts` pins ≤ 2 provider attempts
  per pass). `isRetryableError` retries `TimeoutError` aborts and `APICallError` 429/5xx —
  and explicitly documents schema mismatches as never retryable.
- **The quantified flake**: the finder (`z-ai/glm-4.6`) failed structured output on **2 of 7
  live runs** (`NoObjectGeneratedError`, "response did not match schema" — runs 31275401205,
  31277190123). Both were one-shot flakes; today's only recovery is a human adding the
  `ai-cr:review` label.
- **No backoff**: `withOneRetry` (`retry.ts:31`) re-invokes immediately, so a 429 retry
  usually lands in the same rate-limit window. The AI SDK's `APICallError` exposes
  `responseHeaders` (including `retry-after`) — confirmed against current AI SDK docs.
- **Dedup identity** (`findings.ts:43`): `file:startLine|category` collapses distinct
  same-line/same-category defects before the judge sees them. The dedup exists to merge model
  rephrasings; widening the identity risks duplicate noise. There is currently **no signal**
  for how often collapse even happens in real runs.
- **Runner-ephemeral output**: the CLI writes `review.json` + `comment.md` to `.review-out/`
  (`cli.ts:97-102`); only the top findings survive in the sticky comment — the full findings
  list dies with the runner.
- **Test seams**: `PipelineDeps` (`pipeline.ts:92-95`) injects finder/judge for hermetic
  tests; `pipeline.test.ts:184-260` exercises the retry paths through the real `withOneRetry`.

## Desired End State

A transient-flake PR review recovers by itself: a schema-mismatch or rate-limited pass
re-rolls exactly once (after a bounded, header-aware delay), CI cost stays capped at ≤ 2
provider attempts per pass, every successful run leaves a downloadable `review.json`
artifact, and `review.json` carries the pre-dedup finding count so the `code-review-evals`
change can decide the F3 identity question on data.

Verify by: package tests/typecheck/lint green, the `code-reviewer` CI job green, and a live
run on this change's own PR (review.yml triggers on every PR to master) showing the uploaded
artifact.

### Key Discoveries:

- `NoObjectGeneratedError` is exported from `ai` with a static `isInstance` — classification
  needs no message matching (AI SDK docs, current).
- `APICallError.responseHeaders` is the documented header surface; header keys are lowercase
  (`retry-after`).
- `retry.test.ts:35-42` already pins that a plain `TypeError("response did not match
schema")` is non-retryable — that test **stays** (we match the typed error, never message
  strings); only a genuine `NoObjectGeneratedError` becomes retryable.
- `pipeline.test.ts` drives real `withOneRetry` calls — an unconditional real sleep would add
  seconds of wall-clock to the suite; the delay must be injectable through `PipelineDeps`.
- Composite-action steps have historical quirks with `if: always()`; the artifact upload
  belongs in `review.yml` (workflow level), not `.github/actions/ai-review/action.yml`.
- `PipelineResult` is a plain TS interface (`schemas.ts:123`) — the new count field is
  **required** in TS (deliberate compile break: typed fixtures in `cli.test.ts:19` and
  `render.test.ts:29` must be updated with it), while the `review.json` addition is
  non-breaking for consumers (only the label step's `jq .verdict` reads the file).

## What We're NOT Doing

- **Not widening the `mergeFindings` identity** (F3's reflex fix). The identity stays
  `file:startLine|category`; we only add measurement. The decision moves to the
  `code-review-evals` change with promptfoo data plus the live collapse counts.
- **Not adding a second retry or a general retry framework** — the one-retry contract
  (≤ 2 attempts per pass) is a deliberate cost guard and stands.
- **Not re-enabling SDK-internal retries** (`maxRetries` stays 0 in both agents).
- **Not retrying the `gh` posting steps** (sticky comment / labels) — impl-review F1/F2
  already hardened those.
- **Not changing models or prompts to reduce the flake rate** — that's evals territory
  (`code-review-evals`).
- **Not supporting HTTP-date `Retry-After` values** — numeric seconds only; a date-form
  header falls back to the class default delay.
- **Not uploading artifacts on technical failure** — the CLI only writes `.review-out/` on
  success; the upload step tolerates absence rather than inventing a partial-output path.

## Implementation Approach

Three phases, smallest-risk first. Phase 1 changes only the pure retry module (hermetic,
TDD-able). Phase 2 wires the delay seam through the pipeline and adds the dedup measurement
field. Phase 3 touches CI YAML only. Each phase leaves the package green on its own; the
change's own PR then live-verifies Phase 3.

## Critical Implementation Details

- **Timing & lifecycle**: `withOneRetry`'s default sleep must be a real `setTimeout` in
  production, but `pipeline.test.ts` exercises retries through the real `withOneRetry` — the
  tests MUST inject a recording no-op sleep (via the new `PipelineDeps.retrySleep` seam /
  `withOneRetry` options), or the suite gains multi-second real delays. Do not reach for
  fake timers; the injection seam is deterministic and matches the package's existing
  seam style.
- **State sequencing**: classification must check `NoObjectGeneratedError.isInstance` — never
  match on error message or `TypeError`. The existing `retry.test.ts` case pinning
  `TypeError("response did not match schema")` as non-retryable is kept as-is; it now guards
  exactly this boundary.
- **Debug & observability**: jitter needs an injectable random source (or range assertions)
  so delay tests stay deterministic. `Retry-After` arrives lowercase in `responseHeaders`.

## Phase 1: Retryable Schema Mismatch + Delay Engine (retry.ts)

### Overview

Make `NoObjectGeneratedError` retryable and give `withOneRetry` a bounded, header-aware
pre-retry delay — all inside the pure `retry.ts` module.

### Changes Required:

#### 1. Retry classifier

**File**: `packages/code-reviewer/src/retry.ts`

**Intent**: Classify the AI SDK's `NoObjectGeneratedError` (structured output failed to
parse/validate — the 2/7 live flake) as retryable, alongside the existing TimeoutError and
429/5xx cases. Update the module header + classifier doc comment, which currently document
schema mismatches as never retryable.

**Contract**: `isRetryableError(error: unknown): boolean` returns `true` when
`NoObjectGeneratedError.isInstance(error)` (imported from `ai`). Plain errors that merely
mention schemas in their message remain non-retryable.

#### 2. Delay policy

**File**: `packages/code-reviewer/src/retry.ts`

**Intent**: Compute how long to wait before the single retry, per error class: honor a
numeric `Retry-After` response header when present, otherwise a class default; schema
mismatches re-roll immediately (waiting doesn't help a stochastic decode failure).

**Contract**: A pure exported `retryDelayMs(error: unknown, random?: () => number): number`:

- A **usable** `responseHeaders["retry-after"]` is a non-empty, fully parsed, finite number
  `>= 0` (seconds). Negative, non-finite, partially numeric, and HTTP-date values are NOT
  usable and fall back to the class default — a negative value must never produce an
  immediate retry (plan-review F5). Oversized positive values clamp to
  `MAX_RETRY_DELAY_MS` (export the cap; 30_000).
- `APICallError` with a usable header → header seconds in ms, clamped to the cap.
- `APICallError` 429 without a usable header → `RATE_LIMIT_DELAY_MS` (10_000).
- `APICallError` 5xx and `TimeoutError` → `TRANSIENT_DELAY_MS` (2_000).
- `NoObjectGeneratedError` → 0.
- Nonzero delays add jitter: `random()` (default `Math.random`) × 1_000 ms, still clamped
  to the cap.

#### 3. Sleep seam in withOneRetry

**File**: `packages/code-reviewer/src/retry.ts`

**Intent**: Before the second invocation, wait `retryDelayMs(error)`; the sleep is
injectable so tests never really wait. Expose the swallowed first failure through an
`onRetry` hook — without it an in-run recovery leaves zero trace in CI logs, making the
whole change unverifiable in the wild (plan-review F2).

**Contract**: `withOneRetry<T>(fn, opts?: { sleep?: (ms: number) => Promise<void>; random?: () => number; onRetry?: (error: unknown, delayMs: number) => void }): Promise<T>`.
Default sleep is a real `setTimeout` promise; a computed delay of 0 skips the sleep call
entirely; `onRetry` (default no-op) fires exactly once, before the sleep, only when a retry
will actually happen. Existing call sites remain source-compatible (options optional).

#### 4. Tests

**File**: `packages/code-reviewer/src/retry.test.ts`

**Intent**: Pin the new contract — `NoObjectGeneratedError` retryable; delay policy table
(header wins, clamping, per-class defaults, schema → 0, jitter bounds via injected random);
`withOneRetry` sleeps the computed delay exactly once (recording fake sleep) and never
sleeps on a 0 delay; the existing plain-`TypeError` non-retryable case stays untouched.

**Contract**: Construct the error via the real `NoObjectGeneratedError` constructor with its
required fields (`message`, `text`, `response`, `usage`, `finishReason`, `cause` as the SDK
version demands). NEVER `Object.create(NoObjectGeneratedError.prototype)` — the SDK brands
instances with a private symbol set in the constructor, and `isInstance` checks that marker,
not the prototype chain; a prototype-only fixture silently fails classification
(plan-review F4).

### Success Criteria:

#### Automated Verification:

- Package unit tests pass: `npm run test` (in `packages/code-reviewer`)
- Type checking passes: `npm run typecheck` (in `packages/code-reviewer`)
- Linting passes: `npm run lint` (in `packages/code-reviewer`)

(No Manual Verification subsection — pure hermetic module; live behavior is verified in
Phase 3's run.)

---

## Phase 2: Pipeline Wiring + Dedup Measurement

### Overview

Thread the sleep seam through the pipeline so tests stay fast, and record the pre-dedup
finding count so the F3 identity decision can be made on live data later.

### Changes Required:

#### 1. Retry seams: sleep + telemetry

> **Pulled forward (approved, landed in Phase 1 — `73f8eaf`)**: `PipelineDeps.retrySleep`
> and its forwarding into both `withOneRetry` calls, plus the no-op sleep injection in
> `pipeline.test.ts` — without it the 429 retry-path test would really sleep 10 s and blow
> vitest's 5 s timeout. Still to do here: `PipelineInput.onRetry` (pass-name telemetry),
> the CLI stderr wiring, and the tests asserting recorded delays + `onRetry` behavior.

**File**: `packages/code-reviewer/src/pipeline.ts`, `packages/code-reviewer/src/cli.ts`

**Intent**: Let tests replace the retry delay, and make an in-run recovery visible in the
Actions log — `withOneRetry` swallows the first failure, so without a logged line an
ultimately-green run carries no evidence the retry ever fired (plan-review F2).

**Contract**: `PipelineDeps` gains optional `retrySleep?: (ms: number) => Promise<void>`
(test seam); `PipelineInput` gains optional
`onRetry?: (pass: "finder" | "judge", error: unknown, delayMs: number) => void`
(production observability). Both `withOneRetry(...)` calls forward them. The CLI wires
`onRetry` to a stderr line naming the pass, the error name, and the delay (e.g.
`retrying finder after NoObjectGeneratedError in 0ms`) — this line in an
ultimately-green run IS the live evidence of a recovered flake.

#### 2. Pre-dedup finding count

**File**: `packages/code-reviewer/src/pipeline.ts`, `packages/code-reviewer/src/schemas.ts`

**Intent**: Measure how often the coarse dedup identity actually collapses findings in real
runs — the datum the deferred F3 decision needs — without changing merge behavior.

**Contract**: `PipelineResult` gains `preDedupFindingCount: number` — **required** in the
TS interface (a deliberate compile-time break for typed fixtures; see Tests below), while
the `review.json` addition is non-breaking for consumers (only the label step's
`jq .verdict` reads it) — plan-review F3. `runReviewPipeline` populates it (the finder's
normalized finding count before `mergeFindings`). Renderer ignores it (no sticky comment
change).

#### 3. Tests

**File**: `packages/code-reviewer/src/pipeline.test.ts`,
`packages/code-reviewer/src/cli.test.ts`, `packages/code-reviewer/src/render.test.ts`

**Intent**: Existing retry-path tests inject a recording `retrySleep` (asserting the delays
that were requested, and that the suite performs no real waiting); a new case pins
`preDedupFindingCount` when the finder emits collapsing duplicates (e.g. 3 raw → 2 merged →
`preDedupFindingCount: 3`); a case pins `onRetry` firing (pass name + delay) on a recovered
retry and staying silent on a first-try success. `cli.test.ts` and `render.test.ts` both
build typed `PipelineResult` fixtures (`cli.test.ts:19`, `render.test.ts:29`) — the required
field breaks their compile until the fixtures gain it (plan-review F3).

**Contract**: Total package suite wall-clock must not grow by more than noise — no real
sleeps anywhere in tests.

#### 4. Decision record for F3

**File**: `context/changes/review-pipeline-reliability/change.md` (Notes section)

**Intent**: Record the explicit decision: dedup identity unchanged; measurement shipped;
final call deferred to `code-review-evals` with the promptfoo harness + live
`preDedupFindingCount` data.

**Contract**: A dated note appended under `## Notes`.

### Success Criteria:

#### Automated Verification:

- Package unit tests pass with no added wall-clock: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- `review.json` from a local `npm run review -- --diff-file <synthetic.diff>` run (optional,
  costs one paid call) shows `preDedupFindingCount` ≥ `findings.length`

---

## Phase 3: Run Artifact Upload + Docs

### Overview

Preserve the review output beyond the runner's lifetime and note the new behavior in the
repo docs; verify live on this change's own PR.

### Changes Required:

#### 1. Artifact upload step

**File**: `.github/workflows/review.yml`

**Intent**: After the composite `AI review` step, upload `.review-out/` (full `review.json`
incl. `preDedupFindingCount`, plus `comment.md`) so findings beyond the sticky comment's cut
survive for post-hoc inspection.

**Contract**: An `actions/upload-artifact@v4` step with `if: ${{ !cancelled() }}`,
`name: ai-review-output`, `path: packages/code-reviewer/.review-out/`,
`include-hidden-files: true` (MANDATORY — v4 excludes files inside dot-directories by
default, and `.review-out` is one; without this the step stays green while uploading
nothing, masked by the ignore below — plan-review F1),
`if-no-files-found: ignore` (technical failures produce no output dir — the step must stay
green), `retention-days: 14`. It lives in the workflow, NOT the composite action (per-step
`if:` inside composites is historically unreliable, and the composite stays reusable).

#### 2. Docs touch-up

**File**: `AGENTS.md` (CI section, `review.yml` paragraph)

**Intent**: One clause noting the review run now uploads `review.json`/`comment.md` as the
`ai-review-output` artifact (14-day retention) and that schema-mismatch flakes now retry
once with backoff before the manual `ai-cr:review` fallback.

**Contract**: Prose only; no structural changes to AGENTS.md.

### Success Criteria:

#### Automated Verification:

- Workflow YAML parses (e.g. `npx yaml-lint` or a `gh workflow view` after push; at minimum
  a YAML parse in the editor/CI)
- `code-reviewer` CI job green on the PR

#### Manual Verification:

- This change's own PR triggers `review.yml`; the run shows the `ai-review-output` artifact,
  downloadable, containing `review.json` with `preDedupFindingCount`
- Sticky comment + label behavior unchanged on that run

**Post-landing observability note** (not a success criterion — unverifiable at
implementation time, plan-review F2): over subsequent PRs, a recovered schema flake shows up
as the CLI's `retrying finder after NoObjectGeneratedError …` stderr line in the log of an
ultimately-green run. Worth a glance whenever a review run "felt slow".

---

## Testing Strategy

### Unit Tests:

- Classifier: `NoObjectGeneratedError` retryable (real `isInstance` path); plain
  `TypeError`/string/`AbortError`/4xx unchanged non-retryable.
- Delay policy: header precedence; unusable headers (negative, non-finite, partially
  numeric, HTTP-date, empty) → class default, NEVER an immediate retry; oversized positive
  values → clamp to the 30 s cap; per-class defaults; schema → 0; jitter within
  `[base, base+1000]`.
- `withOneRetry`: sleeps exactly once before retry with the computed delay; skips sleep on
  0; `onRetry` fires once (before the sleep) on a real retry and never otherwise; still ≤ 2
  invocations in every path (the provider-attempts invariant is untouched).
- Pipeline: retry paths with recording `retrySleep`; `onRetry` receives the pass name +
  delay; `preDedupFindingCount` populated; `cli.test.ts` pins the stderr retry line.

### Integration Tests:

- The existing `code-reviewer` CI job (hermetic `npm ci` + lint + typecheck + tests) is the
  gate — no new secrets, fork-PR-safe, unchanged.

### Manual Testing Steps:

1. Open the PR for this change → `review.yml` runs (it reviews itself).
2. Download `ai-review-output` from the run; confirm `review.json` completeness +
   `preDedupFindingCount`.
3. Confirm sticky comment upsert + `ai-cr:*` label flip still behave (same comment id,
   single marker).

## Performance Considerations

Worst case a run gains two bounded delays (finder + judge retry): ≤ 30 s each, typically
2–10 s, and only on failing first attempts. Provider attempts stay capped at ≤ 2 per pass —
the cost ceiling from the original design is unchanged. Test suite gains no real sleeps.

## Migration Notes

`preDedupFindingCount` is additive in `review.json`; nothing consumes `review.json`
programmatically except the label step's `jq .verdict`, which is unaffected. No data or
schema migration.

## References

- Change notes: `context/changes/review-pipeline-reliability/change.md`
- Deferred findings: `context/archive/2026-08-07-ci-cd-code-review/reviews/impl-review.md`
  (F3 `findings.ts:46`, F4 `retry.ts:36`)
- Flake tally: `context/archive/2026-08-07-ci-cd-code-review/verification.md` (2/7 live runs)
- Retry authority + attempts invariant:
  `packages/code-reviewer/src/provider-attempts.test.ts:10-15`
- Composite action / workflow: `.github/actions/ai-review/action.yml`,
  `.github/workflows/review.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Retryable Schema Mismatch + Delay Engine (retry.ts)

#### Automated

- [x] 1.1 Package unit tests pass: `npm run test` — 73f8eaf
- [x] 1.2 Type checking passes: `npm run typecheck` — 73f8eaf
- [x] 1.3 Linting passes: `npm run lint` — 73f8eaf

### Phase 2: Pipeline Wiring + Dedup Measurement

#### Automated

- [x] 2.1 Package unit tests pass with no added wall-clock: `npm run test` — dc38e4c
- [x] 2.2 Type checking passes: `npm run typecheck` — dc38e4c
- [x] 2.3 Linting passes: `npm run lint` — dc38e4c

#### Manual

- [ ] 2.4 (Optional, paid) Local review run shows `preDedupFindingCount` in `review.json`

### Phase 3: Run Artifact Upload + Docs

#### Automated

- [x] 3.1 Workflow YAML parses (prettier YAML parse + format check, local)
- [ ] 3.2 `code-reviewer` CI job green on the PR

#### Manual

- [ ] 3.3 Own-PR run uploads downloadable `ai-review-output` artifact with complete `review.json`
- [ ] 3.4 Sticky comment + label behavior unchanged on that run
