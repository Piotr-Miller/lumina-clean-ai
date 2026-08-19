# Review-pipeline verification log

Standing record for behaviours of the AI review pipeline that shipped but could not be verified at the
time, and what later evidence said. Append-only; each entry states what was claimed, what was measured,
and whether the claim survived.

---

## Impl-review finding anchoring — VERIFIED PARTIALLY (2026-08-15)

**The claim.** `impl-review-ci-agent` shipped a required `locus` discriminated union
(`{locus:"code",file,startLine} | {locus:"file",file} | {locus:"absent"}`) to fix findings arriving with
no anchor. Before it, the pass anchored **0 of 10** findings to a line and 2 of 10 to a file, while the
finder anchored 20/20 on the same runs. A local probe took it to 4/6. It was never verified on a real CI
run, because the cost gate skips the implementation review whenever the code review fails — so a
deliberately-buggy probe PR measures nothing.

**What made verification possible.** PR #143 ran the pass twice on genuine content, so the artifacts are
real CI output rather than a fixture.

| Run                                                                                       | Verdict         | `code` | `file` | `absent` |
| ----------------------------------------------------------------------------------------- | --------------- | ------ | ------ | -------- |
| [`31841839498`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31841839498) | NEEDS_ATTENTION | 0      | 3      | 1        |
| [`31844849055`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31844849055) | REJECTED        | 0      | 1      | 4        |
| [`32255940666`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/32255940666) | APPROVED        | 0      | 1      | 0        |
| [`32258322400`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/32258322400) | APPROVED        | —      | —      | —        |
| [`32260116416`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/32260116416) | APPROVED        | —      | —      | —        |

The finder on the same runs: **7 of 7** anchored to file **and** line.

**What survived.** The structural half. `absent` is now a _declared_ variant, so "this finding points
nowhere" is distinguishable from "the model forgot to fill the field" — which was the actual defect,
since an empty optional field is silent. File-level anchoring roughly doubled, 4 of 9 against the
original 2 of 10.

**What did not.** **No finding in either run used `code`.** Line-level anchoring — the original
complaint — is still at zero on real output. Two readings, and they are not distinguishable from this
evidence:

1. Legitimate. These findings are plan-level ("Phase 3 not implemented", "the checklist is stale");
   such a claim genuinely has no line, and `file` is the honest locus.
2. Not legitimate. The model reaches for the cheapest variant that validates, and `file` is cheaper than
   `code`, exactly as `absent` would have been cheaper still.

Run 2 is a degenerate sample — its findings were truncation-induced false "missing file" claims, for
which `absent` is semantically correct. Only run 1 is informative, and it is 4 findings.

**Status: not closed.** Needs a run where findings genuinely point at code. If `code` stays at zero
across a handful more real runs, the required-union fix solved declaration but not anchoring, and the
next lever is a _conditional_ requirement — a finding about changed code must carry a line — rather
than a wider union.

**Appended 2026-08-19 (PR #146).** Three more real runs, all `APPROVED`, added to the table above. Two
produced no findings at all, so they say nothing about anchoring; the third produced one `file`-locus
OBSERVATION about `change.md`'s status flip, which is honestly file-level. **Running total: 0 `code`,
5 `file`, 5 `absent` across 10 findings and five runs.**

All three were clean PRs, so the sample still contains no finding that _should_ have carried a line. That
is the limitation, not a result: `code` cannot be observed at zero opportunity, and three `APPROVED` runs
are not evidence against line anchoring. The status is unchanged and the re-check is unchanged — a run on
a PR with a genuine code-level deviation. Worth noting only that two of the five runs have now added no
information, so "a handful more real runs" will take longer to accumulate than the phrase suggests.

---

## Judge envelope repair — WIRED AND OBSERVABLE, NEVER FIRED (2026-08-15)

**The claim.** `tolerantJudgeOutput` rescues a judge response that fails the strict parse, added after
four consecutive `AI_NoObjectGeneratedError` failures on PR #127. It has never been observed firing in
production, which raised the question of whether it works at all or is dead code.

**What was checked.** Not the repair logic — that is unit-tested — but whether a repair would be
_visible_ if it happened. It would:

- `judge.ts:59` passes `onRepair` through to `tolerantJudgeOutput`.
- `pipeline.ts:397` forwards `onJudgeOutputRepair` to it, deliberately separate from the finder's
  `onOutputRepair` so the two cannot be confused.
- `cli.ts:290` logs `judge output repaired after strict-parse failure: <reason>` to stderr.

So this is **not** the silent-degradation failure mode recorded in `lessons.md`. The path is
instrumented end to end, and a repaired run is distinguishable from a clean one in the Actions log.

**Status: acceptable as-is.** "Never fired" is the good outcome — it means the judge has not drifted
since the timeout was raised. The detector exists: search a run's log for `judge output repaired`. Worth
re-checking only if judge failures recur; do not synthesize drift to exercise it, since the unit tests
already cover the logic and a synthetic trigger would prove nothing about production.

---

## Finder output is unstable on identical input, and collapses to one severity — MEASURED (2026-08-19)

**What was observed.** PR #146 reviewed the same change three times. Two of those runs sent the finder a
**byte-identical prompt** — `inputTokens: 4833` and `diffStats` (8 files, +119/−7) match exactly, because
the intervening commit touched only `plan.md`, which the workflow strips from the reviewed diff.

| Run                                                                                       | Finder input tok | Output tok | Findings | Severities           |
| ----------------------------------------------------------------------------------------- | ---------------- | ---------- | -------- | -------------------- |
| [`32255940666`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/32255940666) | 4,833            | 1,002      | **8**    | all `critical`       |
| [`32258322400`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/32258322400) | 4,833            | 74         | **0**    | —                    |
| [`32260116416`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/32260116416) | 4,911            | —          | 10       | `critical` + `minor` |

The first two are a controlled pair: same input, **8 findings versus 0**. All three runs passed and the
verdicts agreed, so nothing was mis-gated — but "re-run it and the finding set changes completely" is a
property worth writing down. The third run's input differs (the archive rename changed path names), so it
is not part of the pair.

Of the two, **run B is the better review.** The PR was clean; run A's eight `critical` findings were
descriptions of the fix whose own `fix` fields endorsed it ("The exclusion is essential", "Critical test
that prevents regression"). That is narration graded critical, not review. The variance is between "wrong
verbosely" and "right", not between two flavours of wrong.

**The collapse is measurable, and it was already in a committed snapshot.** Re-reading
`context/archive/2026-08-13-finder-security-vocabulary-bias/results/baseline-n20.json` — 40 draws, 20 per
fixture, no new spend:

| Fixture    | Draws | Zero-finding draws | Severity-monotone draws | Monotone constant    |
| ---------- | ----- | ------------------ | ----------------------- | -------------------- |
| Vulnerable | 20    | **0**              | 8                       | 7× `minor`, 1× `nit` |
| Defended   | 20    | 7                  | 11                      | 9× `minor`, 2× `nit` |

"Monotone" = more than one finding, all carrying the same severity. In **16 of those 19** collapses the
constant is `minor`; run A above shows the constant can also be `critical`.

**Two consequences, both load-bearing for `finder-severity-calibration`.**

1. **There is no silence problem on the vulnerable fixture.** All ten `defect_reported = 0` draws emitted
   findings (1–8 each). The 10/20 baseline is **purely a severity failure**, never the finder declining to
   report. This was worth checking because the two failures have different fixes, and the
   `requireDefectReported` grader scores them identically — but the data settles it, so the 20/20 target
   stands as scoped.
2. **The defect is the collapse, not one finding's severity.** The traversal being graded `minor` is a
   symptom of the whole set collapsing to a single constant. An intervention aimed at "raise traversal
   severity" would treat the symptom; monotony rate is the thing to move, and it is computable from any
   eval snapshot for free.

The 7-of-20 zero-finding rate on the **defended** fixture is correct behaviour — there is nothing to find
there — and it is the same phenomenon as run B, which is why run B is not evidence of a fault.

**Status: recorded, feeds `finder-severity-calibration`.** Do not spend on a `--repeat` run to size this;
the 40 committed draws already do it. Re-measure only after an intervention, against the same snapshot
shape, so before/after are comparable.
