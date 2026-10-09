<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder model swap — pre-registered gate and measurement

- **Plan**: context/changes/finder-model-swap/plan.md
- **Scope**: Phase 2 of 5
- **Base**: 02bd09276b806b1b73f1119478269b340ed2c8a7 (Progress — the parent of the Phase 2 commit; the state after
  Phase 1, its triage fixes and Amendment A1)
- **Head**: d978976
- **Worktree**: included(context/changes/finder-model-swap/plan.md — Manual 2.4/2.5 confirmed by the owner this
  session and the owner's G5 note in Phase 4); excluded: `.claude/settings.local.json`, `temp_steps.md`,
  `context/changes/cloud-exif-orientation/change.md` (not this change's work)
- **Checks ran at**: d978976 (current HEAD)
- **Manual acceptance**: 2 of 2 confirmed (2.4, 2.5 — owner, 2026-10-03)
- **Date**: 2026-10-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Plan drift: §1 price and counter read MATCH (endpoints, `supported_parameters`, `reasoning.mandatory`, UTC
timestamp 11:55:58Z after both push times, T0 before the first paid call); §2 per-candidate procedure MATCH
(order luna → qwen → minimax, G2 probe alone then `--start 2 --append`, promptfoo with the registered filter and
`-j 1 --repeat 3 --no-cache`, `promptfoo-gate-rows.mjs`, G1 with the §3 inputs, counter read after each
series, luna's one-off cost report); §3 comparison correctly not applicable (one automated passer). Stop rules
applied as §5 prescribes: qwen stopped at `FAIL (G3)` without G1, minimax at `FAIL (G2)` on the probe. Every
`--max-spend` passed was ≤ §7's formula (1.60/1.60, 1.59/1.5995, 1.50/1.5958, 1.47/1.4739, 1.47/1.4724,
1.45/1.4586). Nothing from "What We're NOT Doing" was touched. Success criteria at d978976: a script over the
record exits 0 — every series has one `started` marker per attempt record with consecutive attempt numbers and
`notRun: 0` in its summary; both promptfoo exports and row files hold exactly 12 rows; the counter's maximum
$52.810547526 is under T0 + 2.00 = $54.59943383; `promptfoo-gate-rows.mjs` re-run on both exports reproduces the
committed row files byte for byte (exit 0 and 1). The Pre-registration (`f6dc0fb0…e34e`) and A1
(`dc423199…bb9c`) hash unchanged at d978976; the Results were purely appended. An independent analysis agent
recomputed every number in the Results from the six JSONL files, the exports, the logs and the key reads: all
verdict-bearing figures reproduce; three immaterial discrepancies and several omissions are F2, F4 and F6 below.
Mutation check: skipped — no `test-plan.md` §2 risk maps to the measurement tooling or the gate record.

## Findings

### F1 — Evidence for "not-run attempts listed" lives outside the committed record

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/finder-model-swap/gate.md (Results); packages/code-reviewer/scripts/finder-gate.mjs:216-219
- **Detail**: Criterion 2.1 says every series has one JSONL line per attempt run "and `not-run` attempts are
  listed in its summary". The runner prints the series `SUMMARY` (`notRun`, `unrecorded`, `seriesSpend`,
  `seriesRetries`) to stdout only; the six summaries exist in the session scratch (`fms-phase2/*.log`), not in
  the repository. The committed JSONL carries no summary line, so an attempt cut by `--max-spend` would be
  indistinguishable from one never attempted. Here every `notRun` was 0 (verified from the logs), so no
  information is missing in fact — but the record cannot show that.
- **Fix**: paste the six `SUMMARY` lines (model, case, start, through, outcomes, notRun, unrecorded,
  seriesSpend, seriesRetries) into the Results per series (free); as a tooling follow-up, have the runner append
  a `{"kind":"summary",…}` line to the series file, with a test.
- **Decision**: FIX (documentation now) — the owner, 2026-10-03: the six runner `SUMMARY` lines are pasted into
  the Results beside their series, so the committed record shows `notRun: 0` for each; appending a
  `{"kind":"summary",…}` line from the runner is a follow-up (`follow-ups/review-fixes.md`), not done now.

### F2 — Ledger: one transposed digit, a mixed-basis T column, and a reconciliation stated as "≈" that is exact

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/finder-model-swap/gate.md — Ledger row 6, "T after" column; Spend
- **Detail**: (a) Row 6's "T after" cell reads "counter 0.12752338"; `key-after-qwen-g2.json` gives
  52.727027212 − 52.59943383 = 0.127593382 (a digit transposition; downstream rows are computed from the raw
  counter and are right). (b) §7 defines T as counter − T0, but the "T after" column alternates between
  counter values and telemetry-carried values, explained only in the notes. (c) The Spend section attributes
  the counter's excess over the finder total to the grader with "≈"; at the prices in `models.json`
  (`google/gemini-3.1-pro-preview` $2 / $12 per M) the grader is 7,006 × 2e-6 + 4,323 × 12e-6 = $0.065888
  (luna) and $0.066764 (qwen), $0.132652 in all, and 0.211113696 − 0.07846170 = 0.13265200 — the counter
  reconciles to the telemetry plus the grader to eight decimals. That proves two things the prose only
  gestures at: the final counter was settled, not lagging, and no unrecorded paid call hit the key in the
  window (`usage_daily` also equals T). (d) The "final re-read" row promises a re-read at commit time; the
  48-second re-read cannot settle a multi-minute lag — the exact reconciliation is what settles it. Row 6's
  Δ (exactly G2-01's telemetry) is the clean evidence for the one-series lag; the Spend cites row 4, whose
  delta includes the grader catch-up.
- **Fix**: correct the row 6 cell; add a `T (§7, counter)` column beside the telemetry-carried figure; replace
  "≈" with the exact reconciliation (24,056 grader tokens at $2/$12 per M = $0.132652 = counter − finder
  total) and state its two consequences; cite row 6 as the lag evidence.
- **Decision**: FIX — the owner, 2026-10-03: row 6's cell corrected (0.12759338); a `T (§7, counter)` column
  added beside the telemetry-carried figure; "≈" replaced by the exact reconciliation (24,056 grader tokens at
  $2 / $12 per M = $0.132652 = counter − finder total) with its two consequences (the counter was settled; no
  unrecorded paid call hit the key); row 6 cited as the lag evidence. Every change is marked
  `(corrected 2026-10-03, impl-review-phase-2 F2)` in the Results.

### F3 — Luna's Phase 2 label is not one of §5's verdict labels

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-model-swap/gate.md — Verdicts table, row 1
- **Detail**: §5 lists `PASS`, `FAIL (Gx)`, `not measured (…)`, `cannot honour the production shape (A3)`,
  `paused (G4 only) — owner`; `PASS` is earned after the hand-read. A candidate that passed the automated
  G1–G4 with the hand-read pending has no label, so the Results use `PASS (automated G1–G4)`, a qualified
  `PASS`. The owner confirmed Manual 2.5 with that wording; the gap is in the protocol, not the record.
- **Fix**: Phase 3 writes the final §5 label into the Verdicts table and marks the Phase 2 wording as the
  interim state; no amendment needed unless a later change wants an intermediate label.
- **Decision**: FIX in Phase 3 — the owner, 2026-10-03: Phase 3 writes the final §5 label into the Verdicts
  table and describes the current `PASS (automated G1–G4)` as the interim state; no amendment to the gate.

### F4 — Two imprecisions in the candidate detail

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-model-swap/gate.md — Candidate 1 G1; Candidate 2 G2
- **Detail**: Luna's G1 median is written $0.0047835; the exact value is (0.004779205 + 0.004787685) / 2 =
  0.004783445, i.e. $0.0047834 at seven decimals (a double rounding). Qwen's G2 says "every attempt made 5
  `getFileContext` calls"; the records show 5 tool calls per attempt, of which 4 were parseable
  `getFileContext` requests on attempts 03 and 04 (the fifth call carried no string `path` and was dropped
  by `pipeline.ts:405`). Neither bears on a verdict.
- **Fix**: write the median as $0.004783445 (or $0.0047834) and reword qwen's sentence to "5 tool calls per
  attempt; on 03 and 04 the fifth carried no parseable `getFileContext` path".
- **Decision**: FIX — the owner, 2026-10-03: luna's G1 median written as $0.004783445 and qwen's G2 sentence
  reworded as proposed (5 tool calls per attempt; on 03 and 04 the fifth carried no parseable `getFileContext`
  path), both marked as corrections in the Results.

### F5 — Process facts not recorded in the Results

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/finder-model-swap/gate.md (Results header); session logs
- **Detail**: Three facts about how the series ran are only in the session: the promptfoo commands carried
  output-only flags beyond the registered line (`--no-progress-bar --no-table`, env
  `PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_UPDATE=1`); luna's G1 series ran as a background process
  so a tool timeout could not interrupt an attempt (an interrupted attempt would count as failed under Phase 1's
  F1 rule); and a 52-minute gap separates qwen's G2-01 (12:37:59Z) from G2-02 (13:29:46Z) — session latency,
  with the counter unchanged across it (52.72550066 at 12:38:23Z, reconciled at 13:31:01Z), so nothing was
  spent. None affects a result; a reader of the record cannot tell that.
- **Fix**: one short "Run notes" paragraph in the Results naming the three.
- **Decision**: FIX — the owner, 2026-10-03: a short "Run notes" subsection in the Results records the three
  facts (output-only promptfoo flags and env, G1 run in the background, the 52-minute gap with the counter
  unchanged across it).

### F6 — Diagnostic signals the Results omit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/finder-model-swap/gate.md — Candidate 1 one-off report; Candidate 2 G3
- **Detail**: (a) Across all 52 luna requests the reported cost over the base-tier list price ranges
  0.108×–1.233× (median 0.229×): only G2-01's two requests sit at 1.23×, every later request is far below
  list, consistent with cache-read pricing ($0.01 per M). The §1 one-off is reported as registered; the
  sub-list pattern, which bears on how to read the 1.23×, is not. (b) Qwen's cross-hunk rows each had 1–3
  refused `getFileContext` requests (a directory path `src/lib/engines`, repeats of an already-delivered path,
  out-of-diff paths such as `src/components/UploadPanel.tsx`); luna's had none. Both are diagnostic — the
  owner's G5 addition (generation ids) already covers the follow-up for (a).
- **Fix**: add one sentence for each to the candidate detail.
- **Decision**: FIX — the owner, 2026-10-03: one sentence each added to the Results — (a) luna's cost over
  list across all 52 requests (0.108×–1.233×, median 0.229×; the 1.23× is specific to the first, uncached
  requests), (b) qwen's refused `getFileContext` requests on the cross-hunk rows.

## Review Notes

- **Bookkeeping in diff**: context/changes/finder-model-swap/gate.md, context/changes/finder-model-swap/plan.md,
  context/changes/finder-model-swap/gate-openai-clean.jsonl, gate-openai-promptfoo.jsonl, gate-openai-pr269.jsonl,
  gate-alibaba-clean.jsonl, gate-alibaba-promptfoo.jsonl, gate-minimax-clean.jsonl — the whole phase is
  measurement record inside the change folder, so these were reviewed as the implementation rather than set aside.
- Lessons: 34 of 37 entries name `impl-review`; the ones that bear here — "a guard metric that only exists on
  success…" (attempts were counted, not successful rows: 21 attempt records, 24 promptfoo rows, 0 errors), "a
  check that cannot say what it found…" (F1), "writing a fact into its canonical home…" (no stale pointer found:
  `change.md` records no Phase 2 outcome yet by design), "a large committed artifact silently blinds the AI
  review" (the six JSONL files total 78 KB and `review.yml` excludes `**/*.jsonl`).
- Independence: the reviewer also ran the measurement. Every verdict-bearing number was therefore recomputed by
  a separate analysis agent from the raw files, which also found the three discrepancies in F2 and F4 and the
  omissions in F6; its strongest result is the exact counter reconciliation in F2 (c).
- Not verifiable from the repository: GitHub's push times (recorded from the activity API at the time) and the
  remote's state at pre-flight; both are consistent with the commit times and the current `origin`.
