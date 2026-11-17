<!-- PLAN-REVIEW-REPORT -->

# Plan Review: GPT-Image-2.6 Sunburst screening test

- **Plan**: `context/changes/gpt-image-26-screen/plan.md`
- **Mode**: Deep
- **Date**: 2026-11-17
- **Plan sha256**: `55443bfe9289e4a98aad6de0bb9e1b82be98e381e8b1d21b0db282a43e493c63`
- **Plan sha256 after triage**: `b6ebdbe2705739a7f47a1d9c9da125a9bb15f97f72662e43e4620d466a8eaa8e`
- **Verdict**: REVISE
- **Findings**: 2 critical, 6 warnings, 0 observations

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | PASS    |
| End-State Alignment    | WARNING |
| Lean Execution         | PASS    |
| Architectural Fitness  | WARNING |
| Blind Spots            | FAIL    |
| Plan Completeness      | WARNING |

## Grounding

Read `change.md`, `plan-brief.md`, then `plan.md` fully, in that order. The owner decisions of 2026-11-05 and 2026-11-16 are authoritative. None of the findings reopens the six-slot denominator, retry limit, fidelity rule, comparison size, Linux execution, or the distinction between undelivered and severe loss. The brief and plan agree on those decisions.

Canonical plan path is inside `context/changes/`, outside `context/archive/`; no previous review exists. Read all 29 of 39 lesson entries selected by `plan-review`/`all` applicability, plus the specifically requested pointer lesson (`context/foundation/lessons.md:244`), giving 30 entries considered. No `docs/reference/contract-surfaces.md` exists. The five body phases match the five Progress phases; all 12 Automated and eight Manual criteria have corresponding pending rows. The acceptance-state script maps all eight Manual rows and reports them pending. No Progress marks were changed.

The existing modification targets, source viewer, historical manifests/configs and baseline file exist. Proposed `scripts/gpt26/` and evaluation files are correctly absent; their parents must be created. One promised executable has no creation task (F7). The private corpus is absent here: only `test-photos/private/.gitkeep` exists. No photographs or outputs were opened, copied, or published.

### Compatibility and pinned evidence

- All four model configs with an `implementation` map pin **only** `scripts/s19/inputs.py`; its current SHA-256 matches every pin. `curve.json` has no such map. Neither proposed hook target is pinned. Evidence: `scripts/s19/configs/phase5-gpt.json:44`, `scripts/s19/protocol.py:421`. Changing `run-candidate.py` and `protocol.py` alone does **not** break these implementation hashes. Preserve the existing config and series bytes; do not regenerate historical pins or manifests to accommodate the hooks.
- The two S-19 series name config hashes and paths; they do not hash the runner or protocol module. `make-series.py` dynamically imports the runner (`scripts/s19/make-series.py:32`), as do the S-19 fixtures and several tests. S-20 widely imports `protocol`. Optional hooks with unchanged defaults fit this architecture; caller context and validation still need the explicit contracts in F3.
- A guarded `fcntl` import is reasonable for Windows import/refusal smoke checks. It cannot make the full S-19 suite portable: both locks require `flock` (`scripts/s19/run-candidate.py:141`, `scripts/s19/run-candidate.py:159`) and the concurrency test explicitly requests Unix `fork` (`scripts/s19/tests/test_budget.py:324`). Full regression execution belongs on Linux, as the owner decided.

### Automated-command audit

All three commands recorded as executed at planning still return the recorded exit code **1**. The explanations are not all correct; see F6. Linux commands were run through WSL from this checkout with `TMPDIR=/tmp`, preserving their intended shell semantics. Native Windows probes used `python -B`; the inline Bash environment assignment is not PowerShell syntax.

| Criterion                   | Review result                                                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Config/prompt assertion | Re-run: exit 1, exactly the expected missing `scripts/gpt26/configs/gpt26-low.json`. The assertion is valid but deliberately checks only prompt and request fields.                                                                       |
| 1.2 Series checker          | Not run: absent implementation. The command names a file no phase creates, and Phase 1 depends on unspecified Phase 2 output (F7).                                                                                                        |
| 1.3 Scoped Prettier         | Correct future check for supported file types; not run, as recorded. It does not validate Python. No package download was attempted.                                                                                                      |
| 2.1 Runner tests            | Correct Linux discovery form; not run, as recorded, because tests do not exist.                                                                                                                                                           |
| 2.2 S-19 regression         | WSL exit 1: six discovery errors, all `ModuleNotFoundError: PIL`. Native Windows also reports six PIL discovery errors. This confirms the observed blocker, not a passing baseline behind it.                                             |
| 2.3 Dry run                 | Valid proposed CLI; not run, as recorded: runner and private inputs absent. Its implementation must make `--dry-run` send nothing and reserve nothing.                                                                                    |
| 3.1 Builder/gate tests      | Same valid discovery form; not run, as recorded: tests absent.                                                                                                                                                                            |
| 3.2 S-20 regression         | WSL exit 1: 50 discovered tests, nine errors. Four PIL import errors, two NumPy import errors, three archive-path errors. Native Windows: 50 tests, ten errors and six failures, including encoding and symlink-permission problems (F6). |
| 3.3 Repository format check | Existing script is `prettier --check .`; correct read-only check. Not run, as recorded for future Phase 3.                                                                                                                                |
| 4.1 Paid runner             | Not run: explicitly paid; artifact path is present. Exit 0 means slots resolved, not that the visual gate passed. Cost-stop/crash completion requires F1.                                                                                 |
| 5.1 Gate                    | Not run: needs private sealed data and committed owner ratings. This is an **offline** computation, so its `(paid)` label should be removed; keep the artifact path and dependency reason.                                                |
| 5.2 Pointer grep            | Not run as a completion check, as recorded. Independent read-only searches found omitted pointers. The stated command inventories mentions and cannot assert freshness (F8).                                                              |

No paid calls, external/network commands, dependency installs, or repository commits were made. Vendor facts remain a future Phase 1 prerequisite; this review does not verify current vendor support or pricing.

### Independent degenerate walkthrough

The following cases were derived independently of the plan's examples:

| Case                                                                | Existing code / planned outcome                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four pairs `minor/minor`, two `minor/none`                          | Exactly four ties-or-better: PASS if all six valid outputs exist. `SEVERITY` supplies the ordering (`scripts/s20/gate.py:70`); the new gate must count slots independently, rather than reuse S-20's eight-photo/control-win rule.                                               |
| Two anonymous pair IDs both map to S17-03/slot 1; slot 2 is missing | Must reject duplicate coverage; six rating rows alone prove nothing. S-20 derives an independent expected set and rejects duplicate/missing comparisons (`scripts/s20/gate.py:89`, `scripts/s20/gate.py:103`). GPT26 needs the corresponding series-derived slot check (F1).     |
| All six slots terminally undelivered                                | Owner rule unambiguously yields FAIL, all fidelity values not rated. The unchanged viewer rejects zero items before it can export anything (`context/archive/2026-11-03-cloud-classical-denoise/references/compare-s20.html:393`); a separate zero-delivery path is needed (F1). |
| Six valid, well-rated PNGs, last call over its bound                | Existing runner records `ok` and `bound_exceeded` together, then raises; a resume sees `ok` first and returns done (`scripts/s19/run-candidate.py:412`, `scripts/s19/run-candidate.py:473`). Rating checks alone miss the protocol failure (F1).                                 |
| Crash after reservation, before a result                            | The reserve consumes budget and an attempt; missing cost does not mean zero spend (`scripts/s19/run-candidate.py:193`). Resume may use only the remaining attempt, then must resolve or explicitly refuse; no silent omission or new slot identity (F1).                         |
| Legacy/missing fidelity or `uncertain`                              | BLOCKED pending valid evidence, as decided. Existing S-20 validates schema, both sides, crop bounds, and completeness (`scripts/s20/gate.py:126`, `scripts/s20/gate.py:153`).                                                                                                    |

## Findings

### F1 — Make failure accounting independent of delivered images and ratings

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phases 2–3, runner resume and gate preconditions
- **Evidence**: `context/changes/gpt-image-26-screen/plan.md:110`, `context/changes/gpt-image-26-screen/plan.md:285`, `context/changes/gpt-image-26-screen/plan.md:336`, `context/changes/gpt-image-26-screen/plan.md:363`; `scripts/s19/run-candidate.py:191`, `scripts/s19/run-candidate.py:210`, `scripts/s19/run-candidate.py:412`, `scripts/s19/run-candidate.py:426`, `scripts/s19/run-candidate.py:473`, `scripts/s19/run-candidate.py:491`, `scripts/s19/run-candidate.py:540`; `context/archive/2026-11-03-cloud-classical-denoise/references/compare-s20.html:393`.
- **Detail**: The plan declares a fixed denominator, but the gate's concrete checks enumerate only seal, digest and delivered ratings. They do not reconcile the independently expected six series slots with **all** reserve/result/terminal rows, validate attempt limits, recheck PNG validity, or enforce cost-stop state. S-19 can write a valid `ok` output with `bound_exceeded=True`; it stops that invocation, but a later resume returns `done` before checking the flag. All six otherwise acceptable images can therefore hide a cost breach. Reserve-only crashes retain their bound and attempt count, and a budget refusal is not itself a terminal row. Separately, omitting every undelivered slot creates an empty manifest that the unchanged viewer refuses, leaving no ratings export and no specified route to the required FAIL. This is precisely the success-only guard failure described in `context/foundation/lessons.md:194`.
- **Fix**: Add one shared, offline reconciliation step driven by the committed six-slot series, used before every send/resume and by builder/gate. Require unique slot identities, at most two reserved attempts per slot, matching config/input/series identity, valid exact-size PNGs with verified hashes for delivered slots, explicit terminal undelivered states, and conservative spend = known costs plus outstanding/unknown reservations. Persistently refuse further sends after any bound breach; report a budget/protocol failure separately from fidelity and never certify a compliant screen from ratings alone. Keep incomplete/corrupt evidence BLOCKED, and explicitly support a sealed zero-delivery FAIL with empty diagnostics and no viewer session. Add tests for duplicate/missing slots, invalid PNG at gate time, first/last-slot over-bound responses followed by resume, reserve-only crash at both attempt ordinals, budget refusal, and zero delivered outputs.
  - Strength: Every failure is visible independently of whether a gradeable image exists; the owner's visual rule remains unchanged.
  - Tradeoff: Requires a small explicit run-state validator, rather than treating the private key or ratings as the source of slot coverage.
  - Confidence: HIGH — the conflicting S-19 branches and zero-item viewer refusal are present in current code.
  - Blind spot: A post-response cost check cannot undo a billed overrun; describe the bound as an admission estimate and report any actual breach honestly.
- **Decision**: FIXED — owner approved recommended fix 2026-11-17; edited: Implementation Approach, Critical Implementation Details — Failure accounting, Phase 2 — Screen runner and Shared run-state reconciliation and Tests, Phase 3 — Builder and Gate and Tests, Phase 4 — Approval and run, Phase 5 — Seal rating and verdict, Testing Strategy; reopened: none. Shared six-slot reconciliation, crash/reservation accounting, persistent cost-stop checks and zero-delivery sealed FAIL are specified; implementation remains pending.

### F2 — A seal in mutable change.md is incompatible with the reused history checks

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details; Phases 1, 4 and 5
- **Evidence**: `context/changes/gpt-image-26-screen/plan.md:138`, `context/changes/gpt-image-26-screen/plan.md:145`, `context/changes/gpt-image-26-screen/plan.md:225`, `context/changes/gpt-image-26-screen/plan.md:277`, `context/changes/gpt-image-26-screen/plan.md:465`, `context/changes/gpt-image-26-screen/plan.md:543`; `scripts/s20/evidence.py:91`, `scripts/s20/evidence.py:142`, `scripts/s20/evidence.py:164`, `scripts/s20/evidence.py:176`, `scripts/s20/evidence.py:194`; `context/archive/2026-11-03-cloud-classical-denoise/plan.md:166`.
- **Detail**: S-20's checks operate on **file histories**, not the history of a line. `require_write_once(change.md)` cannot pass: that file already exists and will change for approval, seal, status and outcome. Using only `require_strictly_before(change.md, ratings.json)` is also unstable: a later status/outcome commit is not an ancestor of the earlier ratings commit. In addition, `read_seal` accepts only an unbulleted `S20-SEAL` line, so changing the viewer prefix does not adapt the Python parser. The plan omits S-20's no-squash merge requirement and explicit human commitment to opening the viewer only after the seal commit. Windows authorship is not an obstacle, but local timestamps or a clean Windows tree cannot establish these preconditions on the Linux checkout that spends and rates.
- **Fix**: Create a dedicated write-once `evaluations/gate-sealed.md` containing one strictly parsed `GPT26-SEAL` line and the human-control statement; leave lifecycle edits in `change.md`. Implement a GPT26 seal parser without changing S-20 defaults. On the actual Linux checkout, require tracked/clean config, series, approval and executable rule files before reservation; record their committed identities with the run. Resolve the Git root from the executing code, not a test-only repository override. At gate time require the dedicated seal and ratings clean, the seal touched once, and its commit a strict ancestor of every ratings commit. Document transfer of the committed branch with full relevant history and rebase/fast-forward integration, never squash of seal plus ratings. Add untracked/staged/dirty series and approval cases, dirty runner code, same-commit seal/ratings, replaced seal, later `change.md` edit, missing history, and rerun-after-merge tests.
  - Strength: Reuses the existing evidence algorithms on the file-level contract they actually implement; later bookkeeping cannot invalidate the evidence chain.
  - Tradeoff: One additional tracked metadata file and a narrowly scoped parser.
  - Confidence: HIGH — `require_write_once` and `require_strictly_before` explicitly inspect every commit touching their path.
  - Blind spot: Git cannot prove that the owner did not open images early; retain the procedural control instead of claiming technical proof.
- **Decision**: FIXED — owner approved recommended fix 2026-11-17; edited: Implementation Approach, Critical Implementation Details — Ordering of evidence, Phase 1 — Change record, Phase 2 — Screen runner and Tests, Phase 3 — Builder and Gate and Tests, Phase 4 — Approval and run, Phase 5 — Seal rating and verdict; reopened: none. Dedicated write-once gate-sealed.md, GPT26 parser, executing-host clean/committed rule inventory and full-history seal-before-ratings checks replace the mutable-file seal contract.

### F3 — Specify the caller context instead of redirecting S-19 globals

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Generic hooks and screen runner
- **Evidence**: `context/changes/gpt-image-26-screen/plan.md:104`, `context/changes/gpt-image-26-screen/plan.md:260`, `context/changes/gpt-image-26-screen/plan.md:274`; `scripts/s19/protocol.py:165`, `scripts/s19/protocol.py:199`, `scripts/s19/protocol.py:207`, `scripts/s19/protocol.py:222`; `scripts/s19/run-candidate.py:70`, `scripts/s19/run-candidate.py:281`, `scripts/s19/run-candidate.py:360`, `scripts/s19/run-candidate.py:407`.
- **Detail**: Passing an approval **path** does not make S-19 read GPT26 approvals: `read_records(path=...)` already exists, but recognizes only the S-19 sections/tags and spending phases 3/5/7. Likewise, `S19_PRIVATE` controls input sidecars and output paths as well as the ledger: pointing it at `private/gpt26` loses the existing `private/s19/inputs` lookup. Finally, unrestricted `request_fields` merging can shadow `size`, `n`, `model` or other budget-bearing fields after bounds were computed. The two fixed GPT26 additions are safe, but the proposed generic contract permits unsafe additions and lacks collision tests.
- **Fix**: Specify a GPT26-only approval parser in the wrapper; pass independent ledger/output destinations while retaining the S-19 input root. Make new parameters optional with unchanged S-19 defaults and no lasting global mutation. Validate passthrough as additional scalar fields and reject reserved-field collisions before any reservation. Add tests using distinct corpus/ledger directories, a real GPT26 approval line, all reserved-key collisions, unchanged S-19 approvals/requests, and Windows import plus clear lock refusal. Preserve historical configs/series/pins byte-for-byte.
  - Strength: Keeps the new experiment isolated without broadening the old authorization grammar or weakening budget assumptions.
  - Tradeoff: The wrapper must own its small protocol-specific parser and caller context.
  - Confidence: HIGH — all three couplings are explicit in the current functions.
  - Blind spot: Existing default-behavior regression coverage remains blocked by the baseline problems in F6.
- **Decision**: FIXED — owner approved recommended fix 2026-11-17; edited: Current State Analysis — Compatibility pins, Implementation Approach, Phase 2 — Generic hooks and Screen runner and Tests; reopened: none. Independent caller destinations, wrapper-owned approval parsing, unchanged S-19 defaults/pins and reserved-field collision refusals are explicit.

### F4 — Random sides do not conceal the repeated Local image

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — Blind leaks; Phase 3 builder and viewer
- **Evidence**: `context/changes/gpt-image-26-screen/plan.md:159`, `context/changes/gpt-image-26-screen/plan.md:338`, `context/changes/gpt-image-26-screen/plan.md:354`, `context/changes/gpt-image-26-screen/plan.md:398`; `scripts/s20/blind.py:84`, `scripts/s20/blind.py:335`, `scripts/s20/blind.py:351`, `scripts/s20/blind.py:405`, `scripts/s20/blind.py:412`, `scripts/s20/blind.py:434`; `scripts/s20/common.py:225`; `context/archive/2026-11-03-cloud-classical-denoise/plan.md:177`, `context/archive/2026-11-03-cloud-classical-denoise/plan.md:457`, `context/archive/2026-11-03-cloud-classical-denoise/references/compare-s20.html:915`.
- **Detail**: With fixed request dimensions per scene, both Lanczos copies of Local are pixel-identical. The unchanged viewer permits navigation between repeats. Comparing the two pairs identifies the shared reference even when A/B choices are independent; randomization removes positional bias, not this identity channel. This is an inherent limitation of the already-decided repeated-Local design, not a reason to change its six slots. S-20's metadata defenses remain necessary but cannot cure it. Also, its existing `write_copy` and `file_bindings` helpers require source/copy pixels and dimensions to be equal, which is intentionally false for resized originals/Local; checking dimensions alone would not prove the prescribed Lanczos presentation.
- **Fix**: Retain the owner's design, but pre-register the residual recognition risk explicitly rather than claim independent draws solve it. Specify a procedural rating order that locks earlier answers before later repeats and forbids cross-pair file/hash inspection; separately sealed passes with one slot per scene can reduce immediate cross-comparison, while still reporting residual visual recognition and combining all six slots in the gate. Relax the two-string-only viewer contract only if the selected control actually needs it. For presentation integrity, record source and transformed pixel hashes separately, the exact target size and Lanczos transform, and verify the transformation at gate time. Add synthetic assertions for RGB-only PNG chunks/ICC handling, equal A/B byte lengths at equal dimensions, fixed mtimes, side-order writes, identity-free manifest/export, transform tampering, and stdout/stderr/report sanitization including decoder/subprocess exceptions.
  - Strength: Preserves the decided comparator and scale while making the actual limits of blinding and the resized evidence auditable.
  - Tradeoff: Procedural isolation reduces the leak but cannot make a repeated known reference unrecognizable; stronger blinding would require a different experimental design, outside this review.
  - Confidence: HIGH — deterministic resizing preserves equality and the reused viewer exposes all items.
  - Blind spot: No real photos were inspected, so the practical rate of human recognition is unmeasured.
- **Decision**: FIXED — owner approved recommended fix 2026-11-17; edited: Critical Implementation Details — Blind leaks, Phase 1 — Offline series checker, Phase 3 — Builder and Viewer copy and Gate and Tests, Phase 5 — Seal rating and verdict, Testing Strategy; reopened: none. Residual repeated-Local recognition is pre-registered; two-pass reveal/answer locking and source-to-Lanczos pixel verification replace the claim that random sides alone conceal identity. Metadata/error-channel tests and the permitted viewer adaptation are specified.

### F5 — The cap permits more than one retry when actual costs release headroom

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis — Phase-5 config; Phase 2 budget tests
- **Evidence**: `context/changes/gpt-image-26-screen/plan.md:33`, `context/changes/gpt-image-26-screen/plan.md:280`, `scripts/s19/run-candidate.py:191`, `scripts/s19/run-candidate.py:229`, `scripts/s19/run-candidate.py:519`.
- **Detail**: “Exactly one” is only the worst-case headroom calculation: seven reservations of $0.20 total $1.40, eight total $1.60. `phase_committed` substitutes known actual cost for successful calls, retaining the full bound for blocked/unknown attempts. Four $0.08 successes, two blocked $0.20 attempts and two $0.08 successful retries commit only **$0.88**, so two retries can fit. An offline execution of the existing `phase_committed` function on those synthetic rows returned `(0.88, 2)`; seven/eight unknown attempts returned `(1.4, 7)` / `(1.6, 8)`. A supposed global one-retry allowance would incorrectly deny owner-authorized per-slot retries.
- **Fix**: Say “one extra attempt fits under worst-case bounds; more can fit after known actual costs release reservations.” Preserve one retry **per slot**, conservative unknown costs, and atomic admission. Test both multiple retries fitting and a retry refused when full reservations exhaust headroom. Do not promise that all six first attempts remain affordable after earlier retries consume budget; resolve every unaffordable slot explicitly.
- **Decision**: FIXED — owner approved recommended fix 2026-11-17; edited: Current State Analysis — Phase-5 config, Critical Implementation Details — Failure accounting, Phase 2 — Screen runner and Shared run-state reconciliation and Tests, Phase 4 — Approval and run; reopened: none. One extra attempt is worst-case headroom, not a global retry allowance; known costs release budget, unknown costs retain bounds and unaffordable later first attempts terminate explicitly.

### F6 — The regression baseline has archive-path failures as well as missing packages

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis; Phases 2–3 Automated Verification; brief risks
- **Evidence**: `context/changes/gpt-image-26-screen/plan.md:58`, `context/changes/gpt-image-26-screen/plan.md:312`, `context/changes/gpt-image-26-screen/plan.md:408`; `scripts/s20/tests/test_nlm.py:27`, `scripts/s20/tests/test_wavelet.py:28`, `scripts/s20/tests/test_pointers.py:141`, `scripts/s20/tests/test_trials.py:116`, `scripts/s20/tests/test_trials.py:203`, `scripts/s20/trials.py:17`, `scripts/s20/pointers.py:74`; `scripts/s20/tests/test_evidence.py:169`, `scripts/s20/pointers.py:157`.
- **Detail**: The recorded exit codes are honest, but “no Pillow/OpenCV” is not the only cause. The actual WSL S-20 run also lacks NumPy and fails three tests because the current checkout no longer has `context/changes/cloud-classical-denoise/change.md`, `evaluations/pilot-result.json`, and the required calibration path. The files moved to the immutable archive; installing Pillow cannot fix these failures. Native Windows adds cp1250 read/write errors and a symlink privilege error. Therefore the proposed “existing suites stay green on Linux” gate has no established executable green baseline for this revision, even if the owner's older Linux checkout once ran S-20 successfully.
- **Fix**: Record the observed causes and require a baseline on the exact committed revision transferred to Linux, with Pillow, NumPy, OpenCV and the wavelet dependencies. Add a bounded, explicit regression-fixture adaptation for the archived evidence before relying on the full suites—for example a disposable checkout that restores byte-verified historical evidence at the legacy fixture paths—or explicitly repair the live test fixture/path handling. Never edit the archive, invent a green baseline, or silently waive these tests. Compare before/after results and make the intended regression command executable before spend.
  - Strength: Separates existing environment/archive failures from regressions introduced by the hooks.
  - Tradeoff: Some preparatory test maintenance or a disposable-fixture recipe is required.
  - Confidence: HIGH — the additional failures occurred in the review's actual WSL run, without importing Pillow.
  - Blind spot: Missing packages prevent the remaining image-dependent tests from executing, so further baseline failures remain possible.
- **Decision**: FIXED — owner approved recommended fix 2026-11-17; edited: Current State Analysis — This Windows host, Phase 2 — Reproducible Linux regression baseline and Automated Verification, Phase 3 — Automated Verification, Phase 4 — Approval and run, Testing Strategy — Integration Tests; reopened: none. Actual missing-package/archive-path causes are recorded; an offline disposable-worktree harness with four byte-verified metadata fixtures defines full before/after Linux regression checks. Those future checks remain explicitly not run, with no passing baseline claimed.

### F7 — Phase 1 depends on an executable that no phase creates

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Automated Verification 1.2
- **Evidence**: `context/changes/gpt-image-26-screen/plan.md:212`, `context/changes/gpt-image-26-screen/plan.md:235`, `context/changes/gpt-image-26-screen/plan.md:270`, `context/changes/gpt-image-26-screen/plan.md:290`.
- **Detail**: `python3 scripts/gpt26/check_series.py` is the sole automated criterion checking the preregistered slot set, but no phase creates this script or defines its contract. Its “needs Phase 2 output” reason also leaves Phase 1 dependent on a later phase, although Phase 1 is supposed to freeze the series before proceeding. An implementer cannot complete Phase 1's verification as written.
- **Fix**: Add `check_series.py` and its offline contract to Phase 1, or replace the command with a fully specified Phase 1 assertion. Verify exactly S17-03/04/07 × slots 1/2, no duplicates or prerequisites, config hash, copied phase-5 input hashes/dimensions/request sizes, recomputed bounds, and denominator six. Update the recorded not-run dependency to Phase 1 output. Remove the misleading `(paid)` label from the offline Phase 5 gate criterion as part of the command audit.
- **Decision**: FIXED — owner approved recommended fix 2026-11-17; edited: Phase 1 — Offline series checker and Automated Verification, Phase 2 — Tests, Phase 5 — Seal rating and verdict and Automated Verification; reopened: none. Phase 1 creates the checker and its independent offline contract; the Phase 5 gate is identified as offline/free while preserving the immutable historical Progress title.

### F8 — The pointer checklist misses temp_steps.md and its grep cannot detect staleness

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 5 — Pointers and Automated Verification 5.2
- **Evidence**: `context/changes/gpt-image-26-screen/plan.md:474`, `context/changes/gpt-image-26-screen/plan.md:493`, `context/changes/gpt-image-26-screen/plan.md:538`; `temp_steps.md:16`, `temp_steps.md:50`, `temp_steps.md:53`; `context/foundation/github-issues.md:139`, `context/foundation/roadmap.md:412`; `context/foundation/lessons.md:248`.
- **Detail**: `temp_steps.md` still asks the owner to decide whether to run #359 and separately says to plan the parked test after S-20's viewer. Both passages will be stale after this screen, but the checklist omits the file and the final grep searches only foundation files and `idea-notes.md`. Moreover, `git grep -n "gpt-image-26-screen"` returns 0 for any mention, whether it says proposed, complete, or something contradictory. It is an inventory, not a freshness assertion. The historical opened-on-2026-11-05 log row is history, not a status to erase.
- **Fix**: Add both `temp_steps.md` passages to the checklist and the same outcome commit. Specify a block-scoped offline check that requires each current pointer to link the canonical verdict and rejects its actual old wording, including the Polish “zdecyduj”/“Potem /rune-plan” passages. Keep unrelated proposed work and dated historical log entries out of the rejection scope. In `idea-notes.md`, retain the distinction that a six-output PASS only opens wider testing and does not establish production quality. Preserve consent before any GitHub mutation.
- **Decision**: FIXED — owner approved recommended fix 2026-11-17; edited: Phase 5 — Pointers and Automated Verification, Testing Strategy — Unit Tests, Pointer checklist; reopened: none. Both temp_steps.md passages and the change outcome are covered by a specified block-scoped checker and tests; dated historical logs, wider-test limits and consent before GitHub mutation remain intact.

## Workflow bookkeeping

The skill's lifecycle stamp updates `change.md` to `plan_reviewed` on 2026-11-17. The plan and brief remain untouched. The review and stamp are recorded in `.git/rune/gpt-image-26-screen.carry` for a later implementation session; nothing is staged or committed.

To keep a hand edit to a carried file, re-adopt it (Bash; replace `<file>`):

```bash
rune_root=$(git rev-parse --show-toplevel) && cd "$rune_root" && C="$(git rev-parse --git-path rune)/gpt-image-26-screen.carry" && p='context/changes/gpt-image-26-screen/<file>' &&
rune_path=$(realpath -m -- "$p" 2>/dev/null || python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$p") && case "$rune_path" in "$(pwd -P)/context/changes/gpt-image-26-screen/"?*) p=${rune_path#"$(pwd -P)/"} ;; *) printf 'refused: %s is outside the change folder\n' "$p" >&2; false ;; esac && h=$(git hash-object -- "$p") && { [ -f "$C" ] && while IFS= read -r l; do [ "${l#* }" = "$p" ] || printf '%s\n' "$l"; done < "$C"; printf '%s\n' "$h $p"; } > "$C.new" && mv "$C.new" "$C"
```

## Verdict

**REVISE.** The experiment's scope and owner definitions are sound. Repair the evidence and failure-accounting contracts before implementation/spend, then establish an honest Linux regression baseline. These are targeted protocol and verification changes; they do not call for changing the scenes, slots, gate, scale, host, or $1.50 cap.
