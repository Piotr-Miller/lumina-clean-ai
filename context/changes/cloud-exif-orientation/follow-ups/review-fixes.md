# Implementation review fixes

## F1 — Malformed orientation counts trigger a redraw

- **Source**: ../reviews/impl-review-phase-1-65a8548.md
- **Decision**: owner chose Fix now on 2026-10-25.
- **Status**: applied and verified; uncommitted for the next workflow commit.
- **Changes**: require a singleton orientation value; cover malformed counts in both detector entry points and confirm the upload preserves the original file and warns once.
- **Verification**: 14 new cases fail against the original parser; 69 focused tests and 478 full-suite tests pass after the fix. Typecheck, lint and formatting pass; Manual row 1.6 remains current.
- **Remaining work**: include the carried fix and review records in the next implementation commit; no additional code fix is queued.
