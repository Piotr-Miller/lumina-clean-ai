# Regression gate — finder output without `response_format`

> Plan: `context/changes/finder-serialization-outage/plan.md` (Phase 0 writes this file, Phase 4 measures against it).
> Phase 0 evidence: `context/changes/finder-serialization-outage/probe-phase0.md`.

## Pre-registration

Written **2026-09-29, before any Phase 4 call.** The Results section below is appended after the
measurement and never edits this section. A change to a threshold after this date needs a dated amendment
here, placed **before** the measurement it affects.

### Baseline

- **G4 denominator (matched):** the 12 `baseline-glm-4.6` rows (4 cases × 3 repeats) in
  `context/archive/2026-08-10-finder-tool-loop-evals/results/2026-08-11-tool-loop-matrix.json`. Costs,
  sorted: 0.00022508, 0.00022858, 0.00030208, 0.00075786, 0.00076114, 0.00096791, 0.00104311, 0.00106766,
  0.00112339, 0.00122489, 0.00146976, 0.00158216. **Median $0.00100551; 3× ceiling $0.00301653 per
  attempt.** Recomputed 2026-09-29 from the archived file; it matches the plan.
- **Production context (not a denominator):** the 17 pre-break `review.yml` runs of 2026-09-10 → 2026-09-13
  all carry a `review cost: finder=$…` line. Median **$0.002038**, range $0.000294–$0.004027, every one a
  single finder step with no `getFileContext` call. These PRs differ in diff size from #269 and from the
  fixtures, so this figure is reported next to G4, never used as its denominator.

### Gates

Every gate is evaluated **per endpoint**, measured pinned (`OPENROUTER_FINDER_PROVIDERS=<slug>`, i.e.
`only: [slug]`) with the serving provider checked on every request. A request served by another provider
invalidates the attempt rather than passing it. Endpoint slugs, confirmed 2026-09-29 from OpenRouter's
public endpoint list for `z-ai/glm-4.6`: `z-ai`, `novita`, `deepinfra`, `venice`. Z.AI is measured first.

- G1 reliability: PR #269 × 10 per endpoint (the diff CI computed, 65,455 bytes; `--source-root` at
  `fca2778`; the base branch's rules). **≥ 9/10 attempts** end with a valid object (after ≤ 1 repair).
  The count is over **attempts**, not successful rows: every `FinderOutputError`, timeout and API error —
  **a 429 included** — counts against it. The repair rate is reported separately, as a signal rather
  than a gate.
- G2 no findings: `evals/fixtures/clean-change.diff` × 5, tool-enabled: **5/5** valid with
  `findings: []`. Any finding, including `minor` or `nit`, fails this gate. (The archived glm-4.6
  baseline returned an empty list 3/3 on this case.)
- G3 quality: `baseline-glm-4.6` (4 cases × 3 repeats) **pinned per endpoint**. All 12 attempts count,
  provider errors, timeouts and `FinderOutputError` as failures for their case. Required, matching the
  archived baseline: `issue_recall` 3/3 on the JS loop; `issue_recall` 3/3 and `review_fails` 3/3 on React;
  3/3 on each of `flaw_stale_closure`, `flaw_lost_cleanup`, `flaw_unsafe_html`; `no_false_alarms` 3/3 on
  the clean case. Cross-hunk (`tool_required`, `flaw_cross_hunk_contract`, both 0/3 in the baseline) is
  recorded as diagnostic, never as a pass. The owner hand-reads **every distinct finding from successful
  G1 attempts** per candidate endpoint, deduplicated by claimed defect and location, with contributing
  attempt IDs recorded below. Every distinct finding must identify a real defect in #269's diff; a rejected
  hand-read fails G3.
- G4 cost: on the same 12 fixture attempts used by G3, median **total finder cost per attempt** (loop,
  finalization and repair requests, failed attempts included) **≤ $0.00301653**. An attempt with missing
  cost telemetry for any request fails G4 rather than being omitted. Median and maximum latency over all
  attempts are reported; a timeout fails G1.
- G5 live: one same-repo scratch PR, whole review green, `finderTelemetry` present, every finder step
  logged with its provider.

**Admission to production:** only endpoints that pass **all of G1–G4**. If none does, Phase 5 does not
start: the finding goes into `change.md` and the owner decides on the fallback (a model swap).

### Amendment G-A1 (2026-09-29, from plan-review F4, before any Phase 4 call)

The 3× threshold and the G4 denominator are **unchanged**. This records context the verdict needs.

- **Endpoint prices.** The G4 baseline was served by Venice (fp4). Per-token prices for `z-ai/glm-4.6`,
  read 2026-09-29 from `https://openrouter.ai/api/v1/models/z-ai/glm-4.6/endpoints` (USD per million
  tokens, prompt / completion; all four list `reasoning` as supported):

  | Endpoint  | Quant | Prompt | Completion | vs Venice (prompt / completion) |
  | --------- | ----- | ------ | ---------- | ------------------------------- |
  | venice    | fp4   | 0.43   | 1.75       | 1.00× / 1.00×                   |
  | deepinfra | fp4   | 0.50   | 2.00       | 1.16× / 1.14×                   |
  | novita    | bf16  | 0.55   | 2.20       | 1.28× / 1.26×                   |
  | z-ai      | fp4   | 0.60   | 2.20       | 1.40× / 1.26×                   |

  Re-read the list immediately before the first Phase 4 call and note any change here, dated.

- **A G4-only failure is an owner decision, not an automatic fallback.** An endpoint that passes G1–G3
  and fails only G4 is reported to the owner with its measured median, its price ratio above, and the
  fallback's known cost ratio (57.6× in the last cycle). It is not admitted to production without that
  decision, and it does not by itself trigger a model swap.

### Amendment G-A2 (2026-10-01, owner, before any Phase 4 call)

Thresholds unchanged. This records the owner's scope and spend decision for the measurement.

- **Endpoints:** all four are measured: `z-ai` first, then `novita`, `deepinfra`, `venice`.
- **Budget:** **$1.50 in total for the whole of Phase 4**. That covers every finder request (loop, finalization,
  repair), the promptfoo grader and the judge, if it is called. The running total comes from per-request
  telemetry and is cross-checked against the OpenRouter key's usage counter. Before each endpoint, the
  remaining budget is compared with that endpoint's expected cost. **If the total passes $1.20, measurement
  stops and the owner decides whether to continue.** $1.50 is never exceeded. An endpoint not measured for
  lack of budget gets "not measured", never a verdict.
- **No retries to hide failures.** A 429, a timeout and a `FinderOutputError` each count as a failed G1
  attempt, as G1 above says. A failed attempt is never re-run to replace it.
- **Provider check on every request.** The serving provider that OpenRouter reports is checked on every
  request against the pinned endpoint's name (`z-ai` → `Z.AI`, `novita` → `Novita`, `deepinfra` →
  `DeepInfra`, `venice` → `Venice`). A missing or different name invalidates the attempt: it does not count
  as a pass.
- **A G4-only failure** goes to the owner with its median and price ratio (G-A1). It is not rejected
  automatically.
- **4.3 and 4.4 stay with the owner.** The material for the hand-read is the deduplicated findings per
  endpoint, with attempt IDs.

**Price re-read (G-A1), 2026-10-01T20:34:57Z,** from the same endpoint list: venice fp4 0.43 / 1.75, deepinfra
fp4 0.50 / 2.00, novita bf16 0.55 / 2.20, z-ai fp4 0.60 / 2.20 USD per million tokens. All four list `tools`
and `reasoning`. **No change since 2026-09-29.** OpenRouter key usage before the first Phase 4 call:
$51.05074162.

### Amendment G-A3 (2026-10-02, owner, after the $1.20 stop, before any DeepInfra or Venice call)

At the budget stop, with $1.062279 spent, the owner raised the Phase 4 limit to **$2.30 in total**, so that
`deepinfra` and `venice` can both be measured. The protocol and thresholds are unchanged. The rules of G-A2
otherwise stand: the running total is checked before each endpoint, a series is cut before an attempt that
could cross the limit, and $2.30 is never exceeded. The measurements already taken (z-ai, novita) are
unaffected.

## Results

Measured 2026-10-01/02 with `packages/code-reviewer/scripts/finder-gate.mjs` (G1, G2) and promptfoo
(G3, G4), each endpoint pinned through `OPENROUTER_FINDER_PROVIDERS=<slug>`. Raw records, one line per
attempt or row, are in this folder: `gate-<slug>-pr269.jsonl`, `gate-<slug>-clean.jsonl` and
`gate-<slug>-promptfoo.jsonl`. #269's input was reproduced byte for byte: diff 65,455 B (sha256 `1e4ec088…550f`),
rules 2,929 B, worktree at `fca2778`. Every attempt ran once, with no re-runs. promptfoo ran with `-j 1`, with
the four archived cases filtered: exactly 12 rows per endpoint.

### Verdicts

| Endpoint  | G1 (#269, ≥ 9/10)          | G2 (clean, 5/5 with `[]`)          | G3 automated (fixtures)              | G3 hand-read (4.3)  | G4 (median ≤ $0.00301653) | Overall                       |
| --------- | -------------------------- | ---------------------------------- | ------------------------------------ | ------------------- | ------------------------- | ----------------------------- |
| z-ai      | **PASS** 10/10             | **FAIL** 2/5 (3 × HTTP 429)        | **FAIL** — `flaw_stale_closure` 2/3  | material only       | **PASS** $0.00180328      | **FAIL** (G2, G3)             |
| novita    | **PASS** 10/10             | **PASS** 5/5                       | **PASS** — every required metric 3/3 | **pending (owner)** | **PASS** $0.00162580      | **pending** G3 hand-read, 4.4 |
| deepinfra | **FAIL** 5/10 (5 × 429)    | **FAIL** 4/5 (attempt 04: 1 minor) | **PASS** — every required metric 3/3 | material only       | **PASS** $0.00121460      | **FAIL** (G1, G2)             |
| venice    | **PASS** 10/10 (3 repairs) | **FAIL** 3/5 (01, 02: 1 each)      | **FAIL** — `flaw_stale_closure` 2/3  | material only       | **PASS** $0.00078374      | **FAIL** (G2, G3)             |

**Only Novita can enter production.** It passed every automated part of G1–G4, and its admission now
depends on the owner's hand-read of its #269 findings (4.3) and the owner's acceptance of the list (4.4).
No endpoint failed on G4 alone, so G-A1's owner-decision clause is not triggered.

### Detail

- **Serving provider:** every request of every attempt reported the pinned endpoint's name: `Z.AI`,
  `Novita`, `DeepInfra`, `Venice` across G1, G2 and all 48 promptfoo rows. No attempt was invalidated.
- **Reasoning (A3), corrected 2026-10-02 (impl-review-phase-4 F1):** for **G1 and G2**, the gate runner checked
  both A3 channels on every request — reasoning tokens (the SDK's and OpenRouter's count) and the reasoning
  text — and found none on any of the four endpoints. For the **promptfoo rows** as measured, the adapter
  recorded **only the SDK's reasoning-token count**. That count was 0 on every request, but reasoning text
  was not checked, so A3 was not established for those 48 rows. The original responses did not survive, so
  this cannot be checked after the fact. Novita's 12 rows were re-measured with the corrected adapter (see
  "Supplement A3-F1" below). The other three endpoints fail other gates and were not re-measured.
- **Repair rate (signal, not a gate):** z-ai 0 and novita 0 format repairs (G1, G2, promptfoo). deepinfra 2
  in G1 plus 2 in promptfoo (both cross-hunk rows). venice 3 in G1. Every repair succeeded. No attempt
  ended in `FinderOutputError`.
- **HTTP 429 ("temporarily rate-limited upstream"):** z-ai G2 attempts 03–05; deepinfra G1 attempts
  06–10, where 08 failed mid-loop after 4 paid requests ($0.018188). All count against their gate, as
  pre-registered, and none was re-run. For Z.AI this is the second observation after Phase 0 (9/9 × 429);
  for DeepInfra it is the first.
- **Empty #269 reviews (signal for the owner):** deepinfra attempts 02 and 05 returned a valid
  `findings: []` on #269 after 2 requests with no `getFileContext` call. Every other valid #269 attempt
  on any endpoint reported 2–12 findings. G1 counts them as valid, because an explicit empty list is a
  model answer, not a format failure. They are the same shape as the unexplained empty review in Phase 2's
  manual run (follow-up T2).
- **G2 findings on the defect-free rename:** deepinfra 04 flagged the base-10 unit comment in
  `src/lib/format-bytes.ts:6-8` (minor, documentation). venice 01 and 02 each reported one finding (see
  `gate-venice-clean.jsonl`). Any finding fails G2.
- **G3, the stale closure:** z-ai and venice each missed `flaw_stale_closure` on one React repeat. Every
  other required metric was 3/3 on all four endpoints. Diagnostic: cross-hunk `tool_required` and
  `flaw_cross_hunk_contract` were 3/3 on all four endpoints, against 0/3 in the archived baseline.
  Cross-hunk `issue_recall` was 2/3 on z-ai and 3/3 elsewhere.
- **G4 (the 12 fixture rows, every request priced):** medians z-ai $0.00180328 (1.79×), novita $0.00162580
  (1.62×), deepinfra $0.00121460 (1.21×), venice $0.00078374 (0.78×) against the archived median. Maxima
  $0.00638412, $0.00488917, $0.00539710, $0.00248437.
- **#269 cost and latency (context, not a gate):** median cost per attempt z-ai $0.041153, novita
  $0.040345, deepinfra $0.004679, venice $0.006827. Venice and DeepInfra are an order of magnitude cheaper
  on #269 because most of their requests were served from the prompt cache. Latency median / max: z-ai
  98.3 s / 135.4 s, novita 98.6 s / 138.6 s, deepinfra 12.2 s / 103.0 s, venice 18.5 s / 35.1 s; promptfoo
  rows ≤ 136.2 s (deepinfra, one row). No timeouts. Novita's #269 median is ~20× the pre-break production
  median ($0.002038). That figure was one tool-less call; Novita's attempts make 5–6 requests, each
  re-sending the 65 KB diff, mostly uncached.
- **Hand-read material (4.3):** `hand-read-269.md`, per endpoint, deduplicated, with attempt IDs.

### Spend

Budget: $1.50 (G-A2), raised to $2.30 (G-A3) at the $1.20 stop. The OpenRouter key's usage counter went
from $51.05074162 to $52.49339654: **$1.442655 for all of Phase 4**. That covers every finder request and
the promptfoo grader; no judge was called.

| Endpoint  | G1 (#269) | G2 (clean) | promptfoo finder rows | Finder total  |
| --------- | --------- | ---------- | --------------------- | ------------- |
| z-ai      | $0.429646 | $0.006109  | $0.029725             | $0.465480     |
| novita    | $0.416116 | $0.010113  | $0.028236             | $0.454465     |
| deepinfra | $0.087304 | $0.006933  | $0.021258             | $0.115495     |
| venice    | $0.113539 | $0.005300  | $0.012177             | $0.131016     |
| **all**   |           |            |                       | **$1.166456** |

The finder figures are per-request telemetry. Every request was priced, except the 429 attempts that never
reached a model and so cost nothing. The promptfoo grader (48 `llm-rubric` calls on
`google/gemini-3.1-pro-preview`) is the rest of the counter delta: **$0.276199**. On z-ai it was read
directly as $0.073666. Telemetry and counter agree wherever a delta covered finder requests alone: z-ai G1
was $0.429646 by both.

### Supplement A3-F1 (2026-10-02): Novita's fixture rows re-measured with both A3 channels

**Why.** impl-review-phase-4 F1: the promptfoo adapter recorded reasoning tokens but not reasoning text,
so G3 and G4 for the fixture rows did not establish A3. Novita's admission depends on that G3/G4 result.
Owner decision (2026-10-02, FIX): fix the adapter, then establish the evidence for Novita only, with a hard
$0.20 limit on this step inside G-A3's $2.30.

**Did the original responses survive?** No. The adapter returned to promptfoo only the review JSON and its
metadata, so neither the `-o` export nor `~/.promptfoo/promptfoo.db` ever held a reasoning text. The only
non-zero `reasoning` figures in that store belong to the grader (Gemini), not to the finder.

**Re-measurement.** The same command as the original, `OPENROUTER_FINDER_PROVIDERS=novita`, `-j 1`, the
four archived cases, 3 repeats, with the corrected adapter. Every row now carries the SDK's reasoning
tokens, OpenRouter's reasoning tokens, the reasoning-text length per request and `reasoningLeak`. The
records are in `gate-novita-promptfoo-a3.jsonl`. The original `gate-novita-promptfoo.jsonl` is kept
unchanged.

- **12 rows, 12 passed.** Every request was served by `Novita`, and no format repair was needed.
- **A3: no leak.** All three channels were 0 on every one of the 22 requests, and `reasoningLeak: false`
  on every row.
- **G3 still PASS.** `issue_recall` 3/3 on the JS loop. On React, `issue_recall`, `review_fails`,
  `flaw_stale_closure`, `flaw_lost_cleanup` and `flaw_unsafe_html` were each 3/3. `no_false_alarms` 3/3
  on the clean case. Diagnostic: cross-hunk `tool_required` and `flaw_cross_hunk_contract` 3/3.
- **G4 still PASS.** Median $0.00169488 (1.69× the archived median), maximum $0.00636790, every request
  priced.

**Spend.** The OpenRouter key counter went from $52.49339654 to $52.58922727: **$0.095831** for this step,
made up of finder telemetry $0.032829 and the grader $0.063002. That is within the $0.20 limit. Phase 4 in
total: **$1.538486** of G-A3's $2.30.

**Novita's automated G1–G4 verdict stands**, now with A3 established on its fixture rows too. Admission
still depends on 4.3 (hand-read) and 4.4 (the list).
