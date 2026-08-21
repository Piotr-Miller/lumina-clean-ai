# Finder Fabrication Ablation Campaign Implementation Plan

## Overview

Turn `research.md`'s ablation ladder into a pre-registered, budgeted measurement campaign. Repair
the probe instrument so it can measure fabrication at all (today it prints aggregates and captures
no finding text), re-baseline both reproducing #127 variants with window-relative, per-mechanism
grading, run the ablation rungs off the CI variant, and close with a decision doc plus a fixture
spec. Characterization only — no fixes, no fixtures, no production pipeline changes.

## Current State Analysis

From `research.md` (authoritative — repo-only research complete, 2026-08-20):

- "Fabrication" decomposes into three mechanisms: **M1** cap-manufactured falsehood (claim true of
  the truncated input — pipeline defect), **M2** contradiction of visible defences (pure model
  fabrication), **M3** locality gap (defence real but off-window/off-diff, tool never called).
- Every single-property trigger hypothesis is falsified by measurement; the surviving candidate is
  the conjunction **H\***: _in-window security-subject content referencing material the cap or diff
  boundary has made invisible_.
- The reproducing artifact has two runnable variants: **CI** (`git diff e8ebb66...9c49a0c` minus
  `**/reviews/*.md` and the plan path → 215,560 B, byte-validated against the Actions log) and
  **instrument** (`git diff 7c9c12f^1 7c9c12f` minus `**/reviews/*.md` → 266,444 B, zero source
  in-window). Both collapse.
- The existing probe (`packages/code-reviewer/scripts/finder-distribution.mjs`) cannot serve: no
  finding capture, no cost telemetry, stale recipe (4 divergences from CI), re-implemented
  `capDiff`, legacy model env var.
- Fabrication has never been graded locally — the archived "2/8" was a severity-collapse-signature
  count. The only graded-fabrication precedent is the fixture rubric (`no_fabricated_absence`,
  0 misgrades in 20 vs hand-read), which is fixture-specific and raw-diff-relative.

## Desired End State

- A probe + grader pair that reproduces the CI recipe byte-exactly, captures every finding, prices
  every run, and grades fabrication window-relatively with M1/M2/M3 separated.
- Pre-registered gates committed BEFORE any paid run (the vocabulary-bias discipline: the bar
  provably predates the number).
- Baseline fabrication rates for both variants at n=20, and screened/escalated ablation results for
  R1, R2, R3, and R-loc, all read off the numeric table.
- `decision.md` + `fixture-spec.md` closing the change; the R5 truncation-note follow-up named in
  the handoff regardless of outcome.

### Key Discoveries (carried from research):

- Recipe byte-counts are free determinism anchors: CI-variant base must reproduce **215,560 B**,
  instrument base **266,444 B** (`research.md` §1).
- `DIFF_CAP_BYTES = 100_000`, byte-prefix cut — `packages/code-reviewer/src/pipeline.ts:40,107-112`;
  the probe must **import** it, never copy it.
- The window manifest is the ground truth for grading — the archive's raw-diff grading mislabeled
  F10 (`research.md` §2).
- Probe model resolution must be pinned explicitly — the old probe reads legacy `OPENROUTER_MODEL`
  and ignores CI's `OPENROUTER_REVIEW_MODEL` (`research.md` §5.5).

## What We're NOT Doing

- **No R5 / finder truncation note** — an intervention; ships as its own follow-up change (user
  decision). Named in the handoff either way.
- **No production behavior changes** — the ONLY `packages/code-reviewer/src/**` edit is an
  export-only change making `capDiff` importable (review F5), pinned by a parity test; everything
  else is scripts + docs + results.
- **No fixture building** — the deliverable is the spec (change.md charter).
- **No model swap, no severity-calibration work** (change.md "Do NOT"; collapse rate is tracked as
  a secondary observable only, never gated).
- **No budget renegotiation** — inconclusive at ceiling → stop, record, hand off (user decision).

## Implementation Approach

Five phases with a hard free/paid boundary after Phase 2. Phases 1–2 are code + prose and fully
verifiable without API spend (dry-run byte anchors). Phase 3 spends on baselines and finalizes the
$ ceiling from measured cost. Phase 4 spends conditionally, per the pre-registered escalation rule.
Phase 5 is synthesis. Model pinned to `z-ai/glm-4.6` (the production finder), tool-less, settings
matching `createReviewer` defaults — pre-registered in Phase 2.

**Scope of claims (review F8)**: the probe is deliberately tool-less and single-attempt — no
source provider, no outer retry, no dedup, no stable IDs. Conclusions are therefore scoped to
single-attempt tool-less finder draws; the production-faithful element is the INPUT (the CI
recipe, byte-anchored), never the loop around the model. This matches the entire evidence base
(all archived collapse evidence is tool-less; glm-4.6 made 0 tool calls in 4/4 live runs; #127's
`preDedupFindingCount` was 10, so dedup is irrelevant to the collapse), and the R-loc rung probes
the missing-context question experimentally instead.

## Critical Implementation Details

- **Window manifests are per-input, not per-variant.** Every rung changes the window contents; the
  grader needs the manifest of the exact input graded. The probe emits a manifest sidecar (files
  in-window with byte ranges; cut file + cut offset) next to every results file.
- **Rung inputs are pathspec ablations of the CI base recipe, then capped**: R1 = base, cap lifted
  (full 215,560 B sent); R2 = base further excluding `context/**` (window fills with source); R3 =
  base restricted to prose only (additionally excludes `packages/**` AND `.github/**`, so no code
  of any kind is in-window); R-loc = base input unchanged PLUS an appended, clearly-delimited
  context block carrying the off-diff defence definitions the ground truth names (e.g.
  `logSafePath`, `cli.ts:102`) — an experimental input, declared as such, ablating the
  diff-boundary invisibility M3 depends on (review F3). R4 needs no run (control #86 already on
  record); R5 is out of scope.
- **Grading is window-relative and mechanism-split.** A finding claiming absence of something
  outside the window is M1 (pipeline), NOT model fabrication; the campaign's primary metric is the
  **M2+M3 rate** (model-attributable). M1 and collapse-signature rates are recorded as secondary
  observables.
- **The old probe stays but gets a deprecation header** pointing at the new one — it belongs to an
  archived change's documentation trail; deleting it would orphan the archive's references.
- **Results land under `context/changes/finder-fabrication-triggers/results/`** — safe to commit:
  `**/results/*.json` is excluded from reviewed diffs since #146, and `context/changes/**` is
  lint-ignored.

## Phase 1: Instrument repair (P1–P4)

### Overview

Build the probe and grader the campaign needs; prove their determinism free of charge.

### Changes Required:

#### 1. Fabrication probe

**File**: `packages/code-reviewer/scripts/fabrication-probe.mjs` (new)

**Intent**: One script that constructs a declared variant/rung input, runs the real finder on it
tool-lessly, and captures everything the campaign needs — replacing the stale, capture-less
`finder-distribution.mjs` for this purpose.

**Contract**: CLI flags `--variant ci|instrument`, `--rung base|r1|r2|r3|rloc` (rungs valid only
with `--variant ci`), `--n <runs>`, `--dry`. Imports `capDiff`/`DIFF_CAP_BYTES` from
`src/pipeline.ts` (no copies — `capDiff` exported by change #5) and `createReviewer` as
`finder-distribution.mjs` does. Model pinned to
`z-ai/glm-4.6` in-script (never env-resolved). Per run it records: full findings JSON, summary,
usage tokens + computed cost, model id, input SHA-256, input byte size, timestamp. Output:
`context/changes/finder-fabrication-triggers/results/<variant>-<rung>-n<N>-<UTCdate>.json` plus a
window-manifest sidecar (`…-manifest.json`: ordered in-window files with byte ranges, cut file,
cut offset, over-cap file list). `--dry` builds the input + manifest and prints byte counts
without any API call.

#### 2. Window-relative fabrication grader

**File**: `packages/code-reviewer/scripts/fabrication-grade.mjs` (new)

**Intent**: Grade a results file's findings as M1/M2/M3/none against the input's window manifest
and a ground-truth defence inventory, via the neutral grader model — the semantic judgment belongs
to a model grader per the retired-regex lesson.

**Contract**: `node fabrication-grade.mjs <results-file>` → per-finding verdict + per-run and
per-file rate summary written next to the input (`…-graded.json`). Grader model:
`google/gemini-3.1-pro-preview` (the validated neutral-grader precedent). The rubric text is read
from the ground-truth files (change #3), never inlined, so Phase 2's frozen wording is what runs.
Executable pre-spend contract (review F7): grading is per-finding; the verdict schema is a FLAT
structured-output object (`{ mechanism: "M1"|"M2"|"M3"|"none", reason }` — no unions/oneOf, per
the provider-subset lesson) and the emitted JSON Schema is dumped and checked for
`oneOf`/`anyOf`/`$ref` before any spend; raw provider failures (`error.text`) and usage tokens are
captured per call; hermetic unit tests cover prompt construction, response parsing, and rate
aggregation with fake responses — no network.

#### 3. Ground-truth defence inventories

**File**: `context/changes/finder-fabrication-triggers/ground-truth/ci.md` and `instrument.md`
(new) — base variants only; ALL per-rung deltas are generated and frozen in Phase 2, before any
result is visible (review F4).

**Intent**: The window-relative inventory the grader judges against: for each variant, the
defences/files that ARE in-window (F1/F2 targets and their comments), that are OFF-window
(impl-reviewer.ts at byte 110,771), and that are off-diff entirely (logSafePath definition) —
derived from the research's reconstructions and the probe's `--dry` manifests.

**Contract**: One section per defence: location status (in-window / off-window / off-diff), the
claim shape that would count as M1 vs M2 vs M3 against it, and the rubric paragraph the grader
receives. Frozen at Phase 2 together with the rung deltas.

#### 4. Deprecation header on the stale probe

**File**: `packages/code-reviewer/scripts/finder-distribution.mjs`

**Intent**: Stop the stale recipe from being reused for future measurements.

**Contract**: Header comment only — names the four divergences and points at
`fabrication-probe.mjs`. No behavior change.

#### 5. capDiff export (export-only)

**File**: `packages/code-reviewer/src/pipeline.ts`

**Intent**: `capDiff` is currently private — the old probe's re-implemented copy exists precisely
because of that. Export it so campaign tooling imports the real function (review F5).

**Contract**: `export` keyword on the existing `capDiff` declaration — no signature or behavior
change — plus a unit test pinning the exported function's behavior (caps at `DIFF_CAP_BYTES`,
appends the marker, UTF-8-safe cut).

### Success Criteria:

#### Automated Verification:

- Package gates pass: `cd packages/code-reviewer && npm run lint && npm run typecheck && npm test`
  (includes the new capDiff parity test and the grader hermetic tests)
- Dry-run determinism: `--variant ci --rung base --dry` reports exactly 215,560 bytes;
  `--variant instrument --rung base --dry` reports exactly 266,444 bytes
- Dry-run manifest sanity: CI base manifest lists `impl-reviewer.test.ts` as the cut file and
  `impl-reviewer.ts` as over-cap
- Grader schema dump contains no `oneOf`/`anyOf`/`$ref` (flat provider-compatible object)

#### Manual Verification:

- Ground-truth inventories reviewed against `research.md` §2 and the archive quotes — every
  F1/F2/F7/F10 target present with correct location status

---

## Phase 2: Pre-registration

### Overview

Write and commit every gate before the first paid run.

### Changes Required:

#### 1. Verification contract

**File**: `context/changes/finder-fabrication-triggers/verification.md` (new)

**Intent**: The complete pre-registration: metrics, gates, thresholds, escalation rule, ceiling
formula, and read-off rules — so every later number is read against a bar that provably predates
it.

**Contract**: Must contain, at minimum:

- **Primary metric**: per-run M2+M3 rate (model-attributable fabrication), with per-mechanism
  sub-counts always recorded. Secondary observables (recorded, never gated): M1 rate,
  collapse-signature rate.
- **G1 INVALID-PREMISE gate**: if baseline M2+M3 fabrication runs = 0 of 20 on BOTH variants,
  stop after Phase 3 — fabrication is not locally reproducible at measurable rate; decision doc
  records it; R5 hand-off unchanged.
- **G2 INSUFFICIENT-CI-SIGNAL gate** (review F2, threshold sized so the screen arithmetic works:
  3/20 scales to 1.2/8 and could never trigger a 2-run drop; 5/20 gives an expected 2/8, so 0/8
  reaches it): CI rungs require a CI baseline of **≥ 5/20** fabrication runs. Below that →
  pre-registered stop, with the instrument-variant asymmetry recorded in the decision doc.
- **Numeric read-off table** (review F1 — every verdict mechanically derivable). Let B = CI
  baseline fabrication-run count out of 20 (B ≥ 5 guaranteed by G2). A rung read at cumulative
  n=20 on its PREDICTED component: **ELIMINATED** iff count = 0 while B ≥ 4; **DROP** iff
  count ≤ B − 4; **UNCHANGED** iff |count − B| ≤ 3; counts above B + 3 are recorded as
  **INCREASED**. Predicted components: R1 → M1 (cap lifted; falsifier cap-specific — review F3);
  R2 → M2+M3 (prose removed); R3 → M2 expected ≈ 0 with invisible-code claims persisting;
  R-loc → M3 (off-diff definitions injected).
- **H\* combining rule**: SUPPORTED iff R2 reads DROP or ELIMINATED AND at least one of
  R1 (on M1) / R-loc (on M3) reads ELIMINATED; FALSIFIED iff all four rungs read UNCHANGED on
  their predicted components; otherwise INCONCLUSIVE.
- **Escalation rule**: a rung's n=8 screen escalates iff its fabrication-run count differs from
  the CI baseline rate scaled to n=8 by ≥ 2 runs in either direction; escalation adds exactly 12
  attempts to reach cumulative n=20.
- **Ceilings (review F6 — exact denominators)**: hard ceiling = **140 paid finder attempts**:
  120 planned (40 baselines + 4×8 screens + up to 4×12 top-ups) plus a 20-attempt error reserve.
  Each arm must reach its exact gradeable target (baselines n=20, screens n=8, escalations
  cumulative n=20); provider errors consume the reserve but never shrink a denominator.
  Exhausting either ceiling before a target is reached yields INCONCLUSIVE. The calibration is
  the FIRST CI-baseline observation (1 + 19, not 1 + 20), graded immediately, and fixes the
  explicit finder-plus-grader dollar ceiling (120 × measured per-attempt cost × 1.5) before any
  further calls.
- **INCONCLUSIVE gate**: at ceiling with no rung past its threshold → stop, decision doc records
  H\* unsupported, hand off (default follow-up: R5 as its own change).
- **Hand-read protocol**: every rubric-flagged finding + 10 random clean findings per phase,
  hand-read; ≥ 15% misgrade rate → grading invalid, stop.
- **Pinned settings**: model `z-ai/glm-4.6`, tool-less, `maxOutputTokens 16_384`, `maxRetries 0`,
  no temperature override. Claims scoped to single-attempt tool-less draws (review F8).

#### 2. Rung ground-truth freeze

**File**: `context/changes/finder-fabrication-triggers/ground-truth/` (rung sections appended to
the variant files)

**Intent**: All four rung manifests (via `--dry`, free), their inventory deltas, and the rubric
wording for every rung are written HERE and frozen before any paid run — Phase 4 may append only
measurements and gate read-offs (review F4).

**Contract**: Per rung: the `--dry` manifest summary, location-status deltas vs the base
inventory, and the grader rubric paragraph. Frozen at the Phase 2 commit.

### Success Criteria:

#### Automated Verification:

- Touched markdown format-clean: `npx prettier --check context/changes/finder-fabrication-triggers/verification.md context/changes/finder-fabrication-triggers/ground-truth/*.md`
- All four rung `--dry` manifests generated and their summaries present in the ground-truth files

#### Manual Verification:

- Rubric wording (base + every rung) human-reviewed and frozen (independent read before any
  spend — the model-grader lesson's requirement)
- Phase 2 commit lands BEFORE any Phase 3 run is executed (timestamp discipline)

---

## Phase 3: Baselines (paid)

### Overview

First graded fabrication measurement ever taken locally: n=20 per variant, ~40 finder runs.

### Changes Required:

#### 1. Baseline runs + grading

**File**: `context/changes/finder-fabrication-triggers/results/` (generated)

**Intent**: `fabrication-probe.mjs --variant ci --rung base --n 20` and
`--variant instrument --rung base --n 20`, then `fabrication-grade.mjs` over both; commit results,
manifests, and graded files.

**Contract**: The calibration is the first CI-baseline observation (1 + 19): run one attempt,
grade it immediately, record the measured finder + grader per-attempt cost into
`verification.md`'s ceiling formula (the one permitted post-registration edit, additive only),
THEN run the remaining 19 + 20 attempts. Every paid attempt — including provider errors — counts
against the 140-attempt ceiling; errors draw from the 20-attempt reserve so denominators stay
exact. Hand-read protocol executed and its tally appended to `verification.md`.

#### 2. Baseline read-off

**File**: `context/changes/finder-fabrication-triggers/verification.md` (append-only results
section)

**Intent**: Read G1 and G2 and the variant-pair natural experiment (source-visible vs not) off
the gates; record per-mechanism rates.

**Contract**: Numbers + gate verdicts only; no interpretation beyond the pre-registered meanings.

### Success Criteria:

#### Automated Verification:

- Results + manifests + graded files committed under `results/` (40 runs, cost fields non-null)
- Prettier clean on appended verification.md

#### Manual Verification:

- Hand-read protocol completed; misgrade rate below the 15% invalidity bar
- G1 and G2 verdicts recorded (proceed vs INVALID-PREMISE / INSUFFICIENT-CI-SIGNAL stop)

---

## Phase 4: Ablation rungs (paid, conditional on G1 + G2)

### Overview

R1 (cap lifted), R2 (prose excluded), R3 (prose-only), R-loc (off-diff definitions injected) off
the CI variant: n=8 screens, escalations per the pre-registered rule only. All rung ground truth
is already frozen (Phase 2) — this phase only runs, grades, and reads off.

### Changes Required:

#### 1. Screens, escalations, read-off

**File**: `results/` (generated) + `verification.md` (append-only)

**Intent**: Run each rung's n=8 screen, grade, apply the escalation rule mechanically (+12 to
cumulative n=20), read every rung off the numeric table on its predicted component.

**Contract**: Escalation decisions recorded with the arithmetic that triggered them. Attempts
tracked cumulatively against the 140 ceiling (errors from reserve, denominators exact); an
attempt that would exceed either ceiling does not start — the affected arm reads INCONCLUSIVE.

### Success Criteria:

#### Automated Verification:

- All rung results + manifests + graded files committed; attempt ceiling respected (≤ 140 total,
  exact denominators reached or INCONCLUSIVE recorded)
- Prettier clean on appended files

#### Manual Verification:

- Hand-read protocol per rung completed
- Each rung's verdict read off the numeric table on its predicted component; escalations
  justified by the recorded arithmetic only

---

## Phase 5: Synthesis — decision doc + fixture spec

### Overview

Close the change the way the archive closed its predecessor: verdicts read off gates, then the
design artifact the results justify.

### Changes Required:

#### 1. Decision document

**File**: `context/changes/finder-fabrication-triggers/decision.md` (new)

**Intent**: H\* verdict per rung, per-mechanism rates, what the campaign does and does not claim,
and the handoff: the R5 truncation-note follow-up change (named regardless of outcome), and
whatever H\* verdict implies for the path-order-bias follow-up.

**Contract**: Same shape as the vocabulary-bias `decision.md` (measured table → finding →
disposition → non-claims).

#### 2. Fixture specification

**File**: `context/changes/finder-fabrication-triggers/fixture-spec.md` (new)

**Intent**: The paper design of the representative fixture the results justify — composition
(prose/code mix), total size, window layout, which mechanism(s) it must exercise, and the grading
inventory it ships with. If the campaign ends INVALID-PREMISE or INCONCLUSIVE, the spec section
records instead what a fixture CANNOT currently be built to reproduce, and why.

**Contract**: Self-contained enough that a successor change can build the fixture without re-reading
this campaign's raw results.

### Success Criteria:

#### Automated Verification:

- Prettier clean on decision.md + fixture-spec.md

#### Manual Verification:

- Decision doc's claims traceable to gate read-offs (no post-hoc interpretation)
- Handoff names the R5 follow-up change

**Implementation Note**: After completing this phase and all automated verification passes, pause
for manual confirmation before closing the change.

---

## Testing Strategy

### Unit Tests:

- The probe's input-construction path is covered by the free `--dry` byte anchors (215,560 /
  266,444) — deterministic, run in Phase 1's success criteria.
- The grader gets hermetic unit tests (prompt construction, response parsing, rate aggregation —
  fake responses, no network) and a pre-spend JSON Schema dump check (review F7).
- The `capDiff` export gets a parity unit test (review F5).

### Integration Tests:

- None in CI — paid probes never run in CI (matching every prior eval campaign).

### Manual Testing Steps:

1. Review ground-truth inventories against research.md §2 (Phase 1).
2. Independent read of the frozen rubric wording before any spend (Phase 2).
3. Hand-read protocol after every paid phase (Phases 3–4).

## Performance Considerations

Paid-run wall time: ~100 KB inputs at 16k max output; the archived 8-run session completed same-day.
The ceiling (140 attempts) is sized for a few hours of sequential probing across two sessions.

## Migration Notes

None — no production code changes. The stale probe keeps working; only its header changes.

## References

- Research: `context/changes/finder-fabrication-triggers/research.md` (the ladder, mechanisms, measurements)
- Predecessor discipline: `context/archive/2026-08-13-finder-security-vocabulary-bias/{decision,verification}.md`
- Diff mechanics: `packages/code-reviewer/src/pipeline.ts:40,107-112`; `.github/workflows/review.yml:164-185`
- Free exemplar: `packages/code-reviewer/scripts/judge-diagnose-findings.json`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Instrument repair (P1–P4)

#### Automated

- [x] 1.1 Package lint + typecheck + tests pass (incl. capDiff parity + grader hermetic tests)
- [x] 1.2 Dry-run byte anchors reproduce 215,560 (ci) and 266,444 (instrument)
- [x] 1.3 CI base manifest names impl-reviewer.test.ts as cut file, impl-reviewer.ts over-cap
- [x] 1.4 Grader schema dump free of oneOf/anyOf/$ref

#### Manual

- [x] 1.5 Ground-truth inventories reviewed against research.md §2

### Phase 2: Pre-registration

#### Automated

- [ ] 2.1 Prettier clean on verification.md + ground-truth files
- [ ] 2.2 All four rung --dry manifests generated and summarized in ground-truth files

#### Manual

- [ ] 2.3 Rubric wording (base + every rung) independently reviewed and frozen before any spend
- [ ] 2.4 Pre-registration commit lands before any Phase 3 run

### Phase 3: Baselines (paid)

#### Automated

- [ ] 3.1 Calibration (1+19) + 20 instrument runs + manifests + graded files committed, cost fields non-null
- [ ] 3.2 Prettier clean on appended verification.md

#### Manual

- [ ] 3.3 Hand-read protocol completed, misgrade rate below 15%
- [ ] 3.4 G1 and G2 verdicts recorded (proceed vs INVALID-PREMISE / INSUFFICIENT-CI-SIGNAL)

### Phase 4: Ablation rungs (paid, conditional on G1 + G2)

#### Automated

- [ ] 4.1 Rung results + manifests + graded files committed; attempt ceiling ≤ 140 with exact denominators
- [ ] 4.2 Prettier clean on appended files

#### Manual

- [ ] 4.3 Hand-read protocol per rung completed
- [ ] 4.4 Rung verdicts read off the numeric table; escalations justified by recorded arithmetic

### Phase 5: Synthesis — decision doc + fixture spec

#### Automated

- [ ] 5.1 Prettier clean on decision.md + fixture-spec.md

#### Manual

- [ ] 5.2 Decision claims traceable to gate read-offs
- [ ] 5.3 Handoff names the R5 follow-up change
