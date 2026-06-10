<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Cloud Daily-Cap Doc-Drift Correction

- **Plan**: context/changes/cap-doc-drift/plan.md
- **Mode**: Deep
- **Date**: 2026-06-10
- **Verdict**: REVISE → SOUND after triage (both findings fixed 2026-06-10; verification-only)
- **Findings**: 0 critical, 1 warning, 1 observation (both FIXED)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

7/7 paths ✓, 2/2 symbols (`countCloudJobsToday`, `CLOUD_DAILY_CAP`) ✓, brief↔plan ✓, Progress↔Phase ✓ (5 bullets ↔ 1.1–1.5).

## Findings

### F1 — Prettier --check gate (1.4) is invalid: both files already fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria, check 1.4
- **Detail**: Verified empirically — `npx prettier --check CLAUDE.md context/foundation/shape-notes.md` exits 1 right now, before any edit. Cause is NOT CRLF (0 CR bytes); the files are LF but don't conform to the repo's prettier config — prettier wants to reflow ~442 lines of CLAUDE.md alone (222 ins / 220 del, prose-wrap). So check 1.4 would fail for pre-existing reasons unrelated to the change, and the obvious "fix" (`prettier --write`) would reflow the entire file, burying the one-line semantic edit under hundreds of lines of unrelated churn — the same family of problem the plan's cited lesson (line 28) warns against, via prose-wrap instead of line-endings. The plan scoped prettier to touched files (good), but the touched files themselves are non-conformant.
- **Fix**: Drop check 1.4 entirely; rely on grep-asserts (1.1–1.3) + manual read (1.5), and add an instruction to make a minimal line-scoped edit — do NOT run `prettier --write` on these files.
  - Strength: Removes a false-failing gate and prevents a 442-line noise commit; keeps the diff reviewable (just the changed lines).
  - Tradeoff: Loses automated format validation — acceptable, since prose edits don't need it and the files don't pass it regardless.
  - Confidence: HIGH — measured the failure and the churn size directly.
  - Blind spot: None significant.
- **Decision**: FIXED — dropped check 1.4 (prettier) from Automated Verification + Progress (renumbered manual 1.5→1.4); added a verified formatting caveat to Key Discoveries, a "minimal line-scoped edit, no prettier --write" instruction to the Implementation Note, and updated Desired End State / Implementation Approach / Phase Overview to match.

### F2 — Check 1.3's shape-notes "corrected term" assertion is non-specific

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria, check 1.3
- **Detail**: 1.3 asserts `grep -n "global" context/foundation/shape-notes.md` matches — but "global" already appears 9× in that file (`:34/:68/:87/:144/:202`…), so the check passes whether or not line 239 was fixed (a no-op for shape-notes). The CLAUDE.md and migration sub-checks of 1.3 are fine — both have 0 occurrences today, so they're specific 0→match signals. And 1.1's "20 AI ops → none" already guards the stale-gone direction for shape-notes, so the gap is narrow.
- **Fix**: For shape-notes, assert `CLOUD_DAILY_CAP` is present instead — absent today (0); the corrective wording adds it, so it's a clean 0→1 signal specific to the fix.
- **Decision**: FIXED — check 1.3 now asserts `CLOUD_DAILY_CAP` present in shape-notes (≥1) with an explicit note that `grep "global"` is invalid there; Progress row 1.3 matches.

## Notes

- Substance is sound: the three target edits (CLAUDE.md:31, shape-notes.md:239, migration comment 49-52) are correctly grounded against the oracle; both findings are in the verification section only.
- The migration-file comment-edit risk (Supabase CLI integrity) is acknowledged in the plan's Migration Notes / brief Open Risks — adequately handled, not a finding.
