# Promptfoo Finder-Model Eval (First Configuration) Implementation Plan

## Overview

Complete the promptfoo harness in `packages/code-reviewer/evals/` into its first decision-grade configuration: the production finder prompt run across **four** OpenRouter models (`z-ai/glm-4.6` baseline, `qwen/qwen3-coder-flash`, `openai/gpt-5.4-mini`, `anthropic/claude-sonnet-5`), against **one complex React 16→19 migration diff with three planted cross-category flaws**, scored by **per-flaw LLM-rubric grading** (`google/gemini-3.1-pro-preview`) plus a **deterministic "review must fail" assertion**. Paid, on-demand, never in CI — the mutation-testing governance template.

## Current State Analysis

A prior session already scaffolded a working harness (uncommitted, on disk):

- `promptfoo@0.122.0` pinned as devDependency; `eval` / `eval:view` npm scripts (`packages/code-reviewer/package.json:9-10`)
- tsconfig + eslint widened to `evals/**/*.ts` (`tsconfig.json:10`, `eslint.config.js:7`) — vitest `include` untouched, so the hermetic CI job never sees evals
- `evals/finder-provider.ts` — TS custom provider calling the real `createReviewer({ model, lens, projectContext })` with deliberately **one provider attempt** (no pipeline retry), so `--repeat --no-cache` exposes schema flakes instead of hiding them
- `evals/promptfooconfig.yaml` — 3 provider rows (qwen3-coder-flash / gpt-5.4-mini / claude-sonnet-5), one trivial JS-loop test case, `is-json` schema assertion + deterministic regex-recall assertion (`scoreIssueRecall` in `assertions.mjs`)
- `evals/review-result.schema.json`, `evals/README.md`

Gaps vs. the request: no `z-ai/glm-4.6` row (the production baseline), no complex React-migration case, no LLM-as-a-judge assertion, no static "review fails" assertion.

## Desired End State

`npm run eval -- --env-file .env --no-cache --repeat 3` from `packages/code-reviewer` produces a 4-model × 2-case matrix in `promptfoo view` where, for the React case, each **successful** model row shows all six metrics: schema validity, issue recall, three per-flaw rubric verdicts (which flaw was missed, by name), and whether the review was failure-worthy. Provider-error rows (expected schema flakes) carry no per-assertion metrics — they must instead remain visible, attributed to their model, and counted in that model's failure-rate denominator. A results snapshot exported to `context/changes/code-review-evals/results/` makes the first comparison citable.

### Key Discoveries:

- All five model IDs verified live on the OpenRouter models API (2026-08-09): the four candidates plus judge `google/gemini-3.1-pro-preview` ($2/M in, $12/M out) all exist.
- `qwen/qwen3-coder-flash` does **not** support OpenRouter's `structured_outputs` parameter — the likeliest schema-flake source in the matrix. That is measured signal, not a blocker.
- The Gemini judge is **not one of the four candidates** → no model grades itself. Caveat: `-preview` id may be rotated by Google; stable fallback `google/gemini-2.5-pro` exists.
- Promptfoo grader override confirmed (docs, 2026-08-09): `defaultTest.options.provider` sets the grading model for all model-graded assertions; `openrouter:<model>` is a valid grader id using the same `OPENROUTER_API_KEY`.
- `defaultTest.assert` **merges** with per-test `assert` (defaults apply to every test; test-level asserts add on top) — so schema+recall stay global while the rubrics and fail-check attach only to the React case.
- The finder prompt instructs models to derive post-change line numbers from `@@` hunk headers (`src/prompts.ts:111`) — the authored fixture's hunk headers must be arithmetically correct or line-anchored findings are sabotaged.
- `defaultTest.options.disableVarExpansion: true` is load-bearing: without it the `expectedIssues` array var expands into a case-per-element matrix.

## What We're NOT Doing

- **No judge-pass or pipeline-level evals** — this config isolates the finder. Judge-verdict consistency measurement (recorded commitment from `ci-cd-code-review`) is a later suite on this harness.
- **No F3 dedup-identity decision** — that decision consumes data this harness will eventually produce; not this change's call.
- **No model-swap decision** — this config produces comparison data; changing the production finder model is a separate, later decision.
- **No determinism knobs** (`temperature`/`seed` plumbing into `createReviewer`) and **no `tokenUsage`/`cost` population** in the provider (research open questions #2/#3) — deferred; provider defaults are acceptable for the first comparison.
- **No CI integration** — evals stay out of every workflow; the `code-reviewer` CI job remains hermetic and secret-free.
- **No committed run results under `packages/`** — promptfoo's SQLite history and exploratory outputs stay local. The one exception: the selected decision snapshot is committed under `context/changes/code-review-evals/results/` (user decision), after inspection.

## Implementation Approach

Extend the scaffold, don't rebuild it. All work is three files (`promptfooconfig.yaml`, `assertions.mjs`, a new fixture) plus docs. Assertion layering: `defaultTest` keeps the universal checks (schema validity, regex recall) and gains the grader provider; the React case adds its four case-specific assertions. The live run is phase-gated last so all wiring is verified before money is spent — lint/typecheck for the TS provider, plus `node --check` and `promptfoo validate` for the `.mjs`/YAML surfaces that lint and tsc never see (`eslint.config.js:7`, `tsconfig.json:10` cover only `evals/**/*.ts`).

## Critical Implementation Details

- **Fixture hunk math**: the React diff's `@@ -a,b +c,d @@` headers must be consistent with the actual removed/added line counts, and the three flaws must sit on distinct post-change lines. The finder reports post-change line numbers derived from these headers; broken headers invalidate line-anchored results.
- **One provider attempt stays**: `finder-provider.ts` intentionally bypasses the pipeline's schema-retry. Do not "harden" it — repeats are supposed to expose flakes. A provider `error` row (e.g. a qwen schema flake) is correct behavior: it counts as a failure for that model, but per promptfoo's documented behavior it may carry no `gradingResult` or component assertions — don't expect metrics on it.
- **Grader wiring**: set `provider: openrouter:google/gemini-3.1-pro-preview` once under `defaultTest.options` (verified syntax). It only affects model-graded assertion types, so the deterministic asserts are untouched. Same `OPENROUTER_API_KEY`; no new secret.
- **Rubric phrasing**: each rubric must pass on _identification in any wording_ (concept match), not on severity/category agreement — severity calibration is what `reviewMustFail` and the human reading of results are for. Rubrics that demand exact terminology under-count models that describe the flaw differently.

## Phase 1: Complete the Matrix + Author the Fixture

### Overview

The 4th provider row, the React 16→19 migration fixture, and its test case with recall patterns — everything cheap and deterministic.

### Changes Required:

#### 1. Production-baseline provider row

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: Add `z-ai/glm-4.6` as the first provider row so every comparison is anchored to what production runs today; update the config `description` (currently says "three price/capability tiers").

**Contract**: Same `file://./finder-provider.ts` provider, `label: baseline-glm-4.6`, `config.model: z-ai/glm-4.6`. Four rows total; labels stay unique.

#### 2. React 16→19 migration fixture

**File**: `packages/code-reviewer/evals/fixtures/react-migration.diff` (new)

**Intent**: One realistic unified diff (~100–150 lines, one file, e.g. `src/components/MetricsPanel.jsx`) migrating a React 16 class component to a React 19 function component, carrying exactly three impactful planted flaws — everything else idiomatic and clean so false-positive noise stays measurable.

**Contract**: The removed (`-`) side shows a correct class component: subscription in `componentDidMount`, matching unsubscribe in `componentWillUnmount`, plain-text rendering, interval/state updates done right. The added (`+`) side is a hooks rewrite with, on three distinct post-change lines:

1. **Stale closure (correctness)** — a `useEffect` whose callback captures a prop/state value (e.g. the subscription handler reads a `filter` prop or `count` state) with an empty `[]` dependency array, so the closure goes stale after the first render.
2. **Lost cleanup (performance)** — the effect that subscribes returns no cleanup function; the class's `componentWillUnmount` unsubscribe is visibly deleted in the diff and never ported → leak + duplicate handlers on remount.
3. **Unsafe HTML (security)** — the class's `<p>{this.props.description}</p>` becomes `<p dangerouslySetInnerHTML={{ __html: description }} />` (motivated in-diff by a "support rich text from the server" style comment), rendering unsanitized server-provided content.

Hunk headers arithmetically correct; the three flaw lines' post-change line numbers recorded in the test case description for human cross-checking.

#### 3. React test case with recall patterns

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: Add the second test case loading the fixture and declaring the three expected issues for the existing deterministic recall assertion.

**Contract**: `vars.diff: file://./fixtures/react-migration.diff`; `vars.expectedIssues` with three entries (labels: stale closure / lost cleanup / unsafe HTML), each with 3–5 case-insensitive regex alternatives (e.g. `stale`, `dependenc`, `closure` / `cleanup`, `unsubscribe`, `leak`, `componentWillUnmount` / `xss`, `dangerouslySetInnerHTML`, `sanitiz`). The recall gate (≥2 of 3) is enforced by the integer hit-count logic fixed in change #4 below — not by a rounded ratio threshold. Keep `disableVarExpansion: true` — the arrays depend on it.

#### 4. Fix the recall threshold (integer hit-count authoritative)

**File**: `packages/code-reviewer/evals/assertions.mjs`, `packages/code-reviewer/evals/promptfooconfig.yaml`, `packages/code-reviewer/evals/recall-selfcheck.mjs` (new)

**Intent**: The scaffolded gate is wrong: `scoreIssueRecall` compares the unrounded ratio to `0.67` (`assertions.mjs:31-34`) and the YAML repeats that threshold (`promptfooconfig.yaml:36`). Since 2/3 = 0.666…, detecting two of three flaws fails — the "≥2 of 3" gate silently demands 3-of-3.

**Contract**: `scoreIssueRecall` decides `pass` on integer hit counts — `hits >= Math.ceil(expectedIssues.length * 2 / 3)` — while `score` stays the raw ratio for display. Remove the rounded `0.67` threshold from the YAML so the function is the single authority. Add `recall-selfcheck.mjs`: a zero-cost node script feeding synthetic reviews through `scoreIssueRecall`, asserting 2-of-3 passes and 1-of-3 fails; exits non-zero on violation.

#### 5. Narrow the loop-case canary to indisputable ground truth

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: The existing JS-loop case expects coercive-equality and function-scoped-`var` findings (`promptfooconfig.yaml:64-73`) that are debatable without a type contract or an observable scope bug — a healthy model following "report only issues worth fixing" can legitimately skip them, making the canary flaky.

**Contract**: Reduce the loop case's `vars.expectedIssues` to the single out-of-bounds access entry. With change #4's integer logic, one expected issue requires exactly one hit (`Math.ceil(1 × 2/3) = 1`) — no per-case threshold override needed.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint` (from `packages/code-reviewer`)
- Typecheck passes: `npm run typecheck`
- Recall-gate self-check passes: `node evals/recall-selfcheck.mjs` (2-of-3 passes, 1-of-3 fails; zero API cost)
- Harness surfaces validated: `node --check evals/assertions.mjs` and `npx promptfoo validate config -c evals/promptfooconfig.yaml` (lint/tsc exclude both files)

#### Manual Verification:

- Fixture read-through: exactly three planted flaws, on distinct lines, in three distinct categories; the rest of the migration is clean and idiomatic
- Hunk-header arithmetic checked against the actual line counts

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation of the fixture review before proceeding.

---

## Phase 2: Wire the Assertions (Static Fail + LLM Judge)

### Overview

The deterministic failure-worthiness check and the three per-flaw LLM rubrics, graded by Gemini.

### Changes Required:

#### 1. Deterministic "review must fail" assertion

**File**: `packages/code-reviewer/evals/assertions.mjs`

**Intent**: Export a second assertion function that passes only when the review contains at least one `critical` or `major` finding — the finder-side proxy for "this review would fail the change".

**Contract**: `export function reviewMustFail(output)` returning the same GradingResult shape as `scoreIssueRecall` (`pass`/`score`/`reason`); parses the output JSON defensively (same `parseOutput` pattern), reason names the highest severity found. Severity vocabulary comes from `severitySchema` (`critical|major|minor|nit` — `src/schemas.ts:9`).

#### 2. Per-flaw rubrics + fail check on the React case

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: Attach four case-specific assertions to the React test so results show which flaw each model missed, by name, plus whether the review was failure-worthy.

**Contract**: In the React case's `assert` array (merging on top of `defaultTest`'s schema+recall):

- Three `llm-rubric` assertions with `metric: flaw_stale_closure`, `metric: flaw_lost_cleanup`, `metric: flaw_unsafe_html`. Each rubric describes its flaw concretely (what the bug is, where it lives) and instructs: _pass if the review identifies this issue in any wording; the exact terminology, severity, and category do not matter_.
- One `javascript` assertion `file://./assertions.mjs:reviewMustFail` with `metric: review_fails`.

#### 3. Grader provider

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: Route all model-graded assertions through the neutral judge model.

**Contract**: `defaultTest.options.provider: openrouter:google/gemini-3.1-pro-preview` with a comment noting the neutrality rationale (not one of the four candidates) and the stable fallback (`google/gemini-2.5-pro`) if the preview id is retired.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Typecheck passes: `npm run typecheck`
- Harness surfaces validated: `node --check evals/assertions.mjs` and `npx promptfoo validate config -c evals/promptfooconfig.yaml` (re-run after this phase's `.mjs`/YAML edits)

#### Manual Verification:

- Rubric texts reviewed: each targets exactly one flaw, passes on concept identification, doesn't demand exact wording

---

## Phase 3: Live Verification Run + Evidence + Docs

### Overview

Spend money deliberately: smoke first, then the full matrix; capture citable evidence; document the harness.

### Changes Required:

#### 1. Smoke run, then full matrix run

**File**: none (commands from `packages/code-reviewer`)

**Intent**: Validate all wiring (fixture loading, provider row, rubric grading, fail check) on one cheap provider before the full run.

**Contract**: Smoke: `npm run eval -- --env-file .env --no-cache --filter-providers baseline-glm-4.6`. Then full: `npm run eval -- --env-file .env --no-cache --repeat 3`. Expected full-run cost ≈ $0.30–0.60 (24 finder calls + 36 grader calls). Inspect via `npm run eval:view`.

#### 2. Results snapshot into the change folder

**File**: `context/changes/code-review-evals/results/2026-08-XX-first-matrix.json` (new)

**Intent**: Make the first 4-model comparison citable per the repo's recorded-decision practice (user decision: harness in repo, snapshots in the change folder).

**Contract**: Export without rerunning: `npx promptfoo export eval latest -o ../../context/changes/code-review-evals/results/<date>-first-matrix.json` (from `packages/code-reviewer`). Inspect the export before committing — prompts and full model outputs land in it verbatim. Commit the snapshot with the change, never under `packages/`; SQLite history and any exploratory outputs stay local.

#### 3. README + change bookkeeping

**File**: `packages/code-reviewer/evals/README.md`, `context/changes/code-review-evals/change.md`

**Intent**: Update the README to describe the 4-model matrix, both cases, the per-flaw rubric grading and its grader, the snapshot-export command, and the cost note; keep the "not a model-selection decision yet" framing honest (it now _is_ a first decision-grade comparison — reword accordingly). Best-effort: if `packages/code-reviewer/.review-out/{review.json,comment.md}` still exists on disk, copy it to `context/changes/code-review-evals/fixtures/` (research flagged harvest urgency — it's overwritten by any local `npm run review`).

**Contract**: README stays the single how-to-run doc; `change.md` status updated by the implement flow.

### Success Criteria:

#### Automated Verification:

- Snapshot file exists under `context/changes/code-review-evals/results/`

#### Manual Verification:

- Full-matrix run reviewed in `promptfoo view`: schema validity, recall, per-flaw rubric verdicts, and fail-check all populated on every **successful** row; provider-error rows visible, attributed to their model, and counted in that model's failure-rate denominator
- Grader spot-check: rubric verdicts on 2–3 rows match a human reading of the model's review
- Actual spend confirmed in the OpenRouter dashboard as roughly the estimate

---

## Testing Strategy

### Unit Tests:

- None added — `evals/` is deliberately outside the vitest `include`; the harness is itself a test rig. `assertions.mjs` functions are exercised by the smoke run.

### Integration Tests:

- The Phase 3 smoke run is the integration test: one provider row through fixture-loading → real `createReviewer` call → all six assertions.

### Manual Testing Steps:

1. Phase 1: read the fixture as a reviewer would; confirm the three flaws and the hunk math.
2. Phase 3: open `promptfoo view`; check the qwen rows specifically (expected schema-flake source — no `structured_outputs` support); confirm error rows count as failures and stay visible/attributed rather than vanish (they may carry no per-assertion metrics).
3. Compare glm-4.6 baseline rows against its known ~25–33% run-level flake prior.

## Performance Considerations

Cost, not latency, is the constraint: `maxConcurrency` default is fine at this scale (8 rows × 3 repeats). Every run is paid and manual; `--no-cache` is deliberate (cached repeats would fake stability).

## References

- Related research: `context/changes/code-review-evals/research.md` (toolkit selection, seams, priors, governance)
- Provider pattern: `packages/code-reviewer/evals/finder-provider.ts`
- Prompt/lines contract: `packages/code-reviewer/src/prompts.ts:111` (post-change line numbers from hunk headers)
- Severity vocabulary: `packages/code-reviewer/src/schemas.ts:9`
- Live model verification: OpenRouter models API sweep, 2026-08-09 (this plan's session)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Complete the Matrix + Author the Fixture

#### Automated

- [x] 1.1 Lint passes (`npm run lint`)
- [x] 1.2 Typecheck passes (`npm run typecheck`)
- [x] 1.3 Recall-gate self-check passes (`node evals/recall-selfcheck.mjs`)
- [x] 1.4 Harness surfaces validated (`node --check` + `promptfoo validate`)

#### Manual

- [x] 1.5 Fixture read-through: three flaws, distinct lines, three categories, rest clean
- [x] 1.6 Hunk-header arithmetic checked

### Phase 2: Wire the Assertions (Static Fail + LLM Judge)

#### Automated

- [ ] 2.1 Lint passes (`npm run lint`)
- [ ] 2.2 Typecheck passes (`npm run typecheck`)
- [ ] 2.3 Harness surfaces validated (`node --check` + `promptfoo validate`)

#### Manual

- [ ] 2.4 Rubric texts reviewed (one flaw each, concept-match phrasing)

### Phase 3: Live Verification Run + Evidence + Docs

#### Automated

- [ ] 3.1 Snapshot file exists under `context/changes/code-review-evals/results/`

#### Manual

- [ ] 3.2 Full-matrix run reviewed in promptfoo view (metrics populated on successful rows; error rows visible + counted)
- [ ] 3.3 Grader spot-check on 2–3 rows
- [ ] 3.4 Spend confirmed against estimate
