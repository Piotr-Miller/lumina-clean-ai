---
change_id: finder-sonnet
title: "Make anthropic/claude-sonnet-5 the production finder and turn ai-review back on"
status: implemented
created: 2026-10-05
updated: 2026-10-06
archived_at: null
---

## Notes

Owner decision 2026-10-05: production ai-review uses anthropic/claude-sonnet-5 as the finder. Operating cost of
about $5–10 per month is accepted. This is a successor to finder-verification (decision 4.4: none admitted).

1. Why sonnet-5, without a new model search. It was already measured as a finder in
   context/archive/2026-08-10-finder-tool-loop-evals/decision.md: flawless on the fixtures, the only model that
   caught the out-of-hunk defect on a live PR, $0.0951 per review on a small diff (run 31533093356). It was
   declined then only on cost (57.6× the glm-4.6 baseline). The owner has now accepted that cost. Cheap finders
   failed three times: glm-4.6 (Venice ignores response_format), finder-model-swap (luna hand-read 19/20 rejected),
   finder-verification (G3f FAIL, mostly finder variance; F-a).
2. Scope: make sonnet-5 the production finder and turn ai-review back on. Out of scope: the verifier stage (keep
   F-b and the verification pipeline on feat/finder-verification for later, if false alarms appear), and any
   cheap-finder search.
3. Open questions for /rune-research and /rune-plan, not decided here:
   - Base branch. master has none of finder-serialization-outage's routing and raw-output logging, nor
     finder-verification's runner. Decide what to bring over, and how.
   - Routing for sonnet-5: whether structured output and the tool loop work on the anthropic endpoint today.
     Verify it; do not assume it from August.
   - How the model is set. The repo variable OPENROUTER_REVIEW_MODEL still reads z-ai/glm-4.6. The earlier
     ruling was that the owner deletes it and DEFAULT_MODEL in code picks the model.
4. Gates, to be pre-registered in the plan before any paid call:
   - Quality: the owner hand-reads every published finding on the untouched #247 and on #269, with an
     acceptance rule written before the run.
   - Reliability: valid output on every run, with a small fixed number of runs per PR.
   - Cost: measured per-review cost × recent PR volume (62 PRs created in the 30 days before 2026-10-05, minus
     docs-only skips) must project ≤ $10/month. Otherwise stop and ask.
5. Historical budget at creation: $1.50 in total, stop and ask at $1.20. Superseded by the owner's explicit F7
   triage approval on 2026-10-05: **$3.00 total**, including all measurement runs, retries and G5, with **$0.50
   reserved for G5**. Before each measurement run require T + P + $0.50 ≤ $3.00; before G5 require
   T + $0.50 ≤ $3.00. No automatic increase. Read and reconcile the OpenRouter key counter before and after
   each paid step; unresolved spend blocks another paid call. See `plan.md` Definitions for T and P.
6. Cost formula amended by the owner on 2026-10-05, in Phase 2 before the seal: each of the 61 observed review runs
   in the window is priced at the measured mean per-run cost of the frozen PR whose diff is nearer in bytes
   (53 × #247, 8 × #269; linear midpoint 38,146 B), replacing the single mean, which could not pass at the
   research estimates for these two inputs. The $10/month gate is unchanged. See `gate.md` § Pre-registration §6.

**Checked at creation (2026-10-05, no model call):** the figures in point 1 match
`context/archive/2026-08-10-finder-tool-loop-evals/decision.md` — "flawless" (line 116), run 31533093356 at
$0.0951 (line 228), 57.6× (lines 14, 359), the only model converting out-of-hunk context into a correct verdict
on a real PR (line 278).

**Decision (owner, 2026-10-06): `NOT ADMITTED (reliability)`.** Of the four sealed runs, two were executed: `247-r1`
valid; `269-r1` invalid (finder step 2 hit the 16,384-token cap, `NoOutputGeneratedError`, not retried). The
owner stopped the series there. Cost also fails (projected $13.902662 per month > $10.00); hand-read #269 cannot
pass, and #247 failed (2 of 5 rejected). Spend: $0.497284 of $3.00. Production is unchanged, `ai-review` stays off,
Phase 5 does not run, and the dark code stays unmerged on `feat/finder-sonnet`. Record: `gate.md` § Results.
