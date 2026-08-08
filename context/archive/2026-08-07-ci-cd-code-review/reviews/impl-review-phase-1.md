<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: CI/CD PR Code Review Workflow

- **Plan**: `context/changes/ci-cd-code-review/plan.md`
- **Scope**: Phase 1 of 3
- **Date**: 2026-08-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 2 observations
- **Reviewed implementation**: `ca102ed92255369d8b39fdacebc9caea2fc5eea8`
- **Triage**: completed 2026-08-08 — all 8 findings FIXED (F3 via Fix A, F4 via Fix A); package gate 176/176 + typecheck + lint green, root gate 325/325 + typecheck green after fixes.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Untrusted data can close static prompt fences

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `packages/code-reviewer/src/prompts.ts:33`
- **Detail**: The diff, PR metadata, and finder-produced findings are interpolated directly between fixed XML-like tags. A value containing `</review-unit>`, `</findings>`, or `</pr-metadata>` can structurally escape the intended data block and more plausibly influence the model-owned verdict. Existing injection tests use instruction text but do not exercise literal closing delimiters.
- **Fix**: Introduce one delimiter-safe fencing/encoding helper and add adversarial tests containing every literal closing tag.
- **Decision**: FIXED — `fence(tag, content)` helper defuses literal `</tag` (case-insensitive) to `<\/tag` in all three fenced blocks; 4 adversarial tests added (review-unit ×3 kinds, case-variant, findings-description, pr-metadata title/body).

### F2 — Timeout handling is present but no operational timeout is set

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `packages/code-reviewer/src/pipeline.ts:83`
- **Detail**: Finder and judge accept `timeoutMs` and forward it to the AI SDK, but `runReviewPipeline` invokes both without call options. A stalled provider can therefore wait until an external job limit, while the advertised `TimeoutError` retry path does not create a timeout itself.
- **Fix**: Add validated per-pass timeout budgets to pipeline/CLI configuration, pass them into finder and judge, and test timeout → one retry → failure.
  - Strength: Activates the designed retry path and bounds a future Actions job locally.
  - Tradeoff: Adds configuration and clock-related tests.
  - Confidence: HIGH — the call-option surface already exists.
  - Blind spot: Optimal timeout values need provider-latency measurements.
- **Decision**: FIXED — validated per-attempt budgets (finder 300s default, judge 120s default) in `PipelineInput.timeouts`, CLI env overrides `REVIEW_FINDER_TIMEOUT_MS`/`REVIEW_JUDGE_TIMEOUT_MS`; tests cover defaults, overrides, invalid values, and timeout → one retry → rethrow.

### F3 — The documented two-provider-attempt ceiling does not hold for the finder

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: `packages/code-reviewer/src/reviewer.ts:83`
- **Detail**: `maxRetries: 0` correctly disables SDK retries, but one finder execution can perform up to eight model generations through the tool loop. Retrying the whole pass can therefore produce up to sixteen provider generations. The provider-attempt test covers only a failure on the first generation and does not prove the exact `<= 2` contract in the plan.
- **Fix A ⭐ Recommended**: Omit `getFileContext` when no `SourceProvider` is supplied, making the current CI finder tool-less and one-step; pin this with a provider-level test.
  - Strength: The pipeline currently supplies no source, so this enforces the cost ceiling without removing a working CI capability.
  - Tradeoff: Future file context must be enabled explicitly.
  - Confidence: MEDIUM — the no-tools ToolLoopAgent behavior should be pinned against the installed SDK version.
  - Blind spot: The exact structured-output behavior with an empty tool set has not yet been tested.
- **Fix B**: Correct the plan and tests to promise at most two pass executions and explicitly accept a `2 × maxSteps` provider-generation ceiling.
  - Strength: Preserves the existing multi-step finder unchanged.
  - Tradeoff: The actual cost ceiling is materially higher than the current plan states.
  - Confidence: HIGH — it accurately describes the implementation.
  - Blind spot: Real-world finder step counts have not been measured.
- **Decision**: FIXED via Fix A — `getFileContext` (and its instruction sentence) now registered only when a `SourceProvider` is supplied; provider-level pin tests: no source ⇒ no tools + exactly 1 generation, source ⇒ tool present.

### F4 — Repository-specific review rules do not reach the finder

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `packages/code-reviewer/src/prompts.ts:41`
- **Detail**: The rubric omits concrete requirements from `requirements.md`, including `cn()`, the API error contract, zod validation, RLS, IDOR, and secret-handling red flags. The judge never sees the diff and the finder is also not given those rules, so violations may never become findings or influence scores.
- **Fix A ⭐ Recommended**: Add a trusted `projectReviewContext` input to the finder/pipeline and provide a curated set of base-branch project rules.
  - Strength: Delivers rules to the model that sees the code while keeping the package reusable.
  - Tradeoff: Adds an input contract, prompt tokens, and a trusted-context sourcing decision for CI.
  - Confidence: HIGH — this follows directly from the finder → judge information boundary.
  - Blind spot: The precise base-branch loading mechanism belongs partly to Phase 2.
- **Fix B**: Hardcode the LuminaClean checklist into `buildInstructions()`.
  - Strength: Smallest immediate implementation change.
  - Tradeoff: Makes the package repository-specific and creates drift risk against `AGENTS.md`.
  - Confidence: HIGH — the missing criteria are already explicit in `requirements.md`.
  - Blind spot: Future rule changes would require manual synchronization.
- **Decision**: FIXED via Fix A — trusted `projectContext` on `createReviewer`/`buildInstructions` (system instructions, never fenced), `PipelineInput.projectReviewContext` capped at 10,000 chars, CLI `--project-context-file` flag; wiring pinned by provider-level tests (finder sees rules, judge never does). Base-branch sourcing remains a Phase 2 action responsibility.

### F5 — The sticky comment does not isolate model-controlled Markdown

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `packages/code-reviewer/src/render.ts:11`
- **Detail**: Verdict reason, summary, file paths, descriptions, and suggestions flow directly into Markdown without escaping or practical length caps. Newlines, pipes, backticks, links, or mentions can break the scorecard or visually spoof comment sections. A file-level finding is also rendered as `file:0` through the internal deduplication key.
- **Fix**: Normalize and cap model-controlled fields, escape them for their Markdown context, enforce a whole-comment ceiling, and display only the file path when `startLine` is absent.
  - Strength: Protects comment integrity and the GitHub comment-size boundary in one renderer-level policy.
  - Tradeoff: Requires adversarial renderer fixtures and explicit truncation UX.
  - Confidence: HIGH — the current fields are interpolated directly.
  - Blind spot: Appropriate field and total-comment limits have not been selected.
- **Decision**: FIXED — `sanitizeInline` (flatten, cap 1,000, escape `\|[<`` `, defuse @mentions, leading-block-marker escape) on all model prose; backtick-safe `codeSpan` for locations (cap 300); file-level findings render path-only (no `:0`); whole-comment ceiling 60,000 chars with marker-preserving truncation; 7 adversarial renderer tests.

### F6 — The executable CLI contract has no automated coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `packages/code-reviewer/src/review-pr.ts:17`
- **Detail**: There is no test for argument parsing, stdin/file input, artifact writes, exit `0` for a produced `failed` verdict, exit `1` for technical failure, or `$GITHUB_STEP_SUMMARY`. Phase 2 will depend directly on these process semantics.
- **Fix**: Extract an injectable `main()` and add unit or subprocess tests for success, failed verdict, provider failure, malformed arguments, empty diff, and write failure.
  - Strength: Pins the exact boundary consumed by the composite action.
  - Tradeoff: Requires a small entrypoint refactor and potentially platform-aware subprocess assertions.
  - Confidence: HIGH — no `review-pr.test.ts` exists.
  - Blind spot: Windows and Linux process behavior may require separate assertions.
- **Decision**: FIXED — CLI logic extracted to injectable `runReviewCli(argv, env, io, pipeline)` in `src/cli.ts`; `review-pr.ts` is now a thin process shell. 12 hermetic tests in `cli.test.ts` pin exit codes (0 for produced verdicts incl. `failed`, 1 for technical failure), `$GITHUB_STEP_SUMMARY`, artifact writes, stdin/file routing, and the F2/F4 env/flag wiring.

### F7 — Default review artifacts are not ignored

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `.gitignore:1`
- **Detail**: The CLI writes to `.review-out/` by default, but the repository has no matching ignore rule. Local outputs can be accidentally staged and may contain model-repeated source details.
- **Fix**: Add `**/.review-out/` to `.gitignore`.
- **Decision**: FIXED — `**/.review-out/` added to the root `.gitignore`.

### F8 — Completed manual checks have no durable observable evidence

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/ci-cd-code-review/plan.md:310`
- **Detail**: Both live-run checks are marked complete, but the repository contains no safe verification record from which this review can independently confirm the model IDs and generated artifact contract. This is not evidence that the run did not happen; it only limits auditability.
- **Fix**: Record a compact, secret-free verification note with the date, model IDs, artifact schema checks, and outcome; do not retain raw artifacts or credentials.
- **Decision**: FIXED — `context/changes/ci-cd-code-review/verification.md` created with a per-line-provenance Phase 1 note (models derived from local env + config chain, outcome marked "PASS (user-attested; raw evidence unavailable)" per user direction); future live checks append at run time.

## Verification

| Check                                      | Result                                         |
| ------------------------------------------ | ---------------------------------------------- |
| Package `npm test`                         | PASS — 139/139                                 |
| Package `npm run typecheck`                | PASS                                           |
| Package `npm run lint`                     | PASS                                           |
| Barrel import without `OPENROUTER_API_KEY` | PASS                                           |
| Root `npm run typecheck`                   | PASS                                           |
| Root `npm run test:unit`                   | PASS — 325/325                                 |
| `git diff --check ca102ed^..ca102ed`       | PASS                                           |
| Scoped mutation testing                    | SKIPPED — no reviewed file is a §4 risk module |

The only pre-existing worktree change observed during review was the Phase 1 Progress SHA annotation in `plan.md`. The review itself did not modify implementation code.
