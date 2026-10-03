---
change_id: finder-model-swap
title: "Replace the ai-review finder model through a pre-registered quality and cost gate"
status: implementing
created: 2026-10-02
updated: 2026-10-03
archived_at: null
---

## Notes

### Where this comes from

Successor of [`finder-serialization-outage`](../../archive/2026-09-24-finder-serialization-outage/change.md),
archived 2026-10-02. Its gate record is
[`gate.md`](../../archive/2026-09-24-finder-serialization-outage/gate.md), and its distinct #269 findings
are in [`hand-read-269.md`](../../archive/2026-09-24-finder-serialization-outage/hand-read-269.md).

That change removed the outage's cause in code (Phases 1–3: the format is carried in the prompt and parsed
on our side, so the finder no longer depends on `response_format`). Its gate admitted no `z-ai/glm-4.6`
endpoint, and the owner chose the model swap (2026-10-02). This branch, `feat/finder-model-swap`, starts
from `feat/finder-serialization-outage` because it needs the Phases 1–3 code, which `master` does not have.

### Goal

Choose a finder model that passes a gate for quality and cost, **registered before any candidate is measured**.

### Owner's condition (preliminary, set BEFORE any measurement)

G3's hand-read clause ("every distinct finding must identify a real defect in #269's diff") has no baseline:
no measured configuration has ever met it. It gets a measurable threshold before any candidate is measured.

Proposed structure:

- Per candidate, a random sample of **20 deduplicated findings** from PR #269. The seed is recorded before
  sampling.
- The agent may pre-sort the sample. **The owner approves every classification.**
- **"Unresolved" counts as rejected.**

**OPEN, the owner's decision:**

1. The maximum share of rejected findings. It is chosen on principle, not from Novita's result.
2. Whether the threshold also applies to Novita / `glm-4.6`. Its data already exists, so the threshold
   would be set after seeing it. If it applies, that is stated explicitly next to the result.

_Superseded by the owner decision of 2026-10-02 below (sample 40, not 20; both OPEN points decided)._

### Owner decision (2026-10-02): G3 hand-read threshold

Recorded **before any candidate is measured** in this change. It replaces the preliminary structure above.

- **Sample.** Per candidate, a random sample of **40 deduplicated findings** from PR #269. Deduplication
  happens **before** sampling. The input set and the seed are recorded **before** any finding is judged.
  **No re-draw** after an unfavourable result.
- **Judgement.** A finding is **rejected** when it does not identify a real defect in #269's diff.
  **Unresolved counts as rejected.** Every judgement carries a short justification. The agent may pre-sort;
  **the owner approves every classification in the sample.**
- **Threshold.** At most **2 rejected out of 40** (5%). When a candidate has **N < 40** deduplicated
  findings, all N are judged and the limit is **floor(0.05 × N)** (e.g. N = 25 → at most 1).
  **N = 0 cannot pass the gate.**
- **What it is.** A practical acceptance gate, **not** a statistical proof that the true false-finding rate
  is ≤ 5%.
- **Novita / `z-ai/glm-4.6` is subject to the same threshold.** Annotation: the threshold was set **after
  seeing** Novita's data from `finder-serialization-outage` (10 of 50 distinct findings rejected,
  `hand-read-269.md`). With that data, the chance that a sample of 40 passes is **~0.0003%**
  (hypergeometric: 40 drawn from those 50, ≤ 2 of the 10 rejected), so the interim Novita deployment —
  conditional: **only after passing G3, routing `only: ["novita"]`** — will most likely not happen.
  - **Clarification (2026-10-02, owner, from `research.md` Open Question 4).** The predecessor's read of
    Novita's 50 findings was **10 rejected and 40 unresolved**, not 10 rejected and 40 real. Under this
    decision unresolved counts as rejected, so on the existing read **all 50 count as rejected**: any
    sample of 40 then contains ≥ 30 rejected, and Novita **cannot pass** (probability 0). The ~0.0003%
    figure holds only in the best case where a fresh read resolves **all 40** unresolved rows as real
    defects; it is an **upper bound**, not an estimate. Any fresh read of Novita follows this decision's
    sampling and approval rules like every other candidate.
- **If no candidate passes:** we stay **without a finder**. Changing the threshold or the budget, or picking
  a further candidate, needs a **separate owner decision based on the results**; the threshold never
  changes automatically.
- **Report to OpenRouter/Venice (old 5.4 of the predecessor):** the owner sends it personally; the draft
  is ready outside the repo. Status below under _To do_.

### Owner decision (2026-10-02): candidates and budget

Recorded **before any paid call** in this change. The plan (`plan.md`) is built on it.

- **Candidates, in measuring order**, each pinned through `OPENROUTER_FINDER_PROVIDERS`:
  1. `openai/gpt-6-luna` → `openai`;
  2. `qwen/qwen3.8-flash` → `alibaba`;
  3. `minimax/minimax-m3` → `minimax` (first-party).

  `openai/gpt-6-sol` is **not** measured; it returns only as a separate owner decision if all three fail.

- **Budget: $2.00 in total** for the whole measurement — finder, finalization, repairs, grader, and the judge
  if it is called. **Stop and ask the owner once the total passes $1.60.** $2.00 is never exceeded. A candidate
  not measured for lack of budget gets **"not measured"**, never a verdict.
- **Gate:** G1–G4 as in the archived `finder-serialization-outage/gate.md` — same thresholds, same data
  (#269 × 10, `clean-change` × 5, the 12 fixture rows, G4 median ≤ $0.00301653) — plus the G3 hand-read
  threshold of the decision above (sample 40, ≤ 2 rejected, floor(0.05 × N) when N < 40). It is registered
  in this change's own `gate.md` **before the first paid call**.
- **Hand-read (40 findings) only for candidates that passed the automated G1–G4.**
- **A3** (zero reasoning tokens and zero reasoning text) is checked on **both channels**. Each candidate's
  **first G2 attempt is also the A3 probe**: a candidate that cannot turn reasoning off is stopped there, the
  fact is recorded as its result, and nothing more is spent on it.
- **Rules carried over from the previous gate:** the serving provider is checked on every request; a 429
  and a timeout count as failures; no re-runs to hide a failure; prices are re-read immediately before the
  first call.
- **If no candidate passes:** we stay without a finder until a separate owner decision. **If more than one
  passes:** the owner chooses, from a comparison the plan prepares (quality, cost per #269 attempt, latency,
  endpoint depth / 429 risk).
- **Production phase** (routing, merge, the live scratch PR = G5, T2) only for an admitted candidate, and only
  after the owner's 4.4 decision.

### Owner decisions (2026-10-03): planning answers

Given during `/rune-plan`, before any paid call. `plan.md` and the gate's pre-registration carry them.

- **Stop at the first decisive failure.** Order per candidate: G2 (first attempt = A3 probe) → G3/G4 fixtures →
  G1 #269. The verdict is a conjunction, the comparison covers only passers, and extra data on failed candidates
  would serve only to loosen a threshold after the fact. Three clarifications:
  1. The order is a **change from the archived protocol** and is registered in `gate.md` before the first paid
     call, together with the stop rule.
  2. **A3 on every request, both channels, in every gate** — the G2 probe is an early exit, not the only check.
  3. **G4 failing alone does not end a candidate**: G3 PASS + G4 FAIL → pause, report median and ratio, the owner
     decides whether to spend on G1 (archived G-A1).

  Labels must keep `FAIL (Gx)` / `not measured (stopped after Gx FAIL)` apart from `not measured (budget)`.

- **OpenAI service tiers: the agent's premise was false.** OpenRouter (Provider Routing › Targeting Specific
  Provider Endpoints, fetched 2026-10-03): service-tier endpoints such as `openai/fast` / `openai/flex` are **not**
  matched by base slugs; they need `service_tier` or a tier-suffixed slug, and the finder sends neither. Pin
  `openai` as decided, no code change. The quote goes into `gate.md`; on the first G2 request, `cost` ÷ tokens is
  checked against the base-tier prices 0.10 / 0.50 as a **one-off report, not a gate rule**.
- **The owner approves the dedup table** (the sampling frame), not every row. Merge rule registered in `gate.md`
  before the first dedup: same claimed defect and same location → one row; same defect in another file →
  separate; different claims at one location → separate; contradictory wordings → **split, never merged**. The
  agent dedups blind (no correctness judgement), each merged row carries its attempt IDs and a one-sentence
  reason, uncertain decisions are marked. The owner approves merges and splits; the approved table's sha256 goes
  into `gate.md` **before** the seed, then the draw. No re-draw.

### Owner decisions (2026-10-03): plan-review triage

Triage of `reviews/plan-review.md` (verdict REVISE), before any paid call. `plan.md` carries them.

- **F1 — the repository variable goes away for good.** The owner deletes `vars.OPENROUTER_REVIEW_MODEL`
  immediately before G5 and does not restore it; `DEFAULT_MODEL` in `config.ts`, set by Phase 4 to the admitted
  candidate, is the single source of the finder model. `config.ts:209` uses `||`, so an unset variable falls
  through to `DEFAULT_MODEL`: the scratch PR tests exactly what will merge, and `master` stays on its own default.
  The variable may return later only as an emergency override, by a separate decision.
- **F2 — G2 is pinned in Phase 0:** rules = `fca2778:.github/ai-review-rules.md` (2,929 B, as G1), sha256 in
  `gate.md`; `--source-root evals/fixtures/clean-change`.
- **F3 — G5 counts toward the $2.00** (the plan's assumption, confirmed); it runs only if the remainder covers its
  estimate (≤ $0.25), else `not measured (budget)` and the owner decides.
- **F4 — proof of order:** sha256 of the Pre-registration plus a UTC timestamp in `gate.md`, and the Phase 0
  commit pushed to `origin` before the first paid call (GitHub's push time is independent evidence).
- **F5 — Phase 4 names `pipeline.ts:533` for T2** and rewrites the stale `config.test.ts` provider comment.
- **F6 (re-review) — G5 limit $0.50** inside the $2.00 (runs only if 2.00 − T ≥ $0.50, else
  `not measured (budget)`), run on **this change's own PR** to `master`, opened as a draft — not on a scratch PR,
  which would pay a second time for the same diff. A G5 that is not measured or not green **blocks the merge**
  until the owner decides. G5 still needs the variable deleted first (F1) and checks `models.finder` in `review.json`.
- **F7 (re-review) — amendments** go into `## Amendments` after the seal, each dated, with its own sha256 and
  pushed before the measurement it affects; the seal check covers only the Pre-registration section.

### Constraints carried over

- **`anthropic/claude-sonnet-5` was rejected at 57.6×** the matched-baseline production cost per review
  (`context/archive/2026-08-10-finder-tool-loop-evals/decision.md`).
- **Fixtures do not predict live behaviour.** `deepseek-v4-flash-0731` fetched on 6/6 fixture rows and 0/3
  live runs. The gate is a **live scratch PR**.
- **Novita on #269 cost ~$0.040 and ~99 s per attempt** (median $0.040345, 98.6 s): 5–6 requests, each
  re-sending the 65 KB diff, mostly uncached (`gate.md`).
- **Z.AI and DeepInfra returned HTTP 429** during the gate (z-ai G2 3/5, deepinfra G1 5/10).

### To do

- **Candidates and budget** — **decided 2026-10-02 (owner)**; see "Owner decision (2026-10-02): candidates
  and budget" above. (An earlier note here listed the order luna → minimax → qwen; the owner's later decision
  of the same day sets luna → qwen → minimax and supersedes it.)
- **T2** — a bounded log of the stage-1 text in CI (from
  `finder-serialization-outage/follow-ups/review-fixes.md`).
- **G5** — the live scratch PR.
- **The report to OpenRouter/Venice** (old 5.4 of the predecessor) — **decided 2026-10-02: the owner
  sends it personally; the draft is ready outside the repo.** **Sent by the owner on 2026-10-02** (the
  text is outside the repo). Done; any reply is tracked outside this change.
- **Interim deployment of Phases 1–3** to `master` — open, the owner's decision (recorded in the
  predecessor's Result).
