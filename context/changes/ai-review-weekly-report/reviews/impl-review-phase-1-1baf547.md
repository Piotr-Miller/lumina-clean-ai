<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: AI Review Weekly Report Implementation Plan

- **Plan**: context/changes/ai-review-weekly-report/plan.md
- **Scope**: Phase 1 (phases 1–4)
- **Session**: fresh
- **Base**: f8ec73d6a113165f5fa9da409766ca425e261ed8 (merge-base)
- **Head**: 1baf54749bc6829956c94cb0f4734b534153719a
- **Worktree**: included(context/changes/ai-review-weekly-report/plan.md)
- **Checks ran at**: 1baf54749bc6829956c94cb0f4734b534153719a (current HEAD; the only worktree change is the Progress write-back in plan.md)
- **Manual acceptance**: 1 of 1 confirmed
- **Date**: 2026-10-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Findings

### F1 — Per-pass amounts drop `≥` when the cohort has gaps

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/weekly-report-render.ts:95-99
- **Detail**: `passCost` adds `≥` only when that pass has unknown-cost runs (`total.unknown > 0`). Unreported runs and attempt gaps are ignored. The plan (plan.md:145) says spend shows `≥` when anything is unreported, partial or has incomplete attempt coverage. The fixed `COST_CAVEAT` in the same comment (render.ts:34-37) says "an amount without `≥` means no gap was detected", so the comment contradicts itself. `weekly-report-render.test.ts:119-120` locks this in: in a cohort whose headline reads `≥ $0.210000 … (gaps: 1 unreported, 1 partial, 1 with incomplete attempt coverage)`, it asserts `| judge | $0.040000 | 4 | 0 | 0 |` with no `≥`. Confirmed by reading the code and by the drift pass's probe. Owner acceptance 1.5 was given at this revision and does not cover this point. Fixing render.ts will make 1.5 stale, and triage will reopen it.
- **Fix A ⭐ Recommended**: When the cohort has any unreported run or attempt-coverage gap, mark every pass amount with a reported cost `≥`. Keep the pass's own unknown count in its column.
  - Strength: Matches plan.md:145 and the caveat's own definition of `≥`. The headline and the pass table then agree, and it is a one-condition change plus a test update.
  - Tradeoff: In most weeks every pass row will show `≥` (any failure or re-run triggers it), so the table carries less detail.
  - Confidence: HIGH. `report.spend` already has the gap counts that the headline uses.
  - Blind spot: Gaps cannot be assigned to a single pass, because an unreported run's split is unknown.
- **Fix B**: Keep exact pass amounts, title the table "from readable artifacts only", and narrow the caveat so `≥` applies to the headline and per-PR spend.
  - Strength: Each pass number stays an exact sum of what was read, which may suit cost-per-pass trend reading better.
  - Tradeoff: This changes a fixed caveat and the plan's rendering rule, so plan.md:145 needs an addendum.
  - Confidence: MED. A reader skimming in under 10 seconds (criterion 1.5) may still read an unmarked number as complete.
  - Blind spot: None significant.
- **Decision**: FIXED — Fix A; siblings: weekly-report-render.ts `formatSpend` (headline, per-PR, alarm body) n/a (already uses `SpendSummary.incomplete`, which includes unreported and attempt gaps), alarm "known spend" strings n/a (explicitly known amounts; labelling tracked in F2 (PENDING)); reopened: 1.5

### F2 — Some amounts lack the "observed provider-reported cost" label

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/weekly-report-render.ts:116, :126, :222
- **Detail**: The plan says to label all amounts `observed provider-reported cost` (plan.md:145). The headline is labelled. The per-PR "Spend" column (:222), the not-fired alarm line "known spend $X ≤ $Y" (:126) and the spend trigger text (:116) are not; only the caveat's general sentence covers them. The alarm body also shows the observed-as-of time but not the cohort's start/end dates, which the weekly comment does show. No test pins the label on these places.
- **Fix**: Rename the column to "Observed spend", use "known observed provider-reported spend" in both alarm strings, add the cohort dates to the alarm body, and add a test for each.
- **Decision**: FIXED — Fix now: per-PR column "Observed spend", both alarm strings say "known observed provider-reported spend", alarm body gains a `Cohort: … created <start> – <end>.` line; tests pin all three. Siblings: headline `**Spend:**` and alarm-body "Known spend:" n/a (already labelled), "Spend by pass" table n/a (column header already "Observed provider-reported cost"); reopened: none new (1.5 already reopened by F1)

### F3 — Forged or huge costs render `$Infinity` / `$1e+21`, and rounding differs between lines

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/weekly-report.ts:83, :364, :385; packages/code-reviewer/src/weekly-report-render.ts:49
- **Detail**: The subset accepts any finite non-negative cost. Probe results:
  - two passes at `1e308` sum to Infinity, which renders `**Spend:** $Infinity reported` and fires the alarm;
  - from `1e21` upward, `toFixed` switches to `$1e+21`;
  - the Spend line prints raw `toFixed(6)` while the alarm uses `roundUsd`, so at spend `9.9999995` with threshold variable `9.999999` the comment reads "$9.999999" in one line and "known spend $10.000000 exceeds $9.999999" in the next.

  With the default threshold of 10 no wrong firing was found. review.json is treated as untrusted (plan, Critical Implementation Details), and this is how a forged one could raise a false alarm with a meaningless figure.

- **Fix**: Bound each pass cost in the subset (e.g. `.max(1000)`, above which the artifact is unreadable), refuse a non-finite sum, and format every amount from the rounded value. Optionally cap the USD threshold at 6 decimals.
- **Decision**: FIXED — Fix now: `MAX_PASS_COST_USD = 1000` bounds each telemetry cost in `telemetrySubset` (≤ 60 runs × 3 passes stays finite, so no separate non-finite check is needed); `decideAlarm` compares and records the rounded threshold; the renderer's `usd` formats from `roundUsd`. Tests: 1e308 and cap+1µ$ are unreadable while the cap itself is readable; threshold 9.9999996 against spend 9.9999999 does not fire; `formatSpend` prints the rounded figure. Siblings: `cli.ts:231` `usd` n/a (the code-review CLI prints one run's cost, with no alarm comparison to disagree with); reopened: none new (1.5 already reopened by F1)

### F4 — Edge semantics the plan does not decide

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/weekly-report.ts:358-371, :576-589, :83
- **Detail**: Three behaviours follow the letter of the plan but were never decided. All three were probed by the drift pass.
  - (a) `AI_REVIEW_WEEKLY_ALARM_UNREPORTED="0"` is accepted, and `0 >= 0` fires the coverage alarm every week, including an empty one.
  - (b) `dedupeRuns` ranks an unknown `run_attempt` below attempt 1. The same workflow ID arriving once with `null` and once with `1` becomes `{ kind: "complete" }` with 0 coverage gaps. Ties keep the first row in input order instead of flagging ambiguity. Today the collector is meant to send one row per ID, but nothing in Phase 1 guarantees that.
  - (c) One negative cost (`nonnegative()`) makes the whole review.json unreadable, so that run's valid costs, verdict and findings are lost. This is deliberate and pinned at weekly-report.test.ts:304, but unstated in the plan.
- **Fix**: For (a), reject `0` for the unreported threshold with a warning, since it can only mean "always fire". For (b), treat conflicting attempt facts for one ID as unknown coverage, never complete. For (c), record the choice as a plan addendum.
  - Strength: (b) closes the only path by which an unknown attempt becomes "complete", which is the failure the F4 plan-review decision exists to prevent. (a) and (c) are one line each.
  - Tradeoff: (a) removes a setting someone might use as "alarm on any gap", but `1` already gives that.
  - Confidence: HIGH — every case was reproduced with a probe.
  - Blind spot: Whether Phase 2's collector can emit duplicate IDs at all (pagination across the widened date range could).
- **Decision**: FIXED — Fix now: (a) `parseThresholds` rejects an unreported count below 1, with a warning (USD 0 stays valid); (b) `dedupeRuns` keeps attempt coverage unknown when any row for the ID has an unknown `run_attempt`; (c) plan.md Phase 1 addendum. Tests: threshold "0" for both variables, and the duplicate null/1 row in both input orders. Siblings: `attemptCoverage` n/a (already maps null/invalid to unknown), USD threshold n/a (0 is a meaningful "any spend"); reopened: none (weekly-report.ts is outside the 1.5 surface, and 1.5 was already reopened by F1)

### F5 — No comment-size cap, and model ids are not deduplicated

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/src/weekly-report-render.ts:176-298, :276-280
- **Detail**: The sibling sticky-comment renderer caps output at `MAX_COMMENT_CHARS = 60_000` (render.ts:24, :274) because GitHub rejects comments over 65,536 characters. The weekly renderer has no cap. Its PR rows and its unreported, attempt-gap and unmapped run lists all grow with the cohort. An oversized comment would make the Phase 2 publish fail, and the job with it, instead of posting a report. Model ids are mapped through `safeModelId` without deduplication afterwards, so five distinct hostile ids render `(unrecognised model id)` five times. At today's volume (≤ 60 runs a week) the cap would not be reached.
- **Fix**: Deduplicate after `safeModelId`, and truncate with the same pattern and constant as render.ts (a suffix noting the truncation; the full report goes into the `report.md` artifact).
- **Decision**: FIXED — Fix now: `safeModelList` deduplicates after mapping; `renderWeeklyComment` truncates at render.ts's `MAX_COMMENT_CHARS` with an exported `TRUNCATION_NOTICE` that points at `report.md` in the report run's artifact (the week marker leads the comment, so the upsert anchor survives). Tests: three hostile ids render one entry; 2000 failed runs give a comment ≤ the cap that starts with the marker and ends with the notice. Siblings: `renderAlarmBody` n/a (bounded: at most two trigger lines and fixed text); reopened: none new (1.5 already reopened by F1)

### F6 — Renderer trusts link inputs and run ids verbatim

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/weekly-report-render.ts:61-63, :316
- **Detail**: `links.repoUrl` and `links.reportCommentUrl` are pasted into markdown links unchecked. A probe with `reportCommentUrl: "https://x) <!-- [y](javascript:alert(1)"` closed the link early and opened an HTML comment that hid the rest of the alarm body, including the caveat. Run ids are not checked as safe positive integers either: NaN, -5 and 1.5 render as `[run NaN](…/runs/NaN)`, and `dedupeRuns` merges all NaN ids into one entry. PR numbers are already checked (`normalizeAssociation`). All these values come from the Phase 2 CLI and the GitHub API, not from review.json, so the risk today is low.
- **Fix**: Check `repoUrl` against `^https://github\.com/[\w.-]+/[\w.-]+$` and `reportCommentUrl` against the same prefix plus `/issues/\d+#issuecomment-\d+` in the renderer, and apply the PR-number integer check to run ids.
- **Decision**: FIXED — Fix now: both renderers throw when `repoUrl` is not `https://github.com/<owner>/<repo>`, since it is a caller bug that would corrupt every link; the alarm body links `reportCommentUrl` only when it is an issue-comment URL inside `repoUrl`, and otherwise falls back to the unlinked text. `aggregateWeek` excludes rows whose run ID is not a positive safe integer and counts them as `invalidRunIds`, and the comment warns about them without a link. Tests: three hostile or foreign comment URLs (one marker, no `javascript:`, caveat intact), three bad repo URLs throw from both renderers, five invalid ids (including two NaN) are counted and the valid run's spend is kept, and the warning line contains no `NaN`. Siblings: `prLink` n/a (PR numbers already pass `normalizeAssociation`; the URL base is now validated), `runLink` n/a (fed only valid ids now); reopened: none new (1.5 already reopened by F1)

### F7 — A few test pins are weaker than the named cases

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: packages/code-reviewer/src/weekly-report-render.test.ts:224; packages/code-reviewer/src/weekly-report.test.ts:294-302, :489
- **Detail**:
  - `expect(rendered).toContain("REJECTED")` cannot fail, because the impl-verdict mix line always prints `REJECTED <n>`, even for an empty week. The hostile run's verdict is therefore not checked; the next line's finding counts are.
  - The named case "contradictory pass/telemetry facts" covers no-plan with impl cost and skipped impl with telemetry but no cost. It does not cover skipped impl with a numeric cost. The code handles that case correctly (probe: known 0.32, partial true).
  - "Duplicate associations to one PR count once" is tested as two runs of #301 giving one row. Removing duplicates within one run's candidates belongs to Phase 2's collector, since `PrAssociation` arrives already resolved.
- **Fix**: Assert `"REJECTED 1"` (or the PR row), add the skipped-impl-with-cost case, and note in Phase 2 that its collector test owns candidate deduplication.
- **Decision**: FIXED — Fix now: the hostile-run test now matches `REJECTED 1` on the impl-verdict mix line; the contradictory-facts test adds skipped impl with cost 0.3 (contradictory, partial, impl reported 0.3, known 0.32). Phase 2 needs no new note: its test contract already names "duplicate candidates with the same PR number count once" (plan.md, Phase 2 §3). Siblings: other `toContain` checks on a bare enum word n/a (searched weekly-report*.test.ts; the rest pin full lines or counts); reopened: none new (1.5 already reopened by F1)

## Review Notes

- **Bookkeeping in diff**: context/changes/ai-review-weekly-report/change.md, context/changes/ai-review-weekly-report/plan.md, context/changes/ai-review-weekly-report/plan-brief.md, context/changes/ai-review-weekly-report/reviews/plan-review.md
- Automated checks at 1baf547: 1.1 `npx vitest run src/weekly-report.test.ts src/weekly-report-render.test.ts` exit 0 (2 files, 68 tests); 1.2 `npm run typecheck` exit 0; 1.3 `npm run lint` exit 0; 1.4 `npm test` exit 0 (23 files, 784 tests).
- Manual 1.5 is `current` (accepted at 1baf547, surface `weekly-report-render.ts`). A triage fix to that file will make it stale and reopen it.
- Scope: the commit touches exactly the four planned source/test files plus change docs; no IO, `gh` call or `process.env` read in the core. Verified MATCH: `isoWeekWindow` (W00/W54/2025-W53 throw; 2026-W53 valid), `previousCompleteWeek`, `classifyRun` (no-review only on confirmed skip evidence), `runCost`, `attemptCoverage`, `reactionState`, `decideAlarm`, union coverage count, latest-snapshot selection (created_at, then numeric id, order-independent) and the compile-time `PipelineResult` pin.
- Hostile input cleared: no review.json free text reaches the output; `JSON.parse` is inside try/catch and goes through `safeParse`; `__proto__` keys cause no pollution; threshold warnings are length-bounded and character-filtered, so `-->` and newlines cannot break the comment.
- Mutation check skipped: none of the test-plan §2 risks (#1–#6, all app/Supabase pipeline) covers `packages/code-reviewer`.
- Lessons: 35 of 39 entries apply to impl-review by their `Applies to` line. Four shaped this review: silent degradation, a guard metric that only exists on success, a check that cannot say what it found, and a comment that justifies a defect. The rest concern the Supabase/app runtime.
- Phase 2 dependencies recorded by this review: the collector must emit one row per workflow ID (F4b) and deduplicate PR candidates by number (F7), and the CLI must pass validated GitHub URLs (F6).

## Re-review 2 (2026-10-22)

- **Scope**: Phase 1 (phases 1–4)
- **Session**: fresh
- **Base**: 1baf54749bc6829956c94cb0f4734b534153719a (previous round)
- **Head**: 94310b509de83f2cf51bc8db5d13ad2e88b2d31e
- **Worktree**: included(context/changes/ai-review-weekly-report/plan.md) — only Phase 2 Progress SHA write-back; no source edits
- **Checks ran at**: 94310b509de83f2cf51bc8db5d13ad2e88b2d31e (current HEAD)
- **Manual acceptance**: 1 of 1 confirmed — 1.5 current, accepted at ae7d6fddb99d41c46b4460ddee42b0408d676640
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation
- **Closes**: F1, F2, F3, F4, F6, F7. F5's cap and model deduplication verified; its fallback claim has a regression tracked as F8.

### Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

### F8 — Truncation directs readers to an equally truncated Markdown artifact

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/weekly-report-render.ts:63
- **Detail**: F5's fix adds a notice promising the full report in `report.md`, but `renderWeeklyComment` discards overflow and returns only the capped string (lines 339–341). The current caller writes that exact string to `report.md` (`weekly-report-cli.ts:142–145`). A 2,000-failed-run fixture produces 60,000 characters, includes the notice and omits the last run's link from both destinations. The complete structured report is retained in `report.json` (CLI line 147). The cap preserves publication and the week marker, but its advertised recovery path sends readers to another truncated copy. This is a regression in F5's new fallback, with the Phase 2 caller cited as supporting evidence rather than separately reviewed scope. Today's recorded volume is far below this overflow case.
- **Fix**: Point the notice to the complete data in `report.json`, following the existing sticky renderer's JSON-artifact fallback convention, and verify that an overflow report retains its final run in that named artifact.
- **Decision**: FIXED — Fix now: notice points to complete data in `report.json`; the CLI overflow regression check verifies the published comment is capped and omits the final run while that JSON artifact retains all 2,000 runs, including ID 601999. Siblings: `render.ts` n/a (already points to complete `review.json` data); `renderAlarmBody` n/a (bounded body, no truncation fallback); CLI publish-failure message n/a (correctly names the rendered Markdown report, does not promise unabridged data); reopened: 1.5.

- **Notes**:
  - **Bookkeeping in diff**: context/changes/ai-review-weekly-report/change.md, context/changes/ai-review-weekly-report/plan.md, context/changes/ai-review-weekly-report/reviews/impl-review-phase-1-1baf547.md.
  - Incremental phase surface: `weekly-report.ts`, `weekly-report.test.ts`, `weekly-report-render.ts`, `weekly-report-render.test.ts`. Phase 2 files excluded from this phase review: `packages/code-reviewer/package.json`, `src/run-weekly-report.ts`, `src/weekly-report-cli.ts`, `src/weekly-report-cli.test.ts`, `src/weekly-report-github.ts`, `src/weekly-report-github.test.ts`, `src/weekly-report-github-fake.ts` (all source paths under that package). These are planned Phase 2 work, not scope creep. No local changes excluded.
  - F1: per-pass reported amounts inherit unreported/attempt gaps; tests pin both plus the gap-free case. F2: observed-spend labels and alarm cohort dates are present. F3: costs are bounded at $1,000/pass and alarm/display rounding agrees. F4: zero coverage threshold falls back with a warning, unknown duplicate attempts stay unknown in either order, and negative-cost policy is documented in the phase addendum. F6: repository/comment links and run IDs are validated. F7: the impl verdict assertion pins `REJECTED 1`, and skipped impl with numeric cost retains its cost while marking the artifact partial.
  - All applicable phase gates ran in `packages/code-reviewer`, with stdout/stderr captured separately and exit status checked directly: 1.1 `npx vitest run src/weekly-report.test.ts src/weekly-report-render.test.ts` exit 0 — `Test Files 2 passed (2); Tests 79 passed (79)`; 1.2 `npm run typecheck` exit 0 — `tsc --noEmit`; 1.3 `npm run lint` exit 0 — `eslint .`; 1.4 `npm test` exit 0 — `Test Files 25 passed (25); Tests 865 passed (865)`. Logs: `/tmp/ai-review-phase1-checks.ryKXyC/1.1.log` through `1.4.log` (session-local evidence).
  - `acceptance-state.sh` exited 0. Manual 1.5 is current; the remaining pending Manual rows belong to later phases and are outside this review. No n/a or paid rows in Phase 1, and no acceptance/Progress edits made by this review.
  - Lessons: 35 of 39 entries apply by their `Applies to` declarations and were read whole. Silent degradation, guard observability, diagnostic clarity and stale pointers were relevant to this reporting change. Two independent read-only review passes agreed on F8; no other substantive incremental regression found.
  - Mutation check skipped: test-plan §2 risks #1–#6 and its Risk Response Guidance concern the app/Supabase Cloud AI pipeline; none maps to this weekly-report core.
  - Phase review leaves `change.md.status` as `implementing`; its `updated` stamp is already 2026-10-22. Report and change stamp are carried for a later workflow commit. No code changed or commits made.
  - Triage 2026-10-22: F8 fixed after the owner chose Fix now. Post-fix `npm run typecheck`, `npm run lint`, `npm test` (25 files, 866 tests), and Prettier check on the two changed TypeScript files all exited 0. The first lint run caught an unsafe asymmetric-matcher type in the added test; the final test uses an `unknown` JSON value and property assertions. Logs: `/tmp/ai-review-f8-checks.zlykrZ/*-final.log`. The acceptance script confirmed 1.5 stale through the edited renderer, so it was reopened with its original title and no suffix; a second evaluation reports it pending. Earlier review/acceptance evidence above remains historical. Fix and acceptance follow-ups are recorded in `follow-ups/review-fixes.md`; no commit made.
