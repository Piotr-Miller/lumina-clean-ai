# Finder-model decision

> # ✅ FINAL DECISION: **KEEP `z-ai/glm-4.6`. No production change.**
>
> Decided by the repository owner on 2026-08-12, after the live validation below.
> `OPENROUTER_REVIEW_MODEL` remains `z-ai/glm-4.6`; no repository variable, workflow, or package
> default was modified by this change. See § Final decision (no change) at the end for the rationale
> and the follow-ups it leaves open.
>
> **Everything below is preserved as the decision trail, including two recommendations that the
> evidence later overturned.** The fixture matrix recommended `anthropic/claude-haiku-4.5`; three
> live runs falsified it (missed the planted cross-hunk defect 2/2, and manufactured a finding the
> diff contradicts). The fallback recommendation then became `anthropic/claude-sonnet-5`, the only
> live-probed model that caught the defect — at a **matched-baseline 57.6×** the production cost per
> review. That premium is what the owner declined. Nothing here is edited after the fact: the point
> of pre-registering a falsification test is that the record shows what it predicted and what
> actually happened.

**Fixture recommendation (superseded): `anthropic/claude-haiku-4.5`. Runner-up:
`anthropic/claude-sonnet-5`.**
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

> ⛔ **SUPERSEDED — this is the ROUND-1 recommendation, overturned by the live runs.**
> haiku-4.5 was falsified on a real PR (missed the planted defect 2/2 while holding the file
> open). Production was NOT changed. See § Final decision (no change) at the end of this
> document for what actually happens today.

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

> ⛔ **SUPERSEDED — Phase 4 is complete.** These were the exit criteria as written BEFORE the
> live runs. Criterion 1 was met by sonnet-5 only; criterion 2's envelope-repair check passed on
> all seven runs; criterion 3 became a recorded deviation (CI logs requests, not delivery); and
> criterion 5's flip was declined. See § Live validation and § Final decision (no change).

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

---

## Live validation (Phase 4) — the fixture recommendation did not survive

Scratch PR [#123](https://github.com/Piotr-Miller/lumina-clean-ai/pull/123), branch
`scratch/haiku-finder-probe` off master `f6e51f3`, closed and deleted **unmerged**. Planted defect:
`encodeThumbnailJpeg` re-encodes at a hardcoded `0.5` in `src/lib/engines/canvas-helpers.ts`, whose
module header ("single-source the JPEG re-encode quality so the two Canvas paths can't silently
drift apart") and `JPEG_QUALITY = 0.92` sit at lines 1–12, outside the hunk. `JPEG_QUALITY` appears
**zero times** in the diff, so the verdict is unreachable without fetching the file.

| Run                                                                                     | Model     | Tool calls / steps | Fetched the flaw's file | Caught the contract violation | Tokens in/out  | Derived cost |
| --------------------------------------------------------------------------------------- | --------- | ------------------ | ----------------------- | ----------------------------- | -------------- | ------------ |
| [31531406486](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31531406486) | haiku-4.5 | 1 / 2              | `:1-72`                 | **NO**                        | 7,133 / 483    | $0.0095      |
| [31532477513](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31532477513) | haiku-4.5 | 4 / 5 (capped)     | `:1-72`                 | **NO**                        | 21,450 / 917   | $0.0260      |
| [31533093356](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31533093356) | sonnet-5  | 4 / 5 (capped)     | `:1-84` (whole file)    | **YES**                       | 32,848 / 2,938 | $0.0951      |

Costs are derived from token counts at published OpenRouter prices ($1/$5 per M for haiku, $2/$10
for sonnet). The exact provider-reported `cost` field needs the usage-accounting change that landed
on this change's branch, and the probe was based on master so it could review a small diff instead
of this change's 13k-line snapshot.

**haiku-4.5 — falsified, twice.** It fetched the right file on both runs and still never connected
the hardcoded `0.5` to the constant it had just read; `JPEG_QUALITY` appears nowhere in either
review. Both runs also produced a bad minor finding: run 1 asserted the new function "is missing an
explicit return-type annotation" when the diff line reads
`export function encodeThumbnailJpeg(canvas: HTMLCanvasElement): Promise<Blob> {` — the suggested
fix is byte-identical to the code it criticises — and run 2 offered the self-contradicting "The
signature is correct, but it deviates from the module's pattern". Run 2 spent three of four fetches
chasing the workflow pin and never returned to the source file. Cost varied 2.7× between two runs on
one diff.

**sonnet-5 — confirmed.** Its F2 quotes the module header verbatim and names `JPEG_QUALITY`, neither
of which appears in the diff: out-of-hunk context, obtained through the tool, converted into a
correct verdict. F1 (critical) correctly flagged the scratch pin as must-not-merge and F3 noted the
missing test. No envelope repair fired on any of the three runs.

Two qualifications on that win. Sonnet rated the contract violation **`minor/style`**, not major —
it found the contradiction but did not weight it heavily, a distinction the fixture rubric could not
surface because it only asked whether the model _identifies_ the issue. And both models burned three
of four fetches on the workflow pin, an artifact of the probe itself; a normal PR carries no such
lure, so these cost figures are likely an overestimate. Sonnet faced the identical distraction and
still found the flaw, so the comparison itself is sound.

### What the live run exposed about the instrument

- **`no_false_alarms` was blind to haiku's failure mode.** It counts only critical/major findings as
  manufactured, tolerating minor/nit by design — and both of haiku's bad findings were `minor`. The
  matrix scored haiku 3/3 on precision while it was producing exactly this. Widening the metric is
  not obviously right (nit-level noise really is tolerable), but the gap should be recorded before
  anyone cites that 3/3 again.
- **Criterion 4.4 cannot be satisfied as written.** It asks for delivered, non-refused context "in
  the Actions log", but delivery reporting (`onResult`) is eval-only; production's
  `describeFinderStep` logs requested paths and nothing about outcomes. Delivery had to be inferred
  from review content quoting out-of-hunk text. A CI-side delivered/refused counter would close
  this.
- **A 5-step budget is consumed by a 2-file diff** when something in it invites fetching. Both
  capped runs hit `prepareFinalStep`, which did its job — neither died with "No output generated".

### Standing recommendation after the live run

**`anthropic/claude-sonnet-5`, conditional on accepting the cost**, or **keep `z-ai/glm-4.6` and
leave the tool inert**. Both are defensible and the choice is a spending decision, not a technical
one:

- Sonnet is the only model observed converting out-of-hunk context into a correct verdict on a real
  diff, at ~$0.095 for a 2-file, 16-addition PR. Against glm's structural profile on the same class
  of diff (one generation, no fetches) that is roughly **30×** — on an advisory gate that runs on
  every PR to master. The comparison is **unmatched**: no glm run was made on this exact diff, so
  the multiple is an estimate, not a measurement.
- Keeping glm-4.6 costs nothing, keeps 12/12 schema reliability, and accepts that the
  `getFileContext` feature shipped in #120 stays dead code until a cheaper tool-capable model
  appears.

haiku-4.5 is **rejected**: it is the only candidate observed to both miss the target defect and
invent findings the diff contradicts.

---

## Second round: searching for a cheaper tool-capable model (2026-08-12)

Sonnet-5's ~58× premium prompted a search for a cheaper model with comparable tool behaviour,
researched via Exa against the current OpenRouter catalogue. Two candidates qualified on paper and
were added to the matrix (`cheap-deepseek-v4-flash`, `mid-glm-5.2`); a third round of live probes
then tested the survivor. **Neither candidate works.**

**Excluded before testing.** OpenAI's GPT-5.6 tier (Luna/Terra/Sol) tops the public coding boards —
Luna scores 88 coding / 87 agentic — and is structurally unusable here for the same reason
`gpt-5.4-mini` was: strict structured outputs demands every property appear in `required`, while
`startLine`/`endLine` are `.optional()` for Anthropic compatibility (`schemas.ts`). Kimi K3
($2.80/$14) and Gemini 3.6 Flash ($1.50/$7.50) are not cheaper than sonnet-5 in any useful sense.

### Round-2 matrix — `eval-lgM-2026-08-11T20:54:32`, 36 rows, snapshot `results/2026-08-11-round2-new-candidates.json`

| Model                             | Tool calls (of 6 TE) | Cross-hunk delivered (of 3) | Cross-hunk pass | Recall (scored/elig) | `no_false_alarms` | Usable output | $/4-case sweep |
| --------------------------------- | -------------------- | --------------------------- | --------------- | -------------------- | ----------------- | ------------- | -------------- |
| `z-ai/glm-4.6` (anchor)           | 0/6                  | 0/3                         | 0/3             | 0.667 (9/9)          | 3/3               | 12/12         | $0.0034        |
| `z-ai/glm-5.2`                    | **0/6**              | **0/3**                     | **0/3**         | 0.667 (9/9)          | 3/3               | 12/12         | $0.0071        |
| `deepseek/deepseek-v4-flash-0731` | **6/6**              | **3/3**                     | 1/3             | 1.000 (7/9)          | 3/3               | **9/12**      | **$0.0041**    |

**`glm-5.2` — the successor inherits the blindness.** Zero tool calls across all six tool-enabled
rows, cross-hunk 0/3, identical failure text to glm-4.6 ("observes the hardcoded quality literal
generically"). Perfect on canary, React and clean, 12/12 usable output. This matters beyond one
model: the tool inertia is not a glm-4.6 quirk that a newer version fixes, so "wait for the next
Z.ai release" is not a strategy.

**`deepseek-v4-flash-0731` — passed the fixture bar, failed live.** In fixtures it looked like the
answer: fetched on 6/6 tool-enabled rows, delivered every time with zero refusals, and on the one
cross-hunk repeat that serialized it scored 1.0 on every metric including
`flaw_cross_hunk_contract`. At $0.0041 a sweep it is ~1/42 of sonnet-5. Its known weakness was
reliability: 3 of 12 rows produced no parseable output (25%, versus v3.2's 33%).

### Live probes of `deepseek-v4-flash-0731` — the fixture signal did not transfer

Scratch PR [#125](https://github.com/Piotr-Miller/lumina-clean-ai/pull/125), same byte-identical
planted diff as the earlier probes, closed and deleted unmerged.

| Run                                                                                     | PR metadata               | Tool calls | Findings | Verdict    | Tokens      |
| --------------------------------------------------------------------------------------- | ------------------------- | ---------- | -------- | ---------- | ----------- |
| [31571470362](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31571470362) | "throwaway, do not merge" | **0**      | **0**    | failed     | 2,039 / 312 |
| [31571601768](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31571601768) | same                      | **0**      | **0**    | failed     | 2,039 / 352 |
| [31571725531](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/31571725531) | **neutralized (control)** | **0**      | **0**    | **passed** | 2,039 / 767 |

**6/6 fetches in fixtures, 0/3 live.** The strongest result in this whole study, and it is about the
instrument rather than the model: fixture tool-adoption does not predict live tool-adoption.

The third run is a deliberate control. The first two produced summaries reasoning from the PR body —
"nothing in the diff itself suggests defects, but the PR metadata unambiguously identifies this as a
disposable, non-mergeable probe branch" — raising the possibility that telling the reviewer the PR
was a throwaway had suppressed its effort (`pr-title`/`pr-body` are passed to the finder as
metadata). Re-running with a neutral title and body changed nothing about the behaviour, and made
the outcome worse: with no "DO NOT MERGE" text to react to, deepseek-v4-flash **passed** a PR
containing both a hardcoded production-config override and the planted contract violation. It found
nothing, three times, in ~$0.001 of tokens per run.

The confound is therefore ruled out for the other probes too, which is worth stating: glm-4.6,
haiku-4.5 and sonnet-5 all reviewed properly under the same "throwaway" body, and sonnet found the
planted flaw despite it.

## Final live scoreboard — one diff, four live-probed models

| Model                             | Live tool calls | Caught the planted flaw | Findings                | Cost/review    | vs glm-4.6 |
| --------------------------------- | --------------- | ----------------------- | ----------------------- | -------------- | ---------- |
| `z-ai/glm-4.6` (production)       | 0               | no                      | 2                       | $0.00165       | 1.0×       |
| `deepseek/deepseek-v4-flash-0731` | 0, 0, 0         | no                      | 0, 0, 0                 | ~$0.0004       | 0.2×       |
| `anthropic/claude-haiku-4.5`      | 1, 4            | no                      | 2, 2 (one hallucinated) | $0.0095–0.0260 | 5.8–15.8×  |
| **`anthropic/claude-sonnet-5`**   | **4**           | **YES**                 | **3, all substantive**  | **$0.0951**    | **57.6×**  |

`z-ai/glm-5.2` is deliberately absent from this table: it was eliminated at fixture qualification
(0/6 tool-enabled rows, cross-hunk 0/3) and **was never live-probed**, so it has no live row and
belongs to the round-2 matrix section above, not here.

**`anthropic/claude-sonnet-5` is the only one of the four live-probed models that converts
out-of-hunk context into a correct verdict on a real PR.** Every cheaper live-probed candidate
fails, and two of the rejected models — haiku-4.5 and deepseek-v4-flash — looked good on fixtures
first. **Six models were evaluated in total** across the two matrices — glm-4.6, deepseek-v3.2,
haiku-4.5 and sonnet-5 in round 1; glm-5.2 and deepseek-v4-flash-0731 in round 2 — of which four
were live-probed. None of the five cheaper than sonnet-5 can see outside the hunk on a real pull
request.

The decision is unchanged in shape but now much better evidenced: **sonnet-5 at ~58× the baseline
(order $3–8/month at this repo's PR cadence), or keep glm-4.6 and accept that the `getFileContext`
feature stays inert.** No third option survived contact with a real pull request.

---

## Final decision (no change) — 2026-08-12

**`z-ai/glm-4.6` stays the production finder.** Decided by the repository owner after reviewing the
live evidence. Nothing in production was modified: `OPENROUTER_REVIEW_MODEL` still reads
`z-ai/glm-4.6`, `review.yml` is untouched, and `packages/code-reviewer/src/config.ts` is untouched.

### What this accepts

- **The `getFileContext` tool shipped in #120 stays inert.** glm-4.6 does not call it — 0/6
  tool-enabled fixture rows, 0 calls on a real PR — so cross-hunk contract violations of the kind
  planted in the probe will continue to be reported as generic observations of a literal, if at all.
  The feature is not removed: it costs nothing while unused and becomes live the moment a
  tool-calling finder is configured, with no code change.
- **The class of defect is real but was judged not worth 57.6×.** Sonnet-5 found it, and rated it
  `minor/style` — even the model that catches it does not think it is serious. That weighed against
  the premium.

### What it does not accept, and why the study was still worth $1.10

The alternative was never "glm-4.6 is fine". It is "glm-4.6 has a specific, now-measured blind spot,
and every cheaper way of fixing it was tested and failed". Four models were live-probed and a fifth
eliminated in fixtures; the cheap tiers do not merely underperform, they fail differently
(deepseek-v4-flash finds nothing at all, haiku-4.5 invents findings the diff contradicts, glm-5.2
inherits the exact blindness). Re-opening this question later should start from that table, not from
scratch.

### Follow-ups this leaves open

1. ~~**`DEFAULT_MODEL` in `config.ts` is `anthropic/claude-sonnet-5`.**~~ **CLOSED** — raised again by
   impl-review-phase-4 F1 and fixed with the owner's approval: `DEFAULT_MODEL` is now `z-ai/glm-4.6`,
   matching the repository variable it takes over from. `config.test.ts` gained two LITERAL
   assertions, because the existing check (`resolveModels().reviewModel === DEFAULT_MODEL`) was a
   tautology that would pass whatever the constant said. Had the variable ever been cleared, the old
   default would have silently switched the finder to the model this decision declined, at ~58× the
   cost per review.
2. **Re-test when a cheap tool-capable model appears.** The harness makes this ~$0.15 of fixtures
   plus one live probe. The bar to clear is in this document: deliver context on the cross-hunk case
   in ≥2/3 repeats, AND fetch on a real PR — the second half is the one three candidates failed.
3. **The instrument gaps recorded in `verification.md`** (fixture adoption not predicting live
   adoption; `no_false_alarms` blind to minor-severity hallucinations; CI logging requests but never
   delivery) apply to any future re-test and should be closed before the next one is trusted.
