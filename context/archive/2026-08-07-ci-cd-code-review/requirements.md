## Overall concept

- GHA workflow runs for every pull request to `master` (`opened`, `synchronize`, `reopened`; plus `labeled` for on-demand retry)
- composite action for the review itself so that the main workflow is easy to reason about
- **the review step reuses `packages/code-reviewer`** (`createReviewer`, `{ kind: "diff" }` review unit) — no second agent implementation; expose an entry point the action can call (e.g. `npm run review` inside the package)
- output contract: per-criterion 1–10 scores + an overall verdict → requires an **additive scorecard schema** in the package (next to `reviewResultSchema`; the normalized findings stay the mergeable base, scores summarize them)
- separate `.github/workflows/review.yml`: not part of `ci.yml`, **never in `deploy.needs`** (a red review must not block app deploys), with its own `concurrency` block

## Input parameters

- pull request title
- pull request description — include, truncated to ~2,000 chars (PR bodies in this repo carry real context; marginal token cost vs the diff)
- git diff vs the merge-base of the base branch (`fetch-depth: 0`, three-dot diff), capped at ~100 KB with a visible truncation marker

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the best.

1. **implementation correctness** — does the code actually do what it claims, handling edge cases and error paths without introducing regressions?
   - _1_: logic is broken, misses obvious edge/error cases, or silently regresses existing behavior.
   - _10_: behaves correctly across happy path, edge cases, and failure modes with no regressions.

2. **idiomaticity** — does the code follow the language, framework, and project conventions a fluent reader would expect? In this repo that includes the AGENTS.md hard rules: `cn()` for class merging, zod-validated API inputs, the `{ error: { code, message } }` error shape, the `@/*` path alias, React 19 conventions (no Next.js directives, hooks extracted to `src/components/hooks/`).
   - _1_: fights the stack's idioms and the repo's established patterns, reads as foreign.
   - _10_: indistinguishable from well-written surrounding code, uses the right idioms naturally.

3. **complexity** — is the solution as simple as the problem allows, without needless abstraction or convolution?
   - _1_: over-engineered or tangled — hard to follow, with accidental complexity that obscures intent.
   - _10_: minimal and clear, the simplest design that solves the problem completely.

4. **test / risk coverage** — are the meaningful behaviors and risky paths exercised by tests proportional to their risk? This repo's bar is risk-weighted coverage (`context/foundation/test-plan.md`), and explicitly NOT "vibe tests" that pin implementation detail without protecting user-visible behavior.
   - _1_: risky logic ships untested; tests are absent, trivial, or assert nothing useful.
   - _10_: risk-weighted coverage — the parts most likely to break are tested deliberately and well.

5. **documentation** — are non-obvious decisions, public surfaces, and tricky code explained where a reader would need it?
   - _1_: opaque — no comments or docs where they're needed, intent must be reverse-engineered.
   - _10_: just enough docs/comments to explain the "why" without restating the obvious.

6. **security and safety** — does the change avoid introducing vulnerabilities, leaking secrets, or unsafe handling of untrusted input? Repo-specific red flags: client-supplied resource ids routed through id-only service-role helpers (IDOR), new tables without RLS + explicit grants, secrets in code or logs.
   - _1_: introduces an exploitable flaw, leaks secrets, or trusts untrusted input unsafely.
   - _10_: input is validated, secrets are handled correctly, and no new attack surface is opened.

**Verdict (user decision, revised during planning Q&A):** the judge model owns the verdict — it emits `passed`/`failed` plus a short `verdictReason`. The "every criterion ≥ 4 AND average ≥ 6" thresholds are rubric **guidance in the prompt**, not a code-enforced rule; code only validates the schema. Verdict consistency gets measured by the eval harness (`code-review-evals`, next change) before the verdict ever becomes a blocking gate.

## Security & cost guardrails

- **Fork-PR safety**: the workflow needs `OPENROUTER_API_KEY` (repo secret). Run the review ONLY for same-repo PRs (`head.repo == repository`); fork PRs skip gracefully with a neutral note — never combine the secret with an untrusted fork diff in one job.
- **Prompt injection**: the reviewed diff is untrusted input. All model calls go through the package, which fences review units in `<review-unit>` tags and instructs the model to treat embedded text as data — the action must not assemble raw prompts itself.
- **Cost caps**: diff ~100 KB, PR body ~2,000 chars (both with truncation markers); model configurable via `OPENROUTER_MODEL` repo variable with a cheap default; the package's `maxSteps` loop cap applies.
- **Least privilege**: workflow `permissions: contents: read, pull-requests: write`; third-party actions pinned to commit SHAs.
- **Skip conditions**: draft PRs and bot-authored PRs are skipped.
- **Concurrency**: a new push to the same PR cancels the in-flight review run (token savings; matches the repo's existing CI concurrency pattern).

## Parked for later

- business alignment (requires broader context)
- architectural fit (requires broader context)
- hard merge gate on the verdict (branch protection / rulesets — advisory first, gate as a second step)
- prompt/model evaluation harness (promptfoo) — separate change (`code-review-evals`)
- alternative runner path: Claude Code Action + the `10x-impl-review-ci` skill (plan-aware review) — separate track

## Expected side-effects

- PR comment with the scorecard summary — **sticky**: carries a hidden marker; a re-run updates/replaces the previous comment instead of stacking duplicates
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green) — mutually exclusive; the workflow removes the opposite label when flipping

## Expected behavior

- on-demand retry when label `ai-cr:review` is added; the workflow removes that label at run start so re-adding it retriggers cleanly
- advisory in the first version: the review never blocks a merge

## Verification

- end-to-end on a real PR in this repo: scorecard comment posted, correct label applied, sticky update on a second push, `ai-cr:review` retry works, draft/fork skip paths behave
- a deliberately flawed test PR scores low on the targeted criteria and receives `ai-cr:failed`
