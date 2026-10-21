---
date: 2026-10-19T20:21:26+02:00
researcher: Claude Code (claude-opus-5-5)
git_commit: 058097490eeba01305c9349f25adf9a4d098e80f
branch: chore/advisory-review-analysis
repository: lumina-clean-ai
topic: "Is advisory AI review worth continuing? What the recorded finder results say about findings worth a fix"
tags: [research, ai-review, code-reviewer, finder, glm-5.3, hand-read, cost]
status: complete
last_updated: 2026-10-19
last_updated_by: Claude Code (claude-opus-5-5), /rune-implement advisory-review-analysis phase 2
last_updated_note: "Added the adopted owner-delegated decisions"
---

# Research: is advisory AI review worth continuing?

**Date**: 2026-10-19T20:21:26+02:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: `0580974` (`chore/advisory-review-analysis`, after merging `origin/master` `1b15eb3`)
**Branch**: `chore/advisory-review-analysis`
**Repository**: lumina-clean-ai

## Research Question

From `change.md` § Notes, with **$0 for new model calls**:

- Count concrete bugs worth a fix, false alarms, duplicates and minor remarks across the recorded finder gates.
- **Main question, about glm-5.3 low.** The owner accepted 55 of its 60 published findings, D2 was found in 1 of 9
  valid #269 runs, and the provisional cost is $6.556540/month. How many of the accepted findings actually justified
  a fix?
- Feed a recommendation (one candidate, or ending the work) and proposed criteria for an on-demand pilot. Both are
  written by `/rune-plan`; this report supplies the evidence.
- D2 is a reported weakness here, not a veto.

**Scope:** every archived finder gate with recorded findings, plus the production history of the glm-4.6 review.
**Depth:** every finding of glm-5.3 low was checked against the code at its PR head; the other candidates were
mapped from their recorded hand-reads.

## Step 3 decisions — 2026-10-19

At the owner's explicit request, Codex filled all 41 **Owner** cells in
[`worth-fix-sheet.md`](worth-fix-sheet.md#delegated-owner-decisions--2026-10-19), independently checking the source
and the disputed findings. This is a delegated decision, not an additional human hand-read. The original research
below, including its tables, retains its **proposed** classifications; the following decisions supersede them:

- **Only W1 counts as worth a fix.** W2 remains an optional improvement. The main answer is **0/55** accepted
  glm-5.3 low findings.
- `269-I12` moves from W2 to W3: both rounding rules give the same sample dimensions on all **18** frozen entries.
  The adopted glm-5.3 low totals are **0 W1 / 20 W2 / 32 W3 / 8 FA**; among the 55 accepted they are
  **0 / 20 / 32 / 3**. The optional count is therefore 20/55, not the proposed 21/55. Distinct issues:
  0 W1 / 9 W2 / 19 W3 / 7 FA.
- `247-I5` (`KEY[:24]`) is **W1**: a plausible placeholder-editing mistake reveals part of a supported secret-key
  value in output meant to be shared, contrary to the explicit contract. glm-5.3 low never raised it. The original
  statement that no other candidate has any W1 is not adopted: glm-5.3 high and sonnet-5 low did raise this issue.
- D2 remains W2. The three disputed accepted findings remain FA; all five previous rejections stand.
- **No paid pilot now; end this line of work and keep `ai-review` off.** CI and `/rune-impl-review` remain the
  review path. `/rune-plan` should formalize the close-out and carry the key-printing fix as a concrete follow-up.
  If a later decision reopens a pilot: five new PRs changing product behaviour, locally from a
  `feat/finder-glm-5-3` worktree, glm-5.3 low, measuring only W1 not already found by CI or `/rune-impl-review`.

The decision pass reproduced key-prefix printing and the D2 cleanup gap with synthetic inputs and stubbed I/O,
checked that all manifest inputs are tracked, and reproduced the Pillow file-handle behaviour. No paid evaluation
or production/account API was called. Its detailed rationale and limits are in the sheet.

## Original research summary (proposals, before step 3)

1. **Of glm-5.3 low's 55 accepted findings, none justified a fix in the W1 sense.** Checked against the code at the
   PR heads, the 60 findings split into:

   | Class          | All 60 | Of the 55 accepted | Distinct issues |
   | -------------- | ------ | ------------------ | --------------- |
   | W1 fix-worthy  | 0      | 0                  | 0               |
   | W2 valid-minor | 21     | 21                 | 10              |
   | W3 nit/noise   | 31     | 31                 | 18              |
   | FA false alarm | 8      | 3                  | 7               |

   The owner's "accept" meant "true", not "worth fixing". 56 % of the accepts (31 of 55) are true but not worth the
   author's time. Three accepts do not hold at the head: `pr247-01#F3`, `pr269-03#F5` and `pr269-09#F5`. The
   classes are proposals; [`worth-fix-sheet.md`](worth-fix-sheet.md) is where the owner decides (step 3).

2. **What one review would hand an author.**
   - **#247:** 6 findings: 3 W2, 2–3 W3, 0–1 FA.
   - **#269:** 4–6 findings: 1–3 W2, 1–5 W3, 0–2 FA.
   - **The useful part is unstable.** Five of #269's six W2 issues, D2 among them, appear in only 1 of 9 runs. The
     only W2 issue found in all nine runs (`269-I1`) is the weakest: its exit status is already correct.

3. **No candidate on record does better.** The W classes below were assigned by the analysis agents; the owner's
   own verdicts appear only as accept/reject (§ Detailed findings 2).

   | Candidate                       | Findings | W1  | W2  | W3  | FA  | D2 on #269              |
   | ------------------------------- | -------- | --- | --- | --- | --- | ----------------------- |
   | glm-5.3 high (n = 1, #247 only) | 11       | 0   | 5   | 6   | 0   | not measured            |
   | sonnet-5, three efforts         | 37       | 0   | 12  | 17  | 8   | 0/4 valid runs          |
   | gpt-6-luna (#269 only)          | 38       | 0   | 8   | 14  | 16  | 8/10 (all its W2 is D2) |

   The borderline case is `247-I5`: `KEY[:24]` on a pasted placeholder. It is the strongest W1 candidate in all the
   material, and the owner decides it.

4. **Production history points the same way.** Of about 60 production glm-4.6 findings that could still be checked:
   - **2 led to a fix**, a CI trigger filter and a stale plan checklist. Neither is a product bug.
   - **At least 37 were false**, every "critical" among them.
   - The `ai-cr:failed` verdicts on #127, #134 and #172 rested on fabricated claims.
   - No product-code fix ever came from the AI review.

5. **The test corpus could not have shown W1 value.**
   - Both gate PRs, #247 and #269, are maintainer-only tooling. The only known defect, D2, is itself W2, and it is
     still unfixed on `master` two weeks after the owner confirmed it.
   - Since 2026-09-01, **1 of 85 merged PRs changed product source** (#240), and it got no AI review: every finder
     run failed from 2026-09-20.
   - So "W1 = 0" is an honest count but a weak test of a model. It mostly says that this repository's PR mix holds
     little for an advisory reviewer to find.

6. **Cost is not the constraint; value is.**
   - glm-5.3 low costs $0.059 on a #247-sized review and $0.102 on a #269-sized one.
   - The $6.56/month projection uses a September workload: 61 runs, only 3 of them on product code.
   - Restricted to code-changing PRs, about 11 in seven weeks, a month would cost well under $2.
   - Meanwhile the agent-run `/rune-impl-review` already records about 126 FIXED decisions across 56 reviews.

**What this supports.** The evidence leans towards **ending the work**: keep `ai-review` off and rely on CI plus
`/rune-impl-review`. If a pilot is still wanted, **glm-5.3 low is the only candidate the records support**: all
automated gates passed, it has the lowest false-alarm rate per finding among the reliable configurations (8/60), and
it fits within cost. The pilot would have to measure **W1 per reviewed code-changing PR that CI and
`/rune-impl-review` did not already catch**. No recorded gate has measured that. `/rune-plan` owns both choices.

## Detailed Findings

### 1. glm-5.3 low: the 60 findings, checked at the PR heads

Sources: `git show origin/feat/finder-glm-5-3:context/archive/2026-10-11-finder-glm-5-3/<file>`, including `gate.md`
(§ Results `:570-613`, § Hand-read `:655-694`), `hand-read-247.md` and `hand-read-269.md`. The code is at the PR
heads in `~/.cache/finder-sonnet-gate/wt-247` (`dec09f8`) and `wt-269` (`fca2778`), clean detached worktrees.

**Gate facts:**

- G2 5/5, G3 pass, reliability #247 2/2, G1 9/10. `pr269-06` is a technical judge failure (`gate.md:633-643`).
- m247 $0.059289, m269 $0.102397, provisional $6.556540 (`gate.md:608-610`).
- **Every published finding was `minor` or `nit`** (`gate.md:647`).

**#247** (12 findings, 2 runs, all owner-accepted):

- Classes: 0 W1, 6 W2, 5 W3, 1 FA.
- The 6 W2 cover 4 distinct issues: 247-I1 to I4. Three of them came up in both runs.
- **`pr247-01#F3` is a false alarm** although it was accepted. A real urllib `HTTPError`, raised against a local
  stub, prints the source line and `HTTP Error 400: Bad Request`, never the signed URL. The scripts' contract covers
  the key, not signed URLs (`scripts/prod-fetch-results.py:14-15` at the head).
- `pr247-01#F1` and `02#F1` repeat a claim that the owner **rejected** on 2026-10-06 as finder-sonnet R2, so the two
  hand-reads disagree.
- Per run: `pr247-01` has 3 W2, 2 W3, 1 FA; `pr247-02` has 3 W2, 3 W3, 0 FA.

**#269** (48 findings, 9 valid runs; the owner accepted 42, rejected 5 and approved 1 as D2):

- Classes: 0 W1, 15 W2, 26 W3, 7 FA.
- **The analysis agrees with all 5 owner rejects.**
- It reads two accepts as FA. In `pr269-03#F5` and `pr269-09#F5` the premise "a machine without the private test
  photos" is false: the inputs are tracked in `test-photos/licensed/`. Reclassifying them changes no gate outcome.
- Distinct W2 issues: D2 (`269-I8`), the unbounded poll loop (`I7`), a failed download that exits 0 (`I9`), sRGB vs
  encoded pixel values (`I11`), `round()` vs `Math.round` (`I12`), and the unguarded baseline in `compare()` (`I1`).
  `I7` and `I9` existed at base.
- **Why nothing reaches W1.** The code is maintainer-only tooling of a closed change, and nothing outside
  `context/archive/` refers to it on `master`. Its failure paths are rare and loud. A Bread call costs about
  $0.0006, and the uploaded inputs are CC-licensed photos in the maintainer's own Replicate account.
- **Duplicates.** One within-run duplicate (`pr269-01#F5`/`#F6`, one issue, one fix). Cross-run repeats are
  heavy: `269-I1` appears in 9/9 runs, and the dead `data:` branch and the caption escaping in 5/9 each.

**Per-run view, #269:**

| Run      | N   | W2  | W3  | FA  | D2  |
| -------- | --- | --- | --- | --- | --- |
| pr269-01 | 6   | 3   | 2   | 1   | no  |
| pr269-02 | 4   | 2   | 2   | 0   | no  |
| pr269-03 | 6   | 2   | 3   | 1   | yes |
| pr269-04 | 6   | 2   | 3   | 1   | no  |
| pr269-05 | 5   | 1   | 2   | 2   | no  |
| pr269-07 | 5   | 1   | 4   | 0   | no  |
| pr269-08 | 6   | 1   | 5   | 0   | no  |
| pr269-09 | 6   | 1   | 4   | 1   | no  |
| pr269-10 | 4   | 2   | 1   | 1   | no  |

**Still on `master`?** Yes, every W2 issue of both PRs. The reviewed scripts are byte-identical between the PR heads
and `origin/master`. D2, for example, is at `scripts/spikes/bread-spike.ts:191-194` and `269-I1` at
`scripts/s17/desktop-stats.ts:105`.

**Real defects at the heads that no glm-5.3 low run reported:**

- `247-I5` (`KEY[:24]`) and `247-I6` (the unpaginated census), both raised by glm-5.3 high.
- The SIGINT upload leak in `bread-spike.ts`, a sibling of D2.

### 2. The other candidates on record

All figures are from archived records. W classes are agent-derived except where the owner's verdict is quoted.

| Candidate (config)                                                     | Runs read                    | N                     | Owner accept / reject     | W1  | W2    | W3  | FA                    | D2 on #269   | Cost per run (#247 / #269)                            | Monthly                             | Verdict                    |
| ---------------------------------------------------------------------- | ---------------------------- | --------------------- | ------------------------- | --- | ----- | --- | --------------------- | ------------ | ----------------------------------------------------- | ----------------------------------- | -------------------------- |
| **glm-5.3 low** (`z-ai/glm-5.3`, effort low)                           | 2 + 9                        | 60                    | 55 / 5                    | 0   | 21    | 31  | 8                     | 1/9          | $0.059 / $0.102                                       | $6.56 (prov.)                       | NOT ADMITTED (hand-read)   |
| glm-5.3 high                                                           | 1 (#247)                     | 11                    | not hand-read             | 0   | 5     | 6   | 0                     | not measured | $0.140 / —                                            | > $10 (53·m247 alone $7.42 > $7.40) | STOP (c: cost), screening  |
| sonnet-5 as finder, effort high                                        | 1 valid (#247); #269 invalid | 5                     | 3 / 2                     | 0   | 3     | 1   | 1                     | 0 valid      | $0.163 / $0.334 (invalid)                             | $13.90                              | NOT ADMITTED (reliability) |
| sonnet-5, effort low                                                   | 2 + 2                        | 16                    | all unresolved = rejected | 0*  | 5*    | 7   | 4                     | 0/2          | $0.057 / $0.127                                       | $6.63                               | NOT ADMITTED (hand-read)   |
| sonnet-5, effort medium                                                | 2 + 2                        | 16                    | all unresolved = rejected | 0   | 4     | 9   | 3                     | 0/2          | $0.078 / $0.332                                       | $9.37                               | NOT ADMITTED (hand-read)   |
| gpt-6-luna (`openai/gpt-6-luna`, reasoning off)                        | 10 (#269)                    | 38 (20 rows)          | 1 row / 19 rows           | 0   | 8     | 14  | 16                    | 8/10         | finder $0.0048 median; ≈ $0.023 with judge (estimate) | none recorded                       | FAIL (G3 hand-read)        |
| qwen3.8-flash                                                          | fixtures only                | —                     | —                         | —   | —     | —   | —                     | —            | fixture median $0.0007                                | —                                   | FAIL (G3 fixtures)         |
| minimax-m3                                                             | probe only                   | 2 on a clean diff     | —                         | —   | —     | —   | 2                     | —            | $0.003                                                | —                                   | FAIL (G2)                  |
| luna + luna verifier (CONTROL)                                         | fixtures                     | —                     | —                         | —   | —     | —   | —                     | —            | —                                                     | —                                   | FAIL (G3f)                 |
| Frozen-finding verifiers (luna; sonnet-5) over luna's 38 #269 findings | 114 + 114 verifier calls     | would publish 20 / 22 | —                         | 0   | 1 row | —   | 9 of 10 rows rejected | —            | $0.0004 / $0.023 per call                             | —                                   | FAIL, both classes         |

\* In sonnet-5 low, one analysis pass rated the `KEY[:24]` issue (`247-I5`, 2 findings in one run) W1. This report
counts it as W2, in line with the #247 pass, and leaves it to the owner (sheet, note 5).

Sources:

- glm-5.3 high: `origin/feat/finder-glm-5-3-high:context/archive/2026-10-16-finder-glm-5-3-high/screening.md`
  `:270-310`.
- sonnet-5: `context/archive/2026-10-05-finder-sonnet/gate.md:376-466`; `context/archive/2026-10-06-finder-sonnet-effort/gate.md:450-614`
  and `hand-read-247.md` / `hand-read-269.md`.
- luna, qwen and minimax: `context/archive/2026-10-02-finder-model-swap/gate.md:357-503` and
  `hand-read-269-presort.md:19-72`.
- CONTROL: `context/archive/2026-10-03-finder-verification/gate.md:697-750`.
- The frozen-finding verifiers: `context/archive/2026-10-09-finder-verifier-frozen/gate.md:307-392` and
  `context/archive/2026-10-10-finder-verifier-frozen-sonnet/gate.md:359-474`. Their per-row tallies are this
  research's derivation from the series reports, not recorded verdicts.

What the table shows:

- **A higher severity label does not mean a correct finding.** luna's 12 `major` findings all sit on rejected rows,
  and its D2 was `minor` in all 8 attempts (model-swap `hand-read-269.md:22-41`).
- **Recall and precision trade off across models.** luna finds D2 8/10 but is 42 % FA. glm-5.3 low finds D2 1/9 at
  13 % FA. sonnet-5 never found it in a valid #269 run.
- **A verifier does not rescue precision.** Both verifiers would still publish 9 rejected rows out of 10. sonnet as a
  verifier even refuted the true D2 on a false "`finally` covers it" premise
  (`context/archive/2026-10-10-finder-verifier-frozen-sonnet/series-sonnet-report.md:296-304`).
- **The owner's hand-reads differ in strictness.** For luna, "missing tests for tooling" and "friendlier message"
  were rejected: 10 of its 19 rejected rows are W3 policy cases
  (`context/archive/2026-10-02-finder-model-swap/hand-read-269-presort.md:67-72`). For glm-5.3 low, the same kinds
  of claim were accepted (`269-I5`, `269-I16`). Counted under one rule, the candidates move closer together. That
  is why this report counts W classes rather than accept/reject.

### 3. Production history (glm-4.6, live 2026-08-08 to 2026-09-19)

| PR                           | What the review said                                          | Outcome                                                            | Source                                                                                    |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| #115                         | F7: `review.yml` had no `branches: [master]` filter           | **fixed** (`4116d17`)                                              | `context/archive/2026-08-07-ci-cd-code-review/verification.md:35`                         |
| #115                         | "PATCH -F will fail"; F5, a missing author check              | false; F5 was already fixed after a Codex review                   | same `:31`                                                                                |
| #127                         | 10 findings                                                   | 4 contradicted by the cited code, 4 in the wrong category, 2 empty | `context/archive/2026-08-13-finder-security-vocabulary-bias/plan.md:22-23`                |
| #134                         | 7 "critical/security" findings                                | false or ignored                                                   | sticky comment, run 31743227826                                                           |
| #143                         | plan-aware P2: the plan checklist described a deleted matcher | **fixed** (documentation)                                          | `context/archive/2026-08-13-finder-security-vocabulary-bias/reviews/impl-review.md:14-26` |
| #146                         | Run A: 8 "critical"; run B, same input: 0                     | false                                                              | `context/foundation/review-pipeline-verification.md:96-110`                               |
| #172                         | FAILED on 3 import claims                                     | all 3 false (`index.ts:213`, `sentry-scrub.ts:27`)                 | sticky comment; `126ba0b`                                                                 |
| #177                         | 7 findings on `packages/fixturepkg/*`, which never existed    | false; led to reviewer fixes, not code fixes                       | `context/archive/2026-08-24-offdiff-detector-backtest/change.md:14-24`                    |
| #149, #150, #170, #198, #205 | minor and nit items                                           | ignored; still on `master`                                         | sticky comments                                                                           |

**Counts:** 2 fixed, at least 37 false, about 15 ignored minor items, and about 6 accurate items needing no action.
Of the 8 merged PRs labelled `ai-cr:failed`, only #115 changed because of the review. Of glm-4.6's 50 distinct #269
findings in `finder-serialization-outage`, 10 were rejected and 40 left unresolved
(`context/archive/2026-10-02-finder-model-swap/change.md:66-77`).

**How thin the evidence is.** Run artifacts expire after 14 days, and the sticky comment keeps only the last run.
From 2026-09-05 to 09-13 only 10 sticky comments were sampled. No record anywhere weighs the review's value against
its cost.

### 4. Volume: how much there is to review

**Where the cost weights come from.** `53 × m247 + 8 × m269 + 13 × I` is derived at
`context/archive/2026-10-05-finder-sonnet/gate.md:177-231`.

- The window is 2026-09-05 to 10-04: 62 PRs, 61 observed review runs.
- Each run is priced by diff size around a 38,146 B midpoint: 53 at #247's cost, 8 at #269's.
- 13 of the runs carried a plan.
- sonnet-effort already records it as "not a measurement of demand"
  (`context/archive/2026-10-06-finder-sonnet-effort/gate.md:566-568`).

**What those 61 runs were:**

- 25 on 20 bookkeeping PRs and 17 on docs PRs;
- 16 on tooling, scripts or CI;
- **3 on the only product-code PR, #240**;
- up to 17 re-runs of a broken finder.

**Merged since 2026-09-01:** 85 PRs (63 in September, 22 in October):

- 44 bookkeeping, 24 of them `.md` only;
- 30 docs;
- 9 tooling, scripts or CI;
- 2 touching app or test paths: #240 and #297, a skill-routing test.

Checked here: `git log origin/master --since=2026-09-01 -- src supabase/functions supabase/migrations` lists only
`f8a514b` (#240). Since 10-05, 19 PRs were merged, 14 of them bookkeeping.

**#240 itself** has no AI review comment: `gh pr view 240` shows only the Cloudflare deploy comment. It was merged on
2026-09-21, after the finder started failing on 09-20.

**Consequence for a pilot:**

- If eligibility means "code-changing, not bookkeeping and not `.md`-only", 5 eligible PRs take about three weeks
  at the recent rate of about 11 in seven weeks.
- If it means product source only, 5 PRs could take months.

### 5. The review coverage that already exists

**`/rune-impl-review` and Codex reviews.** 56 review files have been archived since 2026-08-08: 25 APPROVED, 29 NEEDS
ATTENTION, 2 REJECTED. Their decisions include about 126 FIXED, 21 ACCEPTED and 15 PENDING (a count over
`**Decision**:` lines). Spot-checked real fixes:

- `atomic-cloud-daily-cap` F1: `SECURITY DEFINER` → `INVOKER`;
- `cloud-quality-below-local` F1–F4: script bugs, fixed in `48b6766`;
- `finder-glm-5-3-high` F1: a symlink got past a write guard, fixed in `2ffe24b`.

Caveat: these dispositions are written by the same workflow, and many fixes are documentation drift.

**CI** (lint, typecheck, unit, Deno check/test, integration, e2e) already catches a claim like "missing import"
(#172) mechanically.

**The overlap between the two is unmeasured.** No record shows a CI AI-review finding that `/rune-impl-review` had
missed. The marginal value of CI advisory review is therefore unknown, and it is bounded above by what those two
leave behind.

### 6. Budget and preconditions for any paid run

**OpenRouter key.**

- The limit is $59.936398 = usage(T0_s) $59.186398 + $0.75 (glm-5.3-high `screening.md:276`).
- The screening spent $0.208963, which leaves **$0.541037 of headroom**.
- A $2 pilot needs the limit raised first.

**Account credit.** About $5.60 left. That is an inference: $65 total credits
(`origin/feat/finder-glm-5-3:…/research.md:222`) minus usage. It was not re-read today. The CI secret's key is not
recorded.

**Code location.** The two-stage finder and the glm-5.3 configuration exist only on `feat/finder-glm-5-3` (`ac6bbb1`)
and `feat/finder-glm-5-3-high` (`0cbf03e`). Both were kept off `master` on purpose. `master`'s `review.yml` still
carries the `false &&` from `68151b0` (R11).

**Two ways to run a pilot:**

- **Locally, on demand:** run the CLI from a worktree of the branch against a new PR's diff. No merge is needed.
- **In CI:** merge the finder and the configuration, and lift `false &&` for the pilot only.

**Re-enabling.** The recorded condition for turning `ai-review` back on is a finder that passed its gates
(`context/archive/2026-10-03-finder-verification/change.md:110-111`). A pilot that skips those gates is a new owner
decision. "The old STOP stands" (`temp_steps.md:29`).

## Code References

All `scripts/…` references are at the PR heads and unchanged on `origin/master`.

**#247:**

- `scripts/prod-fetch-results.py:14-15`: "never stored, logged or printed", the contract that `247-I5` breaks and
  `247-I20` misreads.
- `scripts/prod-fetch-results.py:52-54`, `scripts/prod-result-dimensions.py:56-58`: `KEY[:24] + "..."` in the
  placeholder branch (`247-I5`).
- `scripts/prod-fetch-results.py:77-78,90`: exact 8-character matching and the stale-file check (`247-I2`,
  `247-I1`).
- `scripts/prod-result-dimensions.py:117-119,138`: no 206 check, and `CONFIRMED` despite unreadable jobs (`247-I4`,
  `247-I3`).

**#269:**

- `scripts/spikes/bread-spike.ts:189-195`: D2, `process.exit(1)` before `uploadedFileId` is returned (`269-I8`).
- `scripts/spikes/bread-spike.ts:127-131,226-229`: the unbounded poll loop and the exit-0 download failure
  (`269-I7`, `269-I9`).
- `scripts/s17/desktop-stats.ts:105`: `const a = base[id];` with no guard (`269-I1`, 9/9 runs).

**Pipeline:**

- `.github/workflows/review.yml:23-29`: why `ai-review` is off, and the condition for lifting it.
- `packages/code-reviewer/src/judge.ts:72`: the judge's structured output, the source of `pr269-06`'s
  `NoOutputGeneratedError`. This is the line on `feat/finder-glm-5-3`.

## Architecture Insights

- **The gate measured the wrong unit for this question.** Every gate since `finder-model-swap` judges "real or not"
  per finding, and D2 per #269 run. None asks "worth the author's time". So a finder can pass on true-but-useless
  findings, and fail on the one defect the owner does not fix either.
- **Precision depends on the rule, not only the model.** The same kind of claim, such as a missing test for tooling
  or a friendlier error message, was rejected for luna and accepted for glm-5.3 low. A pilot needs W classes written
  down **before** the run, not a fresh accept/reject read.
- **Run-to-run variance dominates what one author sees.** With 9 runs on the same diff, only one W2 issue is stable,
  and it is the weakest. A pilot of 5 PRs with one run each samples that variance once per PR. It cannot tell a
  lucky review from a good model, which repeats lesson F-a
  (`context/archive/2026-10-03-finder-verification/follow-ups/successor.md:6-18`).
- **The corpus encodes its own answer** (lesson `lessons.md:166-171`, applied here). Both frozen PRs are dormant
  tooling. A gate built on them can measure precision, but it cannot show fix-worthy value, because there is
  little to find. A pilot on real new PRs is the only instrument here that could.

## Historical Context (from prior changes)

- `context/archive/2026-10-02-finder-model-swap/gate.md`: G1–G5, the hand-read threshold, and D2 as a required match.
  Change.md `:33-34`: at creation, no configuration had ever met G3's hand-read clause.
- `context/archive/2026-10-03-finder-verification/`: the verifier idea; F-a (finder recall variance) and F-b
  (compound findings).
- `context/archive/2026-10-05-finder-sonnet/`: sonnet-5 as finder, the 53/8/13 workload, and the owner's acceptance
  of about $5–10/month (`change.md:14-15`).
- `context/archive/2026-10-06-finder-sonnet-effort/`: the efforts are reliable and within cost, but D2 was missed in
  every #269 run; "facts for a successor, not a recommendation" (`gate.md:611-614`).
- `context/archive/2026-10-09-finder-failure-scenario/`: the failure-scenario bar "improves the form of a finding,
  not its truth"; recall is unsolved (`phase0.md:327-348`).
- `context/archive/2026-10-09-finder-verifier-frozen/` and `…-frozen-sonnet/`: neither verifier tells truth from a
  convincing falsehood reliably. The owner noted that a 2/3 majority "is not bad either, since the review is
  advisory" (`2026-10-09-finder-verifier-frozen/change.md:88-89`), the only recorded tolerance.
- `origin/feat/finder-glm-5-3:context/archive/2026-10-11-finder-glm-5-3/`: glm-5.3 low, NOT ADMITTED (hand-read).
- `origin/feat/finder-glm-5-3-high:context/archive/2026-10-16-finder-glm-5-3-high/`: glm-5.3 high, STOP (c: cost)
  after one run; APPROVED implementation review; F1 fixed in `2ffe24b`.
- **A record discrepancy, not corrected because the archive is immutable.**
  `context/archive/2026-10-09-finder-failure-scenario/change.md:50` says luna found D2 in "8/8 attempts". The gate
  records **8 of 10** valid attempts (`phase0.md:63`, `2026-10-02-finder-model-swap/gate.md:357-365`).

## Related Research

- [`worth-fix-sheet.md`](worth-fix-sheet.md): the companion this research wrote. It lists one row per distinct
  issue: the 35 issues of glm-5.3 low on #247 and #269, plus 5 W2 issues on #247 that only other candidates raised.
  Each row has the historical gate verdict, the proposed W class and a completed **Owner** column recording the
  delegated step-3 decisions.
- `origin/feat/finder-glm-5-3:context/archive/2026-10-11-finder-glm-5-3/research.md`: glm-5.3 screening and the
  credit figure.
- `context/archive/2026-10-03-finder-verification/research.md`: the excerpt policy, and why the judge is blind by
  contract.

## Open Questions

1. **Resolved (delegated step 3):** all Owner cells are filled. `247-I5` is W1, D2 is W2, `247-I20` and both
   `269-I2` findings are FA. `269-I12` is W3. See the decision section above and the sheet for the full rationale.
2. **Resolved:** W2 does not enter the worth-a-fix headline. Adopted counts: 0/55 W1 and 20/55 optional W2.
3. **Resolved direction for `/rune-plan`:** no pilot now; formalize ending the work. A later pilot, if reopened,
   would use product-behaviour-changing PRs and run locally from the experimental branch's worktree.

4. **Unmeasured:** how far a CI AI review overlaps `/rune-impl-review` and CI. A pilot should score only W1 issues
   that neither already found. Otherwise it measures redundancy as value.
5. **Not re-read today.** The OpenRouter account credit (about $5.60, inferred) and which key the CI secret uses.
   The key limit's headroom of $0.541037 is computed from recorded figures, and a $2 pilot needs it raised.
6. **Not verified (from the delegated checks):**
   - whether Replicate's upload API can succeed without `urls.get` (D2's trigger) and when uploaded files expire;
   - whether production Storage honours Range on signed URLs (`247-I4`);
   - which key type the maintainer pastes (`247-I5`); the delegated W1 decision relies on a supported format and a
     synthetic reproduction, not on an observed disclosure of a real credential;
   - the `TypeError` path of `269-I1`, inferred from the code and not run.
7. **The workload weights.** 53/8/13 overstate a code-changing month. Any pilot cost estimate should use eligible PRs
   only.

## Follow-up Research 2026-10-19: adopted decisions

Appended by `/rune-implement` (Phase 2 of [`plan.md`](plan.md)) after the owner-delegated decisions of 2026-10-19
were adopted. Nothing above this section was rewritten; only the frontmatter's `last_updated_by` and
`last_updated_note` changed. The previous `last_updated_by` was "Codex (delegated step-3 decisions; original
research retained)". **Where this section and the proposals above disagree, this section is the last word.** The
decisions and their rationale are in
[`worth-fix-sheet.md` § Delegated owner decisions](worth-fix-sheet.md#delegated-owner-decisions--2026-10-19); the
close-out that acts on them is [`close-out.md`](close-out.md).

### Deltas against the proposals

| Item                                                                                            | Proposed above                                                 | Adopted                                                | What it changes in this report                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `269-I12` (`round()` vs `Math.round`)                                                           | W2 (borderline W3)                                             | **W3**                                                 | glm-5.3 low, of the 55 accepted: W2 **20/55** (not 21/55), W3 **32/55** (not 31/55). Distinct issues: 0 W1 / 9 W2 / 19 W3 / 7 FA (not 10 W2 / 18 W3)   |
| `247-I5` (`KEY[:24]`)                                                                           | W2, borderline W1                                              | **W1**                                                 | "W1 0 for every candidate" no longer holds: glm-5.3 high and sonnet-5 low raised it. It still holds for glm-5.3 low, which never raised it             |
| The three disputed accepts (`pr247-01#F3` = `247-I20`; `pr269-03#F5`, `pr269-09#F5` = `269-I2`) | FA                                                             | **FA**                                                 | None: FA stays 3/55 of the accepted, 8/60 of all findings                                                                                              |
| D2 (`269-I8`)                                                                                   | W2                                                             | **W2**                                                 | None: D2 stays a reported weakness, not a veto                                                                                                         |
| Threshold                                                                                       | open (Open Questions 2)                                        | **Only W1 counts as worth a fix**                      | The headline is **0/55** accepted glm-5.3 low findings worth a fix; W2 is optional and stays out of it                                                 |
| Direction                                                                                       | ending the work, or a glm-5.3 low pilot (§ What this supports) | **End the work; no paid pilot; `ai-review` stays off** | CI and `/rune-impl-review` remain the review path. A later pilot needs a new owner decision and a new change; its draft criteria are in `close-out.md` |

### Statements above that these deltas supersede

- Original research summary, item 1: the table's W2 21 and W3 31 (all 60 and of the 55 accepted) and its 10 W2 /
  18 W3 distinct issues.
- Original research summary, item 3: the W1 column of 0 for glm-5.3 high and sonnet-5, and the sentence that leaves
  `247-I5` to the owner.
- § Detailed Findings 1, #269: "0 W1, 15 W2, 26 W3, 7 FA" is now 0 W1, 14 W2, 27 W3, 7 FA, and `I12` leaves the list
  of distinct W2 issues.
- § Detailed Findings 2: the glm-5.3 low row's W2 21 and W3 31, the W1 0 of the glm-5.3 high and sonnet-5 low rows,
  and the footnote that counts `247-I5` as W2.

The § Step 3 decisions section near the top already stated these deltas in prose; this section lists them in one
place, at the end, where the research skill's follow-up convention puts them.

### What stays open

Open Questions 4–7 are not answered by the close-out. They do not block it, because no pilot runs. Questions 4
(overlap with CI and `/rune-impl-review`) and 5 (credit, key limit and the CI secret's key) are carried into
`close-out.md` § Dormant pilot criteria as prerequisites of any reopened pilot.
