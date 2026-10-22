# AI Review Weekly Report Implementation Plan

## Overview

A scheduled, $0 GitHub Actions job that reports on the advisory `ai-review` once a week. For workflow runs created in the previous ISO week it shows observed spend per workflow ID, per PR and for that cohort (finder / judge / impl), the verdict and `ai-cr:*` label mix, finding counts, and the owner's 👍/👎 on each PR's sticky review comment as the quality proxy. The report goes as one comment per week on a single "AI review weekly report" tracking issue. A cohort that crosses the spend threshold, or has too many distinct workflow IDs with unreadable review output or unobserved attempts, also opens a separate alarm issue. It is advisory only: no gate, no OpenRouter call, no secret beyond `GITHUB_TOKEN`. Owner decision of 2026-10-21, made after `ai-review-reenable` turned the review back on.

## Current State Analysis

- **Where the data lives.** `.github/workflows/review.yml` uploads `packages/code-reviewer/.review-out/` as the `ai-review-output` artifact, with `retention-days: 14`, `if-no-files-found: ignore`, and only when `!cancelled() && SKIP_REVIEW != '1'` (`.github/workflows/review.yml`, last step). A technical failure produces no output directory, so it uploads nothing. A docs-only PR takes `SKIP_REVIEW=1`: the run succeeds, there is no artifact, and no money is spent. Origin `code`. Missing artifact alone proves neither a skip nor $0. Since 2026-09-24, GitHub omits expired artifacts from REST responses ([platform changelog](https://github.blog/changelog/2026-09-24-expired-github-actions-artifacts-no-longer-shown-in-ui-and-api/)). A successful run without an artifact needs positive skip evidence from that same attempt's job steps; otherwise it is unreported (Definitions).
- **What `review.json` carries.** It is `PipelineResult` (`packages/code-reviewer/src/schemas.ts:227-283`), and the fields that matter here are these. `verdict` is `passed | failed`. `findings[]` carry `severity` `critical | major | minor | nit` (`schemas.ts:9`). `preDedupFindingCount` is the finder's count before dedup. `models.{finder,judge}` names the models. `finderTelemetry.cost`, `judgeTelemetry.cost` and `implReviewTelemetry.cost` each hold one pass's spend. `implReview` has the shape `reviewed` (with `verdict` `APPROVED | NEEDS_ATTENTION | REJECTED` and `findings`), `failed` or `skipped`, and is absent when the run had no plan. **An executed pass with no provider-reported cost has an absent cost field, not a fabricated 0** (`schemas.ts:190-199`, `:286-298`). Impl telemetry is also legitimately absent when no plan exists or the pass was gated off (`pipeline.ts:684,688-695`). Conversely, the accumulators sum present request costs and ignore undefined ones (`pipeline.ts:547-550,569-576,704-713`), so a present pass total does not prove every request reported cost. Origin `code`; F5 triage (2026-10-22) distinguishes not-run, unknown pass cost and observed provider-reported totals without promising billing completeness.
- **Run-to-PR identity is not supplied reliably.** The 25 runs checked during plan review all had `pull_requests: []`, including baseline run 39653424585 (`head_sha=3516d86bb773e5215424c917d52e6ce8d45924a4`, `head_branch=chore/ai-review-reenable`). A read-only `GET repos/Piotr-Miller/lumina-clean-ai/commits/3516d86bb773e5215424c917d52e6ce8d45924a4/pulls` returned closed PR #300 with matching repository and head/base refs; that PR's current head SHA is already different. `PipelineResult` has no PR number. Therefore the collector needs a commit-associated PR fallback and must not require the current PR head SHA to equal a historical run's SHA. Verified 2026-10-21; F2 triage accepted.
- **One sticky comment per PR.** The composite action upserts one comment per PR: it is authored by `github-actions[bot]`, carries the marker `<!-- ai-cr:sticky -->`, and is PATCHed in place on every re-run (`.github/actions/ai-review/action.yml`, "Upsert sticky comment"; `packages/code-reviewer/src/render.ts:15`). Reactions survive a PATCH. That makes the owner's 👍/👎 **one signal per PR, about the whole comment**, and an old reaction can outlive the text it judged.
- **Volume and cost scale.** Non-skipped runs per ISO week, measured 2026-10-21 with `gh run list --workflow review.yml`: W33 60, W34 34, W35 31, W36 31, W37 28, W38 7, W39 49 (25 of them `failure`), W43 5 so far. One full run on PR #300 cost $0.333040: finder $0.076460, judge $0.027728, impl $0.228852 (`context/archive/2026-10-21-ai-review-reenable/probe.md`). A busy week therefore costs roughly $6–20. W39 had 25 failed runs, and their spend is invisible to an artifact reader.
- **Actions attempts are separate process invocations.** The runs API exposes one workflow ID and its `run_attempt`; live IDs 35917150627, 34277863262 and 31707888975 have multiple attempts. Telemetry is initialized afresh per process (`pipeline.ts:537,569,699`), so one review artifact cannot prove the spend of earlier Actions attempts. F4 triage (2026-10-22) chooses one workflow ID per accounting unit, observed artifact spend only, explicit attempt gaps and a coverage alarm over distinct affected workflow IDs.
- **Package conventions to follow.** `packages/code-reviewer` is outside the root tsc/eslint/vitest graphs. It has its own `tsconfig.json` (`include: ["src", ...]`), its own `eslint.config.js` (strictTypeChecked over `src/**/*.ts`) and its own `vitest.config.ts` (`src/**/*.test.ts`), and the `code-reviewer` CI job gates all three (AGENTS.md § CI). Its process entry points are thin shells over a tested core with injected IO: `src/review-pr.ts` drives `src/cli.ts` through `CliIo`. Exit 0 means data was produced, even unfavourable data, and exit 1 means a technical failure.
- **No precedent for a scheduled workflow.** `.github/workflows/` holds only `ci.yml` and `review.yml`, and neither runs on a `schedule:`. GitHub disables scheduled workflows in a public repository after 60 days with no repository activity. That is a platform fact, and it gets documented here.
- **Labels today**: `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` and the roadmap/status set. Neither `ai-review-report` nor `ai-review-alarm` exists yet (`gh label list`, 2026-10-21).
- **Lessons applied** (7 of 39 ledger entries were read whole; 4 shape this plan): _a best-effort integration that degrades silently_, _a guard metric that only exists on success_, _a check that cannot say what it found_ and _writing a fact leaves pointers stale_. The rest concern the Supabase and app runtime, or eval methodology this change does not touch.

### Carried from predecessor

none — no Predecessor line

## Definitions

Requirements ledger after the 2026-10-21 answers. Degenerate walk-through dataset used below: week 2026-W43. PR #301 has run A on Tue (reviewed, $0.10, finder+judge+impl costs all present; the owner reacts 👍 Tue) and run B on Thu (reviewed, finder cost absent, judge $0.03; the comment is PATCHed Thu). PR #302 has run C, `failure`, with no artifact. PR #303 has run D, `success`, with no artifact and confirmed docs-only skip evidence from its job steps. PR #304 has run E, `success`, whose paid review artifact expired and is now absent from the API response; its job steps show that AI review ran. Run F has conclusion `skipped` (an `ai-cr:passed` label event). Run G was created Sun 23:59:59 UTC, and run H Mon 00:00:00 UTC of the next week. The PR-resolution cases are independent of the A–H cost fixture. For PR resolution, A has an empty `pull_requests` array and maps through the commit API to closed PR #301 even though its current head SHA has advanced; B has duplicate associations to #301, which count once. Run I has a readable $0.04 review but no matching PR; run J has two distinct matching PR candidates. I and J keep their weekly spend but have unavailable PR association. Independent attempt fixtures: K has one workflow ID, `run_attempt=3`, and one readable $0.20 artifact; it contributes one reviewed run, observed $0.20, two unobserved earlier attempts and one coverage-gap workflow. L has `run_attempt=2` and no readable artifact; it contributes one coverage-gap workflow, not two. M is created Sun 23:59:59Z in W43 and re-run on Mon in W44; a later W43 report still owns M and its observed snapshot. A latest skipped/no-review attempt does not prove earlier attempts were free. Independent latest-selection fixture: PR #305 has N (workflow ID 9, passed, one finding) and O (ID 10, failed, two findings), both created 2026-10-21T12:00:00Z. O supplies the row in either input order; a workflow with a later created_at wins even if its ID is smaller.

| Term                  | Decided meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Origin                                                                         | On degenerate data                                                                                                                                                                                  | Verified by                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Week                  | ISO week `YYYY-Www`, `[Mon 00:00:00Z, next Mon 00:00:00Z)`. Each workflow ID belongs to the week of its original `created_at`, including all later observed attempts. The report is an observed-cost snapshot of workflows created in that week, not a ledger of charges incurred during that calendar week. Show the collection timestamp (`observed as of`) even for a completed week. A re-run of the report may change historical figures; automatic refresh of older weeks is out of scope. Default: last complete week. An unfinished requested week is partial with its cut-off time.                                                                                                                                                                                                                                                                                                                                                                                 | user (F4 Fix A triage, 2026-10-22; retains original created_at rule)           | G is in W43, H in W44. M remains in W43 after its Monday attempt. ISO year rollover remains unchanged.                                                                                              | 1.2 `week window` tests                                      |
| Run class             | Each distinct `review.yml` workflow ID in the cohort has one class for its observed review snapshot. **reviewed**: a readable `review.json` exists. **no-review**: the run succeeded, no artifact exists, and the same attempt's successful `ai-review` job has a successful `Compute PR diff (three-dot vs merge-base)` step and a skipped `AI review` step, positively confirming the docs-only path, $0. **unreported**: no readable `review.json` for any other reason: `failure`/`cancelled`/`timed_out`, `artifact missing`, `artifact unreadable`, `skip evidence unavailable`, `still running`. Missing or ambiguous step evidence never proves $0. **not-run**: conclusion `skipped`, meaning the observed attempt's job-level guard held, with no observed current-attempt spend. The $0 for no-review/not-run applies only to that observed attempt; unobserved earlier attempts still make the workflow total a lower bound and count toward the coverage alarm. | user (alarm answer 2026-10-21; F1 triage: $0 requires positive skip evidence)  | A and B are reviewed, C is unreported (failure), D is no-review (confirmed skip), E is unreported (artifact missing), F is not-run.                                                                 | 1.2 `classifyRun` tests                                      |
| Run accounting        | Deduplicate by workflow ID; attempts do not add run, verdict or finding counts. Retain one readable artifact snapshot at most, never sum snapshots from different attempts. A valid run_attempt=n exposes max(n-1,0) earlier unobserved attempts. Mark workflows with n>1 as having an attempt gap even if their observed artifact is readable or the observed attempt skipped review. Missing/non-positive/non-integer run_attempt is unknown attempt coverage, never assumed 1. Report unobserved attempt counts separately from run counts; known spend remains usable but totals with a gap show ≥.                                                                                                                                                                                                                                                                                                                                                                      | user (F4 Fix A triage, 2026-10-22)                                             | K is one reviewed workflow with ≥ $0.20, two unobserved attempts and one alarm contributor; L is one contributor despite both failure and an attempt gap.                                           | Phase 1 accounting/aggregation tests; Phase 2 metadata tests |
| Run cost              | Sum the numeric cost fields present on finderTelemetry, judgeTelemetry and implReviewTelemetry as observed provider-reported spend. Finder and judge are expected for a reviewed artifact: missing telemetry or cost makes that pass unknown and artifact partial. Impl is not run when implReview is absent (no plan) or status skipped; missing impl telemetry in those states does not make the artifact partial. Impl status reviewed/failed expects cost: absent telemetry/cost is unknown and partial. Preserve explicitly reported 0 as a known value; never substitute 0 for an executed pass's missing cost. partial means a detected missing pass cost, not proof of complete per-request reporting when false. Numeric reported costs remain in the sum; contradictory pass/telemetry facts retain observed cost and are marked partial rather than silently discarded.                                                                                           | user (F5 triage, 2026-10-22; producer states verified in pipeline.ts)          | B keeps observed $0.03 and is partial. Finder/judge with known costs plus no-plan/skipped impl is not partial solely for missing impl telemetry. Reviewed/failed impl with missing cost is partial. | 1.2 `runCost` tests                                          |
| Weekly / per-PR spend | Sum at most one observed artifact cost per distinct workflow ID created in the selected week, or per mapped PR in that cohort. Label every amount as observed provider-reported cost. Show ≥ $X when a counted workflow is unreported, has detected missing pass costs/contradictory telemetry or has incomplete/unknown attempt coverage; otherwise show $X reported. The latter means no detected gaps, not a complete bill: a present pass sum cannot prove all requests reported cost. Keep the separate provider/request-completeness caveat in every report.                                                                                                                                                                                                                                                                                                                                                                                                           | user (original aggregation; F4 and F5 triage, 2026-10-22)                      | Week known spend is $0.13 and is shown `≥ $0.13`, with 2 unreported and 1 partial. #301 is `≥ $0.13`. #302 is `unknown`.                                                                            | 1.2 aggregation tests, 1.3 render tests                      |
| Verdict / label mix   | **Verdict mix** is counted per reviewed run: `passed`/`failed`, plus an impl mix of `APPROVED`/`NEEDS_ATTENTION`/`REJECTED`/`failed`/`skipped`/`no plan`. **Label mix** is counted per PR with at least one non-not-run run, using that PR's current `ai-cr:passed`/`ai-cr:failed`/none label at report time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | user (change.md) + plan assumption on per-run vs per-PR                        | #301 adds 2 runs to the verdict mix and 1 PR to the label mix. #303 (docs-only) adds to the label mix with whatever label it carries.                                                               | 1.2, 2.2 tests                                               |
| Finding counts        | Per reviewed workflow ID: findings.length by severity, preDedupFindingCount and impl finding count. Cohort totals sum once per distinct workflow ID. For each mapped PR, latest means the reviewed workflow in the selected cohort with the greatest original created_at instant; ties select the greatest numeric workflow run ID. Input/API order never affects selection. All latest-verdict/latest-findings fields use that same selected snapshot; later attempt timestamps do not reorder workflow creation.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | user (F6 triage, 2026-10-22; F4 workflow-ID unit)                              | #301 totals include A and B, and its row shows B. Independent tied fixtures N (ID 9) and O (ID 10) always select O, even with reversed input; numeric, not lexical ID ordering.                     | 1.2 tests                                                    |
| PR association        | Each run has one mapped PR number or an unavailable association (`missing`, `ambiguous`, `lookup failed`). Use the collector's repository/ref matching rules and deduplicate candidates by PR number. A current PR head SHA need not equal the historical run SHA. Unmapped runs retain all usable weekly spend, run/verdict/finding totals and their existing run class; they appear in a separate run-linked coverage list and are excluded from per-PR rows, labels and reactions. Label/reaction coverage is marked incomplete when an eligible run cannot be mapped; association failure alone is not missing spend and does not change the spend alarm.                                                                                                                                                                                                                                                                                                                | user (F2 triage, 2026-10-21)                                                   | A resolves to closed #301 despite an advanced head SHA; B maps once. I and J retain known weekly spend and show unavailable association, without guessed PR rows.                                   | Phase 1 aggregation/render tests; Phase 2 collector tests    |
| Owner                 | `github.repository_owner` (`Piotr-Miller`). Reactions from anyone else are ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | user (change.md: "the owner's 👍/👎")                                          | A 👍 from another account on #301 is not counted.                                                                                                                                                   | 2.2 reactions test                                           |
| Owner reaction        | For each PR with at least one reviewed run in the week: the owner's `+1`/`-1` reactions on that PR's sticky comment (`github-actions[bot]`, contains `<!-- ai-cr:sticky -->`), as they stand at report time. The state is 👍, 👎, **mixed** (both) or **unrated** (neither). The rating is **stale** when every counted owner reaction was given before the comment's `updated_at`, the last re-run rewrite. A PR with no sticky comment is shown as `no comment`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | user (answer 2026-10-21: "current state, flag stale")                          | #301 shows 👍 stale, because it was given Tue and the comment was PATCHed Thu. #302 has no reviewed run, so it has no reaction row.                                                                 | 1.2 `reactionState` tests, 2.2                               |
| Alarm                 | Fires when known cohort spend > AI_REVIEW_WEEKLY_ALARM_USD (default 10, strictly greater), or the number of distinct workflow IDs in the union {class unreported} ∪ {attempt coverage incomplete/unknown} ≥ AI_REVIEW_WEEKLY_ALARM_UNREPORTED (default 5). Count each ID once even when both conditions apply. Keep the existing variable name for compatibility; its meaning now includes attempt gaps. Preserve and display class-unreported count separately from coverage-gap workflow count. A readable reviewed run or an observed no-review/not-run attempt can therefore trigger the coverage alarm through earlier unobserved attempts. Invalid/non-numeric or negative thresholds use defaults with a warning naming the variable and rejected value.                                                                                                                                                                                                              | user (original thresholds; F4 Fix A triage expands coverage count, 2026-10-22) | Exactly $10 does not fire; $10.01 does. Five affected workflow IDs fire, including five reviewed workflows with unobserved earlier attempts. L counts once; four affected IDs do not fire.          | 1.2 `decideAlarm` tests                                      |
| Idempotency           | There is one report comment per week on the tracking issue, found by the marker `<!-- ai-review-weekly:YYYY-Www -->` on a `github-actions[bot]` comment. A re-run PATCHes it. There is one alarm issue per week, found by `<!-- ai-review-alarm:YYYY-Www -->` in its body on a `ai-review-alarm`-labelled issue in any state. A re-run PATCHes the body and never reopens an issue the owner closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | plan assumption (stated in-session)                                            | Dispatching the job twice for W43 still leaves exactly one W43 comment and at most one W43 alarm issue.                                                                                             | 2.2 publisher tests, 4.2                                     |

## Desired End State

Every Monday at 06:00 UTC, `.github/workflows/ai-review-weekly-report.yml` posts (or updates) a comment headed `AI review — 2026-Www` on the open `ai-review-report` issue. The comment contains:

- a header stating that the cohort is workflow IDs created during the selected week, with its `observed as of` timestamp, known spend (`≥ $X` when artifact spend or attempt coverage is incomplete), distinct workflow/run-class counts and alarm status;
- a per-pass observed provider-reported spend split (finder / judge / impl), distinguishing `not run` from unknown cost and carrying a fixed per-request reporting caveat;
- a per-PR table: PR number, runs, known spend, latest verdict, current label, finding counts of the same latest selected snapshot, owner reaction (with `stale`); select that snapshot by greatest original created_at and then greatest numeric workflow run ID within the cohort;
- the verdict, impl-verdict and label mixes;
- an "unreported runs" list, one line per workflow ID: run link, conclusion, reason;
- an attempt-coverage section showing affected workflow links, observed `run_attempt`, the number of earlier unobserved attempts (or unknown metadata), and the distinct coverage-gap workflow count used by the alarm;
- a separate PR-association coverage section naming each unmapped run by link and enum reason, with incomplete label/reaction coverage stated explicitly;
- any threshold-variable warnings.

When the alarm fires, a separate `ai-review-alarm` issue for that week exists, links back to the report comment, and names its trigger. `workflow_dispatch` re-runs any week (input `week`, optional `dry-run`). The job fails red, with a message naming the failing call and what to do next, only when it cannot list runs or cannot publish. A single unreadable artifact is reported in the comment and does not fail the job.

Verification: unit tests in the package, a local `--dry-run` against the live repository, and one post-merge dispatch whose figures are checked against the probe run 39653424585 ($0.333040).

### Key Discoveries:

- `PipelineResult` cost fields are optional and absent-not-zero: `packages/code-reviewer/src/schemas.ts:190-199`, `:286-298`.
- Sticky-comment identity predicate (`github-actions[bot]` + marker) to reuse verbatim: `.github/actions/ai-review/action.yml` "Upsert sticky comment".
- Thin-shell + tested-core pattern with injected IO and a 0/1 exit contract: `packages/code-reviewer/src/review-pr.ts`, `src/cli.ts`.
- The artifact upload's skip conditions decide which runs have no artifact: `.github/workflows/review.yml`, "Upload review output artifact".

## What We're NOT Doing

- **Per-finding feedback.** The sticky comment stays one comment, and `render.ts` and `review.yml` are not changed. A 👍/👎 grades the whole comment.
- **Recovering the spend of failed or cancelled runs** by parsing Actions logs or calling OpenRouter's usage API. Such runs are counted as unreported, and the alarm covers them through the unreported threshold.
- **Any gate.** The workflow is not a required check and is not in `deploy.needs`, and a fired alarm blocks nothing.
- **Backfilling** weeks older than artifact retention. Without a readable artifact or positive skip evidence, their runs are unreported (`artifact missing` or `skip evidence unavailable`). The collector does not infer expiration from absence, and this does not fail the report.
- **Automatic pinning** of the tracking issue. The owner pins it once, by hand, in Phase 4.
- **Rendering any PR-supplied text** (titles, finding text, plan paths). The report renders numbers, enums and PR/run links only (see Critical Implementation Details).
- Changing the 14-day retention.

## Implementation Approach

The core is pure TypeScript inside `packages/code-reviewer`. It imports `PipelineResult` and its telemetry types directly, so a renamed field breaks `typecheck` instead of silently reading as "unreported". That gives the code the package's existing lint, typecheck and test gate for free. The core has four layers, kept apart in the same way as `cli.ts` / `review-pr.ts`:

1. **week + classify + aggregate + alarm**: pure functions with no IO;
2. **render**: pure markdown for the weekly comment and the alarm issue body;
3. **github**: a collector and publisher over an injected `gh` runner (`(args: string[]) => Promise<{ code, stdout, stderr }>`), using `gh api` / `gh run download`;
4. **cli + shell**: argument parsing, orchestration and the 0/1 exit contract, behind a thin `run-weekly-report.ts`.

The workflow only installs the package and runs `npm run weekly-report`.

## Critical Implementation Details

**Untrusted data in `review.json`.** The artifact comes from a run over PR-controlled content, so finding text, `planPath` and `summary` are attacker-influenced. Parse it through a narrow zod subset of `PipelineResult`. A parse failure makes the run unreported, with reason `artifact unreadable`, and never fails the job. Pin the subset to `PipelineResult` with a compile-time assignability check, so schema drift breaks `typecheck`. Render only numbers, enums, run/PR links, and model ids that match `^[A-Za-z0-9._/:-]+$` (anything else renders as `(unrecognised model id)`).

**Pass applicability and reported cost.** For each reviewed artifact, classify finder/judge cost as reported or unknown. Classify impl as not-run for absent `implReview` or status `skipped`, otherwise reported or unknown for status `reviewed`/`failed`. A not-run pass is rendered `not run`, not as missing telemetry. `runCost.partial` records detected missing expected costs or contradictory pass/telemetry facts; the aggregator independently adds unreadable-artifact and attempt-coverage gaps from F4. It never treats `partial=false` as provider-request completeness. Sum reported costs without inventing missing ones and retain an explicitly reported zero. Because existing telemetry has no count of requests missing cost, every comment/alarm body labels amounts `observed provider-reported cost` and states that pass totals may omit individual request costs. No upstream producer/schema instrumentation is added. A missing executed-pass cost alone changes partial status and the ≥ display; it does not change F4's separately defined coverage-alarm union of unreadable-review and incomplete/unknown-attempt workflow IDs.

**One observed snapshot per workflow ID.** Preserve `id`, original `created_at`, `run_attempt` and the collection timestamp in collector/core input. Deduplicate workflow IDs before aggregation and count at most one artifact snapshot per ID. Earlier Actions attempts are intentionally not reconstructed. With multiple artifacts named `ai-review-output`, do not let `gh run download -n` silently choose a snapshot: treat the artifact selection as unreadable/ambiguous and retain the attempt gap rather than summing or guessing. A sole readable artifact contributes its observed spend, without claiming that it includes other attempts. A current no-review/not-run state with `run_attempt>1` does not make the whole workflow free. Compute the alarm coverage count as a union of workflow IDs with class unreported or incomplete/unknown attempt coverage, not a sum of category counts. Missing attempt metadata is an explicit unknown-coverage warning and one coverage contributor. The observation timestamp makes later historical report changes visible; no automatic refresh/backfill and no upstream telemetry changes are added.

**Window filtering is done in code.** The `created=` filter on the runs API is date-granular and inclusive. Query a range one day wider than the week on each side, then filter by `created_at` against the exact `[start, end)` window in code.

**Check output.** This follows the _check that cannot say what it found_ lesson. A failed `gh` call surfaces the endpoint, exit code and the first `message` line of stderr, never a stack tail. "No runs this week" is a posted report reading "0 runs", never silence. Run `gh` under the default `bash -e` from the workflow only as `npm run weekly-report`; the CLI owns error handling.

**Missing artifacts require positive skip evidence.** For a successful run with no listed artifact, inspect the same `run_attempt` via the [workflow-run-attempt jobs endpoint](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt), paginating all jobs. Require one unambiguous, successful `ai-review` job whose `Compute PR diff (three-dot vs merge-base)` step succeeded and whose `AI review` step was skipped. That is the only no-review proof; a changed or missing step name, ambiguous jobs, missing attempt number, unavailable history or a failed jobs call cannot establish $0. Unavailable or uninterpretable evidence becomes `unreported: skip evidence unavailable`; readable evidence without the skip predicate becomes `unreported: artifact missing`. A listed artifact that fails download or parsing remains `artifact unreadable`. These per-run failures do not fail the report. Expiration and deletion can both appear as no artifact, so the collector never assumes that an empty artifact list means a docs-only run.

**PR identity requires a unique repository/ref match.** Resolve every run before per-PR enrichment. A candidate must have a positive integer PR number, head repository equal to `repo`, head ref equal to the run's nonempty `head_branch`, base repository equal to `repo`, and base ref `master`, matching the source workflow's target. Compare repository identity using the API repository ID or full name, case-insensitively for names; missing identity/ref facts are not a match. Deduplicate matching candidates by PR number. One distinct matching association embedded in the run maps directly; multiple distinct matches are unavailable (`ambiguous`). When no usable embedded association remains, paginate `GET repos/{repo}/commits/{head_sha}/pulls` and apply the same rules across both open and closed PRs. Exactly one distinct match maps; zero or multiple matches become unavailable (`missing` or `ambiguous`). A missing SHA/ref or a failed/unreadable lookup becomes unavailable (`lookup failed`). Never require candidate `head.sha` to equal the historical run SHA, select by API order, or infer a PR from a title/branch naming convention. Preserve the run's usable review data regardless of association failure. Only mapped PRs get comments/labels/reactions lookups; an unmapped run is never rendered as `no comment` or `unrated`. This is a metadata-coverage failure, separate from spend coverage, so it does not itself increment the unreported-run alarm. The fallback is grounded by the live PR #300 lookup in Current State Analysis; see the [commit-associated PR endpoint](https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit).

**Retention dependency.** The Monday run reads artifacts at most 7 days old against a 14-day retention, which leaves up to 6 days of slack for a late or re-dispatched run. A comment on the upload step in `review.yml` records that lowering `retention-days` below 8 breaks this report.

## Phase 1: Report core (pure)

### Overview

Week windows, run classification, cost, aggregation, reaction state, the alarm decision and markdown rendering, all with no IO, tested against the Definitions dataset.

**Addendum (impl-review phase 1, F4, 2026-10-22).** Three edge rules the Definitions left open, decided in triage:

- A negative pass cost fails the `reviewJsonSubset` parse. The whole artifact is then `artifact unreadable`, so that run counts toward the coverage alarm instead of contributing a partial figure.
- `AI_REVIEW_WEEKLY_ALARM_UNREPORTED` must be a positive integer. `0` would fire every week, so it falls back to the default with a warning; `1` means "any gap". A USD threshold of `0` stays valid.
- When duplicate rows for one workflow ID include an unknown `run_attempt`, its attempt coverage stays unknown and never becomes complete.

### Changes Required:

#### 1. Domain core

**File**: `packages/code-reviewer/src/weekly-report.ts`

**Intent**: Turns raw run, artifact and reaction facts into one typed `WeeklyReport`. This is where every Definitions row is implemented.

**Contract**: The module exports these functions:

- `isoWeekWindow(week: string): { week, start: Date, end: Date }`, which throws on anything other than `^\d{4}-W\d{2}$` or a week that does not exist;
- `previousCompleteWeek(now: Date): string`;
- `classifyRun(run: RawRun): RunClass`, with classes `reviewed | no-review | unreported{reason} | not-run`;
- `runCost(review): { known: number, partial: boolean, byPass }`, with each pass carrying reported/not-run/unknown cost state according to Definitions; `partial=false` means no detected missing expected pass cost, not proven completeness of provider request costs;
- `reactionState(reactions, owner, commentUpdatedAt): { state: "up"|"down"|"mixed"|"unrated", stale: boolean }`;
- `parseThresholds(env): { usd, unreported, warnings[] }`;
- `decideAlarm(report, thresholds): { fired: boolean, triggers[] }`;
- `aggregateWeek(input): WeeklyReport`.

It also exports `reviewJsonSubset`, a zod schema with a compile-time check that `Pick<PipelineResult, …>` is assignable to its inferred type.

#### 2. Markdown rendering

**File**: `packages/code-reviewer/src/weekly-report-render.ts`

**Intent**: Renders the weekly comment and the alarm issue body from a `WeeklyReport`, carrying the idempotency markers.

**Contract**: The module exports these functions:

- `renderWeeklyComment(report, links): string`, which starts with `<!-- ai-review-weekly:YYYY-Www -->`;
- `renderAlarmBody(report, alarm, links): string`, which starts with `<!-- ai-review-alarm:YYYY-Www -->`;
- `weeklyMarker(week)` and `alarmMarker(week)`.

Spend shows `≥ $X.XXXXXX` when anything is unreported, has partial artifact spend or has incomplete/unknown attempt coverage. Render class-unreported and union coverage-gap counts as distinct numbers, plus the cohort dates and observation timestamp. Label all amounts `observed provider-reported cost`, show a not-run pass as `not run`, and include a fixed caveat in both weekly comment and alarm body that a pass total can omit individual request costs. The rendered text contains no free text from `review.json`.

#### 3. Tests

**Files**: `packages/code-reviewer/src/weekly-report.test.ts`, `packages/code-reviewer/src/weekly-report-render.test.ts`, which use the Definitions dataset (runs A–H, PRs #301–#304).

**Intent**: Pin every Definitions row on its degenerate case.

**Contract**: Named cases:

- week boundary: G is in W43 and H is in W44, plus the ISO year rollover;
- class per run A–F, including D with positive skip evidence and E with successful paid review steps but no artifact; success with no artifact and unavailable or ambiguous skip evidence is unreported, never no-review;
- B is partial and its absent executed-pass cost is not 0;
- finder/judge with known costs and absent implReview (no plan), or skipped implReview, has a not-run impl pass and is not partial solely because impl telemetry is absent;
- reviewed/failed impl with no telemetry or no cost is unknown and partial; an explicit provider-reported zero remains known, and a legacy artifact missing all expected telemetry stays partial;
- contradictory pass/telemetry facts retain any numeric observed cost and mark partial; a present pass sum is labelled provider-reported and never presented as proof that every request reported cost;
- `≥` rendering for detected gaps, `not run` for inapplicable passes, observed provider-reported labels for all amounts, and the fixed per-request completeness caveat in both weekly comment and alarm body;
- #301 shows 👍 stale, plus the mixed and unrated cases and another account's reaction being ignored;
- alarm at exactly $10.00 (no) / $10.01 (yes), at 4/5 distinct coverage-gap workflow IDs (no/yes), including the unreadable-output and unobserved-attempt union, and with a non-numeric variable (default plus a warning);
- `review.json` with a hostile `summary`/finding text and a malformed model id never reaches the output;
- a malformed `review.json` makes the run unreported, with reason `artifact unreadable`;
- an empty week renders "0 runs";
- an unmapped reviewed run retains its known weekly spend, verdict and finding counts, keeps its run class and alarm treatment, appears in the PR-association coverage list, and adds no guessed PR row/label/reaction; duplicate associations to one PR count once;
- K contributes one observed artifact, two unobserved attempts, a lower-bound total and one coverage contributor; L contributes once despite overlapping unreported/attempt-gap conditions; five readable reviewed workflows with attempt gaps fire the default coverage alarm while four do not;
- a latest no-review/not-run attempt with earlier unobserved attempts stays incomplete, invalid/missing run_attempt never becomes 1, duplicate workflow IDs never double-count spend, and M stays in its original week after its cross-week attempt; a report collected later carries a later observation timestamp;
- N/O have identical created_at and different verdicts/findings: numeric ID 10 wins over 9 in either input order and supplies both verdict and finding counts. A later created_at outranks a greater ID on an older run.

### Success Criteria:

#### Automated Verification:

- New core tests pass: `cd packages/code-reviewer && npx vitest run src/weekly-report.test.ts src/weekly-report-render.test.ts` — not run: needs Phase 1 output
- Package typecheck passes: `cd packages/code-reviewer && npm run typecheck` — at planning: exit 0
- Package lint passes: `cd packages/code-reviewer && npm run lint` — at planning: exit 0
- Full package suite passes: `cd packages/code-reviewer && npm test` — at planning: exit 0 (716 tests)

#### Manual Verification:

- The owner reads a rendered sample comment (printed by the test or a fixture snapshot) and confirms it is readable at a glance: spend, unreported runs and reactions are findable in under 10 seconds — surface: packages/code-reviewer/src/weekly-report-render.ts

**Implementation Note**: Manual checks are acceptance. `/rune-implement` commits a phase once its automated verification passes, then asks the human about these. A pending manual check is reported and does not block the next phase.

---

## Phase 2: GitHub collector, publisher and CLI

### Overview

Wire the core to GitHub through an injected `gh` runner. Collect the runs, artifacts, sticky comments, reactions and labels; publish the weekly comment and the alarm issue idempotently. Expose all of it as `npm run weekly-report`.

### Changes Required:

#### 1. GitHub IO

**File**: `packages/code-reviewer/src/weekly-report-github.ts`

**Intent**: The only module that talks to GitHub. It turns API responses into the core's raw inputs, and publishes with marker-based upserts.

**Contract**: `collectWeek({ gh, repo, owner, window, downloadDir }): Promise<WeekInput>` makes these calls:

- runs: `gh api --paginate repos/{repo}/actions/workflows/review.yml/runs?created=<day-1>..<day+1>&per_page=100`, filtered to the exact window in code;
- per non-not-run workflow ID: list its artifacts. Download `gh run download <id> -n ai-review-output -D <dir>/<id>` only when one unambiguous non-expired matching artifact exists; multiple matching snapshots give `artifact unreadable` rather than implicit name-based selection. Absent or explicitly expired artifacts are missing, not evidence of $0. Preserve positive-integer `run_attempt` or explicit unknown attempt coverage for every class, including no-review/not-run;
- per successful run with a missing artifact: `gh api --paginate repos/{repo}/actions/runs/{id}/attempts/{run_attempt}/jobs?per_page=100`, applying the exact skip-evidence predicate in Critical Implementation Details. Preserve `run_attempt` and normalized skip-evidence facts in `RawRun` for the pure classifier. A missing attempt number or unreadable/ambiguous jobs response yields `unreported: skip evidence unavailable`;
- per run without a usable embedded PR association: `gh api --paginate repos/{repo}/commits/{head_sha}/pulls?per_page=100`, resolving identity by the unique repository/ref match in Critical Implementation Details. An already ambiguous embedded association stays ambiguous. Normalize the result into `RawRun.prAssociation` as mapped with its PR number, or unavailable with a fixed enum reason (`missing`, `ambiguous`, `lookup failed`);
- per distinct mapped PR: issue comments filtered by the sticky predicate, then `issues/comments/{id}/reactions`, then the PR's labels. Do not make per-PR calls for an unavailable association.

An artifact or skip-evidence failure becomes an unreported reason. A PR-association failure follows the separate unavailable-association contract, retains usable review data, and does not fail the report. A failure to list runs throws a `ReportError` that names the endpoint.

`publishWeek({ gh, repo, week, commentBody, alarm }): Promise<{ trackingIssue, commentUrl, alarmIssueUrl? }>` does five things, in order:

- ensures labels `ai-review-report` and `ai-review-alarm` exist;
- finds the open `ai-review-report` issue, picking the lowest number if several exist and noting it; if there is none, it creates "AI review weekly report";
- upserts the week comment by marker plus `github-actions[bot]` author;
- if the alarm fired, upserts the alarm issue by body marker in any state, never reopening it;
- if the alarm did not fire but a week alarm issue exists, PATCHes its body with "no longer over threshold as of <time>".

#### 2. CLI core and process shell

**Files**: `packages/code-reviewer/src/weekly-report-cli.ts`, `packages/code-reviewer/src/run-weekly-report.ts`, `packages/code-reviewer/package.json`

**Intent**: Parse arguments, orchestrate collect → aggregate → render → publish, and keep the exit contract. The shell only binds real IO: `execFile` for `gh`, the filesystem and the clock.

**Contract**: `runWeeklyReportCli(argv, env, io): Promise<0|1>` takes these flags:

- `--repo <owner/name>` (required);
- `--owner <login>` (required);
- `--week <YYYY-Www>` (default `previousCompleteWeek(now)`);
- `--out-dir <dir>` (always writes `report.md`, `report.json`, and `alarm.md` when the alarm fires);
- `--dry-run` (collect and render only, posting nothing).

Thresholds come from env `AI_REVIEW_WEEKLY_ALARM_USD` / `AI_REVIEW_WEEKLY_ALARM_UNREPORTED`. The rendered comment is appended to `GITHUB_STEP_SUMMARY` when that is set. Exit 0 means a report was produced, whether or not the alarm fired. Exit 1 means it could not list runs or could not publish; the message carries the subject, the state and the way out. A `week` value that fails validation exits 1, naming the value.

The package script is `"weekly-report": "tsx src/run-weekly-report.ts"`.

#### 3. Tests

**Files**: `packages/code-reviewer/src/weekly-report-github.test.ts`, `packages/code-reviewer/src/weekly-report-cli.test.ts`

**Intent**: Pin the IO contracts against a scripted fake `gh`.

**Contract**: Named cases:

- the window is filtered in code, so a run one second outside it from the widened query is dropped;
- an empty run `pull_requests` array resolves through the commit API to closed PR #300 for the baseline SHA/ref, even when that PR's current head SHA differs;
- one valid embedded PR association avoids the fallback; duplicate candidates with the same PR number count once;
- multiple same-name artifact snapshots are never summed or silently selected; run_attempt survives normalization, and missing/invalid values remain unknown coverage;
- candidates from another repository, another head ref or another base ref do not match; no match, two distinct matches, missing SHA/ref and a failed/unreadable lookup produce explicit unavailable association without discarding known weekly data or making per-PR calls;
- a successful paid run whose expired/deleted artifact is omitted from the response gives `unreported: artifact missing`, a failed artifact download gives `artifact unreadable`, and a failed/unreadable job-step lookup gives `skip evidence unavailable`; each still produces a report;
- a successful no-artifact run is no-review only with matching skip evidence from its own attempt. Review steps that ran, changed/missing step names, ambiguous jobs, a missing attempt number, and a different attempt's skipped step never prove $0;
- the sticky comment is matched only for `github-actions[bot]` plus the marker, so a user comment containing the marker is ignored;
- reactions from a non-owner are ignored;
- publishing twice for one week PATCHes, leaving one comment and one alarm issue;
- a closed alarm issue is PATCHed and not reopened;
- a non-firing re-run annotates an existing alarm issue;
- a runs-list failure exits 1 with the endpoint and stderr message in the output;
- `--dry-run` makes zero write calls;
- an invalid `--week` exits 1.

### Success Criteria:

#### Automated Verification:

- Collector, publisher and CLI tests pass: `cd packages/code-reviewer && npx vitest run src/weekly-report-github.test.ts src/weekly-report-cli.test.ts` — not run: needs Phase 2 output
- Package typecheck passes: `cd packages/code-reviewer && npm run typecheck` — at planning: exit 0
- Package lint passes: `cd packages/code-reviewer && npm run lint` — at planning: exit 0
- Full package suite passes: `cd packages/code-reviewer && npm test` — at planning: exit 0

#### Manual Verification:

- The owner skims the `gh` calls in `weekly-report-github.ts` and confirms the only writes are to labels, the tracking issue, its comments and alarm issues — surface: packages/code-reviewer/src/weekly-report-github.ts

---

## Phase 3: Workflow, pointers and local dry run

### Overview

Add the scheduled workflow, record the retention dependency where it is set, document the job in `AGENTS.md`, and prove the whole path read-only against the live repository before merge.

### Changes Required:

#### 1. Scheduled workflow

**File**: `.github/workflows/ai-review-weekly-report.yml`

**Intent**: Run the report every Monday and on demand, with the least privilege, and never as a gate.

**Contract**:

- **Triggers**: `schedule: cron "0 6 * * 1"`, plus `workflow_dispatch` with inputs `week` (string, optional) and `dry-run` (boolean, default false).
- **Permissions**: top-level `permissions: {}`. The job gets `contents: read`, `actions: read`, `issues: write` and `pull-requests: read`.
- **Guard and concurrency**: `if: github.event.repository.fork == false`. The concurrency group is `ai-review-weekly-report` with `cancel-in-progress: false`.
- **Steps**: checkout with `persist-credentials: false`, then setup-node 24 with the npm cache on the package lockfile, then `npm ci` in `packages/code-reviewer`, then a step named `Generate weekly report` in that same working directory, using the Bash array invocation below. Only the literal env value `true` adds `--dry-run`; `false`, an empty value and an absent value leave publishing enabled.
- **Environment**: `inputs.week`, `inputs.dry-run`, `github.repository_owner` and `vars.AI_REVIEW_WEEKLY_ALARM_USD` / `vars.AI_REVIEW_WEEKLY_ALARM_UNREPORTED` all arrive through `env:` and are never interpolated into `run:`. `GH_TOKEN` is `secrets.GITHUB_TOKEN`.
- **Artifact**: an `upload-artifact` of `$RUNNER_TEMP/weekly-report` as `ai-review-weekly-report`, with 90-day retention and `if: always()`.
- **Header comment**: states that the job is advisory, costs $0, is never in `deploy.needs`, and is subject to GitHub's 60-day inactivity disablement of schedules.

The `Generate weekly report` step uses this exact argument construction in its `run:` block:

```bash
args=(--repo "$GITHUB_REPOSITORY" --owner "$OWNER"
      --out-dir "$RUNNER_TEMP/weekly-report")
if [[ -n "${WEEK:-}" ]]; then
  args+=(--week "$WEEK")
fi
if [[ "${DRY_RUN:-}" == "true" ]]; then
  args+=(--dry-run)
fi
npm run weekly-report -- "${args[@]}"
```

#### 2. Pointers

**Files**: `.github/workflows/review.yml`, `AGENTS.md`

**Intent**: Record the new dependency where its counterpart is configured, and describe the job where the CI is described.

**Contract**:

- **`review.yml`**: one comment line on the upload step stating that `ai-review-weekly-report.yml` reads this artifact up to 7 days later, so `retention-days` must stay ≥ 8.
- **`AGENTS.md` § CI**: a short paragraph after the `ai-review` block covering the weekly report workflow, its schedule, the thresholds and their repo variables (including the expanded distinct coverage-gap meaning of AI_REVIEW_WEEKLY_ALARM_UNREPORTED), the workflow-created cohort semantics and observation timestamp, the tracking and alarm labels, $0 cost, advisory status, re-running through `workflow_dispatch`, and the 60-day schedule disablement.
- **Pointer sweep**, per the stale-pointers lesson: grep for `14-day retention` and `ai-review-output` to find every statement about the artifact, and leave each one accurate.

#### 3. Workflow invocation tests

**File**: `packages/code-reviewer/src/weekly-report-workflow.test.ts`

**Intent**: Exercise the actual workflow command, so a future env/string conversion regression cannot silently disable publication.

**Contract**: Parse `.github/workflows/ai-review-weekly-report.yml`, assert its expected schedule/dispatch triggers and top-level/job permissions, and extract the `Generate weekly report` step's actual `run:` block. Execute that block with Bash and an injected stub for `npm` that records its argv; do not run the real CLI, contact GitHub or write to GitHub. Assert one npm invocation with `run weekly-report --` and the expected repo/owner/output-directory arguments. Matrix: `DRY_RUN=true` adds exactly one flag; `false`, empty and absent values omit it. A nonempty `WEEK` adds exactly one `--week` value; empty/absent omits both. Include paths with spaces to verify argument boundaries. Test the extracted workflow block, not a copied implementation of it. This test is covered by the existing package Vitest include and Phase 3 verification row 3.1; no Progress title or ID changes.

### Success Criteria:

#### Automated Verification:

- The workflow parses as YAML and declares the expected triggers and permissions; its actual report-step command also preserves arguments and implements dry-run semantics: `cd packages/code-reviewer && npx vitest run src/weekly-report-workflow.test.ts` — not run: needs Phase 3 output
- Formatting holds for the touched files: `npx prettier --check .github/workflows AGENTS.md` — at planning: exit 0
- Full package suite still passes: `cd packages/code-reviewer && npm test` — at planning: exit 0
- Local dry run against the live repository (read-only GitHub API, $0) produces a W43 report containing run 39653424585 at $0.333040 and correctly associates it with PR #300 despite the empty run pull_requests array and advanced current PR head SHA: `cd packages/code-reviewer && GH_TOKEN=$(gh auth token) npm run weekly-report -- --repo Piotr-Miller/lumina-clean-ai --owner Piotr-Miller --week 2026-W43 --dry-run --out-dir <scratchpad>/w43` — not run: external; needs Phase 2 output

#### Manual Verification:

- The owner reads the dry-run `report.md` and confirms the W43 figures match what they know about that week, especially PR #300's run at $0.333040 and the reaction states — surface: packages/code-reviewer/src/weekly-report-render.ts
- The owner reads the new `AGENTS.md` paragraph — surface: AGENTS.md

---

## Phase 4: Live acceptance after merge

### Overview

Once the PR merges, the workflow exists on `master` and can be dispatched. Run it once for real, pin the tracking issue, and confirm that a second run is idempotent.

### Changes Required:

#### 1. First-run record

**File**: `context/changes/ai-review-weekly-report/first-run.md`

**Intent**: Record the first live dispatch: its run URL, the tracking issue and comment URLs, the figures, whether an alarm fired, and the result of the idempotency re-run.

**Contract**: A new evidence file. It records URLs, numbers and conclusions only, and no PR text.

### Success Criteria:

#### Automated Verification:

- (paid) First live dispatch for W43, which creates the labels, the tracking issue and the week comment. It costs $0 but writes to GitHub: `gh workflow run ai-review-weekly-report.yml -f week=2026-W43` — artifact: `context/changes/ai-review-weekly-report/first-run.md` — not run: paid
- (paid) A second dispatch for the same week leaves exactly one W43 comment and at most one W43 alarm issue: `gh workflow run ai-review-weekly-report.yml -f week=2026-W43` — artifact: `context/changes/ai-review-weekly-report/first-run.md` — not run: paid

#### Manual Verification:

- The owner pins the "AI review weekly report" issue (a one-time UI action) — surface: context/changes/ai-review-weekly-report/first-run.md
- The owner confirms that the first scheduled run on Mon 2026-10-26 06:00 UTC posted a W43 comment without a dispatch — surface: context/changes/ai-review-weekly-report/first-run.md

---

## Testing Strategy

### Unit Tests:

- Every Definitions row on its degenerate case (Phase 1 §3), including not-run versus missing executed-pass cost, explicit zero and the per-request completeness caveat: the week boundary and ISO rollover, each run class, workflow-ID deduplication, unobserved-attempt counts, cross-week cohort membership, coverage-alarm union/deduplication, absent-not-zero cost, `≥` rendering, the stale, mixed and unrated reaction states, the alarm boundaries at $10.00/$10.01 and 4/5 distinct coverage-gap workflow IDs, and the invalid-variable fallback.
- Hostile `review.json`: free text and a malformed model id never reach the rendered markdown, and a malformed JSON makes the run unreported.
- IO contracts (Phase 2 §3): window filtering in code, sticky-author spoofing, non-owner reactions, idempotent upserts, no reopening of closed alarms, zero writes under `--dry-run`, and exit 1 with a state, subject and way out.

- Workflow invocation (Phase 3 §3): execute the YAML's actual Bash report command with a stub npm and assert true/false/empty/absent dry-run values, optional week arguments and paths containing spaces; no external calls.

### Integration Tests:

- None in CI: the collector needs the live GitHub API. The Phase 3 local dry run is the integration check, and Phase 4 is the live one.

### Manual Testing Steps:

1. Run the Phase 3 dry run for W43 and compare PR #300's run cost with `probe.md` ($0.333040).
2. After the merge, dispatch for W43, open the tracking issue, and check the comment against the dry-run `report.md`.
3. Dispatch again, and check that the comment was edited, not duplicated.
4. On Mon 2026-10-26, check that the scheduled run posted on its own.

## Performance Considerations

Up to about 60 runs a week means about 60 artifact listings, at most 60 small downloads, and about 3 calls per mapped PR, one paginated commit-associated PR lookup for each run without usable embedded PR association, plus one paginated attempt-jobs lookup for each successful run with a missing artifact. That is well inside `GITHUB_TOKEN`'s 1,000 requests/hour. `npm ci` of the package (promptfoo included) dominates wall time, the same as `review.yml`.

## Migration Notes

None: there is no data migration. The labels and the tracking issue are created by the first run.

## References

- Change identity: `context/changes/ai-review-weekly-report/change.md`
- Live cost baseline: `context/archive/2026-10-21-ai-review-reenable/probe.md`
- Result shape: `packages/code-reviewer/src/schemas.ts:184-321`
- Sticky comment and labels: `.github/actions/ai-review/action.yml`
- Artifact upload: `.github/workflows/review.yml` (last step)
- Thin-shell pattern: `packages/code-reviewer/src/review-pr.ts`, `packages/code-reviewer/src/cli.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done, `- [-]` not applicable (` — n/a: <reason>` required). Append ` — <commit sha>` when a step lands. A Manual row takes ` — accepted at <full sha>` when a human confirms it. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Report core (pure)

#### Automated

- [x] 1.1 New core tests pass — 1baf547
- [x] 1.2 Package typecheck passes — 1baf547
- [x] 1.3 Package lint passes — 1baf547
- [x] 1.4 Full package suite passes — 1baf547

#### Manual

- [ ] 1.5 Owner confirms the rendered sample comment reads at a glance

### Phase 2: GitHub collector, publisher and CLI

#### Automated

- [ ] 2.1 Collector, publisher and CLI tests pass
- [ ] 2.2 Package typecheck passes
- [ ] 2.3 Package lint passes
- [ ] 2.4 Full package suite passes

#### Manual

- [ ] 2.5 Owner confirms the only GitHub writes are labels, tracking issue, comments and alarm issues

### Phase 3: Workflow, pointers and local dry run

#### Automated

- [ ] 3.1 Workflow parses as YAML with expected triggers and permissions
- [ ] 3.2 Formatting holds for the touched files
- [ ] 3.3 Full package suite still passes
- [ ] 3.4 Local dry run produces a W43 report containing run 39653424585 at $0.333040

#### Manual

- [ ] 3.5 Owner confirms the dry-run W43 figures
- [ ] 3.6 Owner reads the new AGENTS.md paragraph

### Phase 4: Live acceptance after merge

#### Automated

- [ ] 4.1 (paid) First live dispatch for W43
- [ ] 4.2 (paid) Second dispatch for the same week is idempotent

#### Manual

- [ ] 4.3 Owner pins the tracking issue
- [ ] 4.4 Owner confirms the first scheduled run posted on its own
