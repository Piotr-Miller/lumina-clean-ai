# CI/CD PR Code Review Workflow — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`
> Requirements: `context/changes/ci-cd-code-review/requirements.md`

## What & Why

Every PR to `master` gets an automatic, advisory AI code review: a scorecard
(six named 1–10 criteria + verdict) posted as a sticky PR comment with
`ai-cr:passed`/`ai-cr:failed` labels. The review reuses the
`packages/code-reviewer` library end-to-end, so review quality later becomes
measurable and tunable (promptfoo) instead of vibes.

## Starting Point

The reviewer library (merged PR #111) provides the finder: diff in →
normalized findings out, with injection fencing and cost caps. The repo has
one workflow (`ci.yml`) with strong conventions; GitHub has no `ai-cr:*`
labels, no OpenRouter secret, no Actions variables yet.

## Desired End State

Open a PR → within one run a sticky scorecard comment + the right label
appear. Push again → the comment updates in place. Add `ai-cr:review` → it
re-runs. Provider hiccup → one targeted retry, then a red job with the cause
in the job summary and the last valid verdict left intact. Nothing ever
blocks a merge.

## Key Decisions Made

| Decision            | Choice                                                                                                     | Why (1 sentence)                                                                                                      | Source                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Review architecture | Two-pass: finder (findings) → judge (scores)                                                               | Cheap model reads the big diff; quality model makes the key decision on a short context                               | Plan Q&A (user)         |
| Judge constraints   | References finding IDs only, never creates findings; never sees the diff                                   | Judge assesses the weight of evidence, doesn't impersonate a second reviewer                                          | Plan Q&A (user)         |
| Scores shape        | Object with six NAMED criterion fields (+ justification + findingIds each)                                 | Positional arrays are fragile for models and evals alike                                                              | Plan Q&A (user)         |
| Verdict             | Model-owned: judge emits `verdict` + `verdictReason`; ≥4/avg≥6 only as rubric guidance                     | The judge weighs the evidence holistically; consistency gets measured by evals before any gating                      | Plan Q&A (user)         |
| Models              | `OPENROUTER_REVIEW_MODEL`=glm-4.6, `OPENROUTER_JUDGE_MODEL`=sonnet-5 (repo vars, explicit fallbacks)       | Cost scales with diff size on the cheap pass; quality where the decision is made; evals can test each pass separately | Plan Q&A (user)         |
| Failure handling    | One retry per failed pass (timeout/429/5xx only) → red job, cause in job summary, comment/labels untouched | Absorbs transients without silent degradation or doubling full-pipeline cost                                          | Plan Q&A (user)         |
| PR comment          | Sticky (marker upsert): verdict + score table + top ≤5 findings                                            | Scannable and actionable without opening logs                                                                         | Plan Q&A                |
| Rubric signal       | Finder gains `testing`/`documentation` categories + instructions to flag gaps                              | The judge can only score what the finder surfaces                                                                     | Plan                    |
| Security            | Same-repo PRs only, draft/bot skip, `permissions: contents:read + pull-requests:write`, per-PR concurrency | First secret-bearing PR-triggered job in this repo — fork block is load-bearing                                       | Requirements + Research |
| Secret provisioning | User sets `OPENROUTER_API_KEY` via GitHub UI (manual gate)                                                 | Recorded incident: agent-shell `gh secret set` writes an empty secret                                                 | Research                |

## Scope

**In scope:** package additions (judge, scorecard, pipeline, renderer, retry,
CLI entry `npm run review`), composite action `.github/actions/ai-review`,
`.github/workflows/review.yml`, labels + model variables provisioning, live
E2E incl. a deliberately flawed PR.

**Out of scope:** merge gating, promptfoo (next change), Claude Code Action
path, inline per-line comments, fork-PR reviews, any finder-loop redesign.

## Architecture / Approach

`review.yml` (guards, diff computation) → composite action (`npm ci`,
`npm run review`, sticky upsert, label flip) → package pipeline: finder
(glm, full diff) → normalize + merge + assign `F1..Fn` → judge (sonnet;
findings + rubric + PR metadata → scores + verdict + verdictReason) →
`review.json` + `comment.md`.
Everything model-adjacent is package code with unit tests; YAML is thin glue.

## Phases at a Glance

| Phase                      | What it delivers                                                | Key risk                                                                                      |
| -------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. Package core            | Judge, scorecard, pipeline, CLI entry + tests (mergeable alone) | Judge schema compliance on sonnet (mitigated: named fields, validation strips bad refs)       |
| 2. Action + workflow       | `ai-review` composite action + `review.yml` with all guards     | Guard logic errors (`labeled` event burn, fork leak) — mitigated by read-through checklist    |
| 3. Provisioning + live E2E | Labels, model vars, user-set secret; verified on real PRs       | Secret is a user-only step; live behavior only testable post-merge-ish on the change's own PR |

**Prerequisites:** none for Phases 1–2; Phase 3 needs the user to set
`OPENROUTER_API_KEY` in the GitHub UI.
**Estimated effort:** ~2 sessions; Phase 1 is the bulk.

## Open Risks & Assumptions

- Judge scoring quality/consistency is unmeasured until `code-review-evals` —
  the schema is designed so that change can test finder, judge, and pipeline
  separately.
- The finder must surface test/doc gaps for those criteria to mean anything —
  new categories + instructions address it, evals will quantify it.
- First live runs happen on this change's own PR — expect one tuning loop on
  comment formatting.

## Success Criteria (Summary)

- A PR author sees a scorecard comment + label within one run, updated in
  place on every push, re-runnable via `ai-cr:review`.
- A deliberately flawed PR gets low targeted scores and `ai-cr:failed`;
  merges are never blocked.
- Technical failures are loud (red job + cause in summary) but never destroy
  the last valid review.
