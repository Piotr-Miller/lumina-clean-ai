# First live run — AI review weekly report

Evidence for Phase 4 of [`plan.md`](plan.md) (rows 4.1 and 4.2). URLs, numbers and conclusions only; no PR text.

- **Workflow revision**: `master` at `eecffa47151f57d2a8e22c0f693f31ba991f42a7`, the rebase-merge of PR
  [#305](https://github.com/Piotr-Miller/lumina-clean-ai/pull/305). Master CI run
  [40020391022](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/40020391022) passed, deploy included,
  before the first dispatch.
- **Before the first dispatch** (2026-10-23): labels `ai-review-report` and `ai-review-alarm` did not exist, and no
  issue titled "AI review weekly report" existed in any state.

## 4.1 — First dispatch for 2026-W43

- **Run**: [40021370975](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/40021370975),
  `workflow_dispatch` with `week=2026-W43`, conclusion `success`. Every step succeeded, including
  `actions/checkout@v5`, `actions/setup-node@v5` and `actions/upload-artifact@v7`.
- **Created**: labels `ai-review-report` and `ai-review-alarm`; tracking issue
  [#306](https://github.com/Piotr-Miller/lumina-clean-ai/issues/306) "AI review weekly report", authored by
  `github-actions`, labelled `ai-review-report`; the week comment
  [6374372819](https://github.com/Piotr-Miller/lumina-clean-ai/issues/306#issuecomment-6374372819), authored by
  `github-actions[bot]`, carrying `<!-- ai-review-weekly:2026-W43 -->`.
- **Run log summary**: `week=2026-W43 workflows=12 known_spend=$0.601783 (lower bound) coverage_gaps=2 alarm=not fired`.
- **Alarm**: not fired, so no `ai-review-alarm` issue was opened.

## 4.2 — Second dispatch for the same week

- **Run**: [40021649177](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/40021649177), same input,
  conclusion `success`, with the same summary line pointing at the same comment.
- **Idempotency**: issue #306 still has exactly **one** comment, the same ID 6374372819. Its `updated_at` moved from
  `2026-10-23T20:44:28Z` to `2026-10-23T20:46:27Z`, so it was PATCHed, not duplicated. Exactly **one** issue carries
  `ai-review-report` and **zero** carry `ai-review-alarm`.

## Figures as published (observed as of 2026-10-23T20:46:11Z, partial week)

| Measure                    | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Workflow IDs in the cohort | 12: 5 reviewed, 2 no-review, 1 unreported, 4 not-run               |
| Known spend                | ≥ $0.601783 (gaps: 1 unreported, 1 partial, 1 incomplete attempts) |
| By pass                    | finder ≥ $0.230161 · judge ≥ $0.142770 · impl ≥ $0.228852          |
| Coverage-gap workflows     | 2 (alarm threshold 5)                                              |
| Unreported                 | run 40019215940, `cancelled` (#305's first push, superseded)       |
| Unobserved attempts        | run 40014914598, `run_attempt` 2, 1 earlier attempt unobserved     |
| PR association             | every run mapped to exactly one PR                                 |
| Owner reactions            | #300, #304, #305 unrated                                           |

The dry run of Phase 3 counted 10 workflow IDs; the two added since are #305's own review runs, and run 40014914598
(#304) has since been re-run, which moved it from unreported to reviewed with an unobserved first attempt.

## Baseline check

In the second run's `report.json` (artifact `ai-review-weekly-report`), run 39653424585 is mapped to PR #300 with
known cost **0.33304023**, rendered $0.333040, not partial — matching
`context/archive/2026-10-21-ai-review-reenable/probe.md` ($0.333040). PR #300's row shows ≥ $0.482761 over its 3
runs.

## Not covered here

- **4.3**: the owner pins issue #306 (a one-time UI action).
- **4.4**: the first scheduled run, Mon 2026-10-26 06:00 UTC, posting without a dispatch. The W43 comment already
  exists, so that run should PATCH comment 6374372819 with the completed week rather than add a new one.
