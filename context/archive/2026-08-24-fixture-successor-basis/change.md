---
change_id: fixture-successor-basis
title: "Fixture successor: corrected design basis + production-fidelity probe mode"
status: archived
archived_at: 2026-08-24T10:40:00Z
created: 2026-08-24
updated: 2026-08-24
---

## Notes

Successor work for the archived `fixture-spec.md`
(`context/archive/2026-08-15-finder-fabrication-triggers/fixture-spec.md`),
whose checklist item 1 — "re-run R2 +12 to n=20 to settle the prose question
before freezing the fixture's composition" — was completed by PR #165.

Item 2 is "build the fixture per the layout above". **That layout is now stale,
and building against it would have measured a pipeline that no longer ships.**
This change establishes the corrected basis and gives the probe a mode that can
reproduce current production, rather than building a fixture on a false premise.

## Finding 1 — R2's DROP settles the composition question

The spec could only claim a fixture was _representative_, never _minimal_,
because H\* was INCONCLUSIVE pending an R2 retest. PR #165 ran it: **R2 = DROP
at cumulative n=20 (11/20 vs B=17)**, so removing prose measurably _reduces_
fabrication, and H\* reads SUPPORTED.

For the fixture this converts a "mirror what we saw" instruction into an
evidence-backed constraint: **the ~55 KB of prose is load-bearing and must be
kept.** Combined with R3 (prose-only → 1/20, so in-window code is also needed),
the reproducing condition is the conjunction, not either half.

## Finding 2 — PR #164 changed WHICH files fall over the cap

The spec's prescribed layout is "prose fully in-window, the cut landing inside a
test file, several source files over-cap". That described production **up to PR
#164**, which added `orderDiffForCap`: source now goes before Markdown, so on an
over-cap diff it is PROSE that falls outside the window.

Measured on the campaign's own CI input (identical raw bytes, `--dry`, no paid
call):

|                                         | base (archived pipeline) | `--ordered` (current production) |
| --------------------------------------- | ------------------------ | -------------------------------- |
| rawBytes / sentBytes                    | 215,560 / 100,030        | 215,560 / 100,030                |
| window                                  | 13 files                 | 14 files                         |
| overCap                                 | 14 — **all source**      | 13 — **7 source, 6 prose**       |
| cut file                                | `impl-reviewer.test.ts`  | `pipeline.ts`                    |
| `impl-reviewer.ts` (the D4 / M1 target) | **over-cap**             | **IN-WINDOW**                    |

**Consequence: the campaign's canonical M1 shape cannot arise on this input
under current production.** D4's claim shape is "the implementation is not
provided in the diff" — true when `impl-reviewer.ts` sat at byte 110,771, and
now false because the file is inside the window. Since R1 proved M1 is entirely
the cap's product, ordering source into the window removes the mechanism's
input on this diff.

**Do not over-read it:** 7 source files remain over-cap, so a source-heavy diff
can still push code out. M1 is **reduced by construction, not eliminated**, and
the size of the reduction in real reviews is unmeasured — this is one input,
computed, not a rate over runs.

## What changed (instrument)

- `fabrication-probe.mjs` gained `--ordered`, applying `orderDiffForCap` before
  the cap to reproduce current production. The manifest records `ordered`, and
  dry manifests are written to a distinct `-ordered-` filename, so a results
  file can never be mistaken for one produced under the other pipeline.
- The header's "base recipe → capDiff (production cap)" claim is corrected: it
  is the production cap **as of the campaign**. The default stays bare-`capDiff`
  because every archived byte anchor and frozen ground-truth window depends on
  it — re-verified here: base still reports 215,560 / 100,030 / cut in
  `impl-reviewer.test.ts` / 14 over-cap, matching the frozen table exactly.

## Corrected fixture design (for the successor that builds it)

1. **Decide which pipeline the fixture represents, and say so.** A fixture for
   _current_ production must be built and validated under `--ordered`. A
   fixture reproducing the archived campaign numbers must use the default.
   These are now different targets.
2. **Keep the prose** (finding 1) — it is contributory, not scenery.
3. **The M1 shape needs re-siting under `--ordered`:** the planted
   implementation must be pushed over the cap _despite_ source-first ordering,
   i.e. total SOURCE must exceed the cap. The archived recipe (rely on prose
   sorting ahead of source) no longer works.
4. **The M3 shape is unaffected** — it depends on the definition being off-diff
   entirely, which ordering cannot change. It remains the dominant and most
   reliably reproducible mechanism.
5. Everything else in the archived spec still holds: window-relative grading,
   frozen sha256 inventory + rubric, `--dry` anchors before any paid run, and
   the Venice fp4 pin for the instrument.

**Gotcha found while measuring:** the probe's `changeDir` still points at
`context/changes/r2-prose-rerun`, which is now archived. `--dry` does not fail
fast on that — `mkdirSync(…, {recursive: true})` silently RESURRECTS the dead
change directory and writes manifests into it. (The grader's ground-truth check
does fail fast, which is the protection that actually matters, and paid runs
would hit it.) The two manifests produced for the table above were deleted
rather than committed. A successor re-pointing `changeDir` should expect to
tidy this up.

## Not done here

The fixture itself is not built. Doing so is a measurement campaign (build +
freeze + an n=20 paid baseline, ≈$4 at campaign rates), and it needed this
basis first — the point of this change is that building it yesterday would have
produced a fixture for a pipeline that shipped out from under it.

## Verification

- `--dry` comparison above: no paid calls; base anchors byte-identical to the
  archived frozen table, ordered mode differs exactly as predicted.
- `npm run typecheck`, `npm run lint`, `npm run test` (608) green in
  `packages/code-reviewer`; probe/grader hermetic suites green.
