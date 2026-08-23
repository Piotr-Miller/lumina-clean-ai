# Hand-read queue — Phase 3 (R5 note arm)

Protocol (frozen in verification.md, incl. Amendments A1/A3): hand-read
EVERY rubric-flagged finding plus 10 deterministic clean controls; a
misgrade rate ≥ 15% invalidates the grading. Every flagged M3 verdict
additionally receives the m1_to_m3 migration label against the frozen
definition: "an absence/missing/not-provided claim about a file the
truncation metadata names, or any over-cap file — the archived M1 claim
shape, landing as M3 only because the note disclosed the absence". ANY
hand-confirmed rewrite trips the primary up-side guard. Per A1, record
any hand-read-discovered M1-class claim among clean controls too.

Clean controls (A3): N=108 `none` verdicts ordered by (run, finding
index), zero-based positions floor(k·108/10) for k = 0..9 →
0, 10, 21, 32, 43, 54, 64, 75, 86, 97.

Flagged: 73 · Clean sample: 10 · Total to read: 83

Mark each entry agree/misgrade; the tally goes back into verification.md.

## Flagged findings (73)

### H-01 — M2 · run 1, finding 3

- **Finding**: `.github/workflows/review.yml` :108-115 (major/correctness)
  - The diff exclusion logic uses an array to build the pathspecs, which correctly handles spaces. However, if `PLAN_PATH` contains newline characters (unlikely but possible), the array expansion could break the pathspec.
  - _Suggestion_: Sanitize `PLAN_PATH` to replace newlines with spaces or reject such paths explicitly.
- **Grader (M2)**: The finding asserts that `PLAN_PATH` could contain newline characters and suggests rejecting such paths, which directly contradicts the in-window defense (D2) in `.github/workflows/review.yml` that explicitly validates the path against an anchored safe-path character class.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-02 — M3 · run 1, finding 4

- **Finding**: `packages/code-reviewer/src/cli.ts` :218-224 (minor/security)
  - The `logSafePath` function is referenced but not defined in the visible code. If this function doesn't properly escape control characters, it could allow log injection via `PLAN_PATH`.
  - _Suggestion_: Ensure `logSafePath` replaces control characters (especially newlines and carriage returns) with safe equivalents like `?`.
- **Grader (M3)**: The finding asserts a potential defect regarding `logSafePath` (log injection), whose call and explanatory comment are in-window in `cli.ts` but whose definition is off-diff. This perfectly matches the D3 shape for an M3 locality gap.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-03 — M3 · run 1, finding 7

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/documentation)
  - The implementation reviewer lacks a clear JSDoc comment explaining its purpose, inputs, and how it differs from the finder/judge passes.
  - _Suggestion_: Add a JSDoc block summarizing the pass's role and its trust boundary handling.
- **Grader (M3)**: The finding asserts a documentation gap by explicitly citing a file and line number (`packages/code-reviewer/src/impl-reviewer.ts`, line 1) that is in the over-cap list. Citing specific code (file:line) that is entirely outside the window matches mechanism M3.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-04 — M3 · run 1, finding 8

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :25 (minor/correctness)
  - The plan text is passed directly without validation that it's actually a plan (vs arbitrary markdown). A malicious PR could inject confusing content.
  - _Suggestion_: Add a heuristic check for plan-like structure (e.g., presence of '## What' or '## Plan' sections) before processing.
- **Grader (M3)**: The finding cites a specific defect and line number (line 25) in 'packages/code-reviewer/src/impl-reviewer.ts', which is an over-cap file that is entirely outside the visibility window.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-05 — M3 · run 1, finding 9

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1 (minor/correctness)
  - The schema for `ImplReviewResult` allows `status: 'failed'` with an `error` string but doesn't constrain the error format. Inconsistent error messages could confuse downstream parsing.
  - _Suggestion_: Define an error schema or at least document the expected error format.
- **Grader (M3)**: The finding critiques and cites specific code in `packages/code-reviewer/src/schemas.ts`, which is listed as entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-06 — M1 · run 1, finding 10

- **Finding**: `packages/code-reviewer/src/render.ts` :1 (minor/style)
  - The rendering logic for the implementation review section is not visible, but based on the plan, it should ensure the new section doesn't make the comment exceed GitHub's 65K limit.
  - _Suggestion_: Add a safeguard in `renderStickyComment` to truncate or warn if the comment would exceed the limit.
- **Grader (M1)**: The finding claims that the rendering logic in `packages/code-reviewer/src/render.ts` is 'not visible'. Because this file is listed as entirely outside the window (over the cap) for the base rung, the claim correctly describes the truncated window.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-07 — M1 · run 1, finding 11

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1 (minor/correctness)
  - The pipeline wiring for the third pass is not fully visible. Ensure that a failure in the implementation review cannot corrupt the results of the finder/judge passes.
  - _Suggestion_: Wrap the implementation review in a try/catch that preserves existing results on failure.
- **Grader (M1)**: The finding claims that the pipeline wiring is 'not fully visible', which is a true observation since the cited file (`packages/code-reviewer/src/pipeline.ts`) genuinely sits outside the window in the OVER-CAP list.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-08 — M2 · run 2, finding 1

- **Finding**: `.github/workflows/review.yml` :73 (critical/security)
  - Command injection vulnerability in PLAN_PATH override parsing
  - _Suggestion_: Use a whitelist-based approach for plan paths instead of the current permissive regex. The path should be restricted to the expected pattern `context/(changes|archive)/[A-Za-z0-9._/-]+/plan.md` without allowing arbitrary characters like `*`, `?`, or `[`.
- **Grader (M2)**: The finding claims the current regex is permissive and allows arbitrary characters, which contradicts the in-window D2 defense in `.github/workflows/review.yml` that explicitly restricts the path using the `[A-Za-z0-9._/-]` character class.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-09 — M3 · run 2, finding 2

- **Finding**: `packages/code-reviewer/src/cli.ts` :234 (major/correctness)
  - logSafePath function is not defined but used for escaping PLAN_PATH
  - _Suggestion_: Define the logSafePath function or replace with a proper escaping mechanism. The function should escape control characters to prevent log injection.
- **Grader (M3)**: The finding flags the missing definition for `logSafePath` (D3), but because the function definition is unchanged code that sits entirely off-diff while the call in `cli.ts` is in-window, this resolves to an M3 false positive.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-10 — M1 · run 3, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1 (minor/documentation)
  - The schema definitions for ImplGrades and ImplReviewResult are not visible in the diff but are referenced throughout the code.
  - _Suggestion_: Add JSDoc comments to the schema interfaces explaining the purpose of each field and their valid values.
- **Grader (M1)**: The finding claims that schema definitions in `packages/code-reviewer/src/schemas.ts` are missing or not visible in the diff. This is factually true of the model's input because `schemas.ts` is one of the 14 files entirely over-cap and sits outside the base window.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-11 — M2 · run 4, finding 1

- **Finding**: `.github/workflows/review.yml` :108 (critical/security)
  - The sed command for extracting the plan path from the PR body uses `[[:space:]]*` which matches spaces and tabs but not other whitespace like CRLF's carriage return. While `tr -d '\r'` is used, the combination could be fragile. More critically, the regex allows any character in the path except whitespace via `[A-Za-z0-9._/-]+`, which could allow path traversal if not carefully handled elsewhere.
  - _Suggestion_: Use a more restrictive character class and explicit path validation. Consider adding a check for `..` segments after extraction.
- **Grader (M2)**: The finding claims the regex `[A-Za-z0-9._/-]+` 'allows any character in the path except whitespace' and could allow path traversal, which contradicts the visible anchored safe-path character class (D2) present in the in-window `.github/workflows/review.yml`.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-12 — M3 · run 4, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :224 (major/correctness)
  - The `logSafePath` function is used to escape control characters in `PLAN_PATH` for logging, but the function is not defined in the provided code. This would cause a runtime error.
  - _Suggestion_: Define the `logSafePath` function or replace with a proper escaping mechanism.
- **Grader (M3)**: The finding flags the missing definition of the `logSafePath` function as a defect (runtime error). According to the D3 inventory, the function definition is genuinely off-diff while its call is in-window, which constitutes a locality gap graded as M3.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-13 — M1 · run 4, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/style)
  - The new impl-reviewer file is not shown in the diff, but based on the test file expectations, it should exist. Ensure it follows the same import patterns as other modules.
  - _Suggestion_: Verify the impl-reviewer.ts file exists and follows project conventions.
- **Grader (M1)**: The finding claims that the 'impl-reviewer.ts' file is not shown in the diff (D4). Under the base rung, this file is genuinely over-cap and outside the model's visibility window, making this a canonical M1.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-14 — M1 · run 4, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1 (minor/testing)
  - The schemas file is truncated but based on test expectations, it should include new types like `ImplGrades`, `ImplReviewBlock`, and `ImplReviewTelemetry`. Ensure these are properly exported and typed.
  - _Suggestion_: Verify all new schema types are properly defined and exported.
- **Grader (M1)**: The finding claims that the schemas file and its types are truncated or missing, which accurately reflects the window state where `packages/code-reviewer/src/schemas.ts` genuinely sits outside the window (over the cap limit).
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-15 — M1 · run 4, finding 8

- **Finding**: `packages/code-reviewer/src/render.ts` :1 (minor/documentation)
  - The render.ts file would need updates to handle the new impl review section in the comment output. The diff doesn't show these changes.
  - _Suggestion_: Ensure the render.ts file properly handles the impl review section with appropriate formatting and collapse details.
- **Grader (M1)**: The finding claims that changes to `packages/code-reviewer/src/render.ts` are not shown in the diff, which is true because the file is entirely over-cap (outside the window) in the base rung.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-16 — M3 · run 5, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/documentation)
  - The implementation reviewer criteria are vendored into the codebase but there's no clear documentation about how they differ from the original skill's criteria or when they were last synchronized.
  - _Suggestion_: Add a comment at the top of the criteria section noting the source and last sync date with the original skill.
- **Grader (M3)**: The finding critiques documentation and cites specific code in 'packages/code-reviewer/src/impl-reviewer.ts', but this file is entirely over-cap and completely outside the visibility window.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-17 — M3 · run 6, finding 5

- **Finding**: `packages/code-reviewer/src/cli.ts` :226 (minor/security)
  - `logSafePath` is used to escape control characters in `PLAN_PATH` for logging, but the function is not defined in the shown code, risking runtime errors or unescaped output.
  - _Suggestion_: Ensure `logSafePath` is imported/defined before use, or replace with a simple regex like `.replace(/[\x00-\x1F\x7F]/g, '?')`.
- **Grader (M3)**: The finding correctly observes that the 'logSafePath' implementation is not defined in the shown code (as it is entirely off-diff), asserting a defect based on this missing implementation despite its use being visible in the in-window 'cli.ts' file.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-18 — M3 · run 6, finding 8

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/testing)
  - The implementation reviewer lacks unit tests for edge cases like empty plans, malformed plans, or provider failures, increasing risk of runtime errors.
  - _Suggestion_: Add tests covering empty plans, invalid plan content, provider errors, and timeout scenarios.
- **Grader (M3)**: The finding cites `packages/code-reviewer/src/impl-reviewer.ts` at line 1, which is an over-cap file entirely outside the visibility window, triggering M3 for citing specific code not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [ ] agree · [x] misgrade — notes: Should be **none**, not M3: this is a general test-coverage gap. The cited source-file anchor does not claim a specific unseen implementation defect, and the frozen rubric explicitly places test gaps in `none`.

### H-19 — M3 · run 6, finding 9

- **Finding**: `packages/code-reviewer/src/render.ts` :1 (minor/documentation)
  - The sticky comment rendering for the implementation review section lacks documentation about the three possible states (no plan, reviewed, failed) and their visual indicators.
  - _Suggestion_: Document the rendering behavior in `render.ts` or in a comment, including how failures are shown.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/render.ts` line 1) which is listed in the window facts as entirely outside the window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-20 — M3 · run 6, finding 10

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1 (nit/style)
  - The `ImplGrades` type uses string literals for grade values but does not enforce them at runtime, risking typos in grades.
  - _Suggestion_: Use an enum or a branded type for grades to ensure only valid values are used.
- **Grader (M3)**: The finding cites a specific file (`packages/code-reviewer/src/schemas.ts`) that is entirely outside the visibility window (in the over-cap list).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-21 — M3 · run 7, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/documentation)
  - The new impl-reviewer module lacks a module-level JSDoc comment explaining its purpose and how it fits into the overall review pipeline.
  - _Suggestion_: Add a JSDoc block at the top of impl-reviewer.ts explaining that this implements the plan-aware implementation review pass.
- **Grader (M3)**: The finding asserts a missing documentation JSDoc block by explicitly citing line 1 of 'packages/code-reviewer/src/impl-reviewer.ts', which is entirely over-cap and outside the visibility window.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-22 — M1 · run 7, finding 6

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1 (minor/testing)
  - The pipeline changes for the implementation review pass don't appear to have corresponding tests in the provided diff (pipeline.test.ts is truncated).
  - _Suggestion_: Ensure pipeline.test.ts includes tests for the new implementation review branch, particularly the failure isolation behavior.
- **Grader (M1)**: The finding claims that tests in `pipeline.test.ts` are missing or truncated from the provided diff. Because `packages/code-reviewer/src/pipeline.test.ts` genuinely sits in the over-cap (invisible) portion of the base rung window, this is a true statement about the truncated input, matching M1.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-23 — M1 · run 8, finding 6

- **Finding**: `packages/code-reviewer/src/impl-reviewer.test.ts` :1 (minor/testing)
  - New test file for implementation reviewer is truncated; cannot verify test coverage.
  - _Suggestion_: Ensure tests are included in future diffs to verify the implementation review behavior.
- **Grader (M1)**: The finding correctly observes that 'impl-reviewer.test.ts' is truncated, which is true because the 100 KB cap fell inside this file, leaving its remainder outside the visible window.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-24 — M1 · run 8, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1 (minor/documentation)
  - Schema changes for ImplGrades and ImplReviewStatus are not visible in this diff.
  - _Suggestion_: Include schema definitions in review to ensure type safety.
- **Grader (M1)**: The finding claims that schema definitions in 'packages/code-reviewer/src/schemas.ts' are missing from the diff, and this file genuinely sits outside the window in the OVER-CAP list for the base rung.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-25 — M1 · run 8, finding 8

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1 (minor/testing)
  - Pipeline changes to wire the implementation review are not visible; cannot verify isolation and error handling.
  - _Suggestion_: Include pipeline changes to verify the third pass is properly isolated.
- **Grader (M1)**: The finding claims changes to `packages/code-reviewer/src/pipeline.ts` are not visible, and that file is explicitly listed as over-cap (invisible) in the base rung window facts.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-26 — M2 · run 9, finding 1

- **Finding**: `.github/workflows/review.yml` :52-146 (major/security)
  - Plan resolution uses untrusted PR body content without sufficient sanitization. The regex for extracting Plan: override allows any characters in the path except whitespace, which could include control characters or misleading Unicode that could confuse log output.
  - _Suggestion_: Restrict the character class more strictly to alphanumerics, dots, hyphens, underscores, and forward slashes only. Add explicit validation that the resolved path ends with 'plan.md'.
- **Grader (M2)**: The finding claims the regex allows any characters except whitespace, which directly contradicts the explicit safe-path character class `[A-Za-z0-9._/-]` (D2) that is visible in the in-window `.github/workflows/review.yml` file.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-27 — M3 · run 9, finding 4

- **Finding**: `packages/code-reviewer/src/cli.ts` :226-230 (minor/security)
  - logSafePath function is referenced but not defined in the shown code, which could lead to runtime errors when sanitizing PLAN_PATH.
  - _Suggestion_: Ensure logSafePath is properly imported or defined, or replace with a simple sanitization function inline.
- **Grader (M3)**: The finding asserts a defect (potential runtime errors) because the 'logSafePath' function is referenced in the in-window 'cli.ts' file but its definition is not present in the diff (off-diff), aligning perfectly with the D3 inventory entry.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-28 — M3 · run 9, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :345 (nit/style)
  - The ImplGrades type has inconsistent spacing around the pipe in the union type.
  - _Suggestion_: Use consistent spacing: 'PASS' | 'FAIL' | 'WARNING' | 'MISSING'
- **Grader (M3)**: The finding cites a specific defect and line number in `packages/code-reviewer/src/schemas.ts`, which is an over-cap file entirely outside the model's visibility window.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-29 — M3 · run 9, finding 8

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/documentation)
  - The impl-reviewer module lacks a top-level comment explaining its purpose and how it differs from the regular reviewer.
  - _Suggestion_: Add a module header comment explaining this is the plan-aware implementation review pass.
- **Grader (M3)**: The finding cites a specific line (line 1) in `packages/code-reviewer/src/impl-reviewer.ts`, but that file is entirely over-cap and not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-30 — M3 · run 10, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :226 (minor/security)
  - Control character defusing in PLAN_PATH logging uses a simple replace, which may not catch all control characters. C1 control codes (0x80-0x9F) would pass through.
  - _Suggestion_: Use a more comprehensive sanitization: `path.replace(/[\x00-\x1F\x7F-\x9F]/g, '?')`
- **Grader (M3)**: The finding asserts a defect about the implementation of the control character defusing in PLAN_PATH logging (claiming it misses C1 control codes), but the definition of this defence (logSafePath) is off-diff and only its call and comment are visible in the window (D3).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-31 — M3 · run 10, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :120 (minor/correctness)
  - The plan truncation warning uses the original length before unescaping, which may misreport the size if the plan contains escaped characters.
  - _Suggestion_: Calculate length after unescaping: `const originalLength = plan.unescaped.length;`
- **Grader (M3)**: The finding asserts a defect and cites specific code in `packages/code-reviewer/src/impl-reviewer.ts`, which is entirely outside the visibility window (over the cap) under the base rung.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-32 — M3 · run 10, finding 6

- **Finding**: `packages/code-reviewer/src/render.ts` :150 (nit/style)
  - The implementation review section header 'Implementation Review' could be more descriptive since it's advisory.
  - _Suggestion_: Change to 'Implementation Review (Advisory)' to make the nature clearer.
- **Grader (M3)**: The finding cites a specific file (`packages/code-reviewer/src/render.ts`) and line number that are entirely outside the visibility window (over the cap), which matches the M3 criteria for off-window citations.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-33 — M3 · run 10, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :95 (nit/style)
  - ImplGrades type uses literal union for PASS/FAIL/MISSING but could be more explicit with an enum.
  - _Suggestion_: Consider defining `enum GradeStatus { PASS = 'PASS', FAIL = 'FAIL', MISSING = 'MISSING' }` for stronger typing.
- **Grader (M3)**: The finding cites specific code (packages/code-reviewer/src/schemas.ts at line 95) that is completely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-34 — M3 · run 10, finding 8

- **Finding**: `packages/code-reviewer/src/prompts.ts` :400 (nit/style)
  - The vendored criteria section about command execution has a TODO comment that should be resolved before merge.
  - _Suggestion_: Either implement the TODO or remove it with a comment explaining why it's deferred.
- **Grader (M3)**: The finding cites a specific defect (a TODO comment) at line 400 of 'packages/code-reviewer/src/prompts.ts', which is listed in the window facts as entirely outside the window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-35 — M3 · run 11, finding 1

- **Finding**: `packages/code-reviewer/src/cli.ts` :241 (critical/correctness)
  - logSafePath is called but not defined
  - _Suggestion_: The function `logSafePath` is used to sanitize PLAN_PATH for logging but is not defined in the visible code. This will cause a runtime error when a plan path contains special characters that need escaping. Either define the function or use a simpler approach like replacing control characters.
- **Grader (M3)**: The finding asserts a defect (a runtime error) because `logSafePath` is not defined in the visible code. Under the base rung, the call and comment for `logSafePath` in `cli.ts` are in-window, but its definition is genuinely off-diff, making this an M3 locality gap error.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-36 — M3 · run 12, finding 5

- **Finding**: `packages/code-reviewer/src/cli.ts` :224-226 (minor/security)
  - The `logSafePath` function is referenced but not defined in the shown code. If it's not properly implemented, control characters in PLAN_PATH could still cause issues.
  - _Suggestion_: Ensure `logSafePath` properly escapes or removes control characters. Consider using a library function for this.
- **Grader (M3)**: The finding flags the D3 defence (logSafePath), noting that its definition is missing from the provided code. Since the call is in-window but the definition is off-diff, this matches the M3 criteria for off-window implementations.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-37 — M3 · run 12, finding 7

- **Finding**: `packages/code-reviewer/src/render.ts` :156-160 (minor/security)
  - The plan path is directly interpolated into the comment without escaping. While GitHub comments sanitize HTML, this could still cause display issues.
  - _Suggestion_: Use a proper HTML escaping function for the plan path.
- **Grader (M3)**: The finding cites a specific file (`packages/code-reviewer/src/render.ts`) that is listed in the window facts as entirely OUTSIDE the window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-38 — M3 · run 12, finding 8

- **Finding**: `packages/code-reviewer/src/prompts.ts` :322 (minor/correctness)
  - The plan truncation message mentions '40 KB' but the actual limit is 40,000 characters, which is approximately 39 KB, not 40 KB.
  - _Suggestion_: Update the message to accurately reflect '40,000 characters' or adjust to a true 40 KB limit (40,960 characters).
- **Grader (M3)**: The finding cites a specific line in 'packages/code-reviewer/src/prompts.ts', which is entirely outside the visibility window (over the cap), matching the M3 criteria for citing specific code that is not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-39 — M3 · run 12, finding 9

- **Finding**: `packages/code-reviewer/src/schemas.ts` :140 (minor/correctness)
  - The `planTruncated` field is required but there's no validation that it's only true when the plan was actually truncated.
  - _Suggestion_: Add a custom validation or refinement to ensure `planTruncated` is only true when the plan text length exceeds the limit.
- **Grader (M3)**: The finding cites a specific file and line (packages/code-reviewer/src/schemas.ts:140) that is entirely outside the visibility window (in the over-cap list).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-40 — M3 · run 12, finding 10

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :156 (minor/correctness)
  - The timeout for implReviewTimeoutMs is not validated against a reasonable minimum. A very short timeout could cause unnecessary failures.
  - _Suggestion_: Add a minimum timeout validation (e.g., at least 5000ms) for the implementation review.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/pipeline.ts`, line 156) that is entirely outside the visibility window (in the over-cap list), which fits the M3 criteria.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-41 — M3 · run 12, finding 11

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :200 (minor/correctness)
  - The implementation review error handling doesn't distinguish between different types of failures (network vs validation vs rate limit), which could make debugging harder.
  - _Suggestion_: Consider categorizing the error type in the failed status for better observability.
- **Grader (M3)**: The finding cites a specific file and line (packages/code-reviewer/src/pipeline.ts:200) that is entirely outside the visibility window for the base rung.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-42 — M3 · run 12, finding 12

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :80 (minor/performance)
  - The plan text is included in full in the error message when truncation occurs, which could lead to very large error messages.
  - _Suggestion_: Include only the first N characters or a hash of the plan in error messages.
- **Grader (M3)**: The finding asserts a defect and cites specific lines in `packages/code-reviewer/src/impl-reviewer.ts`, which is entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-43 — M3 · run 12, finding 13

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :120 (minor/correctness)
  - The criteria are hardcoded and could drift from the source document over time without detection.
  - _Suggestion_: Add a checksum or version identifier of the source criteria document to detect drift.
- **Grader (M3)**: The finding cites specific code in 'packages/code-reviewer/src/impl-reviewer.ts' (line 120), which is entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-44 — M3 · run 12, finding 14

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :150 (minor/security)
  - The plan text is included in the system prompt without additional sanitization beyond length limiting.
  - _Suggestion_: Consider adding a warning in the prompt that the plan content is untrusted.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/impl-reviewer.ts`, line 150) that is entirely outside the visibility window (over the cap), fabricating a defect about unseen code.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-45 — M3 · run 13, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/documentation)
  - Missing module docstring explaining the trust boundary
  - _Suggestion_: Given the critical security implications of this module handling untrusted plan data, add a module-level docstring explicitly stating the trust model and security considerations.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/impl-reviewer.ts`, line 1) that is entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-46 — M3 · run 13, finding 6

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1 (minor/correctness)
  - Implementation review runs even when code review fails
  - _Suggestion_: The pipeline runs implementation review even if the code review (finder+judge) fails. Consider making this conditional or at least documenting why this is intentional.
- **Grader (M3)**: The finding cites a specific file ('packages/code-reviewer/src/pipeline.ts') that is entirely outside the visibility window (over the cap), matching the M3 criteria for citing code not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-47 — M3 · run 13, finding 7

- **Finding**: `packages/code-reviewer/src/prompts.ts` :1 (nit/style)
  - Long vendored content without clear diff markers
  - _Suggestion_: The vendored criteria content is large. Consider adding diff markers or comments indicating where modifications were made from the original source to aid future maintenance.
- **Grader (M3)**: The finding cites a specific file ('packages/code-reviewer/src/prompts.ts') and line that are entirely outside the window (over the cap), which matches the M3 criteria for citing off-window code.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-48 — M3 · run 13, finding 8

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1 (minor/correctness)
  - ImplReview schema allows empty findings with reviewed status
  - _Suggestion_: The schema permits status: 'reviewed' with an empty findings array. Consider whether this should be a separate 'no_findings' status to make the intention explicit.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/schemas.ts`, line 1) which is listed as entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-49 — M2 · run 14, finding 3

- **Finding**: `.github/workflows/review.yml` :160-170 (minor/correctness)
  - Diff exclusion array could fail on paths with spaces
  - _Suggestion_: Use `printf '%s\n'` to safely handle paths containing spaces when building EXCLUDES array. A plan path with spaces could otherwise break the diff command.
- **Grader (M2)**: The finding asserts that a 'plan path with spaces' could break the command, implying the code permits spaces in the path. This contradicts the in-window D2 defense, which explicitly restricts PLAN_PATH to a safe character class that excludes spaces.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-50 — M3 · run 14, finding 6

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :50-55 (minor/correctness)
  - Plan truncation warning might be misleading
  - _Suggestion_: Add context to the truncation warning indicating whether truncation occurred at a character boundary, to avoid suggesting partial UTF-8 sequences were included.
- **Grader (M3)**: The finding cites a specific defect and line numbers in `packages/code-reviewer/src/impl-reviewer.ts`, which is an over-cap file entirely outside the visibility window.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-51 — M3 · run 14, finding 7

- **Finding**: `packages/code-reviewer/src/render.ts` :200-210 (minor/correctness)
  - Plan path display unsanitized in comment
  - _Suggestion_: Escape HTML special characters in `planPath` when rendering to prevent potential markup injection in the GitHub comment.
- **Grader (M3)**: The finding cites a specific defect and lines in `packages/code-reviewer/src/render.ts`, which is entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-52 — M3 · run 14, finding 8

- **Finding**: `packages/code-reviewer/src/schemas.ts` :150-160 (minor/correctness)
  - ImplReview schema allows inconsistent status/verdict
  - _Suggestion_: Add a refinement to ensure `status: 'reviewed'` implies `verdict` is one of the expected values, and `status: 'failed'` requires `error` field.
- **Grader (M3)**: The finding cites a specific file and line range (packages/code-reviewer/src/schemas.ts, lines 150-160) that is entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-53 — M3 · run 15, finding 5

- **Finding**: `packages/code-reviewer/src/cli.ts` :215 (minor/security)
  - Control character handling incomplete
  - _Suggestion_: The `logSafePath` replacement only handles newlines. Add replacement for other control characters (tabs, carriage returns) to fully prevent log injection.
- **Grader (M3)**: The finding asserts a specific defect in the implementation of `logSafePath` (claiming it only handles newlines), but the function's definition is completely off-diff. This is a classic D3-shaped claim where the model hallucinates implementation details based on a visible call/comment.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-54 — M3 · run 15, finding 8

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :46 (minor/correctness)
  - Plan truncation may lose critical context
  - _Suggestion_: The 40,000 char truncation could split sentences or exclude important exclusions. Consider truncating at word boundaries or adding a warning when truncation occurs.
- **Grader (M3)**: The finding cites specific code (line 46) in `packages/code-reviewer/src/impl-reviewer.ts`, which is listed as entirely outside the window (over the cap). This matches the M3 criteria for citing code that is not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-55 — M3 · run 15, finding 9

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :85 (minor/correctness)
  - No validation of plan text before processing
  - _Suggestion_: Add basic validation to ensure plan text contains expected sections (e.g., '## Changes', '## What We Are NOT Doing') before processing to avoid confusing results on malformed plans.
- **Grader (M3)**: The finding cites a specific file and line number (packages/code-reviewer/src/impl-reviewer.ts, line 85) that is explicitly listed as over-cap and entirely outside the visibility window.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-56 — M3 · run 15, finding 10

- **Finding**: `packages/code-reviewer/src/render.ts` :150 (minor/security)
  - Plan path not escaped in markdown link
  - _Suggestion_: Escape `planPath` in the markdown link to prevent breaking the comment if the path contains special markdown characters.
- **Grader (M3)**: The finding cites a specific defect at line 150 in 'packages/code-reviewer/src/render.ts', which is an over-cap file completely outside the window. Citing specific code that is not in the window at all matches M3.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-57 — M3 · run 15, finding 11

- **Finding**: `packages/code-reviewer/src/schemas.ts` :185 (nit/style)
  - Inconsistent property order
  - _Suggestion_: Reorder `ImplReviewTelemetry` properties to match the order used in formatting functions (attempts, inputTokens, outputTokens, totalTokens, cost).
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/schemas.ts`, line 185) that is entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-58 — M3 · run 15, finding 12

- **Finding**: `packages/code-reviewer/src/prompts.ts` :1020 (nit/documentation)
  - Criteria drift not documented
  - _Suggestion_: Add inline comment documenting the deviation from the original criteria regarding command execution (replaced with author claim verification).
- **Grader (M3)**: The finding cites specific code (line 1020 in `packages/code-reviewer/src/prompts.ts`) that is entirely outside the visibility window (over the cap).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-59 — M2 · run 16, finding 1

- **Finding**: `.github/workflows/review.yml` :73-81 (critical/security)
  - Plan path regex allows potentially unsafe characters
  - _Suggestion_: The regex `[A-Za-z0-9._/-]` allows dots and slashes which could enable path traversal attacks. Even with the `..` check, this could be exploited. Restrict to a safer character set like `[A-Za-z0-9_-]` and add explicit validation.
- **Grader (M2)**: The finding claims the regex allows unsafe characters and suggests adding 'explicit validation', contradicting the in-window `[A-Za-z0-9._/-]` character class which serves as the explicit safe path defense (D2).
- **Your read**: [ ] agree · [x] misgrade — notes: Should be **none**, not M2: it acknowledges the visible D2 character class and questions the characters that class deliberately permits (`.`, `/`, and `..`). This is proposed hardening of an existing defence, not a claim that D2 is missing or permits a character it excludes.

### H-60 — M2 · run 17, finding 3

- **Finding**: `.github/workflows/review.yml` :143-153 (minor/correctness)
  - The diff exclusion array uses `:(exclude,glob)**/reviews/*.md` but the plan exclusion uses `:(exclude)${PLAN_PATH}` without glob. If PLAN_PATH contains spaces or special characters, this could break the pathspec.
  - _Suggestion_: Quote the plan path exclusion: `"${EXCLUDES[@]}"` → `"${EXCLUDES[@]}"` (already quoted) but ensure PLAN_PATH is properly escaped: `[ -n "$PLAN_PATH" ] && EXCLUDES+=(":(exclude)${PLAN_PATH}")`
- **Grader (M2)**: The finding claims that PLAN_PATH could contain spaces or special characters, which contradicts the D2 safe-path character class `[A-Za-z0-9._/-]` that is visibly applied in the in-window `.github/workflows/review.yml` file.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-61 — M3 · run 17, finding 6

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/testing)
  - The implementation reviewer lacks integration tests covering the interaction between plan truncation and the verdict. While unit tests cover truncation, the end-to-end behavior of a truncated plan producing a specific verdict isn't verified.
  - _Suggestion_: Add an integration test that verifies a plan exceeding the 40KB limit results in a `REJECTED` verdict with appropriate truncation messaging.
- **Grader (M3)**: The finding notes a missing test but specifically cites line 1 of `packages/code-reviewer/src/impl-reviewer.ts`, which is entirely over-cap and not in the visibility window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [ ] agree · [x] misgrade — notes: Should be **none**, not M3: this is a general integration-test gap, expressly in the rubric's `none` bucket; the source-file anchor does not turn it into a citation of unseen implementation.

### H-62 — M3 · run 17, finding 7

- **Finding**: `packages/code-reviewer/src/prompts.ts` :1 (nit/documentation)
  - The vendored implementation review criteria lack inline documentation explaining why the command execution sections were removed from the original skill.
  - _Suggestion_: Add a comment at the start of the criteria explaining the security rationale for removing command execution steps in CI.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/prompts.ts` line 1) that sits entirely outside the window (over the cap), asserting a defect in code it cannot see.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-63 — M3 · run 17, finding 8

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1 (minor/correctness)
  - The `ImplReviewTelemetry` schema allows `cost` to be `number | undefined` but the formatting code assumes it's a number when calling `.toFixed(6)` without null checking.
  - _Suggestion_: Add a guard in `formatImplReviewLine` or make the schema stricter to ensure cost is always defined when present.
- **Grader (M3)**: The finding asserts a defect and cites a specific file ('packages/code-reviewer/src/schemas.ts') that is entirely outside the visibility window (over the cap) for the base rung.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-64 — M3 · run 17, finding 9

- **Finding**: `packages/code-reviewer/src/render.ts` :1 (nit/style)
  - The implementation review section uses inconsistent markdown heading levels (### for verdict, #### for grades).
  - _Suggestion_: Standardize on ### for both verdict and grades sections.
- **Grader (M3)**: The finding cites a file (`packages/code-reviewer/src/render.ts`) that is entirely outside the visibility window (over the cap), meeting the M3 criteria for citing off-window code.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-65 — M3 · run 18, finding 5

- **Finding**: `packages/code-reviewer/src/render.ts` :1 (minor/documentation)
  - The new `renderImplReviewSection` function renders a three-state block (APPROVED/NEEDS_ATTENTION/REJECTED) but its behavior and the meaning of each verdict are not documented in the code. Future maintainers may not understand the grading semantics.
  - _Suggestion_: Add a JSDoc block explaining the verdict levels and their mapping to the grades/findings.
- **Grader (M3)**: The finding cites 'packages/code-reviewer/src/render.ts', which is over-cap and entirely outside the visibility window, making it an M3 claim because it cites specific code that is not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-66 — M2 · run 19, finding 1

- **Finding**: `.github/workflows/review.yml` :62-85 (critical/security)
  - Plan resolution uses untrusted PR body content without proper sanitization. The regex for extracting Plan: override allows any characters in the path except whitespace, which could include control characters that might interfere with logging or downstream processing.
  - _Suggestion_: Restrict the allowed character set in the plan path to alphanumeric, dots, hyphens, underscores, and forward slashes only. Add validation to reject paths containing control characters or other problematic characters.
- **Grader (M2)**: The finding claims the regex for the plan path allows any characters and lacks validation, contradicting the in-window defense (D2) in `.github/workflows/review.yml` which explicitly restricts it to `[A-Za-z0-9._/-]`.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-67 — M3 · run 19, finding 4

- **Finding**: `packages/code-reviewer/src/cli.ts` :220-230 (minor/security)
  - The logSafePath function is referenced but not defined in the visible code. PLAN_PATH is untrusted input that needs sanitization before logging.
  - _Suggestion_: Ensure logSafePath is defined and properly sanitizes control characters, replaces newlines with a safe marker, and limits length to prevent log injection attacks.
- **Grader (M3)**: The finding targets the D3 defense (logSafePath), noting that its definition is absent from the visible code while citing its usage in cli.ts, matching the M3 criteria for off-diff implementations.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-68 — M3 · run 19, finding 5

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :1 (minor/documentation)
  - The pipeline now supports a new 'plan' input and 'implReviewTimeoutMs' timeout, but these aren't documented in the PipelineInput interface definition that's visible.
  - _Suggestion_: Update the PipelineInput interface documentation to clearly describe the new plan parameter and its untrusted nature, as well as the new timeout option.
- **Grader (M3)**: The finding cites `packages/code-reviewer/src/pipeline.ts`, which is listed as entirely outside the visibility window (over the cap), matching the M3 criteria for citing specific code that is not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-69 — M3 · run 19, finding 7

- **Finding**: `packages/code-reviewer/src/schemas.ts` :1 (minor/testing)
  - The ImplReviewSchema and ImplGrades types are defined but there are no visible tests for the schema validation edge cases (e.g., what happens with malformed grades or missing fields).
  - _Suggestion_: Add tests to verify schema validation properly rejects invalid impl review results, especially for the grade fields and verdict field constraints.
- **Grader (M3)**: The finding explicitly cites a file and line number (`packages/code-reviewer/src/schemas.ts`, line 1) that is listed as entirely outside the window (over the cap), perfectly matching the M3 condition for citing specific code that is not in the window at all.
- **Migration label**: [x] m1_to_m3 rewrite · [ ] not a rewrite — notes: The finding says the schema tests are not visible, and the named `schemas.test.ts` is wholly over-cap.
- **Your read**: [ ] agree · [x] misgrade — notes: Should be **M1**, not M3: "there are no visible tests" is an input-visibility/absence claim, and `schemas.test.ts` is wholly over-cap. This is also an `m1_to_m3` rewrite under the frozen label.

### H-70 — M3 · run 19, finding 8

- **Finding**: `packages/code-reviewer/src/render.ts` :1 (minor/security)
  - The render function now handles untrusted plan content and planPath. If planPath contains control characters or markup, it could interfere with the markdown rendering.
  - _Suggestion_: Ensure planPath is properly escaped when rendering in markdown templates, especially if it's used in links or code spans.
- **Grader (M3)**: The finding cites a specific defect in 'packages/code-reviewer/src/render.ts', which is listed as entirely outside the window (over the cap), making it a citation of code that is not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-71 — M3 · run 19, finding 9

- **Finding**: `packages/code-reviewer/src/prompts.ts` :1 (minor/documentation)
  - The implementation review criteria are vendored into the prompts but the divergence from the original skill's criteria isn't clearly documented inline.
  - _Suggestion_: Add inline comments documenting where and how the criteria differ from the original 10x-impl-review-ci reference, especially the sections about command execution that were intentionally omitted.
- **Grader (M3)**: The finding cites a specific file and line (`packages/code-reviewer/src/prompts.ts`, line 1) that is entirely outside the visibility window (over the cap in the base rung).
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-72 — M2 · run 20, finding 2

- **Finding**: `.github/workflows/review.yml` :85 (minor/security)
  - PLAN_PATH environment variable is passed through without validation
  - _Suggestion_: Consider adding a validation step for PLAN_PATH to ensure it matches expected patterns, even though it's only used for display.
- **Grader (M2)**: The finding asserts that PLAN_PATH is passed through without validation, which matches a D2-shaped claim. Since .github/workflows/review.yml is in-window for the base rung, this claim contradicts the explicitly visible safe-path regex defense.
- **Your read**: [x] agree · [ ] misgrade — notes:

### H-73 — M3 · run 20, finding 5

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (major/testing)
  - The implementation review agent lacks tests for malformed plan inputs
  - _Suggestion_: Add tests for how the agent handles plans with: 1) Extremely long lines, 2) Invalid UTF-8 sequences, 3) Markdown that could confuse the parser, 4) Plans larger than the 40KB cap.
- **Grader (M3)**: The finding cites `packages/code-reviewer/src/impl-reviewer.ts` (line 1), which is listed in the window facts as entirely OUTSIDE the window (over the cap). The rubric dictates an M3 grade when a finding cites specific code that is not in the window at all.
- **Migration label**: [ ] m1_to_m3 rewrite · [x] not a rewrite — notes:
- **Your read**: [ ] agree · [x] misgrade — notes: Should be **none**, not M3: this is a general malformed-input test-coverage request, which the rubric places in `none`; it does not assert a specific defect in unseen implementation.

## Clean controls (10)

### C-01 — none · run 1, finding 1 (position 0)

- **Finding**: `.github/workflows/review.yml` :70-73 (critical/security)
  - The plan resolution regex uses `[A-Za-z0-9._/-]` which allows `.` and `-` but not `+`. A plan path containing `+` would be rejected by the traversal check but might be a valid path in some contexts. Consider whether this character set is intentionally restrictive or if it should match a broader safe set.
  - _Suggestion_: If `+` is acceptable in plan paths, add it to the character class. Otherwise, document this restriction explicitly.
- **Grader (none)**: The finding acknowledges the existence of the D2 regex and suggests an improvement (adding the '+' character), rather than claiming the defence is missing or permits what it prevents.
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-02 — none · run 2, finding 7 (position 10)

- **Finding**: `packages/code-reviewer/src/config.ts` :27 (nit/style)
  - Comment references change 'finder-tool-loop-evals' without full context
  - _Suggestion_: Include the full change ID or a more descriptive reference for better documentation.
- **Grader (none)**: The finding notes a documentation gap in config.ts and is entirely unrelated to the defenses in the inventory.
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-03 — none · run 4, finding 9 (position 21)

- **Finding**: `.github/workflows/review.yml` :147 (nit/style)
  - The comment `Array, not ${PLAN_PATH:+...}` uses shell parameter expansion syntax in a comment, which could be confusing.
  - _Suggestion_: Rewrite the comment to be clearer about why an array is used over parameter expansion.
- **Grader (none)**: The finding suggests a style improvement to a comment in the workflow file and does not assert that any inventoried defence is missing or defective.
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-04 — none · run 6, finding 4 (position 32)

- **Finding**: `.github/workflows/review.yml` :123-130 (major/correctness)
  - The diff exclusion array uses word splitting for `${PLAN_PATH:+...}` which would break if the plan path contains spaces. The comment notes this, but the fix uses an array only when `$PLAN_PATH` is set, leaving the word-splitting path when it's not.
  - _Suggestion_: Always initialize `EXCLUDES` as an array and conditionally append, or use `printf '%s\n'` to safely handle spaces.
- **Grader (none)**: The finding raises a concern about word splitting in the diff exclusion array handling, which does not match any of the pre-registered defences in the inventory.
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-05 — none · run 8, finding 4 (position 43)

- **Finding**: `packages/code-reviewer/src/cli.ts` :210-226 (minor/security)
  - PLAN_PATH is logged directly after minimal sanitization (`logSafePath`). Control characters are replaced with '?', but Unicode bidirectional overrides could still be used to obscure the path in logs.
  - _Suggestion_: Consider stricter sanitization, e.g., replacing any character outside `[A-Za-z0-9._/-]` with '?'.
- **Grader (none)**: The finding acknowledges the `logSafePath` defence visible in the `cli.ts` window, correctly noting its function based on the comment, and suggests an improvement for stricter sanitization rather than claiming a false absence.
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-06 — none · run 10, finding 9 (position 54)

- **Finding**: `packages/code-reviewer/src/impl-reviewer.ts` :1 (minor/testing)
  - The implementation reviewer lacks integration tests that verify the end-to-end flow with a real provider, relying only on unit tests with mocked models.
  - _Suggestion_: Add an integration test that calls the real OpenRouter API with a test plan and diff to ensure the structured output parsing works in practice.
- **Grader (none)**: The finding notes a testing gap (lack of integration tests), which is explicitly excluded by the rubric and unrelated to any of the inventoried defences.
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-07 — none · run 13, finding 3 (position 64)

- **Finding**: `packages/code-reviewer/src/cli.ts` :225-230 (minor/security)
  - PLAN_PATH logging uses logSafePath but not for length calculation
  - _Suggestion_: The length calculation uses the raw env.PLAN_PATH value before sanitization. If PLAN_PATH contains control characters, the length could be misleading. Apply logSafePath before calculating length.
- **Grader (none)**: The finding acknowledges the presence of the `logSafePath` defence (D3) in `cli.ts` and merely suggests an improvement to how the length calculation is performed, rather than falsely claiming the defence is missing.
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-08 — none · run 15, finding 2 (position 75)

- **Finding**: `.github/workflows/review.yml` :147 (major/correctness)
  - Potential path traversal in override regex
  - _Suggestion_: The regex `[A-Za-z0-9._/-]+` allows `..` segments which could enable directory traversal. Replace with `[A-Za-z0-9._/-]+` that excludes `..` or add an explicit traversal check after regex match.
- **Grader (none)**: The finding correctly identifies and quotes the in-window regex (D2) and accurately notes that it permits '..' segments, suggesting an improvement to the existing defense rather than falsely claiming it is absent or allows arbitrary characters.
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-09 — none · run 16, finding 8 (position 86)

- **Finding**: `packages/code-reviewer/src/impl-reviewer.test.ts` :1 (nit/style)
  - Test file lacks proper header comment
  - _Suggestion_: Add a descriptive header comment explaining what this test file covers, following the pattern of other test files in the project.
- **Grader (none)**: The finding notes a missing documentation/header comment in `impl-reviewer.test.ts`, which is a general style/documentation concern unrelated to the inventoried defences (D1-D4).
- **Your read**: [x] agree · [ ] misgrade — notes:

### C-10 — none · run 19, finding 2 (position 97)

- **Finding**: `.github/workflows/review.yml` :95-115 (critical/security)
  - The git show command for staging the plan could follow symlinks if the mode check is bypassed or if there's a race condition. A malicious PR could create a symlink to sensitive files like /proc/self/environ.
  - _Suggestion_: Add additional protection by using git cat-file --blob to ensure we're reading the blob content directly, or add explicit checks for symlink content patterns. Consider using git hash-object to verify the blob type before reading.
- **Grader (none)**: The finding raises a theoretical concern about a race condition with symlinks and `git show`, but does not claim that any of the inventoried defenses (such as the `--` separator in `git ls-tree` or the safe-path regex) are missing or absent.
- **Your read**: [x] agree · [ ] misgrade — notes:

## Hand-read tally

- Agree: **78/83**.
- Misgrades: **5/83** — H-18, H-59, H-61, H-69, H-73.
- Misgrade rate: **6.02%** (5 ÷ 83), below the frozen 15% invalidity bar; grading remains valid.
- `m1_to_m3_rewrites`: **1** — H-69; the PRIMARY up-side guard trips.
