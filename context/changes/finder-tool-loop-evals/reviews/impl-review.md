<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Finder Tool-Loop Evals + Model Decision

- **Plan**: `context/changes/finder-tool-loop-evals/plan.md`
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-08-12
- **Verdict**: APPROVED (borderline — 2 warnings, both documentation-only)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Every finding is a consistency defect in the change's own documents; there are no implementation
defects. All 27 Progress rows are `[x]`. All automated criteria re-run green: 359 tests, `tsc` exit
0, `eslint` exit 0 on the touched eval files, `promptfoo validate` valid, both snapshots valid JSON
(48 + 36 rows; 22 rows with `toolCalls > 0`; 84/84 rows with cost > 0).

Scope guardrails from "What We're NOT Doing" verified UNCHANGED against master: `prompts.ts`,
`schemas.ts`, `judge.ts`, `review.yml`, `ci.yml`, `ai-review/action.yml`. No eval results committed
under `packages/`. Fixture-tree exclusions intact in both `tsconfig.json` and `eslint.config.js`.

**Method note**: this pass was performed by the change's author (standing session instruction
forbids spawning sub-agents), which is structurally weak for the error class that slipped through
earlier — two prose miscounts. Compensated by verifying every number mechanically (`gh run view`
per run id, provider labels enumerated from the snapshots, guardrails diffed against master, all
criteria re-executed) rather than by re-reading prose. The four per-phase Codex reviews are the
independent coverage; this pass adds cross-phase coherence, which is where all four findings landed.

## Findings

### F1 — Criterion 4.4 is checked complete but recorded as a deviation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `plan.md:550` vs `verification.md:267`
- **Detail**: Progress reads `- [x] 4.4 Live PR run shows non-zero getFileContext calls and
delivered context — 2caf9b8`, while the verification evidence row for the same criterion reads
  `**PARTIAL** — 4 calls logged; delivery INFERRED, not logged`. Phase-4 F3 correctly downgraded 4.4
  to a documented deviation, but the checkbox was left claiming a pass. A reader trusting Progress
  gets the opposite answer from one trusting the evidence table.
- **Fix**: Annotate the Progress row to match its own evidence — keep `[x]` (the phase is done) but
  append `— PARTIAL, delivery inferred; see verification.md § Criterion 4.4 deviation`.
- **Decision**: FIXED — Progress row 4.4 now carries the PARTIAL annotation and points at the
  deviation section, so the checkbox and the evidence table agree.

### F2 — Superseded "Adopt haiku-4.5" reads as live mid-document

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `decision.md:137–139` (§ Recommendation), and § "What Phase 4 must confirm"
- **Detail**: `decision.md` is a 400-line layered document holding three successive recommendations.
  § Recommendation still opens "Adopt **anthropic/claude-haiku-4.5** as the production finder" — a
  model the live runs falsified twice. The top-of-file banner covers this globally, but § headings
  are jumped to directly and carry no local marker. § "What Phase 4 must confirm before anything
  changes" has the same problem, written in the future tense about completed work.
- **Fix**: Add a one-line superseded banner under each of the two stale headings, pointing at
  § Final decision (no change).
- **Decision**: FIXED — both § Recommendation and § "What Phase 4 must confirm" now open with a
  SUPERSEDED banner naming what overturned them and pointing at § Final decision (no change). The
  Phase-4 banner additionally states the per-criterion outcome, so a reader landing there learns
  which exit criteria were met, which became a deviation, and that the flip was declined.

### F3 — Plan's Desired End State says "four-model matrix"; six shipped

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `plan.md:75`
- **Detail**: The round-2 candidate search added two providers, so the config holds six. Recorded in
  verification.md deviation 11 and corrected in the eval README, but the plan's own end-state
  sentence still says four — and the plan is what a future reader diffs reality against.
- **Fix**: Append an addendum note to Desired End State pointing at deviation 11.
- **Decision**: FIXED — Desired End State now carries a dated addendum recording the six-provider
  outcome, pointing at deviation 11, and noting that the section's own verification clause was met
  with the no-change decision.

### F4 — Production source touched three ways in a "change nothing" change

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/reviewer.ts`, `src/config.ts`, `src/cli.ts`, `src/pipeline.ts`
- **Detail**: Three categories of production edit in a change whose outcome is "no production
  change": (a) usage accounting in `reviewer.ts` — deviation 2, load-bearing for criterion 3.3;
  (b) `DEFAULT_MODEL` in `config.ts` — phase-4 F1, owner-approved; (c) unrelated prettier reflow in
  `cli.ts` and `pipeline.ts`, collapsing previously-wrapped lines to the root config's 120 width.
  (a) and (b) are documented and justified. (c) is pure churn that inflates the production diff and
  was never decided by anyone.
- **Fix**: None recommended — reverting (c) would itself be churn, and the reflowed files now match
  the repo's prettier config. Recorded so the next reviewer is not surprised by formatting in the
  diff.
- **Decision**: ACCEPTED — no action. (a) and (b) stand as documented, justified deviations; (c) is
  left in place because reverting formatting is itself churn and the reflowed files now match the
  repo's own prettier config. Recorded for the next reviewer.
