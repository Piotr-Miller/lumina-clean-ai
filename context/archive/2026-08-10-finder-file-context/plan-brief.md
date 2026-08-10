# Finder File Context (getFileContext in CI) — Plan Brief

> Full plan: `context/changes/finder-file-context/plan.md`

## What & Why

Give the CI review finder eyes beyond the diff: activate its dormant `getFileContext` tool so it can read the surrounding source of the files under review before judging. Today the finder reviews the diff in a vacuum — the classic failure mode is flagging a "missing" guard that sits five lines above the hunk. The tool, its caps, and its prompt toggle were all built in the `tool-loop-agent` change; this change is the delivery path, plus the diff-derived path allowlist that change recorded as security future-work.

## Starting Point

`createReviewer` already accepts a `SourceProvider` and registers the tool when one is present — but `runReviewPipeline` never passes one, so every CI run is tool-less and single-generation (a deliberate cost ceiling at the time). The CLI (`cli.ts`) has an injectable IO seam, timeout-env patterns, and `onRetry` stderr telemetry to mirror; the composite action runs it from `packages/code-reviewer` against a merge-ref checkout.

## Desired End State

Every advisory PR review runs the finder with file-context access restricted to exactly the files in the diff, capped at 5 loop steps (env-overridable via `REVIEW_FINDER_MAX_STEPS`), with per-step telemetry in the Actions log and a `finderTelemetry` cost summary in the `review.json` artifact. Proven live by a scratch PR whose planted flaw is only findable with surrounding context.

## Key Decisions Made

| Decision           | Choice                                                 | Why (1 sentence)                                                                     | Source       |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------ |
| Which extension    | `getFileContext` wiring; no `readPlan`, no write-tools | Biggest quality lift on already-built seams; write-tools = injection-to-action risk  | Conversation |
| Step budget        | 5 in CI, `REVIEW_FINDER_MAX_STEPS` override            | ~4 context fetches covers a capped diff; knob avoids code changes to tune            | Plan         |
| Telemetry surface  | stderr per-step + `finderTelemetry` in review.json     | The 14-day artifact makes cost measurable per PR — the "was it worth it" data        | Plan         |
| Provider transport | fs reads via injected `CliIo.readFile`                 | Hermetic tests for free; merge-ref vs head drift is rare and low-impact (documented) | Plan         |
| Allowlist          | Exact-match set of `+++ b/` paths, no normalization    | Normalization is where traversal bugs live; a miss just returns a refusal string     | Plan         |
| Eval harness       | Stays tool-less; fixture-backed source = follow-up     | Keeps this change hermetic; eval work has its own paid-run and fixture questions     | Plan         |
| Verification       | Planted-flaw scratch PR off the feature branch         | Proves tool call + allowlist + verdict-improvement end-to-end (precedent: PR #117)   | Plan         |

## Scope

**In scope:** new `source-provider.ts` (path parsing + allowlisted provider), `onStepFinish` pass-through in `reviewer.ts`, `source`/`finderMaxSteps`/telemetry seam in `pipeline.ts`, `--source-root` flag + env knob + stderr lines in `cli.ts`, one-line composite-action opt-in, AGENTS.md doc note, live verification evidence.

**Out of scope:** eval tool-loop wiring (follow-up), `readPlan`, write-tools, `git show`-based provider, allowlist expansion beyond diff files, judge/retry/timeout changes, local `demo.ts` wiring.

## Architecture / Approach

Inside-out along existing seams: pure provider module → optional pipeline inputs/outputs → CLI composition behind an opt-in flag → composite action passes `--source-root "$GITHUB_WORKSPACE"`. The tool-less default is preserved at every layer — absent the flag, behavior is byte-identical to today, which is also the rollback story (revert one action line; package support stays dark).

## Phases at a Glance

| Phase                | What it delivers                                              | Key risk                                                                    |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Library           | Provider + pipeline seam + telemetry, hermetic-tested         | SDK step-result shape for `onStepFinish` needs checking against `ai` types  |
| 2. Delivery          | CLI flag, env knob, stderr lines, action opt-in               | Path-root mismatch (package cwd vs repo root) — covered by `--source-root`  |
| 3. Live verification | Evidence: tool called, allowlist held, flaw found, cost delta | Model may under-use the tool; scratch PR must branch off the feature branch |

**Prerequisites:** none — all seams exist; no secrets, no infra.
**Estimated effort:** ~2 sessions across 3 phases (phase 3 needs live PR runs + ~30 min manual work).

## Open Risks & Assumptions

- The model may rarely call the tool unprompted on small diffs — phase 3's planted flaw forces the question; if under-use shows up broadly, prompt tuning is a follow-up, not this change.
- Worst-case cost rises from 2 to 10 finder generations per PR; the 5-step cap, the env knob, and per-run telemetry bound and measure it.
- Merge-ref checkout vs head-referenced line numbers can drift when master touches a diffed file after branching — accepted and documented, not engineered around.

## Success Criteria (Summary)

- A PR review run shows the finder fetching context (telemetry) and the artifact records what it cost.
- The planted cross-context flaw — invisible in the diff alone — is found and attributed correctly, with all requested paths inside the diff set.
- Runs without `--source-root` (and all existing tests) behave exactly as before.
