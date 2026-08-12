<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Finder Tool-Loop Evals + Model Decision

- **Plan**: context/changes/finder-tool-loop-evals/plan.md
- **Mode**: Deep
- **Date**: 2026-08-11
- **Verdict**: REVISE → **SOUND after triage** (all 12 findings fixed in plan.md, 2026-08-11)
- **Findings**: 3 critical, 7 warnings, 2 observations
- **Passes**: F1–F6 (first pass), F7–F12 (second pass, 2026-08-11)
- **Triage**: complete — 12 fixed, 0 skipped, 0 accepted, 0 dismissed

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | WARNING |
| Architectural Fitness | WARNING |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 11/11 existing paths ✓, 9/9 symbols ✓, brief↔plan ✓, Progress 4/4 phases + 24/24 criteria ✓

## Findings

### F1 — New cases inherit a recall assertion they cannot pass

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §2; Phase 2 §3
- **Detail**: scoreIssueRecall is a defaultTest assertion, and Promptfoo prepends default assertions to every case. assertions.mjs explicitly fails when expectedIssues is absent. The plan requires the clean case to omit expectedIssues, and does not explicitly add it to the cross-hunk case. Implemented literally, both cases fail regardless of model quality.
- **Fix A ⭐ Recommended**: Keep schema validation in defaultTest, but move scoreIssueRecall onto each defect-bearing case. Give cross-hunk explicit expectedIssues and give clean only no_false_alarms.
  - Strength: Each case declares the grading it can meaningfully pass.
  - Tradeoff: Some assertion configuration is repeated per case.
  - Confidence: HIGH — confirmed against Promptfoo 0.122 merge behavior.
  - Blind spot: Update evals/assertions.d.mts for all new exports.
- **Fix B**: Set disableDefaultAsserts on the clean case and restate schema + no_false_alarms there; add expectedIssues to cross-hunk.
  - Strength: Smaller change to existing cases.
  - Tradeoff: Clean silently stops inheriting future default assertions.
  - Confidence: HIGH — Promptfoo exposes this exact escape hatch.
  - Blind spot: Duplicated defaults can drift.
- **Decision**: FIXED via Fix A — plan.md Phase 1 §2 contract + Phase 2 §3 contract

### F2 — Phase 4 targets a fallback that does not control production

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 4 — Live validation and flip
- **Detail**: Production receives OPENROUTER_REVIEW_MODEL from a GitHub repository variable, currently z-ai/glm-4.6. That value outranks DEFAULT_MODEL, which is already anthropic/claude-sonnet-5. Editing config.ts therefore cannot change the live finder. The workflow also has no workflow_dispatch, so “File: none” does not provide a one-run candidate override.
- **Fix A ⭐ Recommended**: Use the proven scratch-PR workflow pin for the candidate, never merge that pin, then—with explicit approval—change OPENROUTER_REVIEW_MODEL after the live result and synchronize the checked-in fallback/docs.
  - Strength: Live validation does not temporarily affect other PR reviews.
  - Tradeoff: Requires a controlled scratch PR and cleanup evidence.
  - Confidence: HIGH — the archived finder-file-context probe used it.
  - Blind spot: The outward GitHub-variable mutation requires user approval.
- **Fix B**: Temporarily change the repository variable during a quiet window, trigger the selected PR, then restore it on every failure path.
  - Strength: No temporary workflow commit.
  - Tradeoff: Repo-wide effect and race risk with concurrent reviews.
  - Confidence: HIGH — the workflow reads the variable directly.
  - Blind spot: Requires an explicit rollback procedure and concurrency check.
- **Decision**: FIXED via Fix A — plan.md Phase 4 §1 (scratch-PR pin) + §2 (repo variable is the control) + criterion 4.7

### F3 — Tool calls do not prove that context was successfully fetched

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3; Phase 2 §1
- **Detail**: describeFinderStep exposes requested fileContextCalls, while the source may refuse an unlisted path, symlinked child, or unreadable file. Calling these fetchedPaths overstates successful use. tool_required would also pass a refused call; combined with a lucky guessed flaw, the row could select a model that never received the required contract.
- **Fix**: Record requested paths and successful context results separately. Gate the cross-hunk case on a successful tool result containing the fixture’s out-of-hunk contract marker; keep tool_calls observational.
  - Strength: Proves evidence delivery rather than mere tool invocation.
  - Tradeoff: Adds fixture-specific success telemetry and tests.
  - Confidence: HIGH — refusal paths are explicit in source-provider.ts.
  - Blind spot: Define how empty/out-of-range reads are classified.
- **Decision**: FIXED in plan.md

### F4 — Cost and repair telemetry lack an implementable contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3; Phase 2 §4
- **Detail**: describeFinderStep exposes tokens but drops exact OpenRouter cost, which lives at step.providerMetadata.openrouter.usage.cost. Promptfoo also needs token keys prompt/completion/total/numRequests, not the AI SDK names. Additionally, createReviewer can repair malformed envelopes, but the matrix does not record repairs even though Phase 4 rejects a repaired run. No hermetic test covers multi-step provider aggregation or error rows.
- **Fix A ⭐ Recommended**: Extend FinderStepInfo/describeFinderStep with optional cost, update pipeline tests, then implement a Promptfoo-specific accumulator mapping token fields, preserving telemetry on errors and counting repairs.
  - Strength: One typed provider-metadata parser, reused by both consumers.
  - Tradeoff: Adds pipeline.ts and pipeline.test.ts to the plan’s scope.
  - Confidence: HIGH — installed SDK declarations expose the exact path.
  - Blind spot: Provider metadata remains optional and must degrade safely.
- **Fix B**: Narrow providerMetadata locally in finder-provider.ts and leave the shared production helper unchanged.
  - Strength: Keeps production modules untouched.
  - Tradeoff: Duplicates OpenRouter-specific parsing.
  - Confidence: HIGH — technically straightforward.
  - Blind spot: Future SDK-shape changes require two maintenance points.
- **Decision**: FIXED via Fix A — plan.md new Phase 1 §4 (cost on FinderStepInfo) + Phase 1 §3 token mapping + repairs in metadata

### F5 — The clean precision case may run without the tool

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §2; Desired End State
- **Detail**: The backing file is optional, but the brief says this case measures tool-induced over-reporting. Without a fixture root, createReviewer removes the tool entirely. The desired state also promises rejection of any invented problem, while the contract deliberately accepts minor/nit findings.
- **Fix**: Require a tool-enabled backing file for the clean case and narrow the promise to “invented critical/major finding,” matching no_false_alarms.
- **Decision**: FIXED in plan.md

### F6 — Root symlinks are incorrectly described as unsupported

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details
- **Detail**: The equality resolves the root on both sides, so a canonicalized or symlinked root works. An existing source-provider test proves this. Symlinks in the file or a child path component are what get refused.
- **Fix**: Correct the warning to distinguish a symlinked root from symlinks beneath that root.
- **Decision**: FIXED in plan.md

### F7 — The cross-hunk fixture tree lands inside the package's own lint + typecheck gates

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 — Cross-hunk fixture; Critical Implementation Details
- **Detail**: `tsconfig.json` is `include: ["src", "evals/**/*.ts"]` and `eslint.config.js` is `files: ["src/**/*.ts", "evals/**/*.ts"]` under `strictTypeChecked` + `stylisticTypeChecked`. Today's only fixture is an inert `.diff`; this phase adds a _tree of real source files_. Any `evals/fixtures/cross-hunk/**/*.ts` is therefore compiled by `npm run typecheck` and typed-linted by `npm run lint` — which are Phase 1 criterion 1.2, Phase 2 criterion 2.1, and the `code-reviewer` CI job on every PR. The file name is not negotiable: `createDiffScopedSource` does `join(root, path)` against the diff's exact `+++ b/<path>`, so the fixture cannot be renamed to dodge the glob. Worst case is silent, not loud — an implementer who edits the fixture to appease a lint rule breaks the plan's own "byte-for-byte consistent with the post-change state" contract, and the tool then serves content that contradicts the diff.
- **Fix A ⭐ Recommended**: Exclude the fixture tree from both gates — `"exclude": ["evals/fixtures/**"]` in `tsconfig.json` plus an `ignores` entry in `eslint.config.js` — and say so in Phase 1 §1.
  - Strength: Language-agnostic and permanent; the ported phase-3 TypeScript contract shape survives unchanged, and every future fixture is covered.
  - Tradeoff: Touches the package's gate config, which the plan does not currently budget.
  - Confidence: HIGH — both globs read directly off the checked-in config files.
  - Blind spot: Confirm `tsc` honors `exclude` against the `evals/**/*.ts` include (it does for non-referenced files) with an actual `npm run typecheck`.
- **Fix B**: Author the fixture tree in non-TypeScript extensions (`.js`/`.jsx`), following the existing React fixture's subject.
  - Strength: No gate-config change at all.
  - Tradeoff: Rewrites the shape that was already proven live to separate sonnet-5 from glm-4.6, and `eslint .` still lints `.js`/`.mjs` by default, so the escape is partial.
  - Confidence: MEDIUM — sidesteps the `.ts` globs, but leaves a second-order lint exposure.
  - Blind spot: Constrains every future fixture to a non-TS language.
- **Decision**: FIXED via Fix A — plan.md Critical Implementation Details (new paragraph) + Phase 1 §1 contract

### F8 — The dead providers are never removed, yet the cost arithmetic assumes they are gone

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 §3 — Config wiring; Phase 3 §1 — Matrix run
- **Detail**: `promptfooconfig.yaml` currently ships four providers including `cheap-qwen3-coder-flash` and `middle-gpt-5.4-mini`. The brief says both "stay out" and the plan calls this a four-model matrix, but Phase 2 §3 only says _add_ two providers and never says remove two. Implemented literally the matrix is six models: Phase 3's "4 models x 4 cases x 3 repeats = 48 finder calls" becomes 72, of which 24 are known-in-advance provider-error rows that carry no metrics and pollute `decision.md`. `evals/README.md`'s matrix table and its "4 models x 2 cases x 3 repeats = 24 finder calls" line are stale for the same reason, and no phase owns that README edit — Phase 4 mentions the README only for the conditional default change.
- **Fix**: In Phase 2 §3, state explicitly that the qwen and gpt-5.4-mini provider blocks are deleted, and add the `evals/README.md` matrix table + case list + cost line to that phase's file list.
- **Decision**: FIXED in plan.md

### F9 — A stochastic tool-call gate has no aggregation rule across `--repeat 3`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2 — Decision record; Progress 3.6
- **Detail**: Tool calling is a sampled behavior, and the run is `--no-cache --repeat 3`. `decision.md`'s contract asks for a table of model x (tool_calls, cross-hunk pass, recall, no_false_alarms, cost/row) — single values where three rows exist — and no rule says how to collapse them. Criterion 3.6, "at least one model passes and at least one fails", is satisfiable by one model's own 2-of-3 noise, so the discrimination criterion can read green on a matrix that discriminates nothing. This is the exact failure the change exists to fix: #119's run tied at 1.0 everywhere.
- **Fix A ⭐ Recommended**: Define the decision statistic before the paid run — per-model tool-call rate and cross-hunk pass rate over the 3 repeats, with an explicit adoption threshold (e.g. calls the tool in ≥2/3) — and have criterion 3.6 compare _rates between models_, not individual rows.
  - Strength: Makes the "does it discriminate" question answerable from the snapshot without rerunning.
  - Tradeoff: Fixes a threshold before seeing the data.
  - Confidence: HIGH — phase 3's live evidence (glm 0/4, sonnet 2 calls) predicts bimodality, so a coarse threshold is safe.
  - Blind spot: Three repeats is a thin base for a rate; consider raising repeats only for the cross-hunk case.
- **Fix B**: Keep single-row reporting but require unanimity — a model adopts only if it passes the cross-hunk case in 3/3 repeats.
  - Strength: No statistic to define; trivially readable off the viewer.
  - Tradeoff: Harsh on a genuinely better model that flakes once, and gives no vocabulary for partial adoption.
  - Confidence: MEDIUM — reasonable, but likely to force a rerun to break ties.
  - Blind spot: Says nothing about how recall and cost are aggregated.
- **Decision**: FIXED via Fix A — plan.md Phase 3 §2 (rates + 2-of-3 threshold) + criterion 3.6

### F10 — "Drives the production provider" holds for the allowlist but not for the fs layer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Implementation Approach; Phase 1 §3 — Provider contract
- **Detail**: `createDiffScopedSource` is pure over three injected primitives (`readFile`, `realpath`, `isRegularFile`); the real fs wiring lives inline in `cli.ts` (~line 161) and is not exported. The eval must therefore hand-roll its own injection, so the harness exercises the shipped _allowlist and containment logic_ but a second, independent copy of the fs layer — and future hardening on the CI side (a size guard, a different realpath flavor) would not be reflected in the evals. Phase 1 §3's contract never names the three callbacks at all, so an implementer reading it discovers them mid-build.
- **Fix**: Name the exact injection in Phase 1 §3's contract, mirroring `cli.ts` (`readFileSync(p, "utf8")`, `realpathSync`, `statSync().isFile()`), and record "the fs injection is duplicated, not shared" as a known limit — or extract a small `createFsDiffScopedSource` helper and use it from both call sites.
- **Decision**: FIXED via the shared-helper option — plan.md new Phase 1 §4 + Implementation Approach + Migration Notes

### F11 — Current State calls the tool "inert" and omits that tool-attachment already broke production

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Current State Analysis; Phase 3 §2 — Decision record
- **Detail**: `output-repair.ts`'s own header records that glm-4.6 running tool-active drifts off `reviewResultSchema` three ways at once (bare findings array, `path` instead of `file`, report-style severity words), that tool-less runs of the same diff pass, and that this only started failing once `--source-root` shipped. The production finder is alive today only because #122's repair layer catches it. The plan's Current State says only that the tool is "wired but inert", so the strongest available argument for changing the finder never enters the decision, and `decision.md`'s column list has no envelope-stability or repair-rate column. F4 covers plumbing the counter; this covers making it a stated input to the decision.
- **Fix**: Add the tool-active envelope drift to Current State Analysis with its `output-repair.ts` citation, and add a repair-rate column to `decision.md`'s contract table so "keep glm-4.6" has to argue against it explicitly.
- **Decision**: FIXED in plan.md

### F12 — A paid API call is filed under Automated Verification with no command

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria; Progress 1.4
- **Detail**: Criterion 1.4 ("Single-provider smoke run reports non-zero toolCalls for sonnet-5") sits beside three runnable commands but is itself a paid model call whose result is read out of metadata. The plan's own governance puts paid runs in the manual column ("paid, on-demand, manual — the Stryker template"), and `/10x-implement` treats Automated bullets as things it may run unattended.
- **Fix**: Move 1.4 to Manual Verification with the README's documented smoke recipe (`npm run eval -- --env-file .env --no-cache --filter-providers premium-claude-sonnet-5`) and state where `toolCalls` is read.
- **Decision**: FIXED in plan.md

## Evidence

- Assertion inheritance: packages/code-reviewer/evals/promptfooconfig.yaml:37-56; packages/code-reviewer/evals/assertions.mjs:38-52
- Runtime model control: .github/workflows/review.yml:78; .github/actions/ai-review/action.yml:20-21,70; packages/code-reviewer/src/config.ts:6,21-33
- Tool/cost telemetry: packages/code-reviewer/src/pipeline.ts:122-162,212-224
- Source containment: packages/code-reviewer/src/source-provider.ts:116-131; packages/code-reviewer/src/source-provider.test.ts:195-207
- Exact provider-reported cost: https://openrouter.ai/docs/cookbook/administration/usage-accounting
- Fixture tree inside the package gates: packages/code-reviewer/tsconfig.json:11 (`include: ["src", "evals/**/*.ts"]`); packages/code-reviewer/eslint.config.js:8-9 (`files`, `strictTypeChecked`)
- Fixture path forced by the diff: packages/code-reviewer/src/source-provider.ts:120,126-127
- Live matrix still carries the dead providers: packages/code-reviewer/evals/promptfooconfig.yaml:24-31; packages/code-reviewer/evals/README.md (matrix table, "4 models x 2 cases x 3 repeats")
- fs injection not shared: packages/code-reviewer/src/cli.ts:151-166 (inline `io.realpath` wiring, not exported)
- Tool-active envelope drift: packages/code-reviewer/src/output-repair.ts:5-22
- Repo variable outranks the checked-in default: `gh variable list` → `OPENROUTER_REVIEW_MODEL = z-ai/glm-4.6`; packages/code-reviewer/src/config.ts:6,31-35 (`DEFAULT_MODEL = anthropic/claude-sonnet-5`)
