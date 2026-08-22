# Pre-registration — r5-finder-truncation-note

Frozen at the Phase 2 commit, before any paid run. Phase 3 may append
measurements and bar read-offs only; no bar, band, bound, ceiling, definition,
or frozen wording below may change after the first paid call.

## Arm

One paid arm: **CI-base, n=20 gradeable, under the finder truncation note**
(the production prompt path shipped in Phase 1), graded against the frozen
ground truth. Reference baseline on record (archived campaign
`context/archive/2026-08-15-finder-fabrication-triggers/`, CI-base n=20):
fabrication runs (M2+M3) 17/20 (**B = 17**), m1Runs 5/20, findings 166 —
M1 10, M2 6, M3 48, none 102, mean findings/run 166/20 = 8.3.

## Pinned settings (inherited unchanged from the campaign)

- Finder: `z-ai/glm-4.6` pinned to **Venice fp4** (Amendment A1:
  `provider: { order: ["venice"], allow_fallbacks: false, require_parameters: true, quantizations: ["fp4"] }`),
  tool-less, `maxOutputTokens 16_384`, `maxRetries 0`, no temperature
  override. Single-attempt draws.
- Grader: `google/gemini-3.1-pro-preview` (`fabrication-grade.mjs`), flat
  verdict schema (`{ mechanism, reason }`), frozen rubric unchanged.
- Instrument identity: dry anchors **rawBytes 215,560 / sentBytes 100,030**;
  `inputSha256` =
  `315a588a6fbdd03da05f4e9b080afe67af009d6d67f0f457673497e004aa027e` (equal
  to the archived CI-base manifest — verified in Phase 1). The note changes
  the PROMPT only, outside the fenced diff; the graded input bytes are
  unchanged, so the archived frozen ground truth grades the new runs as-is.
  Every paid run's provenance must record `noteActive: true` and a constant
  `promptSha256` across all 20+ runs.

## Success bar

**M1 findings = 0 across the 20 gradeable runs** (which entails
m1Runs 0/20) — the ELIMINATED shape from the archived read-off table
(count = 0 on the predicted component while B ≥ 4; B = 17 on record).

## Falsifier

**m1Runs ≈ 5/20** (equivalently M1 findings ≈ 10): the note has no effect on
M1-class absence claims — the falsifier registered for R5 in the archived
`research.md`.

## Guards

Each direction is owned by a different metric (plan-review F1 — the run-level
band alone cannot detect an increase above a 17/20 baseline).

### Down-side (muzzled finder)

- Fabrication runs (M2+M3) within **|count − 17| ≤ 3**, i.e. inside [14, 20].
- Mean findings/run within **8.3 ± 50%**, i.e. inside [4.15, 12.45].

### Up-side, PRIMARY — M1→M3 migration (hard guard, re-review F1)

**`m1_to_m3_rewrites = 0`.** During the Phase 3 hand-read, every flagged M3
verdict is labeled against the following definition, frozen verbatim here
before any spend:

> an absence/missing/not-provided claim about a file the truncation metadata
> names, or any over-cap file — the archived M1 claim shape, landing as M3
> only because the note disclosed the absence

ANY hand-confirmed rewrite trips the guard and is decision-bearing in
Phase 4, exactly like a failed success bar.

### Up-side, SECONDARY — serving drift

**Total M3 findings across the 20 gradeable runs ≤ 57** (trip iff ≥ 58).

Derivation (recorded verbatim; archived per-run M3 distribution read from
`ci-base-n1-20260821T133414Z-graded.json` +
`ci-base-n19-20260821T134341Z-graded.json`, `perRun[].byMechanism.M3` in
file order):

- Per-run M3: 3, 0, 1, 10, 2, 3, 0, 3, 2, 4, 0, 1, 0, 5, 3, 3, 0, 2, 5, 1 —
  total 48, mean 2.4/run, sample SD 2.4149.
- Model the 20-run M3 total as Poisson(λ = 48) (sum of 20 per-run
  Poisson(2.4) draws). The exact one-sided 90% quantile — the smallest k with
  CDF ≥ 0.90 — is **57**.
- Bound = 57, strictly below 58 = 48 + 10 (baseline M3 total + the 10
  baseline M1 findings fully migrated), as the plan mandates: full migration
  trips the guard.
- Dispersion caveat, recorded: the empirical per-run variance is 5.83
  (dispersion index 2.43, driven by the single run with M3 = 10). Under a
  normal model at the empirical SD (total SD 2.4149 × √20 = 10.80),
  P(total > 57) ≈ 0.19 — an accepted false-trip risk for a SECONDARY guard.
- Pre-registered meaning of a secondary trip: a serving-drift signal,
  adjudicated against the primary guard's hand labels — a secondary trip
  with `m1_to_m3_rewrites = 0` reads as serving drift, not migration. Either
  way the trip is recorded in Phase 4 against this meaning; no renegotiation.

## Ceilings and the attempt ledger

- **28 paid finder attempts** — 20 gradeable target + 8 error reserve.
  Provider errors draw from the reserve and never shrink the n=20
  denominator. `--n 20` yields 20 ATTEMPTS, not 20 gradeable runs
  (plan-review F5): after grading, if gradeable < 20, top-up invocations
  (`--n 1` each, graded) run until 20 gradeable runs exist across this
  change's committed results files or a ceiling fires — then the arm closes
  **INCONCLUSIVE** with every available result committed and final
  attempt/cost totals recorded (re-review F3).
- **Dollar ceiling $5.50** = 20 × $0.182414 (the campaign's calibrated
  per-attempt cost, finder + grader) × 1.5 = $5.47, rounded up to $5.50.
- Cross-invocation attempt ledger — the authoritative spent-attempt count is
  the sum of `runs[]` lengths across every committed results file
  `results/<variant>-<rung>-n*-*.json` in THIS change's folder
  (`*-manifest.json`, `*-dry-manifest.json`, and `*-graded.json` never
  count; failed and interrupted attempts count). Read it before EVERY probe
  invocation, from the repo root:

  ```bash
  node -e "const fs=require('fs');const d='context/changes/r5-finder-truncation-note/results';let t=0;for(const f of fs.readdirSync(d)){if(!/-n\d+-/.test(f)||f.endsWith('-manifest.json')||f.endsWith('-graded.json')||!f.endsWith('.json'))continue;t+=JSON.parse(fs.readFileSync(d+'/'+f)).runs.length}console.log('attempts spent:',t,'| remaining of 28:',28-t)"
  ```

  Refuse to start an invocation whose `--n` exceeds the remaining count.

## Ground-truth freeze

`ground-truth/ci.md` in this change's folder is a byte-identical copy of the
archived frozen inventory; the grading input is unchanged from the campaign.

| File    | sha256                                                             |
| ------- | ------------------------------------------------------------------ |
| `ci.md` | `12fceadb423bb6130f1512773f360f3610515fbe6178d783cd46b7c34695e820` |

Hash discipline (re-review F4): verify the LIVE file's sha256 against this
value immediately BEFORE every grader invocation, and verify the graded
output's recorded `groundTruth.sha256` equals it AFTER. A graded file whose
recorded hash differs is INVALID and enters no denominator.

## Aggregation rule (frozen)

Bar read-offs aggregate deterministically across ALL committed result files
for this change, ordered by file stamp, summing per-mechanism counts over
gradeable runs only. The aggregation arithmetic is appended next to the
read-offs in Phase 3.

## Scope of claims (plan-review F3)

All bars measure the **tool-less single-attempt prompt effect** of the
truncation note, on glm-4.6 served by Venice fp4. Production runs
tool-ENABLED with a diff-scoped `getFileContext` able to fetch over-cap
files — that interaction is unmeasured here. The Phase 4 decision may cite
prompt-effect evidence only; the passive live check (the next naturally
oversized PR review, diff >100 KB) is the tool-enabled channel.

## Hand-read protocol

Every rubric-flagged finding + 10 random clean findings are hand-read; a
misgrade rate ≥ 15% invalidates the grading — stop. Additionally, every
flagged M3 verdict receives the `m1_to_m3` migration label against the
frozen definition under the PRIMARY up-side guard above.
