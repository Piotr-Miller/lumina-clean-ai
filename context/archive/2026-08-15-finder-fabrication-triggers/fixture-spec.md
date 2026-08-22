# Fixture Specification — what the campaign's results justify building

- **Change**: `finder-fabrication-triggers` (Phase 5 artifact)
- **Date**: 2026-08-21
- **Status**: paper design only — building it is a successor change's work
- **Basis**: every design constraint below traces to a Phase 3/4 read-off in `verification.md`;
  a successor can build from this file without re-reading raw results.

## What a fixture CAN be built to reproduce

### M1 — cap-manufactured absence claims (mechanical, high confidence)

R1 proved M1 is entirely the cap's product (0 M1 findings in 20 uncapped runs vs 10 findings /
5 runs at capped baseline). A fixture reproduces M1 by construction, not by provoking the model:

- The planted implementation file must **begin beyond byte 100,000** of the raw diff — total
  size above `DIFF_CAP_BYTES` alone does not guarantee a whole over-cap file, because byte
  ordering decides where the cut lands. Verify placement through the `--dry` manifest: its
  `overCap` list must name the implementation before any paid run.
- An **in-window test file that imports the over-cap implementation** — the CI variant's
  `impl-reviewer.test.ts` (in-window, cut) → `impl-reviewer.ts` (byte 110,771) pairing is the
  proven shape. The model then truthfully reports the implementation "not provided in the diff".
- Expected signal at baseline settings: ~25% of runs (m1Runs 5/20). Not rare, not dominant.

### M3 — locality-gap claims (the dominant baseline mechanism)

M3 produced 48 of CI's 64 flagged findings. The proven shape:

- An in-window hunk **calling** a defence helper, with an adjacent comment naming what it
  defends against, while the helper's **definition is off-diff** (unchanged code, appears
  nowhere in the diff at any cap). The campaign's exemplar: `logSafePath` call + comment in
  `cli.ts` hunks, definition off-diff (exactly 2 occurrences in 215 KB).
- Do NOT rely on adding the definition as context to suppress the claims — R-loc's screen
  showed injecting this one definition left the rate UNCHANGED. That is one tested injection,
  not a general result about what context can do.

### Composition and window layout (mirror the CI variant — the reproducing shape)

- ~55 KB prose (plan/research-style markdown) + source files with tests, raw total ~215 KB,
  capped window ~100 KB: prose fully in-window, the cut landing **inside a test file**, several
  source files over-cap.
- Both variants' baselines say in-window source matters: keep real code in the window (CI shape,
  17/20) rather than prose-only (instrument shape trends lower, 8/20; R3's prose-only input
  produced 1/20).

### Grading inventory the fixture must ship with

Per the campaign's ground-truth format (`ground-truth/ci.md` is the template): one section per
planted defence with location status (in-window / over-cap / off-diff), the claim shape that
counts as M1 vs M2 vs M3 against it, and the frozen rubric paragraph. Grading MUST be
window-relative against the probe's manifest sidecar; raw-diff grading is the known mislabeling
mode. Freeze inventory + rubric (sha256) before any paid grading; pin the provider (Venice fp4,
strict structured outputs) or the instrument itself fails — 4/4 pre-pin calibration failures.

## What a fixture CANNOT currently be built to reproduce, and why

- **A validated M2 trigger** (contradicting a visible defence). M2 was 6–7 findings per variant
  at baseline and no rung isolated or amplified it. A fixture "designed to provoke M2" would be
  a guess — the exact mistake the predecessor change made (50 synthetic rows, 0 fabrications).
- **A minimal sufficient condition.** H\* read INCONCLUSIVE: R2's UNCHANGED (prose not needed)
  is one adjudicated misgrade away from having escalated to an n=20 test (recorded R2
  sensitivity). Until a successor re-runs R2 (+12 attempts), a fixture may only claim to be
  _representative_ of the reproducing layout, never _minimal_.
- **Provider-independent behavior.** All rates are scoped to glm-4.6 on Venice fp4; the fixture
  inherits that scope.

## Successor checklist

1. Optional but cheap: re-run R2 +12 to n=20 (38 attempts remain under the 140 ceiling) to
   settle the prose question before freezing the fixture's composition.
2. Build the fixture per the layout above; freeze inventory + rubric; `--dry` byte anchors
   first, then a n=20 baseline against the same read-off table (B from the fixture itself).
3. Success bar for "representative": fixture baseline fabrication within the CI baseline's
   neighborhood (UNCHANGED band, |count − 17| ≤ 3 at n=20) with M3-dominant mechanism split.
