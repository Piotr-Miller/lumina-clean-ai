<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: CI/CD PR Code Review Workflow

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-08-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation
- **Reviewed range**: ae3c00f..a5e1e6e

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Sticky marker does not verify comment ownership

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-review/action.yml:85
- **Detail**: The lookup selects the first comment containing the public <!-- ai-cr:sticky --> marker without checking its author. A commenter can make the action target an unrelated comment, causing an overwrite or blocking the legitimate scorecard update. See [GitHub REST API documentation](https://docs.github.com/en/rest/issues/comments#update-an-issue-comment).
- **Fix**: Require both the marker and expected Actions bot/app author; create a fresh bot comment when no owned marker exists.
- **Decision**: FIXED — marker lookup now also requires `.user.login == "github-actions[bot]"`; verified the existing PR #115 sticky comment matches this filter (no duplicate on next run).

### F2 — Failed label addition can erase the previous verdict

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-review/action.yml:111
- **Detail**: Failure to add the new verdict label is swallowed, after which the opposite label is still removed and the action exits green. A transient API failure can leave the PR with no current ai-cr:* verdict.
- **Fix**: Require the new label addition to succeed before removing the old label; fail or reconcile if the final state cannot be established.
- **Decision**: FIXED — add-label is now mandatory (failed add = red step, old label survives as last valid verdict); remove of the opposite label stays tolerant for first runs.

### F3 — Deduplication discards distinct same-line findings

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/pipeline.ts:137; packages/code-reviewer/src/findings.ts:46
- **Detail**: Findings are identified only by file:startLine|category. Different defects attributed to the same line and category collapse into one, removing evidence before the judge scores the change.
- **Fix**: Include normalized description/range in the merge identity and deterministic sort.
  - Strength: Prevents evidence loss while retaining stable IDs.
  - Tradeoff: Equivalent findings phrased differently may both remain.
  - Confidence: HIGH — tests pin first/higher-severity wins for the coarse identity.
  - Blind spot: Semantic equivalence needs a more sophisticated policy.
- **Decision**: DEFERRED — parked into the pipeline-reliability follow-up change (together with schema-mismatch retry); the coarse identity stays as designed until then.

### F4 — Transient retries happen immediately without backoff

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/retry.ts:36
- **Detail**: HTTP 429 and 5xx errors are retryable, but the second call starts immediately. A 429 retry can remain inside the same rate-limit window. The AI SDK exposes response headers including Retry-After.
- **Fix**: Add an injectable bounded delay honoring Retry-After, with capped backoff/jitter as fallback.
  - Strength: Makes the retry effective for transient provider failures.
  - Tradeoff: Lengthens failed runs and adds a clock test seam.
  - Confidence: HIGH — the helper currently reinvokes immediately.
  - Blind spot: Provider header consistency has not been measured.
- **Decision**: DEFERRED — parked into the pipeline-reliability follow-up change (backoff + Retry-After lands together with schema-mismatch retry and the F3 dedup policy, one coherent edit to retry.ts/findings.ts).

### F5 — Current HEAD has no successful self-review run

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: GitHub Actions run 31277190123
- **Detail**: Earlier required runs succeeded, but the newest run for HEAD a5e1e6e failed on a structured-output schema mismatch. This is intentionally non-retryable, and the failure preserved the previous sticky comment and ai-cr:failed label.
- **Fix**: Re-run current HEAD via ai-cr:review and record the outcome; open a separate change if schema failures remain recurrent.
- **Decision**: PENDING

## Verification

| Check                                             | Result                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Package tests / typecheck / lint                  | PASS — 176/176 tests                                              |
| Barrel import without OPENROUTER_API_KEY          | PASS                                                              |
| Root typecheck / unit tests                       | PASS — 325/325 tests                                              |
| Composite action + workflow YAML parse            | PASS                                                              |
| git diff --check ae3c00f..HEAD                    | PASS                                                              |
| GitHub labels, variables, and secret registration | PASS                                                              |
| Phase 2–3 manual evidence                         | PASS — primary live evidence recorded in verification.md          |
| Phase 1 manual evidence                           | PASS — explicitly post-hoc/user-attested in verification.md       |
| Scoped mutation testing                           | SKIPPED — no reviewed file is an application risk-critical module |

## Review Notes

- No planned implementation is missing and no substantive plan drift was found.
- Extra paths are documented review fixes or normal planning/audit artifacts.
- No What We're NOT Doing boundary was breached.
- Same-repository human authors are treated as secret-trusted. If that changes, executing PR-head code with OPENROUTER_API_KEY becomes a critical trust issue.
