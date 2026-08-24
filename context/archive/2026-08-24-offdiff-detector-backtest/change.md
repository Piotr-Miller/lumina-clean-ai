# Backtest evidence for the off-diff finding detector

**Status:** ready
**Opened:** 2026-08-24
**Validates:** `offDiffFindingPaths` (PR #184, `context/archive/2026-08-24-review-offdiff-detection/`)

The detector shipped with unit tests only. Those pin the mechanics against a
fixture; they cannot show whether it **false-positives on real model output**.
This records the measurement that can, and commits the harness that produced
it — because the evidence has an expiry date and the claim will need renewing.

## Result

|                        |        |
| ---------------------- | ------ |
| PRs replayed           | **42** |
| real findings examined | **96** |
| off-diff paths flagged | **7**  |
| PRs with any flag      | **1**  |

Every flag is on **PR #177** — the known-bad review, where the finder read a
generated fixture's payload instead of the pull request and filed all seven
findings against paths that exist in no version of this repository
(`packages/fixturepkg/src/*`, `context/fixture/notes-*.md`).

So: **89 real findings across 41 healthy PRs produced zero false positives**,
and 7 of 7 on the one review known to be wrong.

## Why the harness is committed rather than thrown away

`ai-review-output` artifacts are deleted after **14 days**. The sample is
therefore perishable — the evidence above cannot be reconstructed next month,
and a future reader asking "is this detector trustworthy, can I delete it?"
would otherwise have only an assertion. `packages/code-reviewer/scripts/offdiff-backtest.mjs`
re-runs it against whatever artifacts currently survive. It makes no model
calls and needs no API key: it replays a shipped pure function over stored
JSON.

## The methodological trap, recorded because it inverts the result

Each PR is replayed under the exclusions that were **live at the time**, not
today's. `**/ground-truth/*` shipped in PR #179; applying it retroactively to
#175–#177 would strip the very payload that starved those reviews, so the
detector would score a clean sheet **on the exact cases it exists to catch** —
a backtest that appears to validate and in fact proves the opposite. The rule
is encoded in `excludesForPr()` rather than left to whoever runs it next.

The same discipline as verifying the format gate by deliberate break, and the
inverse of the freeze that recorded a hash without ever comparing it: a check
that cannot fail is not evidence.

## Honest limits

- One known-bad case, not a population of them. The detector's recall is
  demonstrated against a single incident; the strong number here is the
  **false-positive rate**, not sensitivity.
- 42 PRs is what retention allowed on 2026-08-24, and they skew toward this
  repo's recent code-reviewer work. A later run will draw a different sample.
- It measures the detector, not the underlying cause. `PROSE_PATH_PATTERN` is
  still a binary test; this makes the class observable, it does not remove it.

## Verification

- [x] committed harness reproduces the numbers above byte-for-byte from the
      same artifact set
- [x] `packages/code-reviewer` — lint, typecheck, 608 tests
- [x] `npm run format:check` clean (the new gate from PR #185 covers this script)

---

**Archived 2026-08-24.** Shipped in PR #186.
