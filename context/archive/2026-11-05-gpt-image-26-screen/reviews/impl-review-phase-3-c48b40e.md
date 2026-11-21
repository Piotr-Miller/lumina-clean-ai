<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: GPT-Image-2.6 Sunburst screening test

- **Plan**: context/changes/gpt-image-26-screen/plan.md
- **Scope**: Phase 3 (phases 1–5)
- **Session**: fresh
- **Base**: d67ee61c00feab692d5422b140f300577e60adb9 (explicit)
- **Head**: c48b40e9c53e249e7eb743eeefd26b39873ddf44
- **Worktree**: excluded — clean at the review boundary; no pre-existing edits
- **Checks ran at**: c48b40e9c53e249e7eb743eeefd26b39873ddf44; S-20 uses the documented disposable metadata overlay at each tested revision
- **Manual acceptance**: 0 of 1 confirmed — pending: 3.4
- **Date**: 2026-11-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

The two warnings concern required evidence preservation and recovery, rather than minor style issues. Neither demonstrates a billing-cap bypass or a false PASS from incomplete run evidence.

## Findings

### F1 — A stale viewer tab can replace the original first-pass lock

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/changes/gpt-image-26-screen/references/compare-gpt26.html:582
- **Detail**: Phase 3 requires preventing earlier-pass navigation/edits after revealing pass 2 and exporting the original locked first-pass answers. The controller reads its persistent lock only at initialization (lines 535–565). Two tabs opened before either locks retain separate null closures. After one tab locks pass 1 and reveals pass 2, the older tab still shows editable pass 1. Its normal lock action checks only its cached closure and unconditionally writes localStorage (lines 583–600), replacing the original checkpoint. On reload the replacement becomes authoritative. The gate validates checkpoint/export equality, so it accepts the matching replacement; it cannot recover which checkpoint was originally locked.
- **Evidence**: A Node reproduction extracted the actual controller from the reviewed HTML, using a shared Map as localStorage. Two controllers were initialized before the first lock. The first locked quality `tie`; the stale controller still showed `p01`, successfully locked `A-clear`, and a new controller restored `A-clear`. Independently, `gate.ratings_of` accepted that replacement checkpoint/export. No developer-tools edits, private images or real ratings were used. The same write replaces the entire first-pass rows, including fidelity, not just the diagnostic quality field used in the reproduction.
- **Fix**: Coordinate the rating session across tabs and preserve the first persistent lock immutably. Stale views must adopt that lock and hide pass 1 before accepting further navigation, edits, locks or exports. Use cross-context arbitration or enforce a single active rating session; a non-atomic read-before-write alone leaves a simultaneous race. Add a regression with two live controllers and a changed second lock.
  - Strength: Preserves the plan's original locked answers under ordinary duplicate-tab use.
  - Tradeoff: Requires choosing a coordination mechanism compatible with the viewer's supported local-file and local-HTTP use.
  - Confidence: HIGH — independently reproduced in both review passes and verified against the gate parser.
  - Blind spot: The new coordination mechanism is not selected or browser-tested in this review; current browser access is unavailable.
- **Decision**: FIXED in 1a27271 — owner chose "fix both" (2026-11-21). One rating session per set: each controller claims it; a tab whose claim or lock no longer matches storage refuses to lock, save, render or export and is switched off (storage event and every guarded action). Regression `ViewerTest.test_a_stale_tab_cannot_replace_the_first_lock` (two live controllers, a changed second lock). Residual: a click in the older tab within the instant the newer one claims, since storage has no atomic compare-and-set; recorded in the viewer source.

### F2 — A seal-write failure leaves a published set that cannot be retried

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/gpt26/blind.py:508
- **Detail**: The builder renames the completed private directory into its final location before creating/writing the seal (lines 508–518). Seal I/O is outside the cleanup block. An error opening the seal leaves the final set directory without a seal; an error during its write can additionally leave a partial write-once seal. The public boundary nevertheless reports `BLOCKED. Nothing was written.`, and the next attempt is refused as `set exists`. There is no supported recovery for the already generated mapping; the suggested new set ID draws another mapping. The gate fails closed, but the builder's reported state and recovery instruction are inaccurate at the point that follows a paid run.
- **Evidence**: A synthetic full-pipeline template with a fake provider injected OSError only at `open(seal_path, "x")`. It returned exit 1, with final directory present and seal absent; a normal retry returned exit 1 with `set: set exists`. An independent isolated publication probe reproduced the same result using six terminal undelivered synthetic slots and mocked prerequisites, without photos or network. The public log contained `Nothing was written` despite `FINAL_EXISTS True`.
- **Fix**: Make publication of the final set and seal recoverable together. Roll back only artifacts created by this invocation on caught publication failures, or retain the existing mapping with an explicit supported recovery path; never remove a competing/pre-existing seal. Report any retained artifacts accurately. Add fault-injection coverage before seal creation and during its write.
  - Strength: Lets an I/O failure recover without silently redrawing the prepared blind mapping and makes the refusal describe the actual state.
  - Tradeoff: Ownership of partially published artifacts must be tracked carefully so cleanup cannot remove another invocation's seal.
  - Confidence: HIGH — fault injection reproduced the failure and retry refusal; the publication order is explicit in the source.
  - Blind spot: A real power-loss/fsync crash was not simulated; the demonstrated defect is a caught seal-write failure.
- **Decision**: FIXED in 1a27271 — owner chose "fix both" (2026-11-21). The builder writes the seal first (exclusive create, fsync), then moves the set; any failure removes only the seal this call created (inode-checked, a foreign seal is never removed), so neither set nor seal remains and the same `--set` rebuilds. A leftover it cannot undo is `publication incomplete`, printed as "A partial publication remains" instead of "Nothing was written". Fault-injection regression `SixTest.test_a_failed_publication_rolls_back_and_the_same_set_can_be_rebuilt` (before the seal, during its write, at the move, interrupt, unremovable seal, foreign seal).

## Verification

| Progress row | Command                                                                                                  | Result                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 3.1          | `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests`                                     | PASS, exit 0: `Ran 134 tests in 398.909s`, `OK`             |
| 3.2          | `python3 -B scripts/gpt26/regression.py --suite s20 --revision HEAD`                                     | PASS, exit 0: `Ran 326 tests in 831.559s`, `OK (skipped=4)` |
| 3.2 baseline | `python3 -B scripts/gpt26/regression.py --suite s20 --revision 1a8ae5698d3156a195be022f7f1b2d17f6bd30e0` | PASS, exit 0: `Ran 326 tests in 831.374s`, `OK (skipped=4)` |
| 3.3          | `npm run format:check`                                                                                   | PASS, exit 0: `All matched files use Prettier code style!`  |

Commands captured stdout/stderr to separate files before inspecting output; no check's exit status came from a pipe. Temporary logs: `/tmp/gpt26-phase3-review-unit.log`, `/tmp/gpt26-phase3-review-s20-head.log`, `/tmp/gpt26-phase3-review-s20-base.log`, `/tmp/gpt26-phase3-review-format.log`. These are local verification logs, not durable repository artifacts.

The candidate overlay was `e26b88e38200986e61dc95c0aa59303768cc2efa` with parent `c48b40e9c53e249e7eb743eeefd26b39873ddf44`; the baseline overlay was `2ed062f81cd72f9c5443a377f4bc6f60352d2ef4` with parent `1a8ae5698d3156a195be022f7f1b2d17f6bd30e0`. Each changed exactly the same five metadata paths, verified against archive blobs by SHA-256, and both worktrees were removed. The suites reported four existing skips apiece; no tests were edited or newly suppressed. Both used Python 3.15.2, Pillow 12.3.0, NumPy 2.5.4, distro cv2 4.13.0, scikit-image 0.26.0 and PyWavelets 1.8.0, with byte-identical `package-lock.json` SHA-256 `120849f1603f584d1275797b809201f09960ac95fdc4adf97c913b57ef1896a6` for the shared Node dependencies.

Finding probes: `node /tmp/gpt26-review-stale-tab.cjs` produced `Stale tab replaced persisted checkpoint: true` and `Reloaded first-pass quality: A-clear`; the independent Python gate-parser probe returned `Gate accepts replacement checkpoint/export; p01 quality: A-clear`. Logs: `/tmp/gpt26-phase3-review-stale-tab.log`, `/tmp/gpt26-phase3-review-seal-fault.log`. The reproduction scripts/data are temporary and no real sealed key was opened.

## Review Notes

- **Bookkeeping in diff**: context/changes/gpt-image-26-screen/change.md, context/changes/gpt-image-26-screen/evaluations/regression-baseline.md, context/changes/gpt-image-26-screen/plan.md, context/changes/gpt-image-26-screen/references/compare-gpt26.html. The viewer is under the change folder but was reviewed as executable code.
- The canonical plan resolves to the active change directory. No existing Phase 3 report was found; this is a fresh review of all four commits in the explicit base-to-head range. No archive, production code, provider parameters, prompt, historical config/series or holdout changes appear in the diff.
- The full plan was read. All Phase 3 Automated rows have ancestor commit suffixes (`624ed60`); no unproven or malformed marks and no n/a rows occur in this scope. Phases 4–5 are pending and outside this review.
- `bash .agents/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/gpt-image-26-screen/plan.md` exited 0 and classified 3.4 as pending. The 2026-11-21 change log records the owner's viewer confirmation at `611c9989ce92ad3165b36cb58a3b4b86d5cfbe50`, held for post-merge Progress recording by the owner's workflow. This review neither certifies nor edits Manual acceptance; ordinary pending acceptance does not lower the verdict.
- Applicable lessons: 35 of 39 entries selected by missing Applies-to, impl-review or all. Most concern unchanged production code; the relevant evidence, observability and guard-denominator lessons informed this pass.
- Two read-only delegates independently reviewed plan drift and safety/quality/patterns. Both found the stale-tab defect. Findings were consolidated and independently checked before inclusion.
- Builder, gate and synthetic coverage substantially match Phase 3: six-slot reconciliation, fixed denominator, hash-pinned sources, recomputed Lanczos/ICC/RGB transforms, controlled PNG presentation, frozen/live-record equality, strict seal/ratings history, required checkpoint and separate budget/protocol diagnostics. The viewer's single-instance locking/reload behavior matches; F1 covers the cross-instance gap.
- Helper changes are in scope: `Paths.local` supplies the builder's Local root; the rule inventory adds the builder/gate/viewer and imported S-20 modules; the regression overlay implements the dated five-metadata-file owner decision and verifies its parent, exact path set and bytes.
- Ruled out with source/tests: same-commit or replaced seal acceptance; missing/duplicate delivered comparisons; changed image/source/transform bytes; replacing frozen record copies; ordinary single-instance back-navigation or edits after transition; lost pass-1 answers on reload; treating undelivered slots as severe fidelity losses; disclosing decoder/subprocess details through the public error boundary.
- Mutation testing skipped: the touched offline Python/HTML evaluation tools do not implement any production failure scenario in the foundation test plan's Risk Map/Response Guidance. Stryker's configured TypeScript scope does not cover these tools.
- No paid calls, deployment, publishing, issue mutation or source fixes were performed. This skill leaves only its report and the change.md date stamp uncommitted and records them in the workflow carry file.
