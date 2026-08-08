---
date: 2026-08-07T15:43:43+02:00
researcher: Claude (Fable 5)
git_commit: ae3c00f
branch: master
repository: Piotr-Miller/lumina-clean-ai
topic: "CI/CD workflow for PR code reviews — grounding the plan in requirements.md"
tags: [research, codebase, github-actions, code-reviewer, ci-cd, pr-review]
status: complete
last_updated: 2026-08-07
last_updated_by: Claude (Fable 5)
---

# Research: CI/CD workflow for PR code reviews

**Date**: 2026-08-07T15:43:43+02:00
**Researcher**: Claude (Fable 5)
**Git Commit**: ae3c00f
**Branch**: master
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

Ground the implementation plan for `context/changes/ci-cd-code-review/requirements.md`: a GHA
workflow reviewing every PR to master via the existing `packages/code-reviewer` library, with
scorecard output, sticky PR comment, `ai-cr:*` labels, retry-on-label, and the fork/cost/security
guardrails the requirements specify.

## Summary

The review **engine is ~80% ready**: `packages/code-reviewer` (merged as PR #111, `d67a125`)
already provides the factory, the `{ kind: "diff" }` review unit, prompt fencing against
prompt-injection, loop/cost caps, and model/env resolution — but it has **no scorecard output**
(per-criterion 1–10 + verdict), **no CI entry point** (the demo reviews a hard-coded fixture), and
the six requirements criteria exist nowhere in code. The **workflow side starts from zero but with
strong precedents**: the repo has exactly one workflow (`ci.yml`) with documented conventions
(workflow-level concurrency, fork-PR-safe jobs, `deploy.needs` isolation), and the local
`10x-impl-review-ci` skill ships a reference workflow template whose guard patterns (fork block,
bot-commit guard, per-PR concurrency, label-event handling, marker-based comment cleanup) transfer
directly to the SDK path. **GitHub-side, three provisioning gaps**: no `ai-cr:*` labels, no
`OPENROUTER_API_KEY` secret (must be set by the user via the UI — a past incident showed
`gh secret set` through the assistant shell writes an empty secret), and no Actions variables;
default workflow token permissions are `read` (good — `pull-requests: write` must be requested
explicitly).

## Detailed Findings

### A. Review engine: `packages/code-reviewer` readiness

Ready today (all verified this week; 52 unit tests):

- `createReviewer({ lens?, model?, apiKey?, source?, maxSteps? })` factory →
  `review(unit, { abortSignal?, timeoutMs? })` (`packages/code-reviewer/src/reviewer.ts`)
- `{ kind: "diff", diff }` review unit; prompts fence content in `<review-unit>` tags and
  instruct the model to treat embedded text as data (`src/prompts.ts`) — satisfies the
  requirements' prompt-injection guardrail at the library layer
- `ReviewResult` = `{ summary, findings[{ file, startLine?, endLine?, severity, category,
description, suggestion }] }` with stable keys + merge utilities (`src/schemas.ts`,
  `src/findings.ts`)
- Config: `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` env with throwing lazy resolution
  (`src/config.ts`; `DEFAULT_MODEL = anthropic/claude-sonnet-5`); `maxSteps` cap (default 8);
  context-tool response caps
- Pure barrel `index.ts` (side-effect-free import); own lockfile; `engines: node 24.x`;
  package-local lint/typecheck/test all wired into the existing `code-reviewer` CI job

**Gaps vs requirements (the plan's core work):**

1. **Scorecard schema** — requirements demand per-criterion 1–10 scores + a verdict
   (`passed` iff every criterion ≥ 4 AND average ≥ 6). Nothing in the package models this.
   Additive design consistent with the package's seams: a `scorecardSchema` next to
   `reviewResultSchema`, and a pure `deriveVerdict(scores)` function (unit-testable like
   `findings.ts`).
2. **Criteria representation** — the six criteria (correctness, idiomaticity, complexity,
   test/risk coverage, documentation, security) live only in `requirements.md`. They must become
   model-facing instructions; `prompts.ts` is the established home for all model-facing text.
3. **CI entry point** — no way to feed a real diff: `demo.ts` uses a hard-coded fixture and
   positional lens arg only. Needed: an entry (e.g. `src/review-pr.ts` + `npm run review`) that
   accepts diff (file path or stdin), PR title/body (env or args), applies the requirements'
   truncation caps (~100 KB diff, ~2 000-char body), and emits machine-readable JSON
   (scorecard + findings) for the workflow to consume.

### B. GHA conventions in this repo (from `ci.yml` + archives)

- **Concurrency**: workflow-level `group: <workflow>-<ref>`, `cancel-in-progress` for any ref ≠
  master (`.github/workflows/ci.yml:14-16`; decision PR #72, `AGENTS.md:89`). For `review.yml`
  the reference template keys concurrency per PR number instead — better fit, since the review
  should cancel per-PR, and master pushes never run it.
- **Fork-PR safety is a designed property**: `integration`/`e2e` deliberately use zero secrets
  (`AGENTS.md:85-86`; `context/archive/2026-06-09-testing-ci-gate/plan.md:23-25` — job-level
  process isolation so `$GITHUB_ENV` bleed is structurally impossible). A review workflow using a
  secret is the repo's FIRST secret-bearing PR-triggered job → the fork block is load-bearing.
- **`deploy.needs` isolation precedent**: the `code-reviewer` package job is deliberately NOT in
  `deploy.needs` (`context/archive/2026-08-05-tool-loop-agent/plan.md:400-414`) — same rule for
  `review.yml` per requirements.
- **Action pinning convention**: the repo pins first-party actions by MAJOR TAG
  (`checkout@v5`, `setup-node@v5`, `cache@v5`, `wrangler-action@v4`), not SHA
  (`context/archive/2026-06-11-ci-wrangler-action-node24/change.md:13-20`). Requirements'
  SHA-pinning rule applies to genuinely third-party actions; the planned workflow likely needs
  only first-party ones → tag pinning stays consistent. Node setup precedent: hardcoded
  `node-version: 24` (accepted deviation, `2026-08-05-tool-loop-agent/reviews/impl-review-full.md:79`).
- **CLI pinning**: prefer `npx <devDependency>` over setup actions
  (`2026-06-09-testing-ci-gate/research.md:120,157`) — the review step should run the package via
  its own `npm ci` + `npm run review`, mirroring the existing `code-reviewer` job's
  working-directory pattern (`ci.yml:317-339`).
- **No precedent of CI writing to the GitHub API** (comments/labels) — all `gh` usage so far is
  human/agent-invoked locally (`context/foundation/github-issues.md:29-39,190-194`). The sticky
  comment + label mechanics are new ground; the label convention `gh label create --force`
  (idempotent) is documented and transfers to workflow-time or provisioning-time creation.

### C. GitHub-side state (inventoried live, 2026-08-07)

- **Labels**: `ai-cr:passed` / `ai-cr:failed` / `ai-cr:review` do NOT exist (present: bug,
  chore, roadmap, slice, status:*, north-star, …). Must be created — idempotent
  `gh label create --force` per the documented convention.
- **Secrets**: no `OPENROUTER_API_KEY` (present: Cloudflare/Supabase/Sentry set). ⚠️ Must be set
  by the user via the GitHub UI or their own terminal — a recorded incident shows `gh secret set`
  executed through the assistant's non-interactive shell writes an EMPTY secret.
- **Variables**: none exist; `OPENROUTER_MODEL` as an Actions variable is the natural
  cost-control knob (falls back to the package default when absent).
- **Workflow token defaults**: `default_workflow_permissions: read`,
  `can_approve_pull_request_reviews: false` — `review.yml` must request
  `pull-requests: write` explicitly at job level (matches requirements' least-privilege item).
- **No `.github/actions/` directory yet** — the composite action will create it.
- Squash-merge, PR-only master; single existing workflow `ci.yml`.

### D. Transferable mechanics from the `10x-impl-review-ci` reference template

(`.claude/skills/10x-impl-review-ci/references/workflow-template.yml` — local-only artifact;
patterns apply even though this change implements the SDK path, not Claude Code Action.)

- Fork block: `github.event.pull_request.head.repo.full_name == github.repository` (line 47)
- Per-PR concurrency: `group: impl-review-${{ github.event.pull_request.number }}`,
  `cancel-in-progress: true` (lines 48-50)
- Trigger set incl. `labeled` + a cheap guard step that skips the expensive model step on
  label-only events / bot commits (lines 80-102) — adapts to the `ai-cr:review` retry (guard on
  `github.event.label.name`, remove the label at run start so re-adding retriggers)
- `fetch-depth: 0` + three-dot `origin/BASE...HEAD` diff (lines 59-63) — the requirements' diff
  definition; matches GSC of shallow-checkout pitfalls
- Marker-based comment lifecycle: hidden HTML marker in every bot comment + post-new-then-
  delete-old with a `created_at` cutoff (skill SKILL.md Steps 8-9). For the requirements' sticky
  comment, the simpler variant is find-by-marker → `gh api PATCH` (update in place), falling back
  to create.
- Explicit job-level `permissions:` block with `permissions: {}` at workflow level (lines 36,
  52-57) — stricter than anything in `ci.yml`; matches requirements.

### E. Requirements ↔ reality deltas the plan must decide

| Requirement                         | Reality                            | Plan decision needed                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scores 1–10 per criterion + verdict | Package outputs findings only      | Additive `scorecardSchema` + pure `deriveVerdict`; decide whether the model emits scores directly (single call, scorecard in `Output.object`) or scores accompany findings in one combined schema |
| Six criteria as instructions        | Only in requirements.md            | Criteria text into `prompts.ts` (new scorecard instructions builder); keep lens mechanism intact                                                                                                  |
| `npm run review` in CI              | Only fixture demo exists           | New entry: diff from file/stdin + `PR_TITLE`/`PR_BODY` env; JSON to stdout/file; truncation caps applied in code (testable)                                                                       |
| Sticky comment + labels             | No CI GitHub-API precedent         | Composite action steps with `gh api` (marker upsert; `gh pr edit --add-label/--remove-label`); labels pre-created idempotently                                                                    |
| SHA-pin third-party actions         | Repo pins first-party by major tag | Likely zero third-party actions needed → convention holds; SHA rule kicks in only if one appears                                                                                                  |
| Secret present                      | Missing                            | **User provisioning step (UI)** before first run: `OPENROUTER_API_KEY`; optional `OPENROUTER_MODEL` variable                                                                                      |

## Code References

- `packages/code-reviewer/src/reviewer.ts` — `createReviewer`, `SourceProvider`, guardrails, `maxSteps`
- `packages/code-reviewer/src/schemas.ts` — `reviewResultSchema`, `reviewUnitSchema` (diff unit)
- `packages/code-reviewer/src/prompts.ts` — `buildInstructions`/`buildPrompt`, `<review-unit>` fencing
- `packages/code-reviewer/src/config.ts` — env resolution, `DEFAULT_MODEL`
- `packages/code-reviewer/src/demo.ts` — current (fixture-only) runnable entry
- `.github/workflows/ci.yml:14-16` — concurrency block; `:317-339` — `code-reviewer` job pattern (working-directory, npm cache on package lockfile)
- `.claude/skills/10x-impl-review-ci/references/workflow-template.yml` — reference guard/permission/concurrency patterns (local-only file)

## Architecture Insights

- The package was explicitly designed for this consumption: side-effect-free barrel import,
  factory-not-singleton, model override for cost control, diff unit with absolute-line semantics.
  The CI entry is a thin adapter, not a redesign.
- The repo's CI philosophy: secrets minimized per job, jobs isolated from deploy gating unless
  they protect the shipped app, everything cancellable except master. `review.yml` should read as
  a sibling following the same philosophy with one new property (a secret on a PR event) —
  handled by the fork block + same-repo predicate.
- Advisory-first is structurally cheap here: labels + sticky comment need only
  `pull-requests: write`; the hard gate (commit status / branch protection) is a later additive
  step, exactly like the reference template's verdict-status pattern.

## Historical Context (from prior changes)

- `AGENTS.md:84-89` — CI job inventory + concurrency decision (PR #72)
- `context/archive/2026-06-09-testing-ci-gate/plan.md:23-25,85-87` — job isolation for secrets;
  `deploy.needs` tradeoff record
- `context/archive/2026-08-05-tool-loop-agent/plan.md:400-414` — `code-reviewer` job rationale
  (the pattern `review.yml`'s package invocation should mirror); `reviews/impl-review-full.md:79`
  — node-version pinning deviation accepted
- `context/archive/2026-06-11-ci-wrangler-action-node24/change.md:13-20` — action-bump precedent,
  major-tag pinning convention
- `context/foundation/github-issues.md:190-194` — label conventions (`--force` idempotent
  creation); `context/archive/2026-07-17-skills-sync-check/plan.md:211` — outward-facing GitHub
  writes require explicit user confirmation (applies to provisioning steps, not to the workflow's
  own runtime writes, which this change's approval covers)
- `context/foundation/lessons.md:131` — CI-flake mitigation pattern (cache + retry) if the review
  job ever grows container dependencies (it should not)

## Related Research

- `context/archive/2026-06-09-testing-ci-gate/research.md` — CI job design research (env
  isolation, CLI pinning)
- `context/archive/2026-08-05-tool-loop-agent/` — the review-engine change this builds on (plan +
  4 triaged reviews)

## Open Questions

1. **Score emission**: one combined `Output.object` schema (scores + findings in a single model
   call) vs a second scoring pass over findings — cost favors combined; eval-ability favors
   combined too (single output to assert on). Plan should default to combined.
2. **Comment rendering location**: in the package entry (emits ready markdown) vs in the action
   (jq/bash over JSON). Package-side rendering is testable — lean that way.
3. **`ai-cr:review` retry UX**: remove-at-start (requirements) needs `labeled` in trigger types +
   a guard so ordinary `labeled` events (other labels) don't run the model.
4. **Where truncation happens**: entry point (testable, recommended) vs workflow shell.
5. **Provisioning sequencing**: labels can be created by me (gh, idempotent); the secret is a
   user-only step — the plan must place it as a manual prerequisite with verification (workflow
   skips gracefully when the secret is absent, so merge order is safe).
