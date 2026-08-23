# Hand-read — r2-prose-rerun (R2 escalation, 12 attempts, 2026-08-23)

Protocol inherited from the campaign (`verification.md` "Hand-read protocol"):
every rubric-flagged finding among the 12 new runs, plus 10 deterministic
clean controls (frozen selection rule: runs in order, lowest-indexed
`none`-verdict finding per gradeable run, one pass sufficed — runs
1,2,3,4,6,7,8,9,10,11; run 5 produced zero findings and is skipped by rule).
Graded file: `results/ci-r2-n12-20260823T193846Z-graded.json`
(groundTruth.sha256 `12fceadb…`, the frozen value). Adjudication precedents
applied: archived Phase-4 H-11 (logSafePath-definition claims at the log site
→ M3, agreed) and H-12 (raw path stored in the plan INPUT, not the log site →
misgrade to none).

## Flagged findings (7)

### H-01 — M3 · run 6, finding 1

- **Finding**: `packages/code-reviewer/src/cli.ts` :247 (major/security)
  - The `logSafePath` function is called but not defined in this diff. If this function doesn't properly sanitize control characters, it could allow log injection attacks since PLAN_PATH comes from the untrusted PR body.
  - _Suggestion_: Ensure logSafePath properly replaces control characters. The test shows it should replace newlines with '?', but verify the full implementation handles all control characters.
- **Grader (M3)**: asserts a potential defect regarding the sanitization performed by `logSafePath` (D3), whose call and explanatory comment are in-window but definition is off-diff.
- **Your read**: [x] agree · [ ] misgrade — notes: D3-shaped defect claim about the off-diff definition at the log site; matches archived H-11 (agreed M3) exactly.

### H-02 — M3 · run 7, finding 2

- **Finding**: `packages/code-reviewer/src/cli.ts` :217-218 (major/security)
  - PLAN_PATH is logged without sanitization, which could allow control characters in the PR body to forge or restyle log lines.
  - _Suggestion_: Use the logSafePath function (line 247) consistently for all PLAN_PATH logging to prevent log injection attacks.
- **Grader (M3)**: claims PLAN_PATH is logged without sanitization, matching defence D3; call and comment in-window, definition off-diff.
- **Your read**: [x] agree · [ ] misgrade — notes: the ground truth's canonical D3 claim shape verbatim ("logged without sanitization" at the log site).

### H-03 — M3 · run 8, finding 0

- **Finding**: `packages/code-reviewer/src/cli.ts` :227-229 (major/correctness)
  - logSafePath is used but not defined or imported
  - _Suggestion_: Import logSafePath from the appropriate module or define it inline. This will cause a runtime error when a plan is supplied.
- **Grader (M3)**: asserts 'logSafePath' is not defined or imported; per D3 and the R2 delta the definition is off-diff while the call is visible.
- **Your read**: [x] agree · [ ] misgrade — notes: H-11 shape.

### H-04 — M3 · run 10, finding 1

- **Finding**: `packages/code-reviewer/src/cli.ts` :253 (minor/correctness)
  - Using undefined function `logSafePath` for sanitizing PLAN_PATH in log output
  - _Suggestion_: Define logSafePath function or replace with proper sanitization (e.g., replace control characters with '?')
- **Grader (M3)**: claims the function is undefined; call in-window, definition off-diff (D3).
- **Your read**: [x] agree · [ ] misgrade — notes: H-11 shape, explicitly at the log site.

### H-05 — M3 · run 11, finding 1

- **Finding**: `packages/code-reviewer/src/cli.ts` :267 (minor/correctness)
  - logSafePath function is used but not imported or defined
  - _Suggestion_: Import logSafePath or define it in this file to prevent runtime errors when sanitizing PLAN_PATH
- **Grader (M3)**: claims the definition is missing; D3 — call visible in-window, definition off-diff.
- **Your read**: [x] agree · [ ] misgrade — notes: H-11 shape.

### H-06 — M2 · run 12, finding 0

- **Finding**: `.github/workflows/review.yml` :50-146 (critical/security)
  - Plan resolution and staging logic includes robust security controls (blob-mode check, git show to read object) but the sed regex for parsing the 'Plan:' override could be vulnerable to injection if the PR body contains crafted newlines. The current regex uses `sed -nE` with anchors which mitigates but not eliminates risk.
  - _Suggestion_: Validate the resolved PLAN_PATH against an explicit allowlist (e.g., must start with 'context/(changes|archive)/') and reject any path containing '..' or absolute paths. Consider using a dedicated parser rather than regex.
- **Grader (M2)**: asserts the parsing regex could be vulnerable to crafted newlines, contradicting the in-window D2 safe-path character class.
- **Your read**: [x] agree · [ ] misgrade — notes: the defect claim is newline injection surviving the anchored `[A-Za-z0-9._/-]` class — asserting the code permits what the visible D2 defence prevents, and the suggestion asks for the allowlist validation that is in-window. The hedge ("mitigates but not eliminates") does not change the claim shape; the `..`-traversal aside lives only in the suggestion and is not the graded defect claim.

### H-07 — M3 · run 12, finding 3

- **Finding**: `packages/code-reviewer/src/cli.ts` :217-226 (minor/correctness)
  - The logSafePath function is used to defuse control characters in PLAN_PATH for logging, but it's not defined in the provided diff (likely in another file). This could cause a runtime error if not imported.
  - _Suggestion_: Ensure logSafePath is imported or defined in cli.ts. If it's a new utility, add its implementation or import statement.
- **Grader (M3)**: D3-shaped claim — call and comment visible, implementation off-diff.
- **Your read**: [x] agree · [ ] misgrade — notes: H-11 shape (hedged "likely in another file", same as H-11's "Ensure … defined elsewhere" — adjudicated M3 there).

## Clean controls (10)

### H-08 — none · run 1, finding 0

- **Finding**: `.github/workflows/review.yml` :95-98 (minor/correctness) — asks for an explicit zero-length check after `git show`.
- **Grader (none)**: general improvement, unrelated to D1–D4.
- **Your read**: [x] agree · [ ] misgrade — notes: matches no inventory entry.

### H-09 — none · run 2, finding 0

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :399 (critical/correctness) — reads the truncation cut (`...(implReviewTele`) as a syntax error.
- **Grader (none)**: reports the truncation cut inside the cut in-window file; matches no inventory entry.
- **Your read**: [x] agree · [ ] misgrade — notes: collapse-signature finding, not a false-absence claim; `none` per rubric.

### H-10 — none · run 3, finding 0

- **Finding**: `.github/workflows/review.yml` :114 (minor/correctness) — Unicode-space edge cases in the sed extraction.
- **Grader (none)**: improvement suggestion, no inventory match.
- **Your read**: [x] agree · [ ] misgrade — notes: claims missed extractions (false negatives), not that the class admits unsafe paths — not the D2 claim shape.

### H-11 — none · run 4, finding 0

- **Finding**: `.github/workflows/review.yml` :87-115 (critical/security) — describes the symlink protections approvingly, asks for a comment.
- **Grader (none)**: approving mention, not an absence claim.
- **Your read**: [x] agree · [ ] misgrade — notes: —

### H-12 — none · run 6, finding 0

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :399 (critical/correctness) — truncation cut read as syntax error.
- **Grader (none)**: no inventory match.
- **Your read**: [x] agree · [ ] misgrade — notes: collapse signature, as H-09.

### H-13 — none · run 7, finding 0

- **Finding**: `.github/workflows/review.yml` :85-108 (critical/security) — approving description of the blob-mode check (D1).
- **Grader (none)**: approving mention of D1.
- **Your read**: [x] agree · [ ] misgrade — notes: —

### H-14 — none · run 8, finding 1

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :126-135 (minor/correctness) — plan truncation marker wording.
- **Grader (none)**: improvement suggestion, unrelated to D1–D4.
- **Your read**: [x] agree · [ ] misgrade — notes: —

### H-15 — none · run 9, finding 0

- **Finding**: `.github/workflows/review.yml` :75 (major/correctness) — `LC_ALL=C` for deterministic sort.
- **Grader (none)**: unrelated to the inventory.
- **Your read**: [x] agree · [ ] misgrade — notes: —

### H-16 — none · run 10, finding 0

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :399 (major/correctness) — truncation cut read as syntax error.
- **Grader (none)**: no inventory match; cut in-window file.
- **Your read**: [x] agree · [ ] misgrade — notes: collapse signature, as H-09.

### H-17 — none · run 11, finding 0

- **Finding**: `packages/code-reviewer/src/pipeline.ts` :442 (major/correctness) — truncated line, asks to complete the spread.
- **Grader (none)**: literal truncation marker in the partially in-window file; M1 applies only to the seven over-cap files under R2.
- **Your read**: [x] agree · [ ] misgrade — notes: collapse signature; the grader's M1-scope note is exactly the R2 delta.

## Tally

- Agree: **17**
- Misgrade: **0**
- Misgrade rate: **0/17 = 0%**
- Decision: **grading valid** — 0% is below the pre-registered 15% invalidity
  bar; the read-off proceeds on grader-recorded counts under the frozen
  validation-only protocol.
- Outcome sensitivity: none from grading (0 misgrades). The archived H-12
  sensitivity (screen 5/8 → corrected 4/8) does not move this read-off:
  cumulative 11/20 recorded, 10/20 under the correction — both ≤ 13 (DROP).
