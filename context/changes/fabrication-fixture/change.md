---
change_id: fabrication-fixture
title: "Build and validate the fabrication fixture"
status: implemented
created: 2026-08-24
updated: 2026-08-24
---

## Notes

Item 2 of the archived `fixture-spec.md` successor checklist: build the
deterministic fabrication fixture. Item 1 (re-run R2) was done in PR #165, and
the corrected design basis — including that PR #164 made the archived layout
stale — landed in PR #174.

**What a fixture buys:** the campaign's mechanisms are currently reproducible
only from one real diff (`e8ebb66...9c49a0c`), which is frozen history and
cannot be varied. A synthetic fixture with planted defences at controlled byte
offsets lets a future intervention be tested against the mechanisms directly.

## Design decisions

- **Generated, not checked in as a blob.** The M1 shape exists only if the
  planted implementation genuinely falls outside the window, which depends on
  exact byte offsets. Hand-tuning a 190 KB diff to hit an offset is not
  reproducible; `scripts/build-fabrication-fixture.mjs` is deterministic (no
  clock, no RNG), so the frozen sha256 holds on any machine.
- **Prose is kept and is load-bearing** — R2's DROP (PR #165) showed removing
  it _reduces_ fabrication, and R3 showed prose alone barely fabricates. The
  reproducing condition is the conjunction, so the fixture carries ~60 KB prose
  plus ~127 KB source.
- **Source alone exceeds the cap.** This is what keeps D4's implementation
  over-cap under BOTH cap pipelines, so the fixture stays usable after PR
  #164's source-first ordering rather than being valid only for the archived
  pipeline.
- **Measured under `--pre-note`.** B = 17 predates the production truncation
  note, so the comparison arm must reproduce the pre-note prompt.

## Instrument changes

- `--variant fixture` reads the frozen diff verbatim instead of deriving one
  from git; supports `base` and `r1` (the pathspec ablations are recipes
  against the real PR #127 diff and are meaningless here).
- Rules stay pinned to `CI_BASE` so the trusted-rules channel matches the arm
  whose baseline is the comparator.
- **`changeDir` re-pointed here, plus a fail-fast guard.** It previously
  pointed at an archived path where `--dry` silently resurrected the dead
  directory via `mkdirSync(recursive)`. It now throws with the re-freeze
  discipline spelled out — the same protection the grader already had on its
  ground truth.

## Outcome (2026-08-24)

**NOT REPRESENTATIVE** — 11/20 fabrication runs against the required 14-20;
M3-dominant band passed. Both were required, so the fixture does not reproduce
the real diff's behaviour. Recorded as the pre-registration prescribed; no bar
was moved after seeing the number.

The mechanisms DO reproduce: m1Runs 5/20 exactly matches the CI baseline and
M3 dominates. What differs is the rate (11 vs 17) and M2 (0 vs 6). A new
fabrication mode appeared that the real diff never showed — invented file paths
extrapolated from the generated filler's regular naming — which is the
fixture's own artifact and the named first thing to attack if anyone retries.

Spend $1.60 of a $12 stop. Full record: `verification.md` (Results),
`decision.md`, `reviews/hand-read.md`.
