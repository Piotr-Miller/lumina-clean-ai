---
change_id: impl-review-output-ceiling
title: Per-pass output-token ceiling for the implementation review
status: archived
created: 2026-08-23
updated: 2026-08-23
archived_at: 2026-08-23T20:35:00Z
---

## Notes

Follow-up from the r5-finder-truncation-note close-out (archived
`context/archive/2026-08-22-r5-finder-truncation-note/`, memory gotcha #2): on
PR #162 the implementation review died with "No output generated" —
`outputTokens` exactly 16,384 = the shared `MAX_OUTPUT_TOKENS` ceiling — on a
456-line archived plan, wasting $0.27 and producing a failed advisory block.

## What changed

- `src/config.ts`: new `IMPL_REVIEW_MAX_OUTPUT_TOKENS = 32_768` — the
  implementation review's own ceiling, documented with the failure evidence
  (phase-2 probe 13,327 output tokens; PR #162 death at 16,384). ~2.5x the
  largest COMPLETED output on record and half the model maximum, so the
  credit-reservation blowup `MAX_OUTPUT_TOKENS` exists to prevent stays
  bounded at half its original worst case.
- `src/impl-reviewer.ts`: uses the new constant. Finder and judge keep 16,384
  (their measured outputs, 74–1,560, never approached it).
- `src/impl-reviewer.test.ts`: pins the factory to the new constant and pins
  `IMPL_REVIEW_MAX_OUTPUT_TOKENS > MAX_OUTPUT_TOKENS` so a refactor collapsing
  the two constants back into one re-opens the failure loudly.

Alternative considered and rejected: trimming `## Progress` out of the plan
text before sending. The PLAN_CAP_CHARS calibration comment records why the
Progress ledger must stay visible — at 40k the cut fell inside `## Progress`
and the pass "would have judged adherence without ever seeing which steps were
claimed done". The failure was output-side, so the output ceiling is the fix.

## Verification

`npm run typecheck`, `npm run lint`, `npm run test` (592 tests) — all green
in `packages/code-reviewer` (2026-08-23).
