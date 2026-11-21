# GPT-Image-2.6 wider comparison — Plan Brief

> Full plan: `context/changes/gpt-image-26-wider/plan.md`
> Frame brief: `context/changes/gpt-image-26-wider/frame.md`

## What & Why

The actual problem to plan around is that the fidelity instrument has no level for invented
content. Its labels and gate therefore cannot show whether GPT-Image-2.6 is as faithful as Local,
and a wider run on the same instrument would measure the instrument as much as the model.

This plan first fixes the instrument:

- a written "visible without zoom" anchor;
- a pairwise fidelity preference, as in S-19.

Then it runs a blind, paid comparison on all eight tuning photos.

## Starting Point

The screen (#359) passed 4/6 with every GPT side rated `minor`, although the reasons describe
redrawn faces, invented text and a flag, and erased stars. The `scripts/gpt26/` tools work, but they
are hard-wired to the screen's now-archived folder and pin a commit SHA that broke after the
rebase-merge (`lessons.md:279`). Inputs and pinned Local files exist for all eight photos.

## Desired End State

A committed `evaluations/verdict.md` (PASS or FAIL) for 16 pairs (8 photos × 2), computed from
sealed blind ratings under a gate, rubric and $3.50 cap committed before any spend.

The verdict states separately:

- undelivered slots;
- GPT disqualifications;
- the 8/16 preference count;
- the diagnostics.

Live pointers lead to it. A PASS opens only a further decision, never a deployment.

## Key Decisions Made

| Decision                                                                            | Choice                                                                           | Why (1 sentence)                                                             | Source           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------- |
| Problem                                                                             | Fix the instrument before widening                                               | The PASS rests on labels that contradict their own reasons                   | Frame            |
| Level for invented/altered content and for removed detail                           | Graded by size/visibility, the same rule for both                                | Owner's choice; keeps the screen's scale                                     | Plan (owner)     |
| Where "minor" ends                                                                  | significant = visible with the whole frame fitted, no zoom; minor = only on zoom | Matches how the owner rated, and is auditable from the reason                | Plan (owner)     |
| Majority                                                                            | Pairwise preference per pair; PASS needs ≥ 8/16 tie-or-GPT                       | Coarse level ties could not separate the sides; S-19's pairwise rating could | Plan (owner)     |
| Sequence                                                                            | Anchor, then the paid 8-photo run (no $0 re-rate of the screen)                  | Owner's choice                                                               | Plan (owner)     |
| Slots and cap                                                                       | 8 × 2 = 16, cap $3.50                                                            | Σ worst-case bounds ≈ $3.20–3.36; expected ≈ $1.30                           | Plan (owner)     |
| Wall time                                                                           | Diagnostic, p95 vs 30 s                                                          | A PASS here never deploys                                                    | Plan (owner)     |
| Disqualification, undelivered = FAIL, ≤ 2 attempts, GPT-size comparison, real Local | Carried unchanged from the screen                                                | Already owner-decided rules                                                  | Screen (carried) |
| Tooling                                                                             | Study descriptor in the config, content-hash binding                             | Archived paths and SHA pinning cannot serve a new study                      | Plan             |

## Scope

**In scope:**

- study-driven GPT26 tools and the content-hash binding;
- a viewer copy with the anchor and the preference question;
- gate v2;
- config and series for 16 slots;
- the paid run, seal, two-pass rating, verdict and pointers.

**Out of scope:**

- re-rating or changing the screen;
- any model, prompt or `complexity` variation;
- the holdout;
- wall time as a gate;
- evidence for `minor`;
- production code, un-pausing Cloud, deployment.

## Architecture / Approach

The config gains a `study` block (change folder, series, viewer), and every GPT26 tool derives its
paths from it. The runner, ledger and reconciler keep their behaviour.

The viewer copy keeps S-20's levels and two-pass locking, and adds the anchor text and a required
`fidelity_preference`. The gate maps that preference through the sealed key, counts tie-or-GPT
against 8, and keeps disqualification on a GPT `significant`/`severe`.

Records bind to blob hashes. Seal-before-ratings is proven by ancestry, and the tag
`gpt26-wider-evidence` is pushed before integration.

## Phases at a Glance

| Phase                         | What it delivers                               | Key risk                                                      |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| 1. Study-driven tooling       | Tools free of the screen's paths; hash binding | Breaking the runner's spend behaviour                         |
| 2. Pairwise fidelity + anchor | Viewer copy and gate v2 with tests             | A blind leak through the new question or export               |
| 3. Pre-registration           | Config, gate, rubric, 16-slot series; dry run  | Bounds above the cap; rubric wording not what the owner means |
| 4. Paid run (Fedora)          | 16 slots within $3.50                          | Moderation blocks (S17-07 earlier); 2.6 token use             |
| 5. Seal, rating, verdict      | Committed verdict and pointers                 | Seal/ratings order lost at integration; stale pointers        |

**Prerequisites:**

- the Fedora host with the private corpus and dependencies;
- `OPENAI_API_KEY`;
- the owner's committed `GPT26-SPEND cap_usd=3.50` line.

**Estimated effort:** about 2 sessions of code (phases 1–3), then one short paid run and one rating
session of 16 pairs.

## Open Risks & Assumptions

- **Repeated Local recognition remains.** Each photo's two pairs share one Local file, so a rater
  may recognise the repeated Local side. Two-pass locking reduces this but does not remove it.
- **"Visible without zoom" depends on the owner's display.** The reason must say what is visible
  without zoom, so a reader can audit it.
- **Reproducing the screen's FAIL-worthy defects.** If 2.6 reproduces the screen's defects visibly
  at full frame, the run will FAIL on disqualification. The plan accepts this as an answer, not as
  a waste.
- **2.6 token use may differ from the bound.** A breach stops the runner persistently and is
  reported as a budget/protocol failure.

## Success Criteria (Summary)

- A verdict computed from 16 reconciled slots and sealed, two-pass ratings under rules committed
  before the spend, with spend ≤ $3.50.
- Every "minor"/"significant" is judged by the written anchor, and the majority comes from
  pairwise preferences, not from coarse label ties.
- The roadmap, idea notes and `temp_steps.md` point to the verdict, with no stale "screen PASS
  opens a wider comparison" claim.
