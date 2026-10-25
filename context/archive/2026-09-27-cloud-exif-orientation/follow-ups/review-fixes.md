# Implementation review fixes

## F1 — Malformed orientation counts trigger a redraw

- **Source**: ../reviews/impl-review-phase-1-65a8548.md
- **Decision**: owner chose Fix now on 2026-10-25.
- **Status**: applied and verified; uncommitted for the next workflow commit.
- **Changes**: require a singleton orientation value; cover malformed counts in both detector entry points and confirm the upload preserves the original file and warns once.
- **Verification**: 14 new cases fail against the original parser; 69 focused tests and 478 full-suite tests pass after the fix. Typecheck, lint and formatting pass; Manual row 1.6 remains current.
- **Remaining work**: include the carried fix and review records in the next implementation commit; no additional code fix is queued.

## Round 2 F1 — Pointers to `live-acceptance.md` break on archive

- **Source**: ../reviews/impl-review-e2af620.md § Re-review 2
- **Decision**: owner chose Fix now on 2026-10-25. The target path exists only after the move, so the fix is queued for the archive commit.
- **Status**: applied in the archive commit (2026-10-25); both lines now point at `context/archive/2026-09-27-cloud-exif-orientation/live-acceptance.md`.
- **Changes**: in `context/foundation/roadmap.md:339` and `context/changes/cloud-model-comparison/change.md:31-32`, replace `context/changes/cloud-exif-orientation/live-acceptance.md` with `context/archive/<archived-folder>/live-acceptance.md`.
- **Verification**: after the move, `grep -rn 'changes/cloud-exif-orientation' context/foundation context/changes` prints nothing.
- **Remaining work**: apply in the archive commit, on the archive branch.

## Round 2 F2 — Phase 3 suffixes cite a pre-merge branch commit

- **Source**: ../reviews/impl-review-e2af620.md § Re-review 2
- **Decision**: owner chose Fix now on 2026-10-25. The master SHA exists only after this branch merges, so the fix is queued for the archive branch.
- **Status**: applied in `chore(cloud-exif-orientation): record manual acceptance` on the archive branch (2026-10-25); 3.1–3.4 now carry `29057a0`, an ancestor of master.
- **Changes**: in `plan.md` Progress, replace `— ccecd53` on 3.1–3.4 with the master SHA of `docs(cloud-exif-orientation): Ship and accept in production (p3)`. Do it in the same commit that records 3.5–3.7 and re-confirms 1.6 and 2.5.
- **Verification**: `git merge-base --is-ancestor <sha> HEAD` exits 0 for the new suffix.
- **Remaining work**: apply on the archive branch, before `/rune-archive`.
