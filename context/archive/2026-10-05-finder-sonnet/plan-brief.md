# finder-sonnet — Plan Brief

> Full plan: `context/changes/finder-sonnet/plan.md`
> Research: `context/changes/finder-sonnet/research.md`
> Plan review: `context/changes/finder-sonnet/reviews/plan-review.md` (SOUND after triage; F1–F7 fixed 2026-10-05)

## What & Why

Production AI review switches its finder to `anthropic/claude-sonnet-5`, and `ai-review` is turned back on. The
owner accepts about $5–10/month of operating cost (decision of 2026-10-05).

Sonnet-5 is the only model ever observed catching an out-of-hunk defect on a real PR. It was declined in August
only on cost. Cheaper finders failed three times since: glm-4.6 (Venice), luna (19/20 rejected in hand-read),
and luna again as its own verifier (G3f).

## Starting Point

Master already runs sonnet-5 safely on this path: a single tool loop with strict `json_schema`, and the judge is
sonnet-5 on the same transport. What master lacks:

- the finder defaults to glm-4.6, and the repo variable says the same;
- routing is unpinned;
- the finder's provider is not logged;
- a failed review leaves the previous comment and label in place;
- `ai-review` is switched off with `false &&`.

## Desired End State

Either sonnet-5 is the pinned production finder with `ai-review` on, proven by a sealed measurement and a live
run on this change's own PR, or production is unchanged with a written reason. A technical failure of the review
is never mistaken for "no remarks".

## Key Decisions Made

| Decision               | Choice                                                                                                                                                                                                             | Why (1 sentence)                                                                                                  | Source                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Base                   | Master, plus two ported pieces (`2e2ae19` provider log, `5d72458` `*.jsonl` exclusion); no two-stage finder, no novita routing                                                                                     | Master's path is the one with sonnet-5 quality evidence; the outage branch's routing would break it               | Research                  |
| Model setting          | `DEFAULT_MODEL` = sonnet-5; owner deletes `OPENROUTER_REVIEW_MODEL` in the UI                                                                                                                                      | The variable outranks the default; a non-interactive `gh variable set` writes an empty value                      | Research / earlier ruling |
| Reasoning              | No `reasoning` field (production default: adaptive, `high`)                                                                                                                                                        | The only configuration with quality evidence; date, model id and routing are recorded because defaults can change | Plan (owner)              |
| Routing                | Finder pinned `only: ["anthropic"]`, `allow_fallbacks: false`; no env override; judge and impl-review unchanged                                                                                                    | The measured endpoint is the production one; avoids the Venice failure class                                      | Plan (owner)              |
| Failure visibility     | On a failed run, the sticky comment says it did not complete and `ai-cr:passed` is removed                                                                                                                         | The owner's condition for pinning: an outage must not look like "no remarks"                                      | Plan (owner condition)    |
| Run                    | One production pass including its built-in retry; valid = parsed finder + judge output; retries and cost recorded separately                                                                                       | Measures production as it runs                                                                                    | Plan (owner, DEF)         |
| Reliability            | 2 runs per PR (#247, #269); every run valid                                                                                                                                                                        | Owner's rule                                                                                                      | Plan (owner, DEF)         |
| Hand-read              | Owner reads every published finding; 0 rejected per run; #247 N = 0 passes; #269 must contain the owner-confirmed D2                                                                                               | Few, correct findings is what sonnet-5 is for                                                                     | Plan (owner, DEF)         |
| Cost gate              | Projected ≤ $10/month = observed review runs, each priced at the measured mean finder+judge per run of the size-nearer frozen PR (53 × #247 + 8 × #269; amended 2026-10-05) + plan-bearing runs × impl-review mean | A conservative post-fix forecast; the outage's zero impl-review executions do not zero that term                  | Plan (owner, DEF)         |
| Budget                 | $3.00 total including retries and G5; $0.50 reserved for G5; before each run T + P + $0.50 ≤ $3.00, else INCOMPLETE; no automatic increase                                                                         | Four runs need ≈ $1.02 mid and $2.12 high                                                                         | Plan (owner)              |
| Spend accounting       | Cumulative series spend is reconciled with settled counter deltas; any unresolved spend blocks the next paid run, G5 included; P is an estimate, not a cap                                                         | Telemetry alone misses failed requests before a recovered retry (review F4)                                       | Plan review               |
| Measured configuration | Before each CLI call the runner resolves the effective finder and judge models, finder routing and step limit in the same environment and refuses on any mismatch with the seal (`.env` or inherited overrides)    | `npm run review` loads `.env`, whose variables outrank `DEFAULT_MODEL` (review F3)                                | Plan review               |
| Input check            | Inputs are verified against a sealed manifest per PR; code and configuration globally                                                                                                                              | One series spans two PRs with different diffs (review F2)                                                         | Plan review               |
| G5 trigger             | Mark the PR ready, then add `ai-cr:review`                                                                                                                                                                         | `review.yml` does not listen to `ready_for_review` (review F1)                                                    | Plan review               |
| Final cost gate        | After G5 the projection is recomputed; above $10/month the verdict becomes `NOT ADMITTED (cost)` and the merge is blocked                                                                                          | G5 can change the impl-review mean after admission (review F5)                                                    | Plan review               |

## Scope

**In scope:**

- the default model and pinned finder routing;
- provider-per-step logging;
- the failed-review notice;
- the `*.jsonl` exclusion;
- the measurement runner;
- the sealed gate, the four paid runs, the hand-read and the projection;
- if admitted: removing `false &&`, deleting the variable, and G5.

**Out of scope:**

- the verifier and F-b;
- any other model, sonnet-5.5 included;
- the two-stage finder;
- a `reasoning` setting (`effort: 'low'` only as a later experiment);
- judge or impl-review routing;
- the cost levers: `cache_control`, step budget, triggers;
- bringing the archived finder folders to master.

## Architecture / Approach

The same CLI that CI runs (`npm run review` with `--diff-file`, `--source-root`, `--project-context-file`, and
`PR_TITLE` / `PR_BODY` in the environment) is driven by a small runner. The runner writes a JSONL record for every
run, including failed and interrupted ones, with its retries, its providers and its cost.

The code under test is hashed into a pre-registration that is sealed and pushed before the first paid call. The
runs follow the sealed order, and the first one (#247, never seen by any finder) doubles as the probe for the
known risks: `minLength`, a missing final JSON, and the "workspace" error.

## Phases at a Glance

| Phase                                           | What it delivers                                                                        | Key risk                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1. Production code + runner (no network)        | sonnet-5 default, anthropic pin, provider log, failure notice, runner; `false &&` stays | Hand-porting the routing onto the single-loop finder                          |
| 2. Inputs freeze, pre-registration, seal (free) | Frozen #247/#269 inputs, window run counts, sealed gate with code hashes                | Counting "observed review runs" (42 vs 72 in research)                        |
| 3. Measurement (paid)                           | 4 runs: 247-r1 (probe) → 269-r1 → 247-r2 → 269-r2, each budget-checked                  | Long or thinking-heavy outputs; a provider 400 on the probe                   |
| 4. Hand-read, projection, decision              | Owner's per-run verdicts, the monthly forecast, one label                               | D2 not found in a #269 run fails it outright                                  |
| 5. Enable + G5 (only if admitted)               | `false &&` removed, variable deleted, live run on this PR                               | G5 not affordable, or the post-G5 projection above $10 → the merge is blocked |

**Prerequisites:**

- `feat/finder-sonnet` from master `4c3fc87`;
- the OpenRouter key with credit (about $7 free on 2026-10-05; the budget is $3.00);
- the owner available for the seal, the hand-read and the variable deletion.

**Estimated effort:** about 2–3 sessions. Phase 1 is one session; Phases 2–4 need the owner at the seal and the
hand-read.

## Open Risks & Assumptions

- **Documented but not observed through OpenRouter:**
  - `minLength` in the strict schema;
  - vercel/ai #21992 (no final JSON in a tool loop);
  - "structured_outputs not supported in your workspace".

  The probe run decides. A failure there is a recorded invalid run.

- **Sonnet-5 is legacy**, superseded by 5.5, with retirement not before 2027-06-30. A later model change is a new
  change.
- **The counter's settlement latency is unmeasured.** Unresolved spend stops the series until it settles or the
  owner decides (review F4).
- **The two measured diffs are larger than most reviewable PRs**, so the mean-based projection is likely
  conservative.
- **Assumed in this plan; the owner confirms at the seal:**
  - P = the HIGH estimate for a PR's first run, then 2 × its largest observed run;
  - the "observed review run" definition;
  - the D2 match criterion;
  - the stop rule after an invalid run.

## Success Criteria (Summary)

- A sealed record shows sonnet-5 @ `anthropic` producing valid output on all four runs, findings the owner accepts
  (D2 found on #269), and a projected cost of $10/month or less, rechecked after G5 before the merge.
- If admitted, `ai-review` is on with sonnet-5, its first live run on this change's PR is valid and logged with
  `provider=Anthropic`, and a failure would say so plainly.
- If not admitted, production is untouched and the record says which gate failed.
