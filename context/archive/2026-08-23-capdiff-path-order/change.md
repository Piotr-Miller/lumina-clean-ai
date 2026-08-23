---
change_id: capdiff-path-order
title: capDiff path-order bias — source before prose when the cap fires
status: archived
created: 2026-08-23
updated: 2026-08-23
archived_at: 2026-08-23T20:45:00Z
---

## Notes

The follow-up registered in `review-diff-truncation` ("Not fixing path-order
bias", plan.md:75-77) and carried unfixed through `finder-fabrication-triggers`
(Disposition #4) and `r5-finder-truncation-note`: git sorts `context/` before
`packages/`/`src/`, so on an over-cap diff the byte-prefix `capDiff` kept prose
and cut source — the finder reviewed documentation while the change's own code
fell over the cap, and (since the truncation note went live) the note named the
source files as the invisible ones.

## What changed

- `src/pipeline.ts`: new exported `orderDiffForCap(diff)` — when (and ONLY
  when) the diff exceeds `DIFF_CAP_BYTES`, per-file segments (via the existing
  `computeFileSegments`) are reordered source-first / Markdown-last, each group
  keeping its original relative order; byte-level reassembly (segments carry
  UTF-8 byte offsets); a newline is restored when the diff's final segment is
  relocated. In-cap diffs return the SAME string, so every review the cap never
  touched keeps its pre-feature prompt byte-identical (the truncation note's
  spread-empty discipline). Prose = `*.md`/`*.mdx` (case-insensitive,
  trailing-quote-tolerant for git-quoted paths).
- `runReviewPipeline` caps and reports on the ORDERED diff: `capDiff` and
  `truncationReport` both consume `orderDiffForCap(input.diff)`, so
  `cutFile`/`overCapFiles` (and the finder's `<truncation-metadata>` note)
  always name what the finder actually cannot see. `computeDiffStats` stays on
  the raw diff (order-invariant).
- `capDiff`, `computeFileSegments`, `computeManifest` themselves are UNCHANGED
  — campaign tooling (`fabrication-probe.mjs`) imports them and its frozen
  byte anchors still reproduce (r2 dry-run re-validated 2026-08-23:
  inputSha256 `84696acc…` matches the archived screen).

## Verification

- New `orderDiffForCap` unit suite (identity under cap; source-before-prose
  over cap; stable within-group order; relocated-final-segment newline;
  quoted/upper-case Markdown classification; single-class + headerless
  passthrough; multi-byte reassembly) plus a pipeline integration test
  (prose-first over-cap diff → finder unit starts with source, cutFile names
  the prose, truncationMetadata matches).
- `npm run typecheck`, `npm run lint`, `npm run test` (592 tests) — all green
  in `packages/code-reviewer` (2026-08-23).

## Not done (scope guard)

- No lockfile/generated-file demotion (the separate "lockfile exclusion
  policy" follow-up).
- No finder-prompt change — the eval-pinned prompt is untouched; ordering only
  changes WHICH bytes survive the cap on >100 KB diffs.
