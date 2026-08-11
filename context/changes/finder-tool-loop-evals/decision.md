# Finder-model decision

**Recommendation: `anthropic/claude-haiku-4.5`. Runner-up: `anthropic/claude-sonnet-5`.**
**Not adopted until the Phase 4 live observation holds** — a fixture win is a GO-to-recommend, not a
GO-to-flip (`context/foundation/lessons.md`).

- **Evidence**: `results/2026-08-11-tool-loop-matrix.json`, eval `eval-P4k-2026-08-11T19:12:16`
  (48 finder rows = 4 models × 4 cases × 3 repeats, `--no-cache --repeat 3`, step budget 5).
- **Spend**: $0.6263 finder + ~51k grader tokens. Plus a $0.16 cross-hunk-only probe
  (`eval-Rhd-2026-08-11T19:05:49`) run first to check the full matrix was worth buying.
- **Date**: 2026-08-11.

## Thresholds, declared before the run

The run is `--repeat 3`, so every cell is a RATE over three rows. Both thresholds below were written
into `plan.md` before any money was spent, so neither could be fitted to the result afterwards:

1. **Adoption** — a candidate must deliver context on the cross-hunk case in **at least 2 of 3**
   repeats. Delivery, not invocation: `createDiffScopedSource` answers a refused request with a
   model-facing string, so a refusal is indistinguishable from content on the model's side.
2. **Discrimination (criterion 3.6)** — the cross-hunk case counts as discriminating only if the
   best model's delivered-context rate is ≥ 2/3 **while the worst is 0/3**. One model's own 2-of-3
   sampling noise is not discrimination.

Both hold: haiku 3/3, sonnet 3/3, deepseek 3/3, glm **0/3**.

## The matrix

**Read the denominators.** Telemetry columns (tool calls, delivery, cost) are reported for every
repeat, because the provider reports them on the error path too. Quality columns (recall,
`no_false_alarms`, repairs) can only be scored on a repeat that produced a parseable review, so they
are **conditional on usable output** and each carries its own denominator. A model can therefore show
"perfect" quality over fewer repeats than it ran — deepseek's precision is one scored row of three.

| Model                        | Tool calls (of 6 tool-enabled) | Cross-hunk delivered (of 3) | Cross-hunk pass (of 3) | Recall — mean (scored/eligible) | `no_false_alarms` (scored/3 clean) | Envelope repairs (of rows with output) | Usable output | $/row    | $/4-case sweep |
| ---------------------------- | ------------------------------ | --------------------------- | ---------------------- | ------------------------------- | ---------------------------------- | -------------------------------------- | ------------- | -------- | -------------- |
| `z-ai/glm-4.6` (production)  | **0/6**                        | **0/3**                     | **0/3**                | 0.667 (9/9)                     | 3/3 (of 3)                         | 0/12                                   | 12/12         | $0.00090 | $0.0036        |
| `deepseek/deepseek-v3.2`     | 6/6                            | 3/3                         | 2/3                    | 0.952 (7/9)                     | **1/1 (of 3)**                     | 0/8                                    | **8/12**      | $0.00064 | $0.0026        |
| `anthropic/claude-haiku-4.5` | 6/6                            | 3/3                         | 2/3                    | 1.000 (8/9)                     | 3/3 (of 3)                         | 0/11                                   | 11/12         | $0.00728 | $0.0291        |
| `anthropic/claude-sonnet-5`  | 4/6                            | 3/3                         | 3/3                    | 1.000 (9/9)                     | 3/3 (of 3)                         | 0/12                                   | 12/12         | $0.04338 | $0.1735        |

Tool calls are over the six TOOL-ENABLED rows per model (cross-hunk + clean × 3); the canary and
React cases carry no `fixtureRoot` and are single-generation for every model, so they are not
evidence of anything about tool use in either direction. Cross-hunk **delivery** is over all three
repeats regardless of output, because it is telemetry rather than a graded result — haiku's and
deepseek's failed repeats had already fetched and received the file when they failed to serialize.
Recall is the mean of `issue_recall` over the scored defect-bearing rows out of nine eligible.
"Usable output" counts repeats that produced a parseable review at all; the eval takes ONE provider
attempt per row by design (see Caveats).

## Per-model reads

**`z-ai/glm-4.6` — competent, and structurally blind to the case this change exists for.**
Zero tool calls on **0/6 tool-enabled rows** — every cross-hunk repeat and every clean repeat, where
fetching would have been harmless. (The other six rows carried no tool and are not evidence; only
tool-enabled rows can count.) It is otherwise a strong finder: canary 3/3, React 3/3 with every
planted flaw found on every repeat, clean 3/3 with no manufactured findings, and 12/12 parseable
output — the most schema-reliable model in the matrix. Its failure is precisely and only the
cross-hunk class, and all three failures read identically: the grader rejected them as observing the
hardcoded literal _generically_ without connecting it to the out-of-hunk contract. Its 0.667 mean
recall is entirely the three cross-hunk zeros.

This is consistent with every prior observation of this model — 0 calls across four live runs in
`finder-file-context` phase 3, 0 in CI on #122, 0 in the criterion-2.6 smoke, 0/3 in this change's
probe — but those were recorded under different harnesses and prompts, so they are corroboration,
not addends. **No cumulative "N consecutive zero-call runs" figure is claimed here**; the
decision-grade number is 0/6 tool-enabled rows in this matrix plus 0/3 in the probe. The tool
shipped in #120 is inert under this model, and prompt strengthening did not move it (`09e6e03`
spelled the trigger class out explicitly).

**`deepseek/deepseek-v3.2` — cheapest, uses the tool eagerly, too flaky to trust.**
Fetched on 6/6 tool-enabled rows, recovered from a refusal, and got the cross-hunk verdict right
twice. But 4 of 12 repeats produced no parseable output, spread across three different cases — a
**33.3% observed single-attempt failure rate**. Its apparent quality is the thinnest in the matrix
precisely because of that: recall is a mean over 7 of 9 eligible rows, and its `no_false_alarms`
"pass" rests on **one** scored clean repeat out of three. Worth recording that the earlier
cross-hunk-only probe showed 0/3 here and was read as a structural incompatibility; the full matrix
**corrected that** — deepseek is flaky, not walled off like qwen/gpt-5.4-mini, which never reached a
model at all. At the cheapest price in the matrix it is the tempting pick, and it is declined: a
third of single attempts failing is not something $0.02 a sweep buys back, and no measurement here
establishes how much of it a retry recovers.

**`anthropic/claude-haiku-4.5` — the recommendation, with one open reliability question.**
11/12 repeats produced output; recall was 1.000 over the 8 of 9 eligible defect rows it could be
scored on, context was delivered on all three cross-hunk repeats, and the contract violation was
correctly identified in both repeats that serialized. The detail that most supports adopting it: on
the **clean** case it called `getFileContext` 1, 1 and 4 times and still manufactured zero
critical/major findings. Tool access did not make it invent work, which is the specific risk that
case was built to measure.

Against that: an **8.3% observed single-attempt failure rate** (1/12), on a cross-hunk repeat that
had already fetched and received the file before failing to serialize — so the cost was paid and the
review was lost. A second, different failure appeared in the probe: `structured_outputs not
supported in your workspace`, an OpenRouter routing error rather than a model failure, which did not
recur across the 12 matrix rows. Two distinct failure modes in 15 total rows is the weakest part of
this recommendation, and it is not resolved by the retry argument (see F3 in Caveats) — Phase 4 must
watch for it specifically rather than assume production's single retry absorbs it.

**`anthropic/claude-sonnet-5` — flawless and hard to justify.**
The only 12/12 model: every case, every repeat, every metric. It is also the most restrained tool
user, fetching on only 4/6 tool-enabled rows and skipping the tool entirely on two of three clean
rows — it fetches when the verdict depends on it. The problem is price: $0.04338/row, **48× the
glm-4.6 baseline**, and its React row alone averaged $0.108. Real PR diffs are substantially larger
than these fixtures, so that figure is a floor, not a ceiling, on an advisory gate that runs on every
PR.

## Cost delta against the glm-4.6 baseline

| Model     | $/row    | vs glm-4.6 | vs sonnet-5 |
| --------- | -------- | ---------- | ----------- |
| glm-4.6   | $0.00090 | 1.0×       | 0.02×       |
| deepseek  | $0.00064 | 0.7×       | 0.01×       |
| haiku-4.5 | $0.00728 | **8.1×**   | 0.17×       |
| sonnet-5  | $0.04338 | 48.2×      | 1.0×        |

Haiku costs about eight times the current production finder and about a sixth of the runner-up. The
absolute numbers are fixture-scale and do not transfer to a real PR — Phase 4 records the live
figure, which is the only one that should inform a cap or a rollback.

## Recommendation

Adopt **`anthropic/claude-haiku-4.5`** as the production finder, conditional on the Phase 4 live
observation. It clears the adoption bar, scored 1.000 recall and 3/3 precision on every repeat it
could be scored on, and stays within an order of magnitude of the current spend.
**`anthropic/claude-sonnet-5`** is the runner-up and the fallback if haiku's reliability shows up
live — better in every quality column and the only 12/12 model, at 6× haiku's price.

**The honest shape of this recommendation**: haiku wins on quality-per-dollar and loses to both
glm-4.6 and sonnet-5 on observed schema reliability (8.3% vs 0% single-attempt failure). It is
recommended anyway because the review gate is advisory (never in `deploy.needs`), carries a retry
and a manual `ai-cr:review` re-run label, and because a review that occasionally has to be re-rolled
is worth more than one that reliably cannot see outside the hunk. If Phase 4's live run hits a
schema failure, switch the recommendation to sonnet-5 rather than reverting to glm-4.6 — the
cross-hunk blindness is the problem this whole change exists to fix.

Keeping glm-4.6 is a coherent option and is explicitly rejected here, not overlooked: it is cheaper
and more schema-stable than haiku, and if the cross-hunk defect class is judged rare enough on real
PRs, the tool can stay inert and #120 stays dead code. That trade is declined because the class is
not exotic — a hunk that overrides a constant or contract defined elsewhere in the same file is
ordinary review material, and it is exactly what the finder cannot currently see.

## Caveats — what this run does NOT establish

- **The envelope-repair column is empty, and that is a measurement gap, not a clean bill of health.**
  `output-repair.ts` fired **zero** times across all 48 rows. The plan expected this column to be
  the argument against glm-4.6, since production is schema-stable only because that repair layer
  catches a three-way drift under tool attachment (bare findings ARRAY, `path` instead of `file`,
  report-style severities). The harness did not reproduce that drift at all — plausibly because glm
  never engaged the tool here, or because fixture diffs are far smaller than a real PR. Do not read
  "0 repairs" as evidence the production drift is gone.
- **The eval bypasses the pipeline's schema retry, and retry reliability is UNMEASURED.** The
  harness takes one provider attempt per row, deliberately, so repeats expose flakes. Production
  re-rolls a schema mismatch once, so the observed rates — **33.3% deepseek, 8.3% haiku, 0% glm-4.6
  and sonnet-5** — are single-attempt figures and are the only ones supported by this data. An
  earlier draft of this record squared them into projected run-level rates (~11% / ~0.7%); that has
  been removed. Squaring assumes retries are independent and identically distributed, and nothing
  here tested that — a schema failure on a given prompt may well recur on the same prompt, and the
  probe's routing error would recur for as long as the route is unavailable. No paired-retry
  experiment was run (impl-review-phase-3 F3).
- **Every quality figure is conditional on the repeat producing output.** A model that fails to
  serialize is not scored, so its surviving repeats flatter it. Deepseek is the extreme case: its
  `no_false_alarms` pass is **one** scored clean repeat of three, displayed in the same column as
  haiku's and sonnet's 3/3. Haiku's 1.000 recall is over 8 of 9 eligible rows. Read the
  parenthesised denominators, not the headline (impl-review-phase-3 F1).
- **Fixtures are not PRs.** Four small synthetic diffs with planted ground truth measure what they
  were built to measure. Cost, latency, and drift on a real multi-file diff are Phase 4's job.
- **One repeat count, one step budget, one lens.** No temperature/seed control (out of scope), step
  budget fixed at the CI default of 5, general lens only.

## What Phase 4 must confirm before anything changes

1. Haiku calls `getFileContext` on a real PR diff **and receives non-refused content** (the CI log's
   per-step telemetry lines).
2. The review's verdict and findings are sane on that diff, with **no envelope repair firing** — the
   column this matrix could not fill.
3. **No schema or routing failure** — the two modes haiku showed here (a serialization failure at
   8.3% single-attempt, and the probe's `structured_outputs not supported in your workspace`). A
   single live run is one observation, not a rate, so it can only falsify: a failure is decisive
   against haiku, a success is not proof of reliability.
4. The live cost, recorded against the glm-4.6 baseline.
5. Only then: the `OPENROUTER_REVIEW_MODEL` repository variable (the actual control — `DEFAULT_MODEL`
   in `config.ts` does not outrank it), plus the checked-in fallback and `AGENTS.md`. Setting that
   variable is outward-facing and requires explicit approval; `! gh variable set` from a
   non-interactive shell writes an EMPTY value, so use the GitHub UI or an interactive terminal.
