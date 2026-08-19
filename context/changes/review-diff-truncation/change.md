---
change_id: review-diff-truncation
title: Diff truncation makes the implementation review report present work as missing
status: new
created: 2026-08-19
updated: 2026-08-19
archived_at: null
---

## Notes

A PR carrying a generated snapshot gets a review that confidently declares present files missing, at
CRITICAL severity, with a `REJECTED` verdict. Observed on PR #143
([run `31844849055`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31844849055)) and
diagnosed in `context/archive/2026-08-13-finder-security-vocabulary-bias/reviews/impl-review.md`.

**The model was not wrong.** It is the framing of this defect that matters, because it decides the fix.
Given the window it was shown, `MISSING` was the correct inference and `REJECTED` was the mandated
consequence. The bug is upstream of the model, in two places.

### What the review actually saw

The reviewed diff is capped at `DIFF_CAP_BYTES = 100_000` (`packages/code-reviewer/src/pipeline.ts:40`).
PR #143's diff was **841,417 bytes** with both existing exclusions applied — **8.4× the cap**. `git diff`
emits paths in sort order, so the 100 KB window reached exactly five files, four of them prose and the
fifth machine-generated, all under `context/archive/`:

```
context/archive/2026-08-13-finder-security-vocabulary-bias/change.md
context/archive/2026-08-13-finder-security-vocabulary-bias/decision.md
context/archive/2026-08-13-finder-security-vocabulary-bias/plan-brief.md
context/archive/2026-08-13-finder-security-vocabulary-bias/research.md
context/archive/2026-08-13-finder-security-vocabulary-bias/results/baseline-n20.json   ← cut off inside
```

**Not one line of `packages/code-reviewer/**` — the entire implementation — was in the reviewed diff.**
The pass was asked "was this plan implemented?" while shown only the plan's own prose.

### Defect 1 — a generated snapshot spends the whole budget

`results/baseline-n20.json` is **711,641 bytes**: 85% of the post-exclusion diff on its own. It is
machine-written eval output, committed deliberately as evidence, and no human reviews it line by line.

This is not a one-off. Every eval change commits one, and they are all multiples of the entire cap:

| Snapshot                                                                |     Bytes |
| ----------------------------------------------------------------------- | --------: |
| `2026-08-10-finder-tool-loop-evals/results/…tool-loop-matrix.json`      | 1,020,929 |
| `2026-08-10-finder-tool-loop-evals/results/…round2-new-candidates.json` |   758,430 |
| `2026-08-13-finder-security-vocabulary-bias/results/baseline-n20.json`  |   711,641 |
| `2026-08-09-code-review-evals/results/…first-matrix.json`               |   467,356 |

Three prior changes already did this, and `finder-severity-calibration` will produce another the moment
it runs. `**/reviews/*.md` is already excluded for a closely related reason — committed review prose gets
echoed back as current findings (`.github/workflows/review.yml:175`). Generated result snapshots belong
on the same list.

### Defect 2 — the pass that grades completeness is never told its input was cut

This is the half that must not be skipped, and the asymmetry is stark:

- `capDiff` sets `diffTruncated` (`pipeline.ts:337`), which reaches `render.ts:228` as a **comment
  banner** for the human — and nothing else.
- `pipeline.ts:541` hands the implementation review `planTruncated` and **only** `planTruncated`.
  `ImplReviewPromptInput` (`prompts.ts:193-201`) has no `diffTruncated` field at all.
- So the plan — read for _intent_ — gets a first-class flag and an explicit directive: _"Do not treat
  anything you cannot see as missing, unplanned, or out of scope"_ (`prompts.ts:221`). The diff — audited
  for _completeness_ — gets neither.

Meanwhile the prompt **mandates** the failure. `IMPL_REVIEW_COMPARISON_RULE` (`prompts.ts:155`) requires
every planned change to be assigned `MISSING` when "absent from the diff"; dimension 1
(`prompts.ts:158`) says "FAIL on any planned change missing from the diff"; the verdict rule
(`prompts.ts:172`) says "REJECTED on any critical FAIL". Every one of those instructions is sound **only
under an unstated precondition: that the diff is complete.** That precondition is guarded for the plan
and unguarded for the diff.

The `DIFF_TRUNCATION_MARKER` string is appended inside the fenced diff, but it is in-band text at the
tail of an untrusted block, with no accompanying directive. It did not prevent this.

**Defect 1 alone does not fix this.** Excluding the snapshot would have left ~130 KB — still 1.3× over
the cap, still truncating, still silent. Both halves are required.

### Scope

1. Strip generated result artifacts (`**/results/*.json`, and consider the sibling `reports/`) from the
   reviewed diff the way `**/reviews/*.md` already is, in `.github/workflows/review.yml`. Note the
   existing comment there: the `getFileContext` allowlist derives from this diff, so an exclusion
   correctly narrows the tool's reach too — and the empty-diff guard below it already handles the
   filtered-to-nothing case.
2. Thread `diffTruncated` into `ImplReviewPromptInput` and emit a directive mirroring the plan's, so a
   truncated view cannot be read as deleted work. The finder has the same gap and the same in-band-only
   marker; decide during planning whether it is in scope or a follow-up.
3. Make truncation visible **in the output**, not only in the sticky comment's notes line. A banner a
   human may not read is not a guard when the verdict it should qualify is `REJECTED`.

### The deeper issue, named but not necessarily fixed here

Path-order bias. `git diff` sorts alphabetically, so `context/**` always precedes `packages/**`, and any
prose-heavy change systematically starves its own source files of budget — the reviewed 100 KB is
whatever sorts first, not whatever matters most. Already recorded from the `finder-file-context` work.
Exclusions mitigate it; they do not fix it. A real fix (source-first ordering, or a per-path budget) is a
larger design decision. Decide in planning whether to bound this change to the two defects above and
register the ordering fix separately — that is the honest split, and this note exists so it is a decision
rather than an omission.

### Do NOT

- **Do not raise the cap as the fix.** The cap is a cost control, and a 900 KB diff would blow any cap
  worth having. The problem is what fills it and the silence about the cut, not the number.
- **Do not stop committing eval snapshots.** They are the evidence base three changes now rest on
  (`decision.md` cites the baseline directly). Exclude them from _review_, keep them in _git_.
- **Do not treat the model as the defect.** It followed `IMPL_REVIEW_COMPARISON_RULE` correctly. Fixing
  this with a "be less confident about missing files" prompt tweak would leave the precondition
  unguarded and lose a real `MISSING` finding later.
