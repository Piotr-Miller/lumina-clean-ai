<!-- PLAN-REVIEW-REPORT -->

# Plan Review: skills-sync-check — Phase 1 focus

- **Plan**: context/changes/skills-sync-check/plan.md
- **Mode**: Deep (scoped to Phase 1; Phases 2–3 got the consistency pass + overlapping deep checks only)
- **Date**: 2026-07-18
- **Verdict**: SOUND (after the two number fixes)
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

10/10 paths ✓ (incl. `.prettierignore` correctly absent), 3/3 symbols ✓ (lint-staged md glob, `format` script, npm-alias pattern), brief↔plan ✓. Deep verification: adaptation map 9/9 files confirmed with **zero** unlisted semantic diffs; every intentional adaptation is a 1:1 same-length line substitution (Phase-2 allowlist contract satisfiable as designed); manifest hashes 6/6 as the plan predicts (4 ordinary MATCH, both extended skills MISMATCH); Prettier 3.8.3 ignore semantics confirmed (explicit ignored paths skip → lint-staged neutralized; all-ignored globs exit 0 → criterion 1.2 works as written); `.prettierignore` blast radius clean (no CI prettier step, ESLint never touches the trees' file types, VS Code config doesn't bypass it; side-shielding `.claude/prompts` + the manifest is desirable). File counts FAILED (79/79 actual vs 82/82 claimed → F1). Progress↔Phase mechanical contract fully valid (13 criteria map 1:1, no stray checkboxes).

## Findings

### F1 — Phase 1 contract cites stale counts: "82/82 files", "8 adapted files", "21 formatting-only skills"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State (plan.md:16), Phase 1 step 3 (plan.md:87, 89, 91), criterion 1.1 (plan.md:97), Progress 1.1
- **Detail**: Three numbers fail verification. (a) Both trees hold **79** files, not 82 — git history shows 82 was never true (likely a research counting error; 79 + the 3 top-level `.claude` files = 82). (b) The adapted-file list is **9 files across 7 skills**, not 8 — the count forgot that 10x-e2e contributes two files (`SKILL.md` + `references/e2e-quality-rules.md`) on top of the other 6 skills' SKILL.md files and `SKILL.user.md`; the plan's own Key Discoveries (plan.md:31) enumerates all 9 locations, so line 83 contradicts line 31. (c) "21/32 skills differ only in formatting" conflates classes — the real split is 11 identical / 14 formatting-only / 7 adapted (21 = 14+7 = "any difference"). The 8-vs-9 error is the operational one: criterion 1.1 and Progress 1.1 say the post-resync diff must list "8 adapted files"; the correct diff will list 9, so a literal implementer either "fails" the criterion or drops one file's adaptation to fit the count. Cosmetic sub-issue: Key Discoveries cites `10x-infra-research/SKILL.md:198` (the .agents-side line; the .claude side is 192) — content-based allowlist already neutralizes this.
- **Fix**: Correct the numbers in the five spots (79/79; 9 adapted files; 11/14/7 split; infra-research .claude-side line 192) — or better, drop the hard-coded tree total from the step-3 contract ("sets identical" suffices; the total moves with every lesson fetch) while keeping the explicit "9 adapted files" in criterion 1.1 and Progress 1.1.
- **Decision**: FIXED (2026-07-18, recommended variant): hard-coded totals dropped from step 3 (File line + contract now say "sets identical, no fixed total"); Current State corrected to 79 files + 11/14/7 split; "9 adapted files" in step-2 contract, step-3 contract, criterion 1.1, Progress 1.1; Key Discoveries map now "7 skills / 9 files" with infra-research line 192.

### F2 — Two lock-bootstrap skills are CRLF in the working tree — byte-copying them arms a delayed false-drift trap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 step 3 (re-sync) / Critical Implementation Details
- **Detail**: The plan protects byte-fidelity from Prettier but not from git's EOL normalization. Repo root has `.gitattributes` with `* text=auto eol=lf`, and exactly 4 files in the two trees are currently CRLF on disk while LF in the index: `10x-cli-guide/SKILL.md` and `10x-cli-setup/SKILL.md` in BOTH trees (git already warns "CRLF will be replaced by LF the next time Git touches it"). Phase 1's byte-copy propagates .claude's CRLF into .agents, so the pairs stay equal on copy day — but any later per-file git rewrite (a one-file checkout/revert, e.g. during Phase 2's manual break-and-revert tests, a stash pop, a branch switch) flips just one twin to LF, and the Phase-2 checker then reports content-drift on a pair nobody edited — exactly the false-positive noise this change exists to eliminate. Confirmed safe context: everything else is LF end-to-end, so fresh clones keep manifest hashes and byte-equality intact (`.gitattributes eol=lf` overrides any `autocrlf=true`), and these 2 skills are outside the manifest — normalizing them only invalidates the `skills-lock.json` folder-hash the plan already decided to ignore.
- **Fix**: Add a micro-step to Phase 1 step 3: normalize the two lock-bootstrap SKILL.md files to LF in `.claude` before the byte-copy (git will impose LF on next touch anyway; this just does it deterministically), so both trees end LF and no one-sided flip is possible. Targeted 2-file normalization — consistent with the lessons.md "targeted, never repo-wide" rule.
- **Decision**: FIXED (2026-07-18): EOL micro-step added to Phase 1 step 3 Intent (normalize the 2 files to LF in `.claude` before the byte-copy, rationale + targeted-only note inline); step-3 contract now requires both lock-bootstrap files LF in both trees.
