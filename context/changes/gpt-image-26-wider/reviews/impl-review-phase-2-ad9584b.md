<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: GPT-Image-2.6 wider comparison (eight tuning photos)

- **Plan**: context/changes/gpt-image-26-wider/plan.md
- **Scope**: Phase 2 (phases 1–5)
- **Session**: fresh (a different session; the reviewer did not write this code)
- **Base**: 49341050e68cf819bb30863b0b70e896a5498f08 (explicit: Phase 1's closing commit)
- **Head**: ad9584b86ae5c9a5137228ee6e78a952fe0b319d
- **Worktree**: excluded (`context/changes/gpt-image-26-wider/plan.md` and `change.md` are the implementer's carried bookkeeping edits; they touch no reviewed code)
- **Checks ran at**: ad9584b86ae5c9a5137228ee6e78a952fe0b319d (= HEAD; the S-20 regression ran in its own disposable worktree)
- **Manual acceptance**: 0 of 1 confirmed — pending: 2.3
- **Date**: 2026-11-24
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Pipeline test labelled "Local's level: diagnostic" cannot see a Local-level tie requirement

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/gpt26/tests/test_gate.py:1381
- **Detail**: `PreferencePipelineTest.test_preferences_decide_through_the_sealed_key` sets `levels={labels[4]: ("none", "severe")}` and comments it "Local's level: diagnostic". GPT `none` against Local `severe` already satisfies the old level rule (GPT ≤ Local), and that pair's preference is `local-clear`, so it is not a tie either way. Every other pair is `none`/`none`. A regression that makes the preference rule also require `level(GPT) ≤ level(Local)` (the implementer's deliberate break) therefore produces the same verdict end to end, and only the pure-unit test `PreferenceRuleTest.test_local_level_is_a_diagnostic_under_the_preference_rule` (:1246, GPT `minor` vs Local `none`) catches it. That coverage is **adequate for the rule as written**: the tie decision lives in one place, `decide()` (`gate.py:436`), `evaluate()` only passes both levels through, and the unit test pins the direction that matters. But the pipeline case is mislabelled, and it is the only end-to-end case for the screen's actual failure pattern (a GPT `minor` scored as a tie). Under the preference rule that pattern should still count when the preference says `tie`.
- **Fix**: In that pipeline case, give a tie-preference pair GPT-worse-than-Local levels (e.g. `labels[2]: ("minor", "none")`) and keep `PASS, 4`. Alternatively, correct the comment so it does not claim coverage it lacks.
- **Decision**: PENDING

### F2 — No pre-spend check that the registered viewer exports the version the tie rule reads

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/gpt26/check_series.py:221 (and `check_viewer`, :165)
- **Detail**: `check_series` now refuses an unknown `gate.tie_rule_kind`, and `check_viewer` checks only the viewer's manifest base. Nothing before spend ties the two together. If a config registered `preference` with a viewer that exports version 1 (the Phase 1 fixture, say), or `level` with the wider viewer, the mismatch would surface only at the gate, after the paid run, as BLOCKED `schema error`. The viewer is a rule file pinned at the first reservation, so it could not then be corrected without an owner decision. The risk is low on the planned path, because the only viewer under this change hard-codes `GPT26_VERSION = 2`. Still, it is the class of fault this study's pre-registration exists to catch (lesson "A guard metric that only exists on success cannot detect failure": state the failure a guard must catch, then check it can see it).
- **Fix**: In `check_viewer`/`check_config` (Phase 3 can carry it), require the viewer's `GPT26_VERSION` (or, for the fixture, the literal export `version`) to equal the version the registered kind reads (`level` → 1, `preference` → 2), with a test for each mismatch.
- **Decision**: PENDING

## Review Notes

- **Bookkeeping in diff**: context/changes/gpt-image-26-wider/plan.md, context/changes/gpt-image-26-wider/evaluations/regression-baseline.md
- **Automated checks at ad9584b**:
  - 2.1 `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests` → `Ran 228 tests in 386.585s`, `OK`, exit 0.
  - 2.2 `python3 scripts/gpt26/regression.py --suite s20 --rev HEAD` → overlay commit `7a7ab4c` (parent ad9584b, exactly 5 fixture paths), `Ran 326 tests in 519.791s`, `OK (skipped=4)`, exit 0. The disposable worktree was removed (`git worktree list` shows only the main checkout).
- **2.2 has no committed record of its own.** Progress marks it done at ad9584b, but the Phase 2 commit message has no gate line, and `evaluations/regression-baseline.md` records only S-19 and the GPT26 suite at `4934105`. This review's run is the first written S-20 result for Phase 2. Consider appending it to the baseline file.
- **Misdated attestation.** `evaluations/regression-baseline.md:52` heads the section "Review-fix revision (2026-12-04)", a date after today (2026-11-24). The run it records happened on 2026-11-24 (the date of commit `4934105`). Correct the heading to the date of the check.
- **Supporting extras, within intent:** the `log=` parameter of `blind.boundary` (`blind.py:613`), which lets `--check` write no private log, and `check_series`'s `TIE_RULE_KINDS` refusal (`check_series.py:71,221`), which the plan's "reject unknown kinds" implies before spend. A test pins `TIE_RULE_KINDS` equal to `gate.RULE_KINDS`. The fixture config gained `tie_rule_kind: "level"`, and the fixture series was rehashed to match.
- **Plan drift sweep (Phase 2 §1–§3): all MATCH.**
  - The viewer copy has the `gpt26-wider` base and both checkpoint messages, the required preference with the five Polish choices stored as `A-clear … B-clear`, and the anchor wording verbatim under the level rows. It also has the new evidence prompt, the preference handled in `validAnswer`/`missing`/`gpt26Row`/`gpt26ValidRow`/`restore`, and v2 exports and checkpoints that refuse legacy locks. The stale-tab guard is kept, and the diff against the Phase 1 fixture is bounded and test-enforced.
  - In the gate, a v1/v2 schema is selected by `tie_rule_kind`, and one valid preference is required per row. The final export, the `locked_pass1` and the checkpoint all compare the preference. The preference is mapped through `gpt_side` in `evaluate()`, the majority comes from preferences, and disqualification, undelivered and budget rules are kept. The verdict table has the new column, with Local shown as a diagnostic.
  - `--check` prints the canonical Markdown to stdout, writes nothing and uses exits 0/1/2. Every named test case in §3 exists.
- **Deliberate-break coverage (caller's question):** judged adequate. See F1 for the one gap in the end-to-end test's labelling.
- **Lessons**: 36 of 40 ledger entries apply to `impl-review`. The binding ones here were "Never bind sealed or frozen evidence to a branch commit SHA" (`--check` re-verification at a tag is supported, and no SHA binding was added), "A check that cannot say what it found…" (`--check` sends a sanitized refusal to stderr, with a test) and "A guard metric that only exists on success…" (F2).
- **Mutation check skipped**: `context/foundation/test-plan.md` maps no risk to `scripts/gpt26/`, and the only configured mutation tool (Stryker) targets TypeScript under `src/lib/`.
- **Manual 2.3** (the owner opens the viewer on a fixture set) is pending. It is not a finding.
