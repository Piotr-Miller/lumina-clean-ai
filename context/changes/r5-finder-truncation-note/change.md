---
change_id: r5-finder-truncation-note
title: Tell the finder when its diff is truncated (R5 follow-up)
status: impl_reviewed
created: 2026-08-22
updated: 2026-08-23
archived_at: null
---

## Notes

R5 from the fabrication campaign's handoff (`context/archive/2026-08-15-finder-fabrication-triggers/decision.md`, Disposition #2), opened with R1's ELIMINATED read as its ready-made justification: **M1 absence claims exist only because the model is never told its input was cut** — lifting the cap removed every M1 finding in 20 runs (0 vs 10 findings / 5 runs at capped baseline). The intervention the campaign deliberately did not ship: tell the finder _that_ the diff is truncated and _which files fell outside the window_.

Ready-made ingredients in the archive:

- The probe's window manifest already computes exactly what the note needs (in-window files, cut file + offset, over-cap list) — `computeManifest` in `packages/code-reviewer/scripts/fabrication-probe.mjs`; production `capDiff` (`src/pipeline.ts`) currently appends only `[...diff truncated at 100 KB]` with no file list.
- Measurement instrument exists and is validated: re-running the CI-base arm with the note in place, graded against the frozen ground truth, gives a before/after M1 rate (baseline m1Runs 5/20 on record). Venice fp4 pin mandatory (Amendment A1).
- Related but out of scope here: capDiff path-order bias (byte order selects WHICH files read as missing) — named in the decision doc's Disposition #4.

**Outcome (Phase 4, 2026-08-23)**: success bar NOT MET (M1 findings 10, m1Runs 5/20 — identical to baseline), falsifier read UNCHANGED, primary up-side guard TRIPPED (1 hand-confirmed `m1_to_m3` rewrite). The note's tool-less prompt-only effect is falsified; it stays in production solely for the unmeasured tool-enabled interaction. Full record: `decision.md`.

**Passive live check (REGISTERED, decision.md Disposition #2)**: on the next naturally oversized PR review (raw diff > 100 KB, tool-enabled production path — no probe PR), record from the Actions run log + `ai-review-output` artifact: (a) the note fired (truncation banner + rendered `<truncation-metadata>` block), (b) every `getFileContext` call and whether it targeted a metadata-named file, (c) whether any finding matches the frozen M1-rewrite definition in `verification.md`. Outcome decides keep-vs-revert per decision.md Disposition #1: an inert tool-enabled channel reverts the note as its own change.
