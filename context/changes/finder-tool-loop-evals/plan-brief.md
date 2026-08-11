# Finder Tool-Loop Evals + Model Decision — Plan Brief

> Full plan: `context/changes/finder-tool-loop-evals/plan.md`

## What & Why

The finder's `getFileContext` tool shipped in PR #120 and is **inert**: glm-4.6 made zero tool calls
in 4/4 live runs, and zero again in CI on PR #122. This change builds the offline instrument that
answers "which finder actually uses the tool, at what quality gain and cost", then uses it to pick
the production finder — instead of the seven-CI-run, throwaway-PR-per-hypothesis cycle phase 3 had
to burn.

## Starting Point

A promptfoo matrix exists (PR #119) that calls the production factory directly, but it is
deliberately tool-less, all its planted flaws are visible in the diff, and it scores recall only. In
its one run, glm-4.6 and sonnet-5 tied at **1.0 on every metric, on every case, across all repeats** —
it discriminates nothing. Per-row cost reads 0 because the provider never populates `tokenUsage`.

## Desired End State

`npm run eval` runs a four-model matrix where the finder has a real, diff-scoped tool backed by
fixture files. Every row reports how often the model called the tool, which paths it fetched, and
what it cost. One case is unsolvable without the tool and fails any model that never calls it; one
case is defect-free and fails any model that invents a problem. The run is exported as a citable
snapshot, the model decision is written down with its cost delta, and the production default changes
only after the winner is seen working on a real PR.

## Key Decisions Made

| Decision              | Choice                                                                | Why (1 sentence)                                                                                            | Source |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| Fixture source        | Real files on disk through the shipped `createDiffScopedSource`       | Exercises the production allowlist and symlink containment instead of a stand-in that would drift           | Plan   |
| Cross-hunk flaw shape | Port the phase-3 probe shape (contract defined outside the hunk)      | Already proven live to separate sonnet-5 from glm-4.6, so it reuses a known-good signal                     | Plan   |
| Tool grading          | `tool_calls` metric everywhere, hard gate only on the cross-hunk case | Zero calls there means the model provably lacked the evidence; elsewhere restraint is correct behaviour     | Plan   |
| Cost data             | Populate `tokenUsage` and `cost` in the provider now                  | "At what cost" is half the question, and phase 3's figures were confounded by a model swap                  | Plan   |
| Matrix                | glm-4.6, **+haiku-4.5**, **+deepseek-v3.2**, sonnet-5                 | The open question is whether anything cheaper than sonnet calls tools; the existing pair cannot answer it   | Plan   |
| Excluded models       | qwen and gpt-5.4-mini stay out; no prompt/schema surgery              | Their failures are provider-API structural, and the schema's optionality exists for Anthropic compatibility | Plan   |
| Precision             | One clean-diff case, not full labelling                               | Cheap, deterministic, and aimed at the specific new risk of tool-induced over-reporting                     | Plan   |
| Step budget           | CI default of 5                                                       | Results transfer to production; a probe-only budget of 8 would repeat phase 3's confound                    | Plan   |
| The flip              | Decide here, but gate the default change on a live PR observation     | Honours the standing lesson that a synthetic GO is a GO-to-merge, not a GO-to-enable                        | Plan   |

## Scope

**In scope:** fixture-backed source in the eval provider; cross-hunk and clean-diff cases; tool-call,
token and cost telemetry via promptfoo metadata; two new candidate models; the written model
decision; a live-validated default change (or a recorded no-change).

**Out of scope:** judge-pass or pipeline evals; CI integration; determinism knobs; the F3
dedup-identity call; prompt/schema surgery to revive qwen or gpt-5.4-mini; line-number, severity, or
exhaustive precision scoring; the `readPlan`/impl-review tooling (that is `impl-review-ci-agent`,
which depends on this decision).

## Architecture / Approach

Extend the existing harness rather than fork it. The same provider file gains an optional fixture
root, builds the **production** `createDiffScopedSource` over it, and accumulates per-step tool calls
via `onStepEnd` + `describeFinderStep`. All new observability rides in promptfoo provider
`metadata` — verified readable from JavaScript assertions in promptfoo 0.122 — because
`review-result.schema.json` is `additionalProperties: false` and pinned to draft-07, so nothing new
may ride on the finder output.

## Phases at a Glance

| Phase                           | What it delivers                                                       | Key risk                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Fixture tree + source wiring | Tool-enabled provider, fixtures, telemetry in metadata                 | Fixture root behind a symlink breaks realpath equality — every fetch refuses, and it reads as "model didn't use the tool" |
| 2. Grading surface              | `tool_calls`, `tool_required`, `no_false_alarms` + free hermetic tests | Counting only the last step reports zero, because `prepareFinalStep` strips tools there by design                         |
| 3. Run the matrix and decide    | Committed snapshot + written decision with cost delta                  | The honest outcome may be "no affordable model calls the tool"                                                            |
| 4. Live validation and flip     | Default model changed, or a recorded no-change                         | A fixture win that does not reproduce on a real diff                                                                      |

**Prerequisites:** `OPENROUTER_API_KEY` in `packages/code-reviewer/.env`; promptfoo pinned at
0.122.0; a PR available for the Phase 4 live check.
**Estimated effort:** ~2–3 sessions across four phases; roughly $1–2 in paid model calls for the
full matrix (above #119's $0.30–0.60, because tool loops add steps and input tokens).

## Open Risks & Assumptions

- **No model may clear the bar.** If nothing both calls the tool and stays affordable, "keep
  glm-4.6, the tool stays inert" is a valid recorded outcome — the plan must not force a swap.
- **deepseek-v3.2 advertises structured outputs and tools but is untried here**; qwen's failure
  showed advertised support is not proof. A provider-error row is signal, not breakage.
- **A tool-capable model may still guess** the cross-hunk flaw without fetching, which is why tool
  calls and flaw recall are graded separately rather than collapsed into one metric.
- **Grader family**: the neutral grader stays Gemini, and neither new candidate is from that family,
  preserving the "no model grades itself" property.

## Success Criteria (Summary)

- The matrix separates models on a case that requires reading outside the diff, with tool usage and
  cost visible per row.
- A written decision names the production finder (or records why it stays glm-4.6), with the cost
  delta against today's baseline.
- Any default change is backed by an observed live PR run, not by fixtures alone.
