# finder-sonnet-effort — Plan Brief

> Full plan: `context/changes/finder-sonnet-effort/plan.md`
> Predecessor: `context/archive/2026-10-05-finder-sonnet/`

## What & Why

Measure sonnet-5 as the AI review's finder at OpenRouter `reasoning.effort` **low** and **medium**. If an arm
passes every gate, put the cheaper passing arm into production and turn `ai-review` back on.

At the default effort (`high`) the predecessor was `NOT ADMITTED (reliability)`:

- on #269 the finder used up the 16,384-token output cap and wrote no JSON;
- the cost projected to $13.90/month, against a $10 limit.

## Starting Point

- OpenRouter documents approximate effort fractions of `max_tokens` for budget-based translation: high 0.8,
  medium 0.5, low 0.2. At our cap those reference values are about 13.1k, 8.2k and 3.3k tokens; they are not
  established hard ceilings for adaptive Sonnet-5.
- Thinking counts toward the cap and is billed as output. So lower effort plausibly fixes both failures, but the
  predecessor never logged the reasoning split, so that is a hypothesis.
- The predecessor's code is only on `feat/finder-sonnet` and merges cleanly here: the finder pin, logging, the
  failure notice and the measurement runner.

## Desired End State

A sealed record measures both arms with per-step reasoning tokens, a blind hand-read and a projection per arm,
ending in exactly one verdict.

Verdict precedence: any passing arm → `ADMITTED (<winner>)`; otherwise any budget-incomplete arm →
`INCOMPLETE (budget)`; otherwise both failed → `NOT ADMITTED` with each arm's failed gates. Per-arm outcomes
are recorded alongside the overall label. This preserves the gates and winner rule.

If an arm is admitted:

- production runs sonnet-5 @ `anthropic` at that effort;
- `ai-review` is on;
- G5 has passed live on this change's PR.

G5 verifies the winning effective settings and published comment/label, and its spend must settle before the
post-G5 projection and merge. Its impl-review cost joins the historical mean only if that pass actually ran.
After G5 the PR returns to draft before ledger/documentation pushes, preventing further paid synchronize
reviews; final reviewable code must still match the probe, within the same $4 total budget.

Otherwise production is unchanged and the record says why, per arm.

## Key Decisions Made

| Decision                | Choice                                                                               | Why (1 sentence)                                                                       | Source                 |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------- |
| What "passing" means    | The same three gates; ADMITTED leads to enabling and G5 in this change               | Closes the predecessor's goal in one change, with a proven procedure                   | Plan (owner)           |
| Both arms pass          | The lower projected cost wins; within $0.50, `low`                                   | Both cleared the same quality bar, so cost decides                                     | Plan (owner)           |
| Hand-read rule          | Unchanged: zero rejected, D2 on #269                                                 | Comparable with high; no moving the goalposts after a result                           | Plan (owner)           |
| Runs                    | At most 8 (2 arms × 2 PRs × 2), balanced order; an invalid run ends only its own arm | The winner rule needs both arms measured; the balanced order removes time bias         | Plan (owner)           |
| Budget                  | $4.00 in total, $0.50 reserved for G5                                                | Eight-run affordability is conditional on assumed settled costs; no hard bound         | Plan (owner)           |
| Only effort varies      | Cap, retry, steps, judge unchanged                                                   | The predecessor's review: each of those is its own measured arm                        | Predecessor review     |
| How effort is set       | A CLI flag plus a code constant (undefined until enabled), never an env variable     | Effort and routing have no env override; measurement/G5 verify other settings          | Plan                   |
| Classification          | Blind to the arm; the key is revealed after classifying                              | Removes arm bias from the deciding gate                                                | Plan (confirm at seal) |
| Cost formula and counts | The predecessor's sealed 53 / 8 / 13 and $0.199620, reused                           | Same historical baseline for comparability; disabled days do not measure future demand | Plan                   |

## Scope

**In scope:**

- port the predecessor's package/action/workflow code, excluding its six stale active-change documents and
  recording original commit provenance and authorship;
- finder effort as a flag, plus reasoning tokens in the step log;
- runner arms;
- freeze, seal, up to 8 paid runs, blind hand-read, verdict;
- on ADMITTED: the default effort, removing `false &&`, deleting the repository variable, G5, merge.

**Out of scope:**

- changes to the cap, retry or loop;
- `high`, `minimal` or `none` effort;
- judge or impl-review changes;
- other models, a verifier stage, a new window count, re-runs.

## Architecture / Approach

`createReviewer` passes `reasoning: {effort}` into the finder's OpenRouter settings only. The CLI flag
`--finder-reasoning-effort` sets it; the code constant is the production default. The runner passes the flag per
arm, enforces the sealed run order and ended-arm refusals, checks each arm's resolved configuration against
the seal, and records requested effort and outbound
finder-request settings separately from per-step tokens. It flags missing counts or reasoning above the arm's
reference value + 10% as an anomaly for the owner. No flag does not prove the provider honored effort.

## Phases at a Glance

| Phase                   | What it delivers                                      | Key risk                                                       |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| 1. Port + effort arm    | Dark code, flag, token log, runner arms               | Cherry-pick drift (merge-tree is clean today)                  |
| 2. Freeze + seal        | Sealed protocol for both arms, tag                    | Frozen inputs in `~/.cache` must still match                   |
| 3. Measurement (paid)   | ≤ 8 settled runs, ledger with reasoning tokens        | Effort compliance unverified; anomalies flagged; cap still hit |
| 4. Hand-read + decision | Blind classification, per-arm projection, one verdict | Hand-read fails again at zero tolerance                        |
| 5. Enable + G5          | Winner default, review on, live probe, merge          | Post-G5 projection above $10                                   |

**Prerequisites:**

- the frozen inputs and worktrees in `~/.cache/finder-sonnet-gate/` (kept);
- OpenRouter credit of at least $4 (currently $6.63);
- the owner available for each stop and for the hand-read.

**Estimated effort:** about 3–4 sessions. The paid series costs an estimated $1.6–2.5, conditional on actual
model behavior. At $0.20 per #247 run and $0.45 per #269 run, run 8's admission check is $3.55 including the
$0.50 reserve, and all eight runs plus that reserve total $3.10. These are scenarios, not worst-case bounds;
P cannot cap provider spend, and every actual budget check still applies.

## Open Risks & Assumptions

- **Effort may be applied as an adaptive target, not a hard budget.** The flag is a reasoning-volume anomaly
  heuristic and preserves the owner stop. Ignored effort can remain below its threshold and correctly applied
  effort can exceed it. Request evidence proves what was sent, not provider compliance; no flag is no proof.
- **Cost may still fail.** At m269 ≈ $0.25, m247 must stay under about $0.102. At high it was $0.163.
- **Quality at lower effort is unknown.** It could get worse (fewer real findings, D2 missed) or better.
- **The projection's size assignment is an assumption**, carried from the predecessor's review.
- **The workload counts are historical.** A newer rolling window can overlap earlier active reviews; recent
  disabled days provide no new active-review demand observations and do not establish demand after re-enable.

## Success Criteria (Summary)

- Each arm has at most 4 settled, recorded runs, with reasoning tokens per step and every stop confirmed by the owner.
- One verdict, decided by the sealed gates and the winner rule.
- If admitted: a live G5 on Anthropic at the chosen effort, and a post-G5 projection of ≤ $10/month.
