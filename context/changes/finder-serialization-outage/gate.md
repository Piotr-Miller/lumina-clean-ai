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

## Results

_Phase 4. Not measured yet._
