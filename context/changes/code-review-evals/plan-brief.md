# Promptfoo Finder-Model Eval (First Configuration) — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`
> Research: `context/changes/code-review-evals/research.md`

## What & Why

Turn the already-scaffolded promptfoo harness in `packages/code-reviewer/evals/` into the first decision-grade eval: the production finder prompt across four OpenRouter models, against one complex React 16→19 migration diff with three planted flaws, scored by per-flaw LLM rubrics plus deterministic checks. The finder's ~25–33% run-level schema-flake rate on `z-ai/glm-4.6` is the standing hypothesis this matrix exists to test — with data instead of anecdotes.

## Starting Point

A prior session left a working scaffold on disk (uncommitted): promptfoo 0.122.0 pinned, `eval` npm scripts, a TS custom provider calling the real `createReviewer()` with deliberately one provider attempt, a 3-model config, one trivial JS-loop case, and schema + regex-recall assertions. Missing: the `z-ai/glm-4.6` production baseline row, the complex test case, any LLM-as-a-judge assertion, and a "review actually fails" check.

## Desired End State

`npm run eval -- --env-file .env --no-cache --repeat 3` produces a 4-model × 2-case matrix where each **successful** React-case row shows schema validity, issue recall, three named per-flaw rubric verdicts (which flaw was missed), and failure-worthiness; provider-error rows stay visible, attributed, and counted in that model's failure rate — with a results snapshot exported to the change folder as citable evidence.

## Key Decisions Made

| Decision              | Choice                                                                                                                                                                                           | Why (1 sentence)                                                                                                                  | Source   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Eval toolkit          | promptfoo 0.122.0, in-package harness                                                                                                                                                            | The package was purpose-built for promptfoo embedding; alternatives are dormant, SaaS-tied, or lack the matrix/repeat primitives. | Research |
| Planted flaws         | Cross-category trio: stale closure (correctness), lost cleanup (performance), dangerouslySetInnerHTML (security)                                                                                 | Distinct categories on distinct lines make recall keys unambiguous and exercise the judge's vocabulary.                           | Plan     |
| "Review fails" test   | Deterministic severity proxy (≥1 critical/major finding)                                                                                                                                         | Zero extra model calls and fully deterministic; the real verdict belongs to the judge pass this config deliberately doesn't run.  | Plan     |
| Existing JS-loop case | Keep as cheap canary                                                                                                                                                                             | Distinguishes "harness broke" from "model can't handle complexity".                                                               | Plan     |
| LLM judge design      | Per-flaw `llm-rubric` ×3, named metrics                                                                                                                                                          | Shows exactly which flaw each model misses — the diagnostic a model comparison needs; grader cost is cents.                       | Plan     |
| Judge model           | `google/gemini-3.1-pro-preview` (user proposal, verified live)                                                                                                                                   | Exists on OpenRouter and is not one of the four candidates, so no model grades itself; stable fallback `gemini-2.5-pro` noted.    | Plan     |
| Results policy        | Harness in repo; SQLite history + exploratory outputs stay local; only the selected decision snapshot is committed, in the change folder (inspected first — prompts/outputs land in it verbatim) | Matches the repo's recorded-decision practice while keeping paid, machine-local artifacts out of `packages/`.                     | Plan     |
| Governance            | Paid, on-demand, never CI                                                                                                                                                                        | Mutation-testing template; the hermetic `code-reviewer` CI job stays secret-free.                                                 | Research |

## Scope

**In scope:** 4th provider row (glm-4.6 baseline); `evals/fixtures/react-migration.diff` + its test case with recall patterns; `reviewMustFail` assertion; three per-flaw rubrics + Gemini grader wiring; smoke + full live run; results snapshot; README update.

**Out of scope:** judge-pass/pipeline evals; the F3 dedup-identity decision; any production model swap; temperature/seed or tokenUsage plumbing; CI integration; committing run results under `packages/` (the change-folder decision snapshot is the one exception).

## Architecture / Approach

Extend the scaffold, don't rebuild: `defaultTest` keeps the universal assertions (JSON-schema validity, regex recall) and gains `options.provider` for grading; the React case adds its four case-specific assertions (3 rubrics + fail check), which merge on top. The provider stays single-attempt so `--repeat --no-cache` measures schema flakes honestly. Known signal source: `qwen/qwen3-coder-flash` lacks OpenRouter `structured_outputs` support — expected flake leader, which the matrix will quantify.

## Phases at a Glance

| Phase                  | What it delivers                                                                | Key risk                                                                       |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Matrix + fixture    | glm-4.6 row; React 16→19 diff with 3 planted flaws; test case + recall patterns | Sloppy hunk-header math silently invalidates line-anchored findings            |
| 2. Assertions          | `reviewMustFail` + 3 per-flaw rubrics + Gemini grader                           | Over-specific rubric wording under-counts models that phrase flaws differently |
| 3. Live run + evidence | Smoke run, full `--repeat 3` matrix (~$0.30–0.60), snapshot, README             | Grader misgrades go unnoticed without the manual spot-check                    |

**Prerequisites:** `OPENROUTER_API_KEY` in `packages/code-reviewer/.env`; the uncommitted scaffold left as-is.
**Estimated effort:** ~1 session; Phases 1–2 are free, Phase 3 costs well under a dollar per full run.

## Open Risks & Assumptions

- `google/gemini-3.1-pro-preview` is a preview id — Google may retire it; fallback documented in-config.
- `llm-rubric` grading through a custom-provider _output_ is standard, but promptfoo 0.x churn means the pinned 0.122.0 behavior is what's verified — don't bump the pin casually.
- One complex case + one canary is enough for a _first_ comparison, not a final model decision — the README must keep saying so.

## Success Criteria (Summary)

- The full matrix runs green end-to-end and `promptfoo view` answers "which model missed which flaw" per row.
- A schema flake shows up as a failed row (never hidden by retries or cache).
- The first-run snapshot lands in `context/changes/code-review-evals/results/` and is citable.
