<!-- PLAN-REVIEW-REPORT -->

# Plan Review: GPT-Image-2.6 wider comparison

- **Plan**: `context/changes/gpt-image-26-wider/plan.md`
- **Mode**: Deep
- **Date**: 2026-11-21
- **Plan sha256**: `9b21992ec01e63b350459e05d556e601f3d7feb8fda22f74559e165e26ed89b9`
- **Plan sha256 after triage**: `5c6669333953870972b0ff8d317d44534a7f0f186b87a6f8688959b92f5fb554`
- **Verdict**: REVISE — the approach fits the decided problem; close the implementation and verification gaps before reservation.
- **Findings**: 0 critical, 8 warnings, 1 observation
- **Scope**: Solution review against the authoritative HIGH-confidence frame and the owner's 2026-11-21 decisions. No reframing, paid calls, GitHub mutations, plan edits or archive writes. Decisions below await triage.

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | PASS    |
| End-State Alignment    | WARNING |
| Lean Execution         | PASS    |
| Architectural Fitness  | WARNING |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

## Grounding

Read `change.md`, `frame.md`, `plan.md`, `plan-brief.md`, the archived screen's plan/verdict/ratings and relevant viewer code, and the GPT26 implementation/tests. **30 of 40 lessons apply to plan-review**; lesson 279 is directly material. Lesson 244 was also consulted for pointers despite its different stage tags. One read-only analysis delegate checked runner/binding claims; its reported defects were checked against the files in this session.

All six Python modules named for modification and the test directory exist. The new config, series, viewer and evaluation artifacts are future outputs, not missing existing sources. Progress has exactly one bottom section, matching phase names, and 19 unique rows matching the 19 phase verification bullets (11 Automated, 8 Manual). Definitions have verification references; the added `severe` wording and reason wording are honestly marked as plan choices. The brief agrees with the main decisions.

### Results against the five requested focuses

1. **Owner decisions are faithfully encoded.** Definitions (`plan.md:82`–93), Phase 2 and Phase 3 (`:346`–381) preserve the whole-frame/no-zoom anchor for invented/altered and removed content, required pairwise preference, ≥ 8/16, disqualification, all-delivered condition, $3.50 and diagnostic p95. The cap appears in Definitions and the approval/CLI contract rather than a newly specified gate field; existing approved-cap accounting can enforce it. Recomputing bounds with the existing offline formula and all eight phase-5 sizes gives **$3.24** for 16 first attempts. This checks the registered estimate, not future billing.
2. **The named hard-wired paths are covered in intent, but the migration is incomplete.** F1 covers private storage and the viewer loader; F2 covers the second SHA comparison; F4 covers non-path pointer constants. Keeping the runner's locked admission, unknown-cost reservations, maximum two attempts, retry parameters, persistent bound-breach stop and sequential execution is the correct scope. No spend-policy change is proposed. Existing GPT26 tests, rather than S-19/S-20 regressions alone, must establish that those behaviours survive the refactor.
3. **The v2 decision contract rejects missing preference rather than treating it as tie.** A/B-only values and mapping through the sealed key introduce no necessary side leak. However, the new field must survive the entire viewer/checkpoint lifecycle, and both side orientations need coverage (F3). This review does not claim those protections are already implemented.
4. **The detailed ordering is sound.** Registration → committed owner `GPT26-SPEND` → run records → separate seal → ratings → evidence tag before integration is stated at `plan.md:147`–162 and `:449`–460. Existing `scripts/s20/evidence.py:176`–189 already proves strict seal/ratings ancestry. Rule-file pinning before reservation is explicit, including the new viewer. The approach summary contradicts the tag placement (F9); partial/zero-delivery execution also needs a branch (F7).
5. **Commands are not all executable as planned.** `--config` has an explicit Phase 1 introduction for the six study tools, so its current absence is expected. `regression.py --rev HEAD` is accepted by argparse as an abbreviation of `--revision` (`regression.py:205`–209); it is not a missing flag. F5, F6 and F8 cover actual command/artifact/phase gaps. Clarify that the study-tool `--config` requirement excludes the study-independent regression harness.

### Command checks and limits

- The recorded grep returned exit 0 with existing screen references, matching the planning status. Its Git pathspec also reaches test files; Phase 1 already promises to migrate their references. The post-phase no-match result is exit 1, as the plan explicitly states.
- Native `python3` currently resolves to a Windows Store alias and exits 1 without running Python. Repeating discovery with installed `python -B` ran **32 tests, exit 1, 10 errors**: two missing-Pillow module imports and eight regression-harness errors because Unix `/tmp` does not exist. This confirms a red Windows environment, not Fedora readiness or a passing behavioural baseline.
- Recomputed bounds using the standard-library-only `check_series.cost_bound`: six photos at $0.20/slot, S17-02 and S17-05 at $0.21/slot, two slots each → $3.24.
- Did not run paid commands, create regression worktrees, install dependencies, or invoke future flags against missing artifacts.

### Independent degenerate walkthrough

Use a synthetic 16-slot registration with two pairs of the same scene but distinct slot identities. Give both sides `minor` on every delivered pair, seven GPT-favoured preferences, one explicit tie and eight Local-favoured preferences. Unlike today's level comparison (`gate.py:392`), the planned preference rule gives exactly **8/16 → PASS**; changing the explicit tie to Local-slight gives **7/16 → FAIL**. Reversing both the sealed GPT side and the A/B answer must preserve the count. A missing/null answer must be BLOCKED, not restored as a tie; a duplicate pair cannot replace a missing identity (`gate.py:292`–337 and `:177`–216 already enforce coverage). A GPT `significant` remains FAIL regardless of preference count. A fifteenth delivered output leaves the denominator 16 and yields FAIL. With zero delivered outputs, today's gate accepts no export (`gate.py:431`–436), but the planned Phase 5 command always supplies one (F7). These are code/contract walkthroughs, not claims of executed v2 tests.

## Findings

### F1 — Study storage and the viewer loader still point at the screen's private evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 study descriptor (`plan.md:186`–197); Phase 4 (`:418`)
- **Detail**:
  Phase 4 promises `test-photos/private/gpt26-wider/`, but Phase 1 defines neither a private-root field nor its derivation. `run.default_paths()` selects `private/gpt26` (`scripts/gpt26/run.py:94`–96). The copied viewer loads that same old root (archived `compare-gpt26.html:376`) and directs checkpoint placement there (`:509`, `:1278`). On the actual Fedora corpus, changing only the listed public paths leaves the old ledger/sidecar selected, causing a binding refusal, and leaves the viewer unable to load assets from the promised new directory. Repointing only the runner also separates the gate from its checkpoint and frozen records.
- **Fix A ⭐ Recommended**: Define one study-specific private root in Phase 1, thread it through runner/builder/gate/checkpoint lookup, and specify how the copied viewer receives its matching base and checkpoint instructions before pinning it. Preserve the independent S-19 input/Local root.
  - Strength: Isolates both studies' budgets and evidence while preserving admission logic.
  - Tradeoff: Adds one path contract across Python and the static viewer.
  - Confidence: HIGH — both current defaults are directly visible.
  - Blind spot: The private corpus itself is unavailable on this host.
- **Decision**: FIXED — Fix A; edited: Phase 1: Study-driven GPT26 tooling, Phase 2: Pairwise fidelity and the visible anchor, Phase 3: Pre-registration, Phase 4: Paid run (Fedora); reopened: none

### F2 — The gate independently retains the registration commit equality

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 content-hash binding (`plan.md:204`–216)
- **Detail**:
  This subsection names only `state.py`. In addition to `state.check_bindings()` at `state.py:424`, `gate.run_record()` independently compares the sealed key's `registration_commit` with the checkout's registration commit (`scripts/gpt26/gate.py:171`–173). Removing the named state comparison alone still blocks the full gate after the registration commit is rewritten. The evidence tag preserves a fallback, but the intended content-binding fix would remain incomplete, repeating lesson 279.
- **Fix**: Name both comparisons explicitly. Require the registration-rewrite test to build/seal/rate and execute the complete offline gate, retaining blob checks and strict seal-before-ratings ancestry; a changed rule blob must still block.
- **Decision**: FIXED — Fix in plan; edited: Phase 1: Study-driven GPT26 tooling; reopened: none

### F3 — Preference is not threaded through the existing lock and resume contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 viewer/gate contracts and tests (`plan.md:264`–314)
- **Detail**:
  A required question and v2 export are specified, but the plan calls two-pass locking unchanged and names no preference persistence or lock tests. The copied viewer has several closed schemas/projections: `validAnswer()` allows only quality/fidelity (`compare-gpt26.html:434`–451), `missing()` controls lock completeness (`:755`–768), `gpt26ValidRow()` accepts only the old row fields (`:524`–533), `restore()` copies only quality/fidelity (`:601`–604), and `gpt26Row()` emits only those answers (`:1247`–1256). Leaving any of these unchanged can discard the preference, permit locking before it is answered, reject reload, or permanently lock an incomplete first pass. The current gate also validates document/checkpoint versions in `ratings_of()`, not `check_rows()` (`gate.py:341`–370). A missing-preference gate test alone cannot catch this lifecycle failure.
- **Fix A ⭐ Recommended**: Specify the field end to end: initially unanswered, valid saved state, completeness before lock, checkpoint rows, restore, final rows, and equality against the private checkpoint. Update v2 checks in `ratings_of()` for both documents. Add synthetic viewer/gate tests for omission/null/invalid value, reload after lock, post-lock preference tampering and all five choices with GPT on either A or B. Keep arm mapping exclusively on the sealed-key gate side.
  - Strength: Protects the new measurement through the actual two-pass workflow without inventing a default tie.
  - Tradeoff: Extends the existing controller tests and viewer diff allowlist.
  - Confidence: HIGH — the current projections explicitly drop additional fields.
  - Blind spot: Human recognition of repeated Local outputs remains the accepted residual risk.
- **Decision**: FIXED — Fix A; edited: Phase 2: Pairwise fidelity and the visible anchor; reopened: none

### F4 — Pointer selection retains issue #359 and the screen's history grammar

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 derived paths; Phase 5 pointers (`plan.md:193`–197, `:474`–492)
- **Detail**:
  Deriving `CHANGE_ID` does not adapt the complete checker. `pointers.py` additionally fixes issue #359 (`:53`), requires its 2026-11-05 opening row and `screen gate run` outcome grammar (`:149`–160), and selects the current-task item by `#359` (`:173`–175). It also always requires an issue-mapping row (`:144`–147), while this change's issue decision is explicitly pending until Phase 5. The advertised wider-study check can therefore fail even after all four planned live pointers are correct, or inspect predecessor blocks.
- **Fix**: Specify the wider study's exact block selectors and stale phrases, with tests. Scope required local checks to the plan's named pointers; validate issue mapping/history only when this study has an issue. Do not rewrite the predecessor's historical rows to satisfy legacy selectors.
- **Decision**: FIXED — Fix in plan; edited: Phase 1: Study-driven GPT26 tooling, Phase 5: Seal, rating, verdict, pointers; reopened: none

### F5 — Evidence-tag verification uses an undefined command after rules are frozen

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Automated row 5.3 (`plan.md:486`)
- **Detail**:
  The command contains worktree/config placeholders and an ellipsis, attempts to place Python after `git -C`, and uses `--check`. The current gate supports only `--set` and `--export` (`gate.py:541`–555); no phase adds `--check`. Discovering this after spend cannot be remedied by editing the pinned gate. Also, the prescribed tag is at the ratings commit, before the verdict is written, so a check that compares against committed verdict files would have no files to compare there.
- **Fix**: Add and test a read-only recomputation mode in Phase 1/2 before reservation, stating its exit/output semantics and that it needs the private sealed evidence/checkpoint but no existing verdict at the ratings tag. Replace row 5.3 with the complete detached-worktree setup and invocation from that checkout, including full config, set and export arguments. State the separate policy for zero delivery (F7).
- **Decision**: FIXED — Fix in plan; edited: Phase 2: Pairwise fidelity and the visible anchor, Phase 5: Seal, rating, verdict, pointers; reopened: none

### F6 — The paid command does not produce its promised run report

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 run artifact and Automated row 4.1 (`plan.md:411`, `:419`–432)
- **Detail**:
  The plan says the tools write `evaluations/run.md`, and the paid row names it as the command's artifact. Today's runner prints summary/state to stdout (`run.py:297`–311, `:428`–429); it does not write that report. No Phase 1/2 change adds a report writer or capture operation. The named artifact and subsequent manual check are therefore not delivered by the command as written.
- **Fix**: Specify either an offline report writer built/tested before reservation, or an explicit capture-and-report procedure using the existing reconciled state and output, preserving the paid process's exit status. Include known/conservative costs, unknown reservations, per-slot terminal reasons, blocks/recovery and wall times. Do not change admission/retry behaviour to create a report.
- **Decision**: FIXED — Offline report writer; edited: Phase 1: Study-driven GPT26 tooling, Phase 4: Paid run (Fedora); reopened: none

### F7 — Phase 5 assumes every slot produced a pair despite the decided FAIL branch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 5 builder, command and Manual rating row (`plan.md:458`, `:484`, `:490`)
- **Detail**:
  Definitions and tests correctly retain denominator 16 when a slot is undelivered. Execution nevertheless requires building/rating all 16 pairs and always supplies a ratings export. Existing code creates pairs only for delivered slots (`blind.py:503`–505), and explicitly refuses an export at zero delivery (`gate.py:431`–436). The predecessor plan already distinguishes delivered-only ratings and the no-export zero-delivery path (archived plan `:702`–712). A legitimate terminal failure must still reach an honest verdict, rather than an impossible rating requirement or invented pairs.
- **Fix**: Specify up to 16 presented pairs, rating every delivered pair with the denominator fixed at 16. Carry the single-pass/zero-delivery handling forward explicitly; provide the zero-delivery gate command, omit the ratings commit, mark the rating Manual row n/a with evidence, and place the evidence tag on the terminal evidence commit for that branch.
- **Decision**: FIXED — Fix in plan; edited: Desired End State, Implementation Approach, Critical Implementation Details, Phase 5: Seal, rating, verdict, pointers; reopened: none

### F8 — Phase 1's full suite depends on a viewer created only in Phase 2

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 tests/Automated row 1.1; Phase 2 viewer creation (`plan.md:218`–238, `:257`–267)
- **Detail**:
  The full GPT26 suite includes viewer tests that read an actual `VIEWER` file (`test_gate.py:880`–901), including an exact adaptation-diff check. Phase 1 migrates fixtures away from the missing screen paths but does not supply the new viewer, which is introduced in Phase 2. A fixture config alone does not supply the HTML or its controller. Phase 1 cannot be declared green by disabling these tests or leaving them pointed at the absent old location.
- **Fix**: Create the unchanged viewer copy in Phase 1 and adapt its path assertions there, then add the anchor/preference in Phase 2; alternatively explicitly provide a self-contained Phase 1 fixture viewer. Keep the full suite and diff protections active.
- **Decision**: FIXED — Self-contained Phase 1 viewer fixture; edited: Phase 1: Study-driven GPT26 tooling, Phase 2: Pairwise fidelity and the visible anchor; reopened: none

### F9 — The approach summary puts the evidence tag before ratings

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach item 4 (`plan.md:142`–143)
- **Detail**:
  The summary says seal commit → evidence tag → two-pass rating → ratings commit. The detailed contract correctly requires the tag at the ratings commit (`:155`–158, `:460`). Following the summary would preserve a tag without the ratings needed for re-verification. The stronger detailed contract resolves intent, so this is a consistency correction, not an undecided owner rule.
- **Fix**: Move the tag step after the ratings commit in the summary, before any update-branch rebase or integration, and refer to the zero-delivery exception from F7.
- **Decision**: FIXED — Fix in plan; edited: Implementation Approach, Critical Implementation Details; reopened: none

## Triage state

The owner approved all recommended fixes. All nine findings are addressed in the plan. All eight Manual rows were pending at triage, so none reopened.
