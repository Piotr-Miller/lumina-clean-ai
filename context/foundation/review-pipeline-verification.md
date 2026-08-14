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
