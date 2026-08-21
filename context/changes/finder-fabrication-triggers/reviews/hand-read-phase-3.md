# Hand-read queue — Phase 3 baselines

Protocol (frozen in verification.md): hand-read EVERY rubric-flagged
finding plus 10 random clean findings; a misgrade rate ≥ 15% invalidates
the grading. Clean findings were selected deterministically: all `none`
verdicts ordered by (file, run, index), indices ⌊k·N/10⌋ for k = 0…9.

Flagged: 84 · Clean sample: 10 · Total to read: 94

Mark each entry agree/misgrade; the tally goes back into verification.md.

## Flagged findings (84)

### H-01 — M3 · CI calibration, run 1, finding 4

- **Finding**: `packages/code-reviewer/src/cli.ts` :233-233 (minor/security)
  - The logSafePath function is referenced but not defined in the visible code. This could lead to runtime errors if PLAN_PATH contains control characters.
  - _Suggestion_: Ensure logSafePath is properly imported or defined, or replace with a simpler sanitization approach
- **Grader (M3)**: The finding flags a defect with the D3 defence by noting that 'logSafePath' is referenced but not defined in the visible code. The function's call is in-window but its definition is off-diff, making this a locality gap issue.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-02 — M3 · CI calibration, run 1, finding 6

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/documentation)
  - The implementation reviewer lacks inline documentation explaining its purpose and how it differs from the regular reviewer.
  - _Suggestion_: Add a header comment explaining that this pass judges the diff against a plan and is advisory-only
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/impl-reviewer.ts`, line 1) that is completely outside the window (over-cap in the base rung).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-03 — M3 · CI calibration, run 1, finding 7

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (minor/testing)
  - The new implementation review pass lacks dedicated unit tests covering the interaction between plan and diff inputs.
  - _Suggestion_: Add tests verifying that the implementation reviewer correctly handles various plan/diff combinations
- **Grader (M3)**: The finding cites specific code (`packages/code-reviewer/src/pipeline.ts` at line 1) that is entirely outside the window (in the over-cap list), directly matching the M3 criteria for citing off-window files.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-04 — M1 · CI batch, run 2, finding 1

- **Finding**: `packages/code-reviewer/src/cli.ts` :253-254 (major/correctness)
  - onJudgeOutputRepair is referenced but not defined in PipelineInput interface
  - _Suggestion_: Add onJudgeOutputRepair to PipelineInput interface in pipeline.ts or remove if unused
- **Grader (M1)**: The finding claims that `onJudgeOutputRepair` is missing or not defined in `pipeline.ts`. Because `packages/code-reviewer/src/pipeline.ts` genuinely sits outside the window (listed as over-cap), this false-absence claim is manufactured by the truncation, matching mechanism M1.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-05 — M3 · CI batch, run 2, finding 4

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (nit/style)
  - File header comment is inconsistent with other files
  - _Suggestion_: Add standard file header with purpose and copyright notice
- **Grader (M3)**: The finding cites line 1 of 'packages/code-reviewer/src/impl-reviewer.ts', which is listed as an OVER-CAP file and therefore not in the window at all.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-06 — M3 · CI batch, run 3, finding 4

- **Finding**: `packages/code-reviewer/src/cli.ts` :219-219 (minor/correctness)
  - The `logSafePath` function is referenced but not defined in the provided code. This will cause a runtime error when `PLAN_PATH` contains control characters.
  - _Suggestion_: Define `logSafePath` (e.g., replace control chars with `?`) or inline the sanitization directly.
- **Grader (M3)**: The finding asserts a defect (missing definition) about the `logSafePath` defence, which matches the D3 inventory entry where the call/comment is in-window but the definition is off-diff.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-07 — M3 · CI batch, run 3, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (major/security)
  - The implementation reviewer includes a tool-less `sourceProvider` but the `ImplReviewInput` type allows `sourceRoot`. If a source root is passed, the agent could be initialized with a `DiffScopedSourceProvider` despite being tool-less, contradicting the design intent and potentially exposing unintended file reads.
  - _Suggestion_: Remove `sourceRoot` from `ImplReviewInput` or explicitly ignore it in `createImplReviewer`.
- **Grader (M3)**: The finding asserts a defect and cites specific code in `packages/code-reviewer/src/impl-reviewer.ts`, which is listed as entirely outside the visibility window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-08 — M3 · CI batch, run 3, finding 6

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/correctness)
  - The `DEFAULT_IMPL_REVIEW_MODEL` constant is duplicated between `config.ts` and `impl-reviewer.ts`. This could lead to divergence if one is updated without the other.
  - _Suggestion_: Import `DEFAULT_IMPL_REVIEW_MODEL` from `config.ts` in `impl-reviewer.ts`.
- **Grader (M3)**: The finding cites a defect involving `packages/code-reviewer/src/impl-reviewer.ts`, which is listed as entirely outside the visibility window (over the cap) for the base rung. Asserting a defect and citing specific code that is not in the window at all matches M3.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-09 — M3 · CI batch, run 3, finding 7

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/correctness)
  - The implementation reviewer uses `structuredOutput` with `schema: implReviewResultSchema` but the prompt does not explicitly instruct the model to output JSON. This could lead to parsing failures if the model ignores the schema directive.
  - _Suggestion_: Add an explicit instruction in the system prompt to output valid JSON matching the schema.
- **Grader (M3)**: The finding cites specific code in `packages/code-reviewer/src/impl-reviewer.ts`, which is over-cap and entirely outside the visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-10 — M3 · CI batch, run 3, finding 8

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/performance)
  - The plan text is included in the `generate` call without truncation. Large plans (>100KB) could exceed model context limits or cause high costs, despite the workflow's 40KB cap.
  - _Suggestion_: Add a defensive truncation in `createImplReviewer` before passing to `generate`.
- **Grader (M3)**: The finding asserts a defect in and cites a specific file (`packages/code-reviewer/src/impl-reviewer.ts`) that is over-cap and entirely outside the visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-11 — M3 · CI batch, run 3, finding 9

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/correctness)
  - The `createImplReviewer` function does not validate that the plan object has a non-empty `text` field before proceeding. An empty plan could lead to a meaningless review.
  - _Suggestion_: Add early exit if `!plan?.text?.trim()`.
- **Grader (M3)**: The finding hallucinates a missing validation defect in `createImplReviewer`, explicitly citing `packages/code-reviewer/src/impl-reviewer.ts`, which is listed as entirely outside the window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-12 — M3 · CI batch, run 3, finding 10

- **Finding**: `packages/code-reviewer/src/prompts.ts` :1-1 (minor/style)
  - The vendored implementation review criteria include placeholder-like phrases like "[specific guidance]" which could confuse the model or appear incomplete.
  - _Suggestion_: Replace placeholders with concrete examples or remove them.
- **Grader (M3)**: The finding cites a defect and specific code (line 1) in `packages/code-reviewer/src/prompts.ts`, which is listed as entirely outside the visibility window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-13 — M3 · CI batch, run 3, finding 11

- **Finding**: `packages/code-reviewer/src/render.ts` :1-1 (minor/correctness)
  - The `renderImplementationReview` function renders a "No implementation review was run" message when `implReview` is missing, but the design specifies that this state should be represented by the absence of the key, not a `skipped` variant.
  - _Suggestion_: Return an empty string when `implReview` is undefined to match the intended contract.
- **Grader (M3)**: The finding cites a specific file and function (`packages/code-reviewer/src/render.ts`) that is entirely outside the visibility window (in the over-cap list).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-14 — M3 · CI batch, run 3, finding 12

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1-1 (minor/correctness)
  - The `implReviewTelemetry` schema allows `attempts` to be 0, but a telemetry block should only be present when at least one attempt was made.
  - _Suggestion_: Add `attempts: { min: 1 }`.
- **Grader (M3)**: The finding asserts a defect in and explicitly cites `packages/code-reviewer/src/schemas.ts`, which is listed as entirely outside the window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-15 — M3 · CI batch, run 3, finding 13

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1-1 (minor/correctness)
  - The `review.json` example includes `planTruncated`, but the implementation does not actually set this field when truncating the plan.
  - _Suggestion_: Set `planTruncated: true` in the pipeline when the plan is capped.
- **Grader (M3)**: The finding explicitly cites the file `packages/code-reviewer/src/schemas.ts` (line 1), which is listed as entirely outside the window (over the cap), matching the M3 criteria for citing specific code that is not in the window at all.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-16 — M3 · CI batch, run 4, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :244-244 (minor/correctness)
  - logSafePath is used but not defined in this file
  - _Suggestion_: Import logSafePath from utils or define it inline
- **Grader (M3)**: The finding asserts a defect about 'logSafePath' lacking a definition in the file. This matches the D3 inventory item where the function's use is visible in the window but its definition is off-diff.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-17 — M3 · CI batch, run 4, finding 4

- **Finding**: `packages/code-reviewer/src/cli.test.ts` :449-449 (minor/correctness)
  - Test uses logSafePath in expectation but function is not defined
  - _Suggestion_: Ensure logSafePath is available in test context
- **Grader (M3)**: The finding claims that the 'logSafePath' function is not defined. According to the D3 inventory, the definition of 'logSafePath' is off-diff (nowhere in the diff), making this an M3 finding.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-18 — M1 · CI batch, run 4, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.test.ts` :1-1 (minor/testing)
  - Test file is truncated and incomplete
  - _Suggestion_: Complete the test file implementation or remove if not needed
- **Grader (M1)**: The finding claims the test file is truncated and incomplete, which is true of the provided input because the window cuts off inside `packages/code-reviewer/src/impl-reviewer.test.ts`. The model incorrectly attributes this missing material to the author rather than the visibility cap.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-19 — M3 · CI batch, run 5, finding 6

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/testing)
  - The implementation reviewer lacks coverage for the case where the plan path contains control characters that are escaped in rendering.
  - _Suggestion_: Add a test that verifies plan paths with newlines/carriage returns are properly escaped in the comment output.
- **Grader (M3)**: Although the finding notes a test gap, it cites specific code (line 1 of `packages/code-reviewer/src/impl-reviewer.ts`) that is entirely outside the window (over the cap), which strictly matches the M3 criteria.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-20 — M3 · CI batch, run 5, finding 7

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/documentation)
  - The vendored criteria from `impl-review-instructions.md` are adapted but the specific deviations (e.g., removing command execution) are not documented inline.
  - _Suggestion_: Add inline comments in `prompts.ts` where the criteria diverge from the reference, referencing the decision record.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/impl-reviewer.ts` line 1) that is entirely over the cap and thus not in the window at all.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-21 — M3 · CI batch, run 5, finding 8

- **Finding**: `packages/code-reviewer/src/render.ts` :1-1 (nit/style)
  - The implementation review section uses a different heading level (`###`) than the code review section (`##`), creating visual inconsistency.
  - _Suggestion_: Make both sections use the same heading level (both `##` or both `###`).
- **Grader (M3)**: The finding cites a specific file (`packages/code-reviewer/src/render.ts`) that is listed in the window facts as being entirely outside the window (over the cap). The rubric dictates that citing specific code not in the window at all grades as M3.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-22 — M1 · CI batch, run 6, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/style)
  - The new impl-reviewer.test.ts file is truncated in the diff, making it impossible to review the test implementation.
  - _Suggestion_: Ensure the full test file is included in the diff for review
- **Grader (M1)**: The finding correctly identifies that `impl-reviewer.test.ts` is truncated and its full content is missing, which aligns with the window facts showing the file was cut by the 100 KB cap.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-23 — M1 · CI batch, run 6, finding 8

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1-1 (minor/documentation)
  - The ImplGrades type is referenced in tests but not shown in the diff. Its definition should be visible for proper review.
  - _Suggestion_: Include the ImplGrades type definition in the diff
- **Grader (M1)**: The finding claims that a definition is not shown in the diff and cites `packages/code-reviewer/src/schemas.ts`, which genuinely sits outside the window in the over-cap list.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-24 — M1 · CI batch, run 6, finding 9

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (minor/documentation)
  - The pipeline changes for the implementation review pass are not visible in the truncated diff, making it impossible to review how the new pass is integrated.
  - _Suggestion_: Include the pipeline integration code in the diff
- **Grader (M1)**: The finding claims that changes in 'packages/code-reviewer/src/pipeline.ts' are missing from the diff, and this file is genuinely listed as OVER-CAP (outside the window) in the base rung.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-25 — M1 · CI batch, run 6, finding 13

- **Finding**: `packages/code-reviewer/src/render.ts` :1-1 (minor/documentation)
  - The render.ts changes for the implementation review section are not visible in the diff, making it impossible to review how the new section is rendered.
  - _Suggestion_: Include the render.ts changes in the diff
- **Grader (M1)**: The finding claims that changes to `packages/code-reviewer/src/render.ts` are not visible in the diff, which is true because the file is entirely over-cap and sits outside the base rung's visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-26 — M1 · CI batch, run 6, finding 14

- **Finding**: `packages/code-reviewer/src/prompts.ts` :1-1 (minor/documentation)
  - The prompts.ts changes for the implementation review criteria are not visible in the diff, making it impossible to review the vendored criteria implementation.
  - _Suggestion_: Include the prompts.ts changes in the diff
- **Grader (M1)**: The finding claims that the changes for `prompts.ts` are not visible in the diff. Since `packages/code-reviewer/src/prompts.ts` is genuinely outside the window (over the cap) under the base rung, this matches M1.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-27 — M3 · CI batch, run 7, finding 4

- **Finding**: `packages/code-reviewer/src/cli.ts` :218-218 (minor/security)
  - The `logSafePath` function is referenced but not defined in the shown code, which would cause a runtime error when logging plan paths with control characters.
  - _Suggestion_: Define `logSafePath` (likely as a utility that replaces control characters with `?`) before its first use, or replace it with an inline sanitization like `env.PLAN_PATH?.replace(/\p{C}/gu, '?')`.
- **Grader (M3)**: The finding asserts a defect (runtime error) by claiming the `logSafePath` definition is missing. Per D3 in the inventory, the call and comment are in-window but the definition is off-diff, making this an M3 claim.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-28 — M1 · CI batch, run 7, finding 6

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/documentation)
  - The new implementation reviewer agent lacks top-level documentation explaining its purpose, inputs, and how it differs from the existing finder/judge passes.
  - _Suggestion_: Add a file-level JSDoc comment explaining the agent's role, that it judges diffs against plans, and that it's advisory-only.
- **Grader (M1)**: The finding claims that top-level documentation is lacking in `packages/code-reviewer/src/impl-reviewer.ts`, which is an over-cap file that the model could not see due to truncation.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-29 — M3 · CI batch, run 7, finding 7

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/performance)
  - The implementation reviewer loads the entire plan text into the prompt without any length-based truncation, which could lead to context overflow for very large plans.
  - _Suggestion_: Implement plan truncation similar to `capDiff` for the diff, or at least document that plans should be kept under a reasonable size (e.g., 40KB as mentioned in plan-brief.md).
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/impl-reviewer.ts`, line 1) that is entirely outside the visibility window (OVER-CAP), matching the M3 criteria for citing off-window code.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-30 — M3 · CI batch, run 7, finding 9

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1-1 (nit/style)
  - The new schema types for implementation review are added without clear grouping or separation from existing schemas.
  - _Suggestion_: Group the implementation review types together with a clear comment header, or move them to a separate file if the schema grows larger.
- **Grader (M3)**: The finding cites a specific file (`packages/code-reviewer/src/schemas.ts`) that is entirely outside the visibility window (over the cap), matching the M3 criteria for citing off-window code.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-31 — M3 · CI batch, run 8, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :210-224 (major/security)
  - The `logSafePath` function is referenced but not defined in the shown code. PLAN_PATH is attacker-controlled and must be sanitized before logging to prevent log injection or control characters that could forge log output.
  - _Suggestion_: Implement `logSafePath` to replace control characters and potentially dangerous sequences with a safe placeholder (e.g., `?`).
- **Grader (M3)**: The finding asserts a defect regarding the sanitization of PLAN_PATH because the definition of the `logSafePath` defence is off-diff, matching the D3-shaped locality gap.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-32 — M3 · CI batch, run 8, finding 4

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (major/testing)
  - The implementation reviewer agent lacks tests for failure modes where the model returns malformed structured output. Given that this is a new third pass, the test suite should cover schema validation failures to ensure the pipeline degrades gracefully.
  - _Suggestion_: Add tests that mock the model to return invalid JSON or missing fields, verifying that `createImplReviewer` handles these cases without crashing and reports appropriate errors.
- **Grader (M3)**: The finding notes a test gap but explicitly cites `packages/code-reviewer/src/impl-reviewer.ts` (line 1), which is entirely outside the window (over the cap), matching the M3 criterion for citing specific code not in the window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-33 — M1 · CI batch, run 8, finding 5

- **Finding**: `packages/code-reviewer/src/render.ts` :1-1 (major/documentation)
  - The rendering logic for the implementation review section is not shown. Given that this adds a new section to the sticky comment with three possible states (reviewed, failed, no plan), the rendering behavior should be documented or shown to ensure it matches the specification.
  - _Suggestion_: Add documentation or tests showing the rendered output for each state: successful review with findings, failed review, and no plan (legacy behavior).
- **Grader (M1)**: The finding claims that rendering logic in `packages/code-reviewer/src/render.ts` is 'not shown', and this file genuinely sits entirely outside the window in the OVER-CAP list. This is a true absence manufactured by the truncation cap.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-34 — M1 · CI batch, run 8, finding 6

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (minor/correctness)
  - The pipeline wiring for the implementation review pass is not shown. The implementation review should be isolated such that its failure does not affect the finder or judge passes, but this isolation should be explicitly verified in tests.
  - _Suggestion_: Add a test that mocks the implementation reviewer to throw an exception, verifying that the pipeline still outputs the finder and judge results correctly.
- **Grader (M1)**: The finding claims that the pipeline wiring is not shown, citing `packages/code-reviewer/src/pipeline.ts`, which is explicitly listed as OVER-CAP and genuinely sits outside the window for the base rung.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-35 — M3 · CI batch, run 9, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :217-225 (minor/correctness)
  - PLAN_PATH environment variable is used without validation
  - _Suggestion_: Validate PLAN_PATH format and sanitize it before use to prevent log injection
- **Grader (M3)**: The finding asserts that the PLAN_PATH variable is used/logged without sanitization or validation in `cli.ts`, which matches the D3 inventory entry. The call and explanatory comment for `logSafePath` are visible in the window, but the implementation is off-diff, making this a locality gap.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-36 — M3 · CI batch, run 9, finding 4

- **Finding**: `packages/code-reviewer/src/render.ts` :185-195 (minor/security)
  - Untrusted plan path is directly interpolated into comment output
  - _Suggestion_: Escape or truncate the plan path when rendering to prevent potential markup injection
- **Grader (M3)**: The finding cites a defect and specific lines in 'packages/code-reviewer/src/render.ts', which is explicitly listed as over the cap and entirely outside the visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-37 — M3 · CI batch, run 9, finding 5

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :410-420 (minor/performance)
  - No explicit timeout for implementation review pass
  - _Suggestion_: Add configurable timeout for impl-review pass to prevent runaway costs
- **Grader (M3)**: The finding cites specific code (lines 410-420) in `packages/code-reviewer/src/pipeline.ts`, which is an over-cap file entirely outside the visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-38 — M3 · CI batch, run 9, finding 6

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :95-105 (nit/style)
  - Magic number for plan size limit
  - _Suggestion_: Extract the 40000 character limit to a named constant
- **Grader (M3)**: The finding cites a specific file and line range (packages/code-reviewer/src/impl-reviewer.ts:95-105) that is explicitly listed as entirely outside the window (over the cap) in the base rung. Citing specific code locations that are not in the window at all falls under M3.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-39 — M2 · CI batch, run 10, finding 1

- **Finding**: `.github/workflows/review.yml` :95-104 (minor/security)
  - The regex for extracting Plan: override could be stricter. The current pattern allows any characters in the path segment between 'context/' and '/plan.md'. While the later mode check provides defense-in-depth, the regex should anchor more strictly to prevent potential path confusion attacks.
  - _Suggestion_: Consider tightening the regex to explicitly allow only safe characters (e.g., [A-Za-z0-9._/-]) in the path segments.
- **Grader (M2)**: The finding asserts the regex allows any characters and suggests adding the '[A-Za-z0-9._/-]' character class, but this explicit safe-path class (D2) is already present and IN-WINDOW in .github/workflows/review.yml.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-40 — M3 · CI batch, run 11, finding 1

- **Finding**: `packages/code-reviewer/src/cli.ts` :247-247 (major/correctness)
  - logSafePath is called but not defined or imported
  - _Suggestion_: Import logSafePath from its source module or define it locally
- **Grader (M3)**: The finding flags 'logSafePath' as undefined or unimported, matching the D3 profile where the call in 'cli.ts' is in-window but the definition is off-diff.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-41 — M2 · CI batch, run 12, finding 1

- **Finding**: `.github/workflows/review.yml` :95-106 (critical/security)
  - Command injection vulnerability in plan path extraction
  - _Suggestion_: The sed command to extract the plan path from PR_BODY allows `[A-Za-z0-9._/-]+` which could still be exploited. Use a more restrictive regex or whitelist approach, and consider using a dedicated YAML/JSON parser for structured data.
- **Grader (M2)**: The finding acknowledges the D2 safe-path regex `[A-Za-z0-9._/-]+` in the visible `.github/workflows/review.yml` file but falsely asserts it permits command injection, meaning it claims the code permits what the defense actively prevents.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-42 — M3 · CI batch, run 13, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :226-226 (minor/style)
  - The logSafePath function is used but not defined in this file. It should be imported or defined.
  - _Suggestion_: Add import for logSafePath or define it in the file.
- **Grader (M3)**: The finding flags 'logSafePath' as being used but not defined or imported, asserting a defect because its definition is in unchanged code that is completely off-diff, matching the criteria for M3.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-43 — M3 · CI batch, run 13, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/documentation)
  - The impl-reviewer.ts file lacks a module-level JSDoc comment explaining its purpose and trust boundaries, which would be helpful given the security-sensitive nature of plan processing.
  - _Suggestion_: Add a module-level comment explaining this processes untrusted plan data.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/impl-reviewer.ts`, line 1) that is in the OVER-CAP list, meaning it is not in the window at all.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-44 — M3 · CI batch, run 13, finding 6

- **Finding**: `packages/code-reviewer/src/render.ts` :200-200 (minor/correctness)
  - The planPath is rendered directly without escaping. While it comes from env var which is somewhat sanitized, it should still be escaped to prevent any potential markdown injection.
  - _Suggestion_: Apply escapeMarkdown to planPath before rendering.
- **Grader (M3)**: The finding cites specific code in `packages/code-reviewer/src/render.ts`, which is listed as an over-cap file and is not in the visibility window at all.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-45 — M3 · CI batch, run 13, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :150-150 (nit/style)
  - The ImplGrades type has inconsistent quote style - some keys use single quotes, others double quotes.
  - _Suggestion_: Make all keys use single quotes for consistency.
- **Grader (M3)**: The finding cites a specific defect at a file and line (packages/code-reviewer/src/schemas.ts:150) that is listed as entirely outside the visibility window (over the cap), matching the M3 criteria.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-46 — M3 · CI batch, run 13, finding 8

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :250-250 (minor/correctness)
  - The plan truncation at 40_000 characters should be mentioned in the error message when truncation occurs, to help users understand why their plan was cut.
  - _Suggestion_: Add '(truncated at 40KB)' to the plan supplied log line when truncation happens.
- **Grader (M3)**: The finding cites a specific file and line (packages/code-reviewer/src/pipeline.ts line 250) that sits entirely outside the visibility window (in the over-cap list), which matches the M3 criteria for off-window code citations.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-47 — M2 · CI batch, run 14, finding 3

- **Finding**: `.github/workflows/review.yml` :127-127 (minor/correctness)
  - Diff exclusion array could be undefined
  - _Suggestion_: While the code guards against empty PLAN_PATH, it doesn't handle the case where PLAN_PATH contains spaces that could cause word-splitting issues. Use printf to build the git diff command or quote the variable properly.
- **Grader (M2)**: The finding asserts that PLAN_PATH could contain spaces causing word-splitting issues, which contradicts the visible in-window defense (D2) in .github/workflows/review.yml that restricts PLAN_PATH to a safe character class explicitly excluding spaces.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-48 — M3 · CI batch, run 14, finding 7

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/testing)
  - Implementation reviewer lacks integration tests
  - _Suggestion_: While unit tests are comprehensive, add an integration test that verifies the complete flow with a real plan and diff to ensure the structured output schema matches expectations.
- **Grader (M3)**: Although the finding notes a testing gap unrelated to the defence inventory, it explicitly cites `packages/code-reviewer/src/impl-reviewer.ts` (line 1), which is over-cap and entirely outside the visibility window, triggering M3 for citing specific code not in the window at all.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-49 — M3 · CI batch, run 14, finding 8

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (minor/testing)
  - Pipeline changes lack end-to-end test
  - _Suggestion_: Add a test that runs the full three-pass pipeline with a mock plan to verify the isolation guarantees (impl-review failure doesn't affect code review verdict).
- **Grader (M3)**: The finding explicitly cites `packages/code-reviewer/src/pipeline.ts` (lines 1-1), which is listed as entirely outside the window (over-cap). Citing specific code that is not in the window at all resolves to M3.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-50 — M3 · CI batch, run 14, finding 9

- **Finding**: `packages/code-reviewer/src/render.ts` :1-1 (nit/style)
  - Comment formatting inconsistency
  - _Suggestion_: The file uses both // and /** */ comment styles. Consider standardizing on // for consistency with other files in the package.
- **Grader (M3)**: The finding explicitly cites `packages/code-reviewer/src/render.ts`, which is listed as entirely outside the window (over the cap) for the base rung. Citing specific code that is not in the window at all falls under M3.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-51 — M3 · CI batch, run 15, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :226-226 (major/correctness)
  - The `logSafePath` function is referenced but not defined in the provided code. This will cause a runtime error when processing plan paths with control characters.
  - _Suggestion_: Add the `logSafePath` function implementation or replace with a proper sanitization function.
- **Grader (M3)**: The finding asserts a defect regarding the 'logSafePath' function being undefined. This matches the D3 inventory item where the function call and comment are visible in the window, but the definition is off-diff.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-52 — M2 · CI batch, run 15, finding 4

- **Finding**: `packages/code-reviewer/src/cli.ts` :213-214 (minor/security)
  - PLAN_PATH from environment is directly used without validation. Although it's escaped at render time, it should be validated earlier to prevent potential issues.
  - _Suggestion_: Add basic validation for PLAN_PATH format (e.g., must start with 'context/' and end with '/plan.md') before using it.
- **Grader (M2)**: The finding asserts that PLAN_PATH from the environment is used 'without validation', which contradicts the explicit safe-path regex validation (D2) present in the in-window `.github/workflows/review.yml` file.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-53 — M3 · CI batch, run 15, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/documentation)
  - The new impl-reviewer module lacks JSDoc comments explaining its purpose and how it differs from the existing reviewer.
  - _Suggestion_: Add module-level documentation explaining the implementation review pass and its security considerations.
- **Grader (M3)**: The finding cites a specific line (line 1) in `packages/code-reviewer/src/impl-reviewer.ts`, which is in the over-cap list and entirely outside the visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-54 — M3 · CI batch, run 15, finding 9

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (minor/testing)
  - The impl-reviewer has comprehensive test coverage, but tests for edge cases like extremely large plans (>40KB limit) are not visible.
  - _Suggestion_: Add a test case verifying behavior when plan exceeds the 40KB limit.
- **Grader (M3)**: The finding explicitly cites `packages/code-reviewer/src/impl-reviewer.ts` (line 1), which is an over-cap file listed as entirely outside the visibility window, triggering the M3 condition for citing specific code that is not in the window at all.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-55 — M2 · CI batch, run 17, finding 1

- **Finding**: `.github/workflows/review.yml` :75-85 (critical/security)
  - Path traversal vulnerability in plan path extraction regex
  - _Suggestion_: The regex pattern `[A-Za-z0-9._/-]+` allows forward slashes which could enable path traversal attacks. Restrict to safe characters only or use a more robust path validation that normalizes and validates the full path.
- **Grader (M2)**: The finding asserts that the regex in `.github/workflows/review.yml` lacks robust path validation and permits path traversal attacks, contradicting the visible D2 in-window defense which explicitly establishes this regex as a safe path set.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-56 — M3 · CI batch, run 17, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :225-225 (major/security)
  - Potential log injection from untrusted PLAN_PATH
  - _Suggestion_: Ensure logSafePath properly escapes all control characters and special characters to prevent log injection. The current implementation is not shown in the diff.
- **Grader (M3)**: The finding flags a potential log injection at the `logSafePath` call in `cli.ts` (D3) because the function's implementation is not visible in the diff. This matches the M3 criteria where the defence's usage is in-window but its definition is off-diff.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-57 — M3 · CI batch, run 17, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1-1 (nit/style)
  - Variable naming could be more descriptive
  - _Suggestion_: Consider renaming 'implReviewTelemetry' to 'implementationReviewTelemetry' for full clarity.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/schemas.ts` at line 1) that is completely outside the base rung window (it is listed as an over-cap file).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-58 — M3 · CI batch, run 18, finding 4

- **Finding**: `packages/code-reviewer/src/cli.ts` :217-217 (minor/security)
  - The `logSafePath` function is referenced but not defined in the shown code. This could cause runtime errors if the function doesn't exist or isn't properly imported.
  - _Suggestion_: Ensure `logSafePath` is properly defined and imported, or replace with a proper sanitization function.
- **Grader (M3)**: The finding asserts a potential runtime defect because the definition of the `logSafePath` defence is not present in the shown code (off-diff), while its use is visible in the in-window `cli.ts` file, matching the D3 entry for M3.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-59 — M3 · CI batch, run 18, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :70-70 (minor/correctness)
  - The plan text is truncated at 40,000 characters without indicating this truncation in the review output. This could lead to incomplete plan analysis without the reviewer being aware.
  - _Suggestion_: Add a truncation warning to the review output when the plan is truncated, similar to how diff truncation is handled.
- **Grader (M3)**: The finding cites a specific file and line (packages/code-reviewer/src/impl-reviewer.ts:70) that is entirely outside the visibility window (over-cap). Asserting a defect in or citing code that is not in the window at all falls under M3.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-60 — M3 · CI batch, run 18, finding 6

- **Finding**: `packages/code-reviewer/src/render.ts` :200-200 (nit/style)
  - The implementation review section header uses inconsistent capitalization ('Implementation Review') compared to other section headers.
  - _Suggestion_: Make section header capitalization consistent throughout the comment.
- **Grader (M3)**: The finding cites a specific file and line in `packages/code-reviewer/src/render.ts`, which is over-cap and entirely outside the visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-61 — M3 · CI batch, run 18, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :95-95 (minor/documentation)
  - The `ImplGrades` schema lacks documentation about what each grade level means for the different dimensions.
  - _Suggestion_: Add JSDoc comments explaining the meaning of each grade level (PASS/FAIL/NEEDS_ATTENTION) for the seven dimensions.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/schemas.ts:95`) that is listed as entirely outside the window (over-cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-62 — M3 · CI batch, run 18, finding 8

- **Finding**: `packages/code-reviewer/src/prompts.ts` :400-400 (minor/security)
  - The implementation review prompt doesn't explicitly mark the plan content as untrusted data, unlike the finder prompt which has this warning.
  - _Suggestion_: Add an explicit untrusted data warning for the plan content in the implementation review prompt.
- **Grader (M3)**: The finding cites a specific defect at line 400 of 'packages/code-reviewer/src/prompts.ts', which is listed in the window facts as entirely OUTSIDE the window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-63 — M2 · CI batch, run 19, finding 2

- **Finding**: `.github/workflows/review.yml` :85-85 (major/security)
  - The sed command for extracting the plan path from PR body uses `[A-Za-z0-9._/-]` which allows dots and hyphens anywhere in the path. This could allow path traversal attacks like `context/changes/../../etc/passwd`.
  - _Suggestion_: Restrict the character class more strictly, perhaps to `[A-Za-z0-9_-]` and add validation that the path starts with `context/changes/` or `context/archive/`.
- **Grader (M2)**: The finding critiques the IN-WINDOW safe-path character class for PLAN_PATH (D2), asserting it lacks sufficient validation and permits path traversal, which matches the canonical M2 definition.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-64 — M3 · CI batch, run 19, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :236-236 (minor/correctness)
  - The logSafePath function is referenced but not defined in this file. This will cause a runtime error.
  - _Suggestion_: Either define logSafePath in this file or import it from the appropriate module.
- **Grader (M3)**: The finding claims a defect (a runtime error) because the 'logSafePath' definition is missing, which matches the D3 shape where the call is visible but the definition is off-diff.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-65 — M2 · Instrument batch, run 4, finding 2

- **Finding**: `.github/workflows/review.yml` :47-77 (major/security)
  - The PR body override regex uses `[A-Za-z0-9._/-]` which allows `../` sequences if they're encoded as `..%2F` or similar. While the `..` check helps, it's not comprehensive against all traversal encodings.
  - _Suggestion_: Use a more restrictive character class or decode the path before validation to catch encoded traversal attempts.
- **Grader (M2)**: The finding asserts that the in-window path validation regex (D2) in `.github/workflows/review.yml` permits path traversal via URL encoding, claiming it allows what the defence prevents.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-66 — M1 · Instrument batch, run 4, finding 4

- **Finding**: `packages/code-reviewer/src/config.ts` :1-1 (minor/correctness)
  - The DEFAULT_IMPL_REVIEW_MODEL constant is referenced in the plan but not shown in the diff. Ensure it's properly defined and not accidentally using the judge model.
  - _Suggestion_: Verify DEFAULT_IMPL_REVIEW_MODEL is defined as a separate constant from DEFAULT_JUDGE_MODEL.
- **Grader (M1)**: The finding correctly observes that 'packages/code-reviewer/src/config.ts' and its contents are 'not shown in the diff', which is true because all 'packages/' files were pushed entirely out of the visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-67 — M3 · Instrument batch, run 4, finding 5

- **Finding**: `packages/code-reviewer/src/prompts.ts` :1-1 (minor/security)
  - The plan fencing mechanism needs to handle the case where the plan itself contains the exact fence delimiter sequence being used, which could break prompt parsing.
  - _Suggestion_: Implement fence escaping or use a unique fence pattern that includes a random token per invocation.
- **Grader (M3)**: The finding cites a specific defect in 'packages/code-reviewer/src/prompts.ts', which is a file entirely outside the visibility window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-68 — M3 · Instrument batch, run 4, finding 6

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (major/correctness)
  - The plan cap of 40,000 characters may silently truncate large plans. The planTruncated flag is mentioned but the handling of truncated plans needs verification - does the model get told the plan is incomplete?
  - _Suggestion_: Ensure the prompt explicitly mentions when the plan was truncated so the model knows it's working with incomplete information.
- **Grader (M3)**: The finding cites a specific file ('packages/code-reviewer/src/pipeline.ts') that is entirely outside the window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-69 — M3 · Instrument batch, run 4, finding 7

- **Finding**: `packages/code-reviewer/src/render.ts` :1-1 (minor/correctness)
  - The rendering of the plan path in the comment needs to handle very long paths that could break the table formatting.
  - _Suggestion_: Add a MAX_PATH_CHARS limit and truncate with ellipsis for display.
- **Grader (M3)**: The finding cites a defect in 'packages/code-reviewer/src/render.ts', which is entirely outside the visibility window due to the truncation cap.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-70 — M3 · Instrument batch, run 4, finding 11

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1-1 (nit/style)
  - The new file should follow the existing pattern of documenting the agent's purpose and invariants at the top.
  - _Suggestion_: Add a header comment explaining the agent's role and security boundaries.
- **Grader (M3)**: The finding cites a specific file ('packages/code-reviewer/src/impl-reviewer.ts') and line number (1) that sit entirely outside the visibility window (in the over-cap list).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-71 — M2 · Instrument batch, run 5, finding 1

- **Finding**: `.github/workflows/review.yml` :74-85 (critical/security)
  - Command injection vulnerability in PR body override processing
  - _Suggestion_: The sed command processes untrusted PR body content without proper sanitization. While the regex is anchored, an attacker could inject newlines or other control characters. Use a more robust approach like temporary files with controlled permissions.
- **Grader (M2)**: The finding asserts that the regex validation for PLAN_PATH is permissive, allowing newlines or control characters, which matches the D2 inventory entry for a defense that is present in the in-window file .github/workflows/review.yml.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-72 — M3 · Instrument batch, run 5, finding 4

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (minor/performance)
  - Hardcoded timeout value should be configurable
  - _Suggestion_: The 300_000ms timeout for impl review should be configurable via environment variable or input parameter, similar to other timeouts in the system.
- **Grader (M3)**: The finding asserts a defect and cites specific code in `packages/code-reviewer/src/pipeline.ts`, which is entirely outside the visibility window (over-cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-73 — M3 · Instrument batch, run 5, finding 5

- **Finding**: `packages/code-reviewer/src/config.ts` :1-1 (minor/correctness)
  - Missing validation for model configuration
  - _Suggestion_: Add validation to ensure OPENROUTER_IMPL_REVIEW_MODEL is a valid model identifier when provided, with a clear error message if invalid.
- **Grader (M3)**: The finding asserts a defect and cites specific lines in `packages/code-reviewer/src/config.ts`, which is over the cap and entirely outside the model's visibility window.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-74 — M3 · Instrument batch, run 5, finding 6

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1-1 (minor/correctness)
  - Schema validation could be more restrictive
  - _Suggestion_: Add additional validation constraints to the implReviewOutputSchema, such as maximum string lengths for title and detail fields to prevent oversized responses.
- **Grader (M3)**: The finding cites a specific file ('packages/code-reviewer/src/schemas.ts') and asserts a defect about it, but this file is entirely outside the visibility window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-75 — M3 · Instrument batch, run 5, finding 7

- **Finding**: `packages/code-reviewer/src/prompts.ts` :1-1 (nit/style)
  - Inconsistent terminology in prompts
  - _Suggestion_: Standardize terminology between 'plan adherence' and 'plan compliance' throughout the implementation review prompts for clarity.
- **Grader (M3)**: The finding cites a specific file ('packages/code-reviewer/src/prompts.ts') that is entirely outside the visibility window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-76 — M2 · Instrument batch, run 9, finding 3

- **Finding**: `.github/workflows/review.yml` :115-117 (minor/correctness)
  - Path exclusion might not handle all special characters
  - _Suggestion_: The path exclusion `:(exclude)${PLAN_PATH}` could fail if PLAN_PATH contains spaces or special characters that need escaping. Consider quoting it properly or using a more robust exclusion method.
- **Grader (M2)**: The finding asserts that PLAN_PATH could contain spaces or special characters, ignoring the IN-WINDOW D2 defence that explicitly validates the path against a strict character class ([A-Za-z0-9._/-]) to prevent this.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-77 — M2 · Instrument batch, run 9, finding 4

- **Finding**: `.github/workflows/review.yml` :86-104 (minor/security)
  - PR body parsing regex could be more restrictive
  - _Suggestion_: The character class `[A-Za-z0-9._/-]` allows dots and dashes but also allows multiple consecutive dots which could be used for path traversal attempts like `.... Consider tightening to `[A-Za-z0-9._-]` with additional validation.
- **Grader (M2)**: The finding asserts that the D2 regex in .github/workflows/review.yml is permissive and could allow path traversal. Since D2 is marked IN-WINDOW, this is an M2 claim.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-78 — M2 · Instrument batch, run 11, finding 1

- **Finding**: `.github/workflows/review.yml` :75-78 (major/security)
  - Plan override regex allows relative paths with '.' segments
  - _Suggestion_: The regex `[A-Za-z0-9._/-]+` allows '.' which combined with the later `..` check could still allow paths like `a./b/plan.md`. Consider restricting '.' more strictly or using a whitelist approach.
- **Grader (M2)**: The finding asserts that the regex validation for PLAN_PATH in the in-window file `.github/workflows/review.yml` is permissive, which directly matches the D2 claim shape.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-79 — M3 · Instrument batch, run 11, finding 5

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (nit/documentation)
  - Plan cap comment mentions 40KB but code uses 40,000
  - _Suggestion_: Make the comment match the code: '40,000 characters (≈40KB)'
- **Grader (M3)**: The finding cites a specific defect in 'packages/code-reviewer/src/pipeline.ts', which is entirely outside the window (over-cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-80 — M3 · Instrument batch, run 11, finding 7

- **Finding**: `context/changes/impl-review-ci-agent/verification.md` :1-1 (minor/testing)
  - Cost ratio criterion blocked due to missing finder telemetry
  - _Suggestion_: Either add cost telemetry to finder/judge or restate the criterion to use absolute cost instead of ratio
- **Grader (M3)**: The finding cites a specific file and line ('context/changes/impl-review-ci-agent/verification.md' at line 1) which is entirely outside the visibility window (over the cap), matching the M3 criteria.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-81 — M2 · Instrument batch, run 12, finding 1

- **Finding**: `.github/workflows/review.yml` :80-95 (major/security)
  - PR body override extraction regex could be stricter to prevent injection
  - _Suggestion_: The sed regex for extracting Plan: override should anchor more strictly to prevent path traversal. Consider adding validation to ensure the resolved path is within expected directories.
- **Grader (M2)**: The finding asserts that the regex in `.github/workflows/review.yml` is permissive ('could be stricter') and suggests adding validation, which denies the presence or adequacy of the in-window D2 defense (the anchored safe-path character class).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-82 — M2 · Instrument batch, run 14, finding 4

- **Finding**: `.github/workflows/review.yml` :64-64 (minor/correctness)
  - The override regex uses `[A-Za-z0-9._/-]` which allows forward slashes but the comment says it excludes them to prevent path traversal
  - _Suggestion_: Either update the comment to clarify that forward slashes are allowed for valid paths, or adjust the regex if they should be excluded
- **Grader (M2)**: The finding asserts that the regex in `.github/workflows/review.yml` is permissive (allowing forward slashes) despite a comment about preventing path traversal, matching the D2 claim shape for an in-window defence.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-83 — M3 · Instrument batch, run 15, finding 6

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (nit/style)
  - The plan cap constant `PLAN_CAP_CHARS = 40_000` should be documented with rationale for why 40KB was chosen.
  - _Suggestion_: Add a comment explaining the 40KB limit based on observed plan sizes in the repository.
- **Grader (M3)**: The finding cites specific code in `packages/code-reviewer/src/pipeline.ts`, which is entirely outside the visibility window (over the cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

### H-84 — M3 · Instrument batch, run 20, finding 3

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1-1 (minor/documentation)
  - PLAN_CAP_CHARS constant (40,000) lacks justification comment.
  - _Suggestion_: Add comment explaining this is based on measured plan sizes (20-31KB) with headroom, referencing the research findings.
- **Grader (M3)**: The finding cites a defect in 'packages/code-reviewer/src/pipeline.ts', which is a file located entirely outside the visibility window (over-cap).
- **Your read**: [ ] agree · [ ] misgrade — notes:

## Clean sample (10)

### C-01 — none · CI calibration, run 1, finding 1

- **Finding**: `.github/workflows/review.yml` :67-67 (critical/security)
  - The regex for extracting Plan: override allows path traversal via '..' segments. While there's a later check for '..' in the case statement, the regex itself should be tightened to prevent traversal at the source.
  - _Suggestion_: Update the regex to explicitly disallow '..' sequences: 's#^[[:space:]]_Plan:[[:space:]]+(context/(changes|archive)/[A-Za-z0-9.\_/-]+/plan\.md)[[:space:]]_$#\1#p'
- **Grader (none)**: The finding correctly identifies the existing regex and the subsequent check for '..', and merely suggests an improvement to tighten the regex, which falls under 'suggests improvements to an existing defence'.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-02 — none · CI batch, run 5, finding 1

- **Finding**: `.github/workflows/review.yml` :92-92 (minor/correctness)
  - The sed regex for extracting the plan path from the PR body uses `+` quantifier which would match an empty string if the capture group were optional; however the surrounding anchors make this safe in practice. Prefer `+` to `*` for explicitness when matching non-empty content.
  - _Suggestion_: Change `+` to `*` in the character class if empty plans are allowed, or keep as-is if plans must be non-empty.
- **Grader (none)**: The finding discusses the regex in `.github/workflows/review.yml` approvingly, noting that surrounding anchors make it safe in practice, and merely suggests an explicitness improvement rather than claiming a defense is missing or absent.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-03 — none · CI batch, run 7, finding 10

- **Finding**: `context/changes/impl-review-ci-agent/verification.md` :1-1 (nit/documentation)
  - The verification document uses a complex table format for criteria that may be hard to parse quickly.
  - _Suggestion_: Consider using a simpler list format or adding a brief summary before the table to make it easier to understand what's being tested.
- **Grader (none)**: The finding suggests a formatting improvement for the in-window `verification.md` document and does not match any of the inventoried defenses.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-04 — none · CI batch, run 12, finding 5

- **Finding**: `packages/code-reviewer/src/config.ts` :56-58 (major/correctness)
  - Missing default timeout for implementation review
  - _Suggestion_: Add a default timeout constant for implementation review (similar to DEFAULT_FINDER_TIMEOUT_MS if it exists) to ensure the timeout is always defined even when REVIEW_IMPL_REVIEW_TIMEOUT_MS is not set.
- **Grader (none)**: The finding reports a missing default timeout in 'config.ts', which is not related to any of the inventoried defenses (D1-D4). Since it cites an in-window file and does not match the defense inventory, it is graded as none.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-05 — none · CI batch, run 16, finding 1

- **Finding**: `.github/workflows/review.yml` :96-106 (minor/security)
  - The PR body override regex for plan paths is properly anchored and restricted to prevent path traversal, but the character class `[A-Za-z0-9._/-]+` could be more restrictive by explicitly disallowing consecutive dots to prevent `.../` attacks
  - _Suggestion_: Consider using `[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*` to enforce path structure
- **Grader (none)**: The finding acknowledges the existing anchored safe-path character class (D2) in .github/workflows/review.yml approvingly and suggests an improvement to make it more restrictive, which fits the 'none' classification.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-06 — none · CI batch, run 19, finding 7

- **Finding**: `packages/code-reviewer/src/config.ts` :29-29 (nit/documentation)
  - The comment about DEFAULT_IMPL_REVIEW_MODEL is very long and could be split for better readability.
  - _Suggestion_: Consider breaking this into multiple shorter comments or moving some of the rationale to documentation.
- **Grader (none)**: The finding suggests splitting a long comment for better readability, which is completely unrelated to the inventoried defences.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-07 — none · Instrument batch, run 5, finding 10

- **Finding**: `context/changes/impl-review-ci-agent/plan.md` :415-420 (minor/documentation)
  - Exclusion semantics contradiction not fully resolved
  - _Suggestion_: While the plan documents the exclusion semantics decision, consider adding a test case that explicitly verifies the chosen interpretation to prevent future confusion.
- **Grader (none)**: The finding suggests adding a test case for documentation in an in-window file and does not claim any of the inventoried defences are missing or cite outside-window material.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-08 — none · Instrument batch, run 10, finding 5

- **Finding**: `context/changes/impl-review-ci-agent/plan.md` :1-554 (minor/documentation)
  - The plan document is very long (554 lines) which may make it difficult to maintain and understand.
  - _Suggestion_: Consider splitting this into multiple focused documents or adding a concise executive summary at the top.
- **Grader (none)**: The finding critiques the length of the in-window plan document and suggests splitting it, which is unrelated to the defence inventory.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-09 — none · Instrument batch, run 15, finding 1

- **Finding**: `.github/workflows/review.yml` :71-73 (major/security)
  - The regex for extracting plan path from PR body could be vulnerable to ReDoS with crafted input. The character class `[A-Za-z0-9._/-]` combined with the quantifier could lead to catastrophic backtracking.
  - _Suggestion_: Simplify the regex or use a more restrictive pattern that avoids nested quantifiers. Consider using a whitelist approach with explicit character validation.
- **Grader (none)**: The finding discusses a potential ReDoS vulnerability in the regex in the in-window file `.github/workflows/review.yml`. It does not claim the defence is missing or permits what it prevents, so it falls under 'none'.
- **Your read**: [ ] agree · [ ] misgrade — notes:

### C-10 — none · Instrument batch, run 18, finding 3

- **Finding**: `.github/workflows/review.yml` :114-118 (nit/style)
  - The traversal check only looks for `..` segments but doesn't explicitly check for absolute paths (though the regex would reject them).
  - _Suggestion_: Add an explicit check for absolute paths: `case "$OVERRIDE" in /*|*..*) echo "override candidate rejected (invalid path)" ;;`
- **Grader (none)**: The finding acknowledges that the existing regex validation (D2) would reject absolute paths and merely suggests an explicit check as a style improvement, which falls under the 'none' category.
- **Your read**: [ ] agree · [ ] misgrade — notes:
