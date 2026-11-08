<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-20 Step 1 (1a: NLM) — Classical Denoise vs No-Denoise Control

- **Plan**: context/changes/cloud-classical-denoise/plan.md
- **Scope**: Phase 5 (phases 0–6)
- **Session**: fresh
- **Base**: c5a277de1040af2299c71c04e54a3cd1cc03a975 (explicit — parent of the pilot seal 59fea67)
- **Head**: b586de453bc389f13e082540c5e6bf810962efe6
- **Worktree**: excluded (change.md, plan.md, temp_steps.md — the owner's carry: confirmation notes for 2.4/3.3/4.2/4.3 and the Progress SHA write-back for 5.1–5.5; none of it is Phase 5 code or evidence)
- **Checks ran at**: b586de453bc389f13e082540c5e6bf810962efe6 (HEAD)
- **Manual acceptance**: 0 of 2 confirmed — pending: 5.6, 5.7
- **Date**: 2026-11-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

None.

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-classical-denoise/plan.md (Progress 5.1–5.5), context/changes/cloud-classical-denoise/evaluations/pilot-sealed.md, pilot-ratings.json, pilot-result.json
- **Plan adherence.** The four files Phase 5 § 1 names are the whole diff, plus the Progress rows: `pilot-sealed.md` (one `S20-SEAL kind=pilot set_id=pilot-1` line + the human-control statement), `pilot-ratings.json`, `pilot-result.json`, `scripts/s20/configs/nlm-frozen.json`. No code changed. The STOP branch did not apply (SELECTED).
- **Order table, steps 3–7, re-checked at HEAD.** The seal has exactly one commit (59fea67, 22:49:20), which is a strict ancestor of the only ratings commit (a5d1a3e, 23:03:14); result and freeze follow in b586de4. `pilot-1` was built at 22:44, before the seal commit, as step 3→4 requires. The seal line's `set_digest`/`key_sha256` equal those in `pilot-result.json` and `nlm-frozen.json`; `sha256(pilot-ratings.json)` = `6fb62f61…` = `pilot_export_sha256`; `sha256(nlm-grid.json)` = `34f1a72b…` = `grid_config_sha256`.
- **5.5 re-run.** `python3 scripts/s20/pilot.py --set pilot-1 --export …/pilot-ratings.json` → exit 0, `SELECTED k 1.0: counts {'k1.0': 3, 'k1.5': 2, 'k2.0': 0}, none 3`; `git status` unchanged afterwards (idempotent re-run; it re-verifies the RULE_FILES, seal order and the NLM provenance against the calibration bind). Vote rule checked by hand: 3 > 2 > 0, three `none` cast no vote → k 1.0.
- **5.1–5.4 not re-run** (each writes records): verified by artifact instead. `test-photos/private/s20/decoded/` holds 8 records + 8 PNGs, `s20/nlm/` 24 + 24, `s19/arms/control-full/` 8, `s19/arms/nlm-gamma/k{1.0,1.5,2.0}/` 24 — the 8 + 24 + 8 + 24 the plan requires, with no leftover partial render. Decoded records date from 22:24, after c5a277d (22:12), so they postdate every rule-file commit.
- **Regression.** `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests` → 156 tests OK (exit 0); `… -s scripts/s19/tests` → 85 tests OK (exit 0). `prettier --check` on the four new files → clean.
- **Preconditions held only in the carry.** Phase 5 depends on 2.4 ("before Phase 5 renders"), 4.2 ("before any render") and on 3.3/4.3 preceding Phase 5 (Phase 4 § 8). Their Progress rows are still `[ ]` by the owner's rule (Manual rows are written after the merge, at the master SHA); the dated confirmations exist only in the uncommitted `change.md` Notes (2.4 on 11-06, 4.2 on 11-07, 3.3/4.3 on 11-08 before the 22:24 decode). The ordering is consistent, but until `change.md` is committed, the repository does not show that the preconditions held before the renders.
- **Commit text vs. the hand-off.** b586de4 says "18 of the 24 NLM renders came from a run another agent started"; the hand-off note said 19/24. They agree if the 19th was the interrupted S17-07 that was set aside and re-rendered (6 renders for S17-07 + S17-21). This review cannot check that; the counts on disk are complete either way.
- **Phase 4 code seen during the re-run (not a Phase 5 finding).** `pilot.py` prints `wrote pilot-result.json and nlm-frozen.json` even when `write_if_changed` and the freeze comparison wrote nothing. Lesson "A check that cannot say what it found…" applies loosely; worth a word change if Phase 6 touches `pilot.py`, not before.
- **Lessons.** 35 of 39 ledger entries name `impl-review` or `all`; the ones bearing on this phase are "Writing a fact into its canonical home leaves every pointer to it stale" (the pilot result has no pointers yet — the plan puts them in Phase 6 § 2, after the gate verdict) and "A check that cannot say what it found…" (note above).
- **Mutation check skipped**: Phase 5 changed no code (evidence files only).
- **Session**: fresh — this conversation did not run `/rune-implement` for Phase 5.
