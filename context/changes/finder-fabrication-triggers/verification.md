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
