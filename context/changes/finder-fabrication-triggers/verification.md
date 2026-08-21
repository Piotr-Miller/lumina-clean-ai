# Pre-registration — finder-fabrication-triggers

Frozen at the Phase 2 commit, before any paid run. Phases 3–4 may append
measurements and gate read-offs only; no gate, threshold, formula, or frozen
wording below may change after the first Phase 3 call.

## Pinned settings

- Finder: `z-ai/glm-4.6`, tool-less, `maxOutputTokens 16_384`, `maxRetries 0`,
  no temperature override — pinned in `fabrication-probe.mjs`, never
  env-resolved. Claims are scoped to single-attempt tool-less draws (plan
  review F8).
- Grader: `google/gemini-3.1-pro-preview` (`fabrication-grade.mjs`); flat
  verdict schema (`{ mechanism, reason }`) asserted provider-compatible
  before any spend; run identity (`variant`/`rung`/`model`/`inputSha256`/
  `inputsSha256`) cross-checked results↔manifest before the first call.

## Primary metric

Per-run **M2+M3 rate** (model-attributable fabrication), with per-mechanism
sub-counts always recorded. Secondary observables (recorded, never gated):
M1 rate, collapse-signature rate.

## Gates

- **G1 INVALID-PREMISE**: if baseline M2+M3 fabrication runs = 0 of 20 on
  BOTH variants, stop after Phase 3 — fabrication is not locally reproducible
  at measurable rate; the decision doc records it; the R5 hand-off is
  unchanged.
- **G2 INSUFFICIENT-CI-SIGNAL**: CI rungs require a CI baseline of **≥ 5/20**
  fabrication runs (threshold sized so the screen arithmetic works: 3/20
  scales to 1.2/8 and could never trigger a 2-run drop; 5/20 gives an
  expected 2/8, so 0/8 reaches it). Below 5/20 → pre-registered stop, with
  the instrument-variant asymmetry recorded in the decision doc.

## Numeric read-off table

Let B = CI baseline fabrication-run count out of 20 (B ≥ 5 guaranteed by G2).
A rung read at cumulative n=20 on its PREDICTED component:

| Verdict        | Condition             |
| -------------- | --------------------- |
| **ELIMINATED** | count = 0 while B ≥ 4 |
| **DROP**       | count ≤ B − 4         |
| **UNCHANGED**  | \|count − B\| ≤ 3     |
| **INCREASED**  | count > B + 3         |

Predicted components: R1 → M1 (cap lifted; the falsifier is cap-specific);
R2 → M2+M3 (prose removed); R3 → M2 expected ≈ 0 with invisible-code claims
persisting as M3; R-loc → M3 (off-diff definitions injected).

## H\* combining rule

- **SUPPORTED** iff R2 reads DROP or ELIMINATED AND at least one of R1 (on
  M1) / R-loc (on M3) reads ELIMINATED.
- **FALSIFIED** iff all four rungs read UNCHANGED on their predicted
  components.
- Otherwise **INCONCLUSIVE**.

## Escalation rule

A rung's n=8 screen escalates iff its fabrication-run count differs from the
CI baseline rate scaled to n=8 by ≥ 2 runs in either direction; escalation
adds exactly 12 attempts to reach cumulative n=20.

## Ceilings and the attempt ledger

- Hard ceiling: **140 paid finder attempts** — 120 planned (40 baselines +
  4×8 screens + up to 4×12 top-ups) plus a 20-attempt error reserve. Each arm
  must reach its exact gradeable target (baselines n=20, screens n=8,
  escalations cumulative n=20); provider errors consume the reserve but never
  shrink a denominator. Exhausting either ceiling before a target is reached
  yields INCONCLUSIVE for the affected arm; an attempt that would exceed a
  ceiling does not start.
- **Calibration**: the FIRST CI-baseline observation is 1 + 19 (not 1 + 20),
  graded immediately; it fixes the explicit finder-plus-grader dollar ceiling
  = 120 × measured per-attempt cost × 1.5, before any further calls.
- **Calibration record (2026-08-21, `ci-base-n1-20260821T133414Z`, Venice
  fp4)**: finder $0.012462 + grader ≥$0.169952 (9 calls — 8 findings + 1
  resume re-attempt; one call's cost unreported) = per-attempt **≥$0.182414**.
  **Dollar ceiling = 120 × $0.182414 × 1.5 = $32.83.** Grader spend dominates
  (~$0.02 per verdict at ~8 findings/run). Observation: 8 findings, 3 flagged
  — all M3, 0 M1, 0 M2; fabricationRuns 1/1.
- **Cross-invocation attempt ledger** (impl-review F3 closure): the
  authoritative spent-attempt count is the sum of `runs[]` lengths across
  every committed results file `results/<variant>-<rung>-n*-*.json`
  (checkpointed by the probe after every paid attempt; `*-manifest.json`,
  `*-dry-manifest.json`, and `*-graded.json` never count). Every attempt in a
  checkpointed file counts — failed and interrupted attempts included.
  Single-invocation batches are additionally capped at `MAX_ARM_ATTEMPTS =
20` by the probe itself. Before EVERY probe invocation, read the ledger
  from the repo root:

  ```bash
  node -e "const fs=require('fs');const d='context/changes/finder-fabrication-triggers/results';let t=0;for(const f of fs.readdirSync(d)){if(!/-n\d+-/.test(f)||f.endsWith('-manifest.json')||f.endsWith('-graded.json')||!f.endsWith('.json'))continue;t+=JSON.parse(fs.readFileSync(d+'/'+f)).runs.length}console.log('attempts spent:',t,'| remaining of 140:',140-t)"
  ```

  Refuse to start an invocation whose `--n` exceeds the remaining count.

## INCONCLUSIVE gate

At ceiling with no rung past its threshold → stop; the decision doc records
H\* unsupported; hand off (default follow-up: R5 as its own change).

## Hand-read protocol

Every rubric-flagged finding + 10 random clean findings per phase are
hand-read. A misgrade rate ≥ 15% invalidates the grading — stop.

## Ground-truth freeze (impl-review F2 closure)

Raw-byte sha256 of the frozen grading inputs, taken from the Phase 2 working
tree on the campaign machine (the same machine every paid run executes on).
The grader records the hash of the ground truth it actually read in every
graded file (`groundTruth.sha256`); a graded file whose recorded hash differs
from the value here is INVALID and must not enter any denominator.

| File               | sha256                                                             |
| ------------------ | ------------------------------------------------------------------ |
| `ci.md`            | `12fceadb423bb6130f1512773f360f3610515fbe6178d783cd46b7c34695e820` |
| `instrument.md`    | `20c3baeb778c9270c973b1c9c6fd3c4a53861e07be2c5e8aa427947fd9ae9b00` |
| `rloc-context.txt` | `2551b64085cdeee9b2adb56c776c64d1f07776734f47c71b6f49c2f566cc15ab` |

The injected R-loc block additionally appears in every rloc manifest as
`rlocContext.sha256` =
`a92bc759919994eed117f76754a608af6eb006f6031940950217fdd2a026885c` (the
wrapped `<off-diff-context>` form, 596 bytes at sent offset 100,030).

## Amendment A1 — provider pinning (2026-08-21, before any gradeable observation)

- **Trigger**: calibration attempts 1–4 ALL failed — 3× `AI_NoObjectGeneratedError`
  with three DISTINCT malformed envelopes (severity-keyed object, bare array
  with `issue`/`detail` fields, severity-keyed object again) and 1× 300 s
  `TimeoutError`. Raw failure texts preserved in
  `results/ci-base-n1-20260821T{125600,125747,125920,130502}Z.json`.
  Unpinned OpenRouter routing spreads `z-ai/glm-4.6` across five upstreams
  (Venice, DeepInfra, Novita, AtlasCloud, Z.AI) with visibly different
  behavior and 3× per-attempt cost variance; provider provenance was not
  captured, so routing is the leading hypothesis, not a proven cause.
- **Endpoint facts** (OpenRouter endpoints API, 2026-08-21): only Venice
  (fp4) and AtlasCloud (fp8, deranked status −2) advertise
  `structured_outputs` (server-enforced strict JSON Schema). Novita (bf16)
  and DeepInfra advertise `response_format` only; Z.AI advertises neither.
  Providers silently ignore unsupported parameters, so unpinned routing sent
  strict-schema requests to endpoints that never enforced them — consistent
  with the malformed-envelope failures. A first pin attempt at Novita bf16
  with `require_parameters: true` was rejected in 345 ms at $0 ("No endpoints
  found that can handle the requested parameters",
  `results/ci-base-n1-20260821T133008Z.json`) — Novita cannot serve enforced
  json-schema at all.
- **Change (additive, instrument-side only)**: finder requests now pin
  `provider: { order: ["venice"], allow_fallbacks: false,
require_parameters: true, quantizations: ["fp4"] }` — schema enforcement is
  required for the instrument to produce a measurable outcome; quantization
  limits external validity only, and every baseline and rung uses the same
  endpoint so the within-provider ablation comparison is unaffected. Every
  probe run records the serving provider
  (`providerMetadata.openrouter.provider` → `runs[].provider`). Model,
  prompts, inputs, rubric, gates, and grading are UNCHANGED.
- **Ledger**: all failed attempts REMAIN counted — 5/140 spent (4 model
  failures + the $0 Novita routing rejection), error reserve 15/20.
- **Scope**: campaign results are scoped to `z-ai/glm-4.6` served by Venice
  fp4 with strict structured outputs. They must not be generalized to bf16 or
  unpinned OpenRouter routing.
- **Decision rule**: ONE controlled calibration retry under the Venice pin;
  if it also fails, take the pre-registered stop (instrument failure) — no
  further paid attempts.
- **Validity**: zero gradeable observations existed when this amendment was
  written, so it cannot be results-driven; every arm (baselines and all
  rungs) runs under the same pin, so internal comparisons are unaffected.

## Rung dry-manifest anchors (frozen)

| Rung | rawBytes | sentBytes | Window                                     |
| ---- | -------- | --------- | ------------------------------------------ |
| base | 215,560  | 100,030   | 13 files, cut in `impl-reviewer.test.ts`   |
| r1   | 215,560  | 215,560   | 27 files, no cut, no over-cap              |
| r2   | 155,354  | 100,030   | 15 files, cut in `pipeline.ts`, 7 over-cap |
| r3   | 63,978   | 63,978    | 6 prose files, no cut, no over-cap         |
| rloc | 215,560  | 100,626   | base window + 596-byte injected block      |

Instrument variant (base only): rawBytes 266,444 → sentBytes 100,030.

## Phase 3 results — baselines (2026-08-21; numbers + gate read-offs only)

- **CI baseline** (n=20 gradeable = calibration 1 + batch 19; files
  `ci-base-n1-20260821T133414Z`, `ci-base-n19-20260821T134341Z`):
  fabrication runs (M2+M3) **17/20**; M1 runs 5; findings 166 — M1 10, M2 6,
  M3 48, none 102. **B = 17.**
- **Instrument baseline** (n=20 gradeable = batch 19 of 20 + top-up 1; files
  `instrument-base-n20-20260821T140824Z` — one attempt errored, drawn from
  reserve — and `instrument-base-n1-20260821T150514Z`): fabrication runs
  **8/20**; M1 runs 1; findings 121 — M1 1, M2 7, M3 12, none 101.
- **G1 INVALID-PREMISE**: 17/20 and 8/20 — neither variant is 0/20 → G1 does
  not fire.
- **G2 INSUFFICIENT-CI-SIGNAL**: CI baseline 17/20 ≥ 5/20 → G2 does not
  fire.
- Gate verdicts are provisional until the Phase 3 hand-read completes below
  the 15% misgrade bar (hand-read queue: `reviews/hand-read-phase-3.md`;
  tally to be appended here).
- **Escalation reference for Phase 4**: B = 17 scaled to n=8 = 6.8; |count −
  6.8| ≥ 2 ⇔ count ≤ 4 (the high side, ≥ 8.8, is unreachable at n=8) — so a
  screen escalates iff its fabrication-run count ≤ 4.
- **Ledger**: 46/140 attempts spent (40 gradeable + 6 errors from reserve;
  reserve 14/20 left). Session spend ≈ finder $0.288 + grader $3.385 ≈
  **$3.67** against the $32.83 ceiling (recorded floor — see incident below).
- **Grading-integrity incident (recorded)**: the first grading task was
  stopped mid-CI-grading, but part of its process tree survived the stop and
  kept grading concurrently with the resumed session; both wrote the same
  checkpoint files (atomic writes, last-writer-wins), so a subset of grader
  calls was paid twice — true grader spend exceeds the recorded `graderUsage`
  by roughly $1–2. Every verdict in the surviving files is a genuine grader
  output under the frozen rubric. One double-graded finding received
  differing verdicts across the two sessions (instrument run 5, finding 1:
  `none` vs `M2`; the last write, `M2`, stands) — a measured instance of
  grader nondeterminism, flagged for the hand-read; it does not change any
  fabrication-run count. Finder attempts and denominators are unaffected.
  Surviving processes were terminated once discovered.

## Phase 3 hand-read — baselines (2026-08-21)

- Queue completed: all **84 rubric-flagged findings + 10 deterministic clean
  controls = 94 findings** were adjudicated in
  `reviews/hand-read-phase-3.md`.
- Tally: **93 agree, 1 misgrade**. The sole misgrade is H-28: the recorded
  `M1` should be `M3` because the finding asserts a documentation defect in,
  and cites, a specific file wholly outside the CI window rather than reporting
  that the file or documentation was merely not provided by the capped input.
- Misgrade rate: **1/94 = 1.06%**, below the pre-registered 15% invalidity bar.
  **Grading is valid; the campaign does not stop.**
- Instrument run 5 finding 1: the surviving `M2` verdict is correct. The
  in-window safe-path class excludes newlines and control characters, so the
  finding claims the code permits what D2 prevents. The earlier discarded
  `none` verdict was incorrect and does not enter the 94-entry denominator.
- The provisional condition on the Phase 3 G1/G2 read-offs is therefore
  cleared; their recorded counts are unchanged. H-28 sits in CI run 7, which
  carries three other M3 verdicts — the M1→M3 correction cannot move B off
  17 or either gate. Under the correction the secondary split would read CI
  M1 9 / M3 49 and m1Runs 4; the grader-recorded numbers stand for all
  read-offs (the hand-read validates grading, it does not regrade), with
  this delta on record for Phase 5's R1 interpretation.
- **G1 and G2 verdicts FINAL: neither fires — proceed to Phase 4.**

## Phase 4 screens — rung ablations at n=8 (2026-08-21; numbers + escalation arithmetic only)

All four screens on the CI variant under the Venice fp4 pin; 8/8 gradeable
each (32 attempts, 0 finder errors). Files `ci-{r1,r2,r3,rloc}-n8-20260821T*`.

| Rung  | fabricationRuns | M1  | M2  | M3  | none |
| ----- | --------------- | --- | --- | --- | ---- |
| R1    | 2/8             | 0   | 0   | 2   | 51   |
| R2    | 5/8             | 0   | 1   | 4   | 55   |
| R3    | 0/8             | 0   | 0   | 0   | 43   |
| R-loc | 5/8             | 4   | 2   | 11  | 39   |

- **Escalation arithmetic** (frozen rule: scaled baseline = B × 8/20 = 17 ×
  0.4 = 6.8; escalate iff |count − 6.8| ≥ 2):
  - R1: |2 − 6.8| = 4.8 ≥ 2 → **ESCALATES** (+12 to cumulative n=20)
  - R2: |5 − 6.8| = 1.8 < 2 → no escalation
  - R3: |0 − 6.8| = 6.8 ≥ 2 → **ESCALATES** (+12 to cumulative n=20)
  - R-loc: |5 − 6.8| = 1.8 < 2 → no escalation
- Non-escalating rungs (R2, R-loc) sit within ±2 scaled runs of baseline —
  read UNCHANGED on the fabrication rate at screen size; their final table
  read-offs on predicted components happen in Phase 5 alongside the
  escalated rungs' n=20 counts.
- **Ledger**: 78/140 spent; escalations would add 24 → 102/140. Reserve
  still 14/20.

## Phase 4 escalations + table read-offs (2026-08-21; numbers + rule applications only)

- **R1 +12** (`ci-r1-n12-20260821T174641Z`): 12/12 gradeable; fabrication
  7/12 — M1 0, M2 4, M3 4, none 66. **Cumulative n=20: fabrication 9/20; M1
  findings 0; m1Runs 0/20.**
- **R3 +12** (`ci-r3-n12-20260821T181157Z`): 12/12 gradeable; fabrication
  1/12 — M1 0, M2 0, M3 1, none 58. **Cumulative n=20: fabrication 1/20; M2
  findings 0.**
- **Table read-offs** (B = 17; ELIMINATED = 0 on predicted component):
  - R1 on M1: count 0 at n=20 → **ELIMINATED**.
  - R3 on M2: count 0 at n=20 → **ELIMINATED**. (Secondary, recorded: the
    pre-registered expectation "invisible-code claims persisting as M3" did
    NOT hold — M3 appeared in 1/20 runs.)
  - R2 on M2+M3: no escalation (5/8, |5 − 6.8| < 2) → **UNCHANGED**.
  - R-loc on M3: no escalation (5/8, |5 − 6.8| < 2) → **UNCHANGED**.
- **H\* read-off (frozen combining rule)**: SUPPORTED requires R2 ∈ {DROP,
  ELIMINATED} — R2 is UNCHANGED, so SUPPORTED cannot obtain. FALSIFIED
  requires all four UNCHANGED — R1 and R3 are ELIMINATED, so FALSIFIED
  cannot obtain. **H\* = INCONCLUSIVE.** Interpretation is deferred to
  `decision.md` (Phase 5).
- Read-offs are provisional until the Phase 4 hand-read completes below the
  15% bar (queue: `reviews/hand-read-phase-4.md`; tally to be appended).
- **Ledger**: 102/140 spent (96 gradeable + 6 errors); reserve 14/20.
