# Review Pipeline Reliability — Plan Brief

> Full plan: `context/changes/review-pipeline-reliability/plan.md`
>
> ⚠️ Planned autonomously (user asleep, "finish that plan for me"): the interactive
> questioning rounds were replaced by decisions grounded in the change notes' own leanings +
> codebase/SDK research. Every such call is in the Key Decisions table — review those rows
> first; any of them is cheap to reverse before `/10x-implement`.
>
> Revised 2026-08-09 after the Codex plan review (`reviews/plan-review.md`, verdict REVISE):
> all 5 findings accepted — hidden-dir artifact flag (F1), Progress-contract cleanup + retry
> telemetry (F2), required-field fixture scope (F3), real-constructor test fixture (F4),
> strict Retry-After validity rule (F5).

## What & Why

The advisory AI PR review (PR #115) is live but flaky: the finder's structured output failed
schema validation on **2 of 7 live runs**, each costing a manual `ai-cr:review` re-run, and
its 429/5xx retry fires immediately — usually inside the same rate-limit window. This change
is the deferred reliability pass (impl-review F3/F4 + the schema-flake tally): self-healing
retries with bounded backoff, measured (not changed) dedup, and durable run output.

## Starting Point

`packages/code-reviewer` is a hermetic two-pass pipeline (finder → judge) where `retry.ts` is
the single retry authority (`maxRetries: 0` on both agents, ≤ 2 provider attempts per pass —
test-pinned). Schema mismatches are currently classified non-retryable by design;
`withOneRetry` has no delay; `review.json` dies with the CI runner.

## Desired End State

A transient flake (schema mismatch, 429, 5xx, timeout) recovers within the same CI run via
one delayed re-roll; every successful review run leaves a downloadable `ai-review-output`
artifact; `review.json` reports how many raw findings the dedup collapsed, feeding the
deferred F3 identity decision with live data.

## Key Decisions Made

| Decision              | Choice                                                                                                                                                 | Why (1 sentence)                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema-flake handling | `NoObjectGeneratedError.isInstance` → retryable (typed check, no message match)                                                                        | 2/7 live-run flake rate, quantified; one re-roll would likely have saved both failed runs.                                                 |
| Backoff shape         | Single bounded pre-retry delay: `Retry-After` (numeric secs) → else class default (429: 10 s, 5xx/timeout: 2 s, schema: 0) + 0–1 s jitter, capped 30 s | Keeps the ≤ 2-attempts cost contract; a schema re-roll gains nothing from waiting.                                                         |
| Retry-After parsing   | Usable = fully numeric, finite, ≥ 0 seconds; negative/malformed/HTTP-date → class default (never immediate retry); oversized → clamp 30 s              | Covers the realistic provider case without a clock seam; a negative header must not defeat the backoff (review F5).                        |
| Test seam             | Injectable `sleep`/`random` on `withOneRetry` + `PipelineDeps.retrySleep`                                                                              | Pipeline tests drive the real retry path — a real default sleep would add seconds to the suite.                                            |
| Retry observability   | `onRetry` hook → CLI stderr line (`retrying finder after … in …ms`)                                                                                    | `withOneRetry` swallows the first failure — without the line, a recovered flake is invisible in green runs (review F2).                    |
| F3 dedup identity     | UNCHANGED; ship `preDedupFindingCount` in `review.json` instead (required TS field — `cli.test.ts`/`render.test.ts` fixtures updated)                  | The notes say "decide, don't reflex-fix" — measurement feeds the `code-review-evals` change, which owns the call.                          |
| Artifact upload       | `review.yml` step (`!cancelled()`, `include-hidden-files: true`, `if-no-files-found: ignore`, 14-day retention), not the composite action              | v4 silently excludes dot-directories like `.review-out` without the hidden-files flag (review F1); composite per-step `if:` is unreliable. |
| Flake-rate reduction  | Out of scope (no model/prompt changes)                                                                                                                 | That's `code-review-evals` territory.                                                                                                      |

(All sourced from Plan — no frame/research doc existed; the change.md notes served as the task description.)

## Scope

**In scope:** retry classification + delay engine (`retry.ts`), pipeline seams + retry
telemetry + pre-dedup count (`pipeline.ts`, `cli.ts`, `schemas.ts`), tests (incl.
`cli.test.ts`/`render.test.ts` fixture updates), artifact upload (`review.yml`), one-clause
AGENTS.md docs touch, F3 decision record in change.md.

**Out of scope:** widening `mergeFindings` identity, >1 retry / retry frameworks, SDK-internal
retries, retrying `gh` posting steps, model/prompt changes, HTTP-date Retry-After,
partial-output artifacts on technical failure.

## Architecture / Approach

All logic lands in the already-hermetic `retry.ts` (pure classifier + pure delay policy +
injectable sleep), threaded through the existing `PipelineDeps` seam so the package suite
stays fast and deterministic. CI changes are one workflow step. Nothing touches the sticky
comment/label lifecycle hardened in impl-review F1/F2.

## Phases at a Glance

| Phase                                  | What it delivers                                                                    | Key risk                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Schema retry + delay engine         | `retry.ts` classifies `NoObjectGeneratedError`; bounded delay                       | SDK error-construction in tests (use real `isInstance` path, not mocks) |
| 2. Pipeline wiring + dedup measurement | `retrySleep` seam (fast tests); `onRetry` → CLI stderr line; `preDedupFindingCount` | Accidentally adding real sleeps to the suite                            |
| 3. Artifact upload + docs              | `ai-review-output` on every run; AGENTS.md clause                                   | Only live-verifiable on the change's own PR                             |

**Prerequisites:** none — no secrets, no migrations; the change's own PR doubles as the live test bed.
**Estimated effort:** ~1–2 sessions across 3 phases (Phases 1–2 are pure TDD; Phase 3 is ~20 lines of YAML + prose).

## Open Risks & Assumptions

- Assumes OpenRouter surfaces `Retry-After` numerically when it sends one; if absent, the
  class defaults still make the retry land outside typical rate windows (unmeasured — noted
  in impl-review F4 as a blind spot).
- A `NoObjectGeneratedError` caused by something systematic (e.g. content filter) burns one
  extra finder pass per run; bounded by the one-retry cap, accepted.
- Schema-flake recovery can't be forced deterministically in CI — but the `onRetry` stderr
  line makes any real recovery visible in the Actions log of a green run, so the
  observational follow-up has a concrete signal to look for.

## Success Criteria (Summary)

- A schema-flaked or rate-limited pass recovers in-run without a human label, with provider
  attempts still capped at ≤ 2 per pass.
- Every successful review run leaves a downloadable `review.json` (with
  `preDedupFindingCount`) surviving the runner.
- Package + `code-reviewer` CI job green; sticky comment/label behavior unchanged live.
