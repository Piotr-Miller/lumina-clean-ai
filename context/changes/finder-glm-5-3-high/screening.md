# finder-glm-5-3-high — screening at effort high

The paid screening of `z-ai/glm-5.3` as the ai-review finder at `reasoning: {enabled: true, effort: "high"}`, run
**before** any pre-registration (plan Phase 3). It decides whether the change goes on to a sealed gate. It is not a
gate: screening runs are never gate samples, and the screening has no hash and no tag (H10). These rules were
committed and pushed before the screening's first step, `preflight --screening`; the push is recorded in § Rules ›
Push record.

- **Runner:** `packages/code-reviewer/scripts/glm-gate.mjs --screening`, driving the production CLI
  (`npm run review`) exactly as the gate does.
- **Ledger:** `screening/series.jsonl`. Stored `review.json` copies and fixture rows: `screening/results/`. D2
  proposals: `screening/d2/<runId>.md`. Console logs and promptfoo exports: `<cache>/screening/`, where `<cache>` is
  `~/.cache/finder-glm-5-3-high`, outside git.
- **Frozen inputs:** #247 and #269 under `~/.cache/finder-sonnet-gate/`, checked by sha256 at every step.
- **Code under test:** the Phase 2 code with Phase 1's `high` configuration. The screened tree is identified by the
  sha256 of `describeManifest`, recorded by `preflight --screening` (O8 below).

References to `§ Definitions` are to `plan.md` § Definitions. The predecessor is the archived change
`finder-glm-5-3` (`context/archive/2026-10-11-finder-glm-5-3/`).

## Rules

### The owner's rules (2026-10-16, verbatim from `change.md` § Notes)

1. **Screening inputs:** G3's four fixture cases × 1 (promptfoo), plus #247 × 1 and #269 × 2 through the production
   CLI.
2. **Screening stops** — stop before pre-registration if any of: (a) a finder request ends `length`; (b) a screening
   run is invalid because the finder timed out after its retry — a first-attempt timeout that the retry recovers is
   recorded as a warning, not a stop, and its cost counts (retries included); (c) 53·m247 + 8·m269 + 13·$0.199620 >
   $10.00, i.e. 53·m247 + 8·m269 > $7.404940, from settled costs (finder + judge, retries included) — deliberately
   stricter than the gate's pre-G5 I/2 bound; (d) a valid screening #269 run has no owner-approved D2 match, using
   the D2 definition of the predecessor's `plan.md:76` unchanged; an undecided match counts as no match. Not stops: a
   confirmed 401/402, a provider/model mismatch or a grader error pauses the screening for an owner decision, as in
   the gate. Fixture quality at × 1 is informational only. Screening runs are not gate samples.
3. **D2 during the paid series** — checked as each #269 run lands: (a) the owner's D2 decision for each valid #269
   run is final and is recorded in the ledger before the next run starts; the full hand-read after the series does
   not revisit it; (b) for each run the agent lists every finding that touches `bread-spike.ts` (`localInput` upload
   path or `main`'s cleanup), including those it judges not to match, each with its recommendation; the owner
   decides, the agent does not filter; (c) an early stop on D2 records the remaining gates (rest of G1, cost, full
   hand-read, G5) as not measured, never as passed; (d) the runner pauses after every #269 run until the owner's D2
   decision is recorded — the plan confirms or adds that pause in the gate tooling (plan Phase 2 § 2).
4. **Budget:** $5.25 in total — screening $0.75; series pause at $3.00, hard stop at $3.50; G5 reserve $1.00.

Rule 3 is written for the series; its (a), (b) and (d) apply to the screening's #269 runs too (§ D2 below).

### The owner's amendments (2026-10-17, verbatim, before the push)

Given while confirming the terms below; they amend H6, O4 and, for fixture rows only, rule 2 (a)/(b):

- **H6:** "Amend H6: a first terminal fixture timeout or length outcome pauses for owner review, with at most one
  additional attempt within the remaining screening budget. A repeated failure stops screening; all costs count.
  Align screening stop rules (a)/(b) with this exception."
- **O4:** "Amend O4: after a confirmed 401/402, allow a replacement #269 attempt following owner continuation, subject
  to the remaining screening budget. Keep the failed attempt in the ledger and count any actual spend, but exclude it
  from model samples. Other invalid runs remain cost samples as specified"
- **O7:** "O7 defines how a terminal timeout is detected; whether it pauses or stops screening follows the amended
  stop rules, including the agreed additional-attempt allowance."

The owner then chose, on the same day, how both work: the H6 exception covers **fixture rows only** (a #247 or #269
run ending `length` or timing out after its retry still stops at once), and the additional attempt reruns the
**whole** fixtures step; the #269 replacement is **per stop**, like the reruns of `sfix` and `s247-01`. The runner was
changed to match before any spending (`scripts/glm-gate-core.mjs`, `scripts/glm-gate.mjs`), with tests.

### Plan-chosen terms (the owner confirms each one)

H1–H7 are verbatim from `plan.md` § Implementation Approach. O1–O8 restate the outcome rules of `plan.md` Phase 2
§ 1, which the runner implements (`screeningState`, `computeScreeningOutcome` in `scripts/glm-gate-core.mjs`). The
owner confirmed each term on 2026-10-17, one by one, before the push; H6 and O4 were amended (§ The owner's
amendments above) and are given as planned and as amended.

1. **H1. Screening tooling.** The runner gains a `--screening` mode with its own ledger, results, cache and budget. It
   uses the same CLI invocation, `classifyRun`, `runCost` and `reconcile` as the gate, so screening numbers are
   comparable with gate numbers. Manual commands would not classify runs the way the stop rules need. — Confirmed:
   owner (date: 2026-10-17)
2. **H2. Screening order.** Fixtures → #247 → #269 → #269. The cheapest step that can trip (a) or (b) runs first; a
   D2 decision follows each valid #269 run. — Confirmed: owner (date: 2026-10-17)
3. **H3. Screening admission.** A step starts only when no step is unsettled and T_s + P ≤ $0.75. P is the largest
   settled cost of that kind's sample runs so far, else a first estimate: fixtures $0.10, pr247 $0.15, pr269 $0.30. A
   run stopped by a confirmed 401/402 is not a sample and never sets P (owner decision 2026-10-16, impl-review F3). A
   refused step ends the screening `INCOMPLETE (budget)` with nothing spent. The gate's 2 × P would refuse the second
   #269 run at plausible costs. — Confirmed: owner (date: 2026-10-17)
4. **H4. Early cost stop.** After #247 settles, the screening stops (c) if 53·m247 alone > $7.404940. No later run can
   lower that bound. — Confirmed: owner (date: 2026-10-17)
5. **H5. Other invalid screening runs pause.** A run invalid for a reason other than (a), (b) or the owner's named
   pauses (for example a technical judge failure or a parse failure) pauses the screening for an owner decision. Its
   cost counts. — Confirmed: owner (date: 2026-10-17)
6. **H6. Fixture rows count for (a) and (b).**
   - _As planned:_ A fixture row's finder request ending `length`, or a fixture row whose finder timed out after the
     adapter's single retry, stops the screening. Fixture **quality** is informational only.
   - _As amended (owner, 2026-10-17):_ The first fixtures step with a row whose finder request ended `length`, or
     whose finder timed out after the adapter's single retry, does not stop the screening. It pauses for the owner's
     review (`continue --screening --for fixture-retry --note <text>`, once that step is settled). After that
     `continue`, the whole fixtures step runs once more, as `sfix-02`, under H3's admission within the remaining
     screening budget. A `length` row or a timeout after the retry in any later fixtures step stops the screening,
     (a) or (b). All costs count. A #247 or #269 run ending `length` or timing out after its retry still stops at
     once. Fixture **quality** is informational only.

   — Amended and confirmed: owner (date: 2026-10-17)

7. **H7. D2 mechanics.**
   - Candidates are the term superset in § Definitions.
   - The runner prints them after a valid #269 run (`d2 --list`). The agent writes a proposal file with a
     recommendation per candidate; the owner decides with `d2 --match … | --none`.
   - The runner pauses after an invalid #269 run too, as owner decision 3(d) says ("after every #269 run"). The owner
     records `d2 --not-applicable --note <text>`; `--match` and `--none` are refused for that run, because D2 counts
     only for valid runs (decision 3(a)). An invalid run may still carry findings in its review.json (a model or
     configuration mismatch), but they never count.

   — Confirmed: owner (date: 2026-10-17)

8. **O1. Outcome labels.** The screening ends as one of `STOP (a: length)`, `STOP (b: finder timeout after retry)`,
   `STOP (c: cost)`, `STOP (d: no D2 in <id>)`, `INCOMPLETE (budget)`, `INCONCLUSIVE (no valid #269 run)` or `GO`.
   Every stop rule that holds is listed, so one label never hides another; `outcome` prints them all. — Confirmed:
   owner (date: 2026-10-17)
9. **O2. Precedence.** When several outcomes hold, the label is, in this order: a STOP label if any stop rule fired
   (the first to fire; the rest are listed); else `INCOMPLETE (budget)`; else `INCONCLUSIVE (no valid #269 run)`;
   else `GO`. A fired stop is never handed to the owner as an open GO/STOP question. — Confirmed: owner (date:
   2026-10-17)
10. **O3. GO needs a checked #269 run.** `GO` requires no stop and at least one valid #269 run checked for (d). With
    none, and no stop fired, the screening ends `INCONCLUSIVE (no valid #269 run)`. That is not a stop: the owner
    decides. — Confirmed: owner (date: 2026-10-17)
11. **O4. 401/402 and samples.**
    - _As planned:_ A run stopped by a confirmed 401/402 is not a sample and stays out of m269, as in the gate. A #269
      run is not replaced: the run ids stay `s269-01` and `s269-02`. A confirmed 401/402 on `sfix` or `s247-01` is
      not a sample either, but the screening needs one sample of each: after the owner's `continue`, that kind runs
      once more, under admission. The rule is per stop: a confirmed 401/402 on that rerun gives another, after its
      own `continue` (`sfix-03`, `s247-03`, …; owner decision 2026-10-16, impl-review F5). Only a confirmed 401/402
      gives a rerun. An invalid fixture row or an invalid run is still a sample (as an invalid #269 run is in m269):
      after the owner's `continue`, the screening goes on, with no `sfix-02`.
    - _As amended (owner, 2026-10-17):_ A run stopped by a confirmed 401/402 stays in the ledger, its actual spend
      counts toward T_s, and it is not a sample: it stays out of m247, m269, P and stop rules (c) and (d). Every kind
      runs once more after the owner's `continue`, under H3's admission within the remaining screening budget — a
      #269 run included. The rule is per stop: a confirmed 401/402 on a rerun gives another, after its own
      `continue`. Run ids are numbered in the order runs start (`sfix-02`, `s247-02`; after a stop on `s269-01`, the
      two #269 samples are `s269-02` and `s269-03`). A stopped #269 run still takes its
      `d2 --not-applicable` line before the `continue`. The screening needs two #269 sample runs, and stop rule (c)
      is decided on those two. Only a confirmed 401/402 gives a rerun, apart from H6's one extra fixtures attempt. An
      invalid fixture row or an invalid run is still a sample (as an invalid #269 run is in m269): after the owner's
      `continue`, the screening goes on.

    — Amended and confirmed: owner (date: 2026-10-17)

12. **O5. Overshoot.** A step that ends with T_s above $0.75 records its overshoot and ends the screening
    `INCOMPLETE (budget)`. The owner decides. — Confirmed: owner (date: 2026-10-17)
13. **O6. Pauses (owner decision 2026-10-16).**
    - A fixtures step pauses on a confirmed 401/402, a provider or model mismatch, a grader error, and, as H5 treats
      CLI runs, on an invalid row: a failed export (wrong row count or label), a wrong reasoning shape, inline
      reasoning, or any other finder error. A missed metric alone is informational. The pause names each row and
      its cause.
    - `continue --screening --for <reason>` takes the reason the pause reports for that step (`auth-credit`,
      `mismatch`, `grader-error` or `invalid-run`) and refuses any other.
    - After an invalid #269 run, the D2 line comes first: `continue --screening` refuses while that run's
      `d2 --not-applicable` line is missing. Both are recorded.
    - `continue --screening` refuses while the paused step is unsettled.

    — Confirmed: owner (date: 2026-10-17). The H6 amendment adds a fifth reason, `fixture-retry`, which comes first
    when a step has several.

14. **O7. Rule (b) on metadata only.**
    - **CLI run:** no `review.json`; at least one `retrying finder after <any class>` line; no `retrying judge` line;
      no `finder-output:` reason (a finder output refusal is that refusal's H5 pause, not (b)); and the timeout
      pattern matches stderr once every `retrying …` line is removed, together with the lines that name or carry
      model output: the configuration line, the step lines, `rejected output (` and `Finder output rejected (`.
    - **Fixture row (H6):** at least one adapter retry, and a terminal finder error of class `timeout`.
    - A timeout retry followed by a valid artifact is a warning. A recovered finder timeout followed by another
      failure (for example a technical judge failure) is that failure's pause (H5), with the warning recorded.

    — Confirmed: owner (date: 2026-10-17), with the note: "O7 defines how a terminal timeout is detected; whether it
    pauses or stops screening follows the amended stop rules, including the agreed additional-attempt allowance."

15. **O8. Screened tree (owner decision 2026-10-16).** The baseline is the `describeManifest` sha256 of the last
    screening preflight before the first paid step. From that step on it is frozen. A fix made before any spending
    needs only a new preflight. Every paid step writes the sha256 it ran on into the ledger, and refuses before
    spending when it differs from the baseline, naming the files and inputs that differ. — Confirmed: owner (date:
    2026-10-17)

### Push record

_Written after the push: a commit cannot contain its own push time. Nothing above this heading changes after the
push._

## Order

H2, from `packages/code-reviewer`, with no path flag (they are refused without `--dry-run`, H8):

1. `node scripts/glm-gate.mjs preflight --screening` — free. Records T0_s, the glm-5.3 endpoints of Z.AI, Fireworks
   and Together, the input fingerprints of `pr247` and `pr269`, the screened tree's sha256 and the git `HEAD`. It
   refuses a forbidden environment variable that is present at all, empty or blank included. The owner reads it,
   optionally sets the key's limit at usage(T0_s) + $0.75, and authorizes the spend.
2. `node scripts/glm-gate.mjs fixtures --screening` — `sfix`: G3's four cases × 1 through promptfoo, checked with
   `repeats: 1`. It refuses while its export file already exists. Its grading cost is not in the export, so it is
   always settled by `reconcile --screening`.
3. `node scripts/glm-gate.mjs run --screening --case pr247 --run-id s247-01`.
4. `node scripts/glm-gate.mjs run --screening --case pr269 --run-id s269-01`, then its D2 line (§ D2).
5. `node scripts/glm-gate.mjs run --screening --case pr269 --run-id s269-02`, then its D2 line.
6. `node scripts/glm-gate.mjs reconcile --screening` until every step is settled, then
   `node scripts/glm-gate.mjs outcome --screening --write`.

`reconcile --screening` (two key-counter reads at least 180 s apart) settles an unsettled step before the next one is
admitted. A run whose telemetry is complete settles at once. Every step honours every stop and pause; the runner
names the next step, or what it waits for, after each one. After a confirmed 401/402 on any step, the owner's
`continue` admits a rerun under the next id, a #269 run included (O4 as amended). After the first fixture `length`
row or timeout after the retry, `continue --screening --for fixture-retry` admits `sfix-02` (H6 as amended).

## Budget

- **Cap:** $0.75 for the screening, on its own ledger and its own T0_s (the counter at the first screening preflight).
  T_s is the larger of the counter's delta since T0_s and the settled costs. The screening's spend is outside the
  series' T.
- **Admission:** H3. The first-step estimates are fixtures $0.10, pr247 $0.15 and pr269 $0.30; after that, P is the
  largest settled cost of that kind's sample runs. A refused step writes `budget_stop`, exits 4, spends nothing and
  ends the screening `INCOMPLETE (budget)`.
- **Overshoot:** O5.
- **Stop rule (c):** 53·m247 + 8·m269 > $7.404940 from settled costs, m247 the one #247 sample run and m269 the mean
  of the two #269 sample runs, valid and invalid (a run stopped by a confirmed 401/402 is not one, O4); after #247
  alone, 53·m247 > $7.404940 (H4). Equality does not stop.

## D2

- **D2 match** (unchanged from the predecessor's `plan.md:76`): a finding cites `bread-spike.ts` within `localInput`'s
  upload path or `main`'s cleanup **and** claims the uploaded file is not deleted (or leaks) on the missing-URL exit.
  Cleanup only in `finally` is not a match. A run with no finding citing `bread-spike.ts` has no match.
- **D2 candidates:** every finding of the run whose `file` contains `bread-spike.ts`, or whose description or
  suggestion mentions `bread-spike.ts`, `localInput`, `deleteUpload`, `urls.get` or `uploadedFileId`. The owner may
  approve a finding outside the list; it is recorded as unlisted.
- **Procedure, after each #269 run:**
  1. `node scripts/glm-gate.mjs d2 --screening --run <id> --list` — free; prints the candidates, writes nothing.
  2. For a valid run, the agent writes `screening/d2/<id>.md`: every candidate, each with a recommendation and its
     reason. It filters nothing.
  3. The owner decides: `d2 --screening --run <id> --match <F-id>[,<F-id>…] --note <text>` or
     `d2 --screening --run <id> --none --note <text>`. For an invalid run:
     `d2 --screening --run <id> --not-applicable --note <text>`, then the pause's `continue`.
- **Final:** one `d2` line per run; a second one is refused. Every paid step is refused until the line exists. At
  `outcome`, an undecided D2 of a valid run counts as no match (rule 2(d)).

## Results

<!-- glm-screen:outcome:start -->

_Not run yet._

<!-- glm-screen:outcome:end -->
