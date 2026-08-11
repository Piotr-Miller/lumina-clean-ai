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

| Model                        | Tool-call rate | Cross-hunk delivered | Cross-hunk pass | Recall (mean) | `no_false_alarms` | Envelope repairs | Usable output | $/row    | $/4-case sweep |
| ---------------------------- | -------------- | -------------------- | --------------- | ------------- | ----------------- | ---------------- | ------------- | -------- | -------------- |
| `z-ai/glm-4.6` (production)  | **0/6**        | **0/3**              | **0/3**         | 0.667         | 3/3               | 0                | 12/12         | $0.00090 | $0.0036        |
| `deepseek/deepseek-v3.2`     | 6/6            | 3/3                  | 2/3             | 0.952         | 1/1 scored        | 0                | **8/12**      | $0.00064 | $0.0026        |
| `anthropic/claude-haiku-4.5` | 6/6            | 3/3                  | 2/3             | 1.000         | 3/3               | 0                | 11/12         | $0.00728 | $0.0291        |
| `anthropic/claude-sonnet-5`  | 4/6            | 3/3                  | 3/3             | 1.000         | 3/3               | 0                | 12/12         | $0.04338 | $0.1735        |

Tool-call rate is over the six TOOL-ENABLED rows per model (cross-hunk + clean × 3); the canary and
React cases carry no `fixtureRoot` and are single-generation for every model. Recall is the mean of
`issue_recall` across all scored defect-bearing rows. "Usable output" counts rows that produced a
parseable review at all — the eval takes ONE provider attempt per row by design, so this column is
the raw flake rate, not the production failure rate (see Caveats).

## Per-model reads

**`z-ai/glm-4.6` — competent, and structurally blind to the case this change exists for.**
Zero tool calls in **all twelve rows**, including the clean case where fetching would have been
harmless. It is otherwise a strong finder: canary 3/3, React 3/3 with every planted flaw found on
every repeat, clean 3/3 with no manufactured findings, and 12/12 parseable output — the most
schema-reliable model in the matrix. Its failure is precisely and only the cross-hunk class, and all
three failures read identically: the grader rejected them as observing the hardcoded literal
_generically_ without connecting it to the out-of-hunk contract. Its 0.667 mean recall is entirely
the three cross-hunk zeros. Counting prior evidence (0/4 live in `finder-file-context` phase 3, 0 in
CI on #122, 0 in the 2.6 smoke, 0/3 in the probe, 0/12 here) this is **19 consecutive zero-call
observations**. The tool shipped in #120 is inert under this model, and no prompt strengthening has
moved it (`09e6e03` spelled the trigger class out explicitly).

**`deepseek/deepseek-v3.2` — cheapest, uses the tool eagerly, too flaky to trust.**
Fetched on 6/6 tool-enabled rows, recovered from a refusal, and got the cross-hunk verdict right
twice. But 4 of 12 rows produced no parseable output, spread across three different cases — a ~33%
single-attempt flake rate. Worth recording that the earlier cross-hunk-only probe showed 0/3 here
and was read as a structural incompatibility; the full matrix **corrected that** — deepseek is flaky,
not walled off like qwen/gpt-5.4-mini, which never reached a model at all. At the cheapest price in
the matrix it is the tempting pick, and it should still be declined: even with production's
single retry, a ~11% run-level failure rate on an advisory gate that already carries a manual
`ai-cr:review` fallback is a bad trade for $0.02 a sweep.

**`anthropic/claude-haiku-4.5` — the recommendation.**
11/12 rows, perfect recall on every scored row, context delivered on all three cross-hunk repeats,
and the contract violation correctly identified in the two rows that produced output. Its single
failure was a parse error on a cross-hunk row that had already fetched and delivered context. The
detail that most supports adopting it: on the **clean** case it called `getFileContext` 1, 1 and 4
times and still manufactured zero critical/major findings. Tool access did not make it invent work,
which is the specific risk the clean case was built to measure. One caveat carried forward from the
probe: one haiku row there failed with `structured_outputs not supported in your workspace`, an
OpenRouter routing error rather than a model failure. It did not recur in 12 matrix rows, but it is
a reason to watch the live run rather than assume it away.

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
observation. It is the only candidate that clears the adoption bar, keeps perfect recall and
precision, and stays within an order of magnitude of the current spend. **`anthropic/claude-sonnet-5`**
is the runner-up and the fallback if haiku misbehaves live — better in every quality column, at 6×
haiku's price.

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
- **The eval bypasses the pipeline's schema retry** (one provider attempt per row, deliberately, so
  repeats expose flakes). Production re-rolls a schema mismatch once, so the "usable output" column
  overstates real failure: haiku's 1/12 becomes roughly 0.7% at run level, deepseek's 4/12 roughly
  11%.
- **Fixtures are not PRs.** Four small synthetic diffs with planted ground truth measure what they
  were built to measure. Cost, latency, and drift on a real multi-file diff are Phase 4's job.
- **One repeat count, one step budget, one lens.** No temperature/seed control (out of scope), step
  budget fixed at the CI default of 5, general lens only.

## What Phase 4 must confirm before anything changes

1. Haiku calls `getFileContext` on a real PR diff **and receives non-refused content** (the CI log's
   per-step telemetry lines).
2. The review's verdict and findings are sane on that diff, with **no envelope repair firing** — the
   column this matrix could not fill.
3. The live cost, recorded against the glm-4.6 baseline.
4. Only then: the `OPENROUTER_REVIEW_MODEL` repository variable (the actual control — `DEFAULT_MODEL`
   in `config.ts` does not outrank it), plus the checked-in fallback and `AGENTS.md`. Setting that
   variable is outward-facing and requires explicit approval; `! gh variable set` from a
   non-interactive shell writes an EMPTY value, so use the GitHub UI or an interactive terminal.
