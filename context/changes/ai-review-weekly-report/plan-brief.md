# AI Review Weekly Report — Plan Brief

> Full plan: `context/changes/ai-review-weekly-report/plan.md`

## What & Why

The advisory `ai-review` was switched back on on 2026-10-21. Nothing yet watches what it costs, or whether its comments are worth reading. This plan adds a scheduled, $0 weekly report that answers both questions. Spend comes from each run's `review.json`. Quality comes from the owner's 👍/👎 on the sticky review comment. The report is posted as a comment on one tracking issue, and a separate alarm issue opens when a week looks expensive or blind.

## Starting Point

Each review run uploads `review.json` (with per-pass `cost`, verdict and findings) as the 14-day `ai-review-output` artifact. Failed and cancelled runs upload nothing, so their spend is invisible. In W39, 25 runs were like that. Each PR has one sticky comment, which every re-run PATCHes in place. A reaction therefore stays on the comment after later runs rewrite the text it judged. No workflow in the repo runs on a schedule today.

## Desired End State

Every Monday at 06:00 UTC, the "AI review weekly report" issue gets one comment for workflow IDs created in the previous ISO week, re-runs update that same comment, and nothing is duplicated. The comment shows:

- observed spend for that workflow-created cohort, its observation timestamp and `≥ $X` when spend or attempt coverage is incomplete;
- observed provider-reported spend split by finder, judge and impl, distinguishing not-run passes from unknown costs and explaining that pass sums can omit individual request costs;
- a per-PR table with runs, spend, verdict, label, findings and the owner's reaction, with stale reactions flagged;
- the verdict and label mix;
- every run whose spend could not be seen, with its reason;
- earlier unobserved attempts and the distinct coverage-gap workflow count;
- every run whose PR could not be resolved, with its reason and explicitly incomplete label/reaction coverage.

An over-threshold week also gets its own alarm issue. A failure is loud and readable: the job turns red only when it cannot list runs or cannot publish, and the message names the call and what to do next.

## Key Decisions Made

| Decision           | Choice                                                                                                                                                                                                                                        | Why (1 sentence)                                                                                                                 | Source                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Reaction semantics | Current state per PR at report time. A rating is 👍, 👎, mixed or unrated, and is flagged **stale** when given before the latest re-run rewrite.                                                                                              | One honest signal per PR, and you can see which ones judged older text.                                                          | Plan (owner)                  |
| Spend threshold    | `$10`/week, overridable through the repo variable `AI_REVIEW_WEEKLY_ALARM_USD`. The comparison is strict `>`.                                                                                                                                 | It sits above a normal week (~$2–6) and below the busiest one observed (~$20).                                                   | Plan (owner)                  |
| Unreported runs    | The alarm also fires on ≥ 5 distinct workflow IDs with an unreadable review or incomplete/unknown attempt coverage, counting their union once per ID (AI_REVIEW_WEEKLY_ALARM_UNREPORTED).                                                     | Missing review output and earlier unobserved attempts must both be visible without double-counting one workflow.                 | Owner (F4 Fix A, 2026-10-22)  |
| Absent cost        | A no-plan/skipped impl pass is not run; an executed expected pass without cost is unknown/partial, not free. Sum only reported numeric costs and label them observed provider-reported; present totals do not prove per-request completeness. | Distinguishes pass applicability from missing spend without claiming a complete bill.                                            | Owner (F5 triage, 2026-10-22) |
| Week               | ISO week by original workflow created_at. One observed artifact per workflow ID; later attempts remain in the same cohort. Show observed as of and mark unfinished weeks partial.                                                             | A bounded observed-cost snapshot of workflows created in that week.                                                              | Owner (F4 Fix A, 2026-10-22)  |
| Code location      | In `packages/code-reviewer/src/weekly-report*.ts`, importing `PipelineResult`.                                                                                                                                                                | A schema rename breaks typecheck instead of silently reading as "unreported", and the existing `code-reviewer` CI job covers it. | Plan                          |
| Finding totals     | Totals count once per workflow ID. The per-PR row uses the reviewed workflow with greatest original created_at, then greatest numeric run ID for ties; verdict and findings share that selected snapshot.                                     | Stable selection independent of API/input ordering, consistent with the workflow-created cohort.                                 | Owner (F6 triage, 2026-10-22) |
| PR association     | Resolve a unique repository/ref-matching PR from the run or the commit API, including closed PRs; never require the current head SHA to equal a historical run SHA. Unmapped runs retain weekly data and show incomplete PR coverage.         | Real run responses can have empty pull_requests; ambiguity must not hide known spend or invent a PR.                             | Owner (F2 triage, 2026-10-21) |
| Untrusted data     | The report renders numbers, enums, links and validated model ids only. It never renders finding text, titles or plan paths.                                                                                                                   | `review.json` is derived from PR-controlled content.                                                                             | Plan                          |
| Pinning            | The owner pins the tracking issue once, by hand.                                                                                                                                                                                              | Pinning the issue automatically is not part of this plan; the job only finds or creates the issue by label.                      | Plan (assumption)             |

## Scope

**In scope:**

- a pure report core with unit tests on degenerate data;
- a `gh`-backed collector and an idempotent publisher;
- `npm run weekly-report` with `--dry-run`;
- `.github/workflows/ai-review-weekly-report.yml` (schedule + dispatch, least privilege);
- the retention-dependency comment in `review.yml`;
- an `AGENTS.md` CI paragraph;
- one live dispatch, recorded in `first-run.md`.

**Out of scope:**

- per-finding feedback (no change to `render.ts` or `review.yml` behaviour);
- recovering the cost of failed runs from logs or the OpenRouter API;
- any gate;
- backfill beyond 14 days;
- automatic pinning;
- reconstructing per-attempt costs or automatically refreshing older cohorts.

## Architecture / Approach

The code has four layers, which follow the package's `review-pr.ts` → `cli.ts` pattern:

1. pure **week/classify/aggregate/alarm** functions;
2. pure **render**, which produces markdown with the `<!-- ai-review-weekly:YYYY-Www -->` and `<!-- ai-review-alarm:YYYY-Www -->` markers;
3. **github** IO over an injected `gh` runner, covering runs, artifacts, sticky comments, reactions and labels, plus the upserts;
4. a **CLI** with the 0/1 exit contract, behind a thin process shell.

The workflow only runs `npm ci` and `npm run weekly-report`, with `GITHUB_TOKEN` (`actions: read`, `issues: write`). Its report command builds a Bash argument array: only `DRY_RUN=true` adds `--dry-run`; `false`, empty and absent values publish. A package test executes the actual YAML command with a stub npm, including optional week arguments and paths with spaces.

## Phases at a Glance

| Phase                 | What it delivers                                                                                              | Key risk                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Report core        | Typed aggregation, reaction state, alarm decision and markdown, tested on degenerate data                     | An absent cost miscounted as $0, or untrusted text leaking into the output |
| 2. GitHub IO + CLI    | A collector, an idempotent publisher and `npm run weekly-report --dry-run`                                    | Sticky-comment spoofing, or a duplicate comment on re-run                  |
| 3. Workflow + dry run | A scheduled workflow, pointers, and a read-only W43 dry run checked against probe run 39653424585 ($0.333040) | The API's date filter granularity, handled by filtering in code            |
| 4. Live acceptance    | First dispatch, pinning, an idempotent re-run, and the first scheduled Monday                                 | Needs the merge first: dispatching requires the workflow on `master`       |

**Prerequisites:** `gh` authenticated locally for the Phase 3 dry run, and the PR merged before Phase 4.
**Estimated effort:** ~2 sessions across 4 phases. Phases 1–2 are most of the code.

## Open Risks & Assumptions

- Missing impl telemetry is expected for no-plan/skipped passes; missing cost on an executed pass is unknown/partial. Present pass totals can omit request costs, so amounts are explicitly provider-reported observations, not an assertion of a complete bill. Detecting those omitted request costs needs upstream telemetry beyond this change.
- One artifact does not cover earlier Actions attempts. A workflow with multiple attempts (or unknown attempt metadata) keeps observed spend as a lower bound and contributes once to the coverage alarm. Multiple same-name artifacts are reported as unreadable rather than silently selected. A later report may update an old cohort; this is not a calendar-week billing ledger.
- GitHub disables scheduled workflows after 60 days with no repository activity. This is documented, not guarded against.
- Only a successful run with positive docs-only skip evidence from that same attempt's job steps is $0. Missing artifacts without this proof are unreported (`artifact missing` or `skip evidence unavailable`), including expired/deleted artifacts that GitHub no longer lists.
- Lowering `review.yml`'s `retention-days` below 8 would make review artifacts disappear before collection, producing unreported runs. A comment there records the dependency.
- Run 39653424585 has no embedded PR association; the commit API maps it to closed PR #300 despite its advanced current head SHA. Runs with no unique repository/ref match keep their weekly data, but per-PR label/reaction coverage is incomplete and reported as such.
- Reactions grade the whole sticky comment, not individual findings, so the quality proxy stays coarse.

## Success Criteria (Summary)

- A weekly comment appears on the pinned issue with no manual step. Its observed provider-reported spend figures match the run logs without claiming a complete bill, and re-runs do not duplicate it.
- A cohort with more than $10 of known spend, or ≥ 5 distinct workflow IDs with unreadable review output or incomplete/unknown attempt coverage, opens one alarm issue that says why.
- Runs with invisible spend and stale reactions are shown as such, never as $0 or as a fresh vote.
