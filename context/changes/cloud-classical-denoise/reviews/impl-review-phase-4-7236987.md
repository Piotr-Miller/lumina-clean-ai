<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-20 Step 1 (1a: NLM) — Classical Denoise vs No-Denoise Control

- **Plan**: context/changes/cloud-classical-denoise/plan.md
- **Scope**: Phase 4 (phases 0–6)
- **Session**: fresh
- **Base**: b83a7c4ede49054a9cb3c8659210036c70958b69 (Progress — previous phase's commit)
- **Head**: 7236987dc4961175f6e65cabc1301bc7b0531528
- **Worktree**: included(context/changes/cloud-classical-denoise/plan.md) — bookkeeping only (4.1 Progress SHA suffix); excluded temp_steps.md (outside scope)
- **Checks ran at**: 7236987dc4961175f6e65cabc1301bc7b0531528 (current HEAD)
- **Manual acceptance**: 0 of 2 confirmed — pending: 4.2, 4.3
- **Date**: 2026-11-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 0 observations
- **Triage**: 2026-11-07 — F1, F2 and F3 FIXED; edits uncommitted and carried; Manual 4.2/4.3 pending

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Pilot votes can freeze a different strength from the images actually rated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/s20/pilot.py:138
- **Detail**: `evaluate()` checks the sealed key and manifest and re-hashes NLM metadata through `check_provenance()`, then decodes the votes. It never verifies that the pilot presentation images or their source images still match the sealed key. In an eight-photo synthetic world, swapping the PNG bytes of the labels mapped to k=1.5 and k=2.0 after sealing, then committing votes for the labels originally mapped to 1.5, returns exit 0, `SELECTED k 1.5`, although those labels now display k=2.0. Committing that result/freeze also lets `blind.py gate` build all 16 comparisons (exit 0): `require_freeze()` calls the same incomplete evaluation. A correct vote can therefore freeze the wrong treatment and compromise the experiment. This is an evidence-integrity gap in the plan's narrowly specified pilot provenance check as well as in its implementation; the live gate already re-verifies presentation/source bindings in `file_bindings()`.
- **Fix**: Re-verify every pilot presentation and source against the sealed hashes and pixel bindings before counting votes. Share the file-binding validator with the gate and add a regression that swaps two strength presentations after sealing and expects BLOCKED, including through gate construction.
  - Strength: Binds the selected k to the treatment actually shown and preserves the existing refusal protocol.
  - Tradeoff: Re-hashing and decoding full-resolution pilot files adds I/O and CPU work whenever the live freeze precondition is rechecked.
  - Confidence: HIGH — the exact swap and downstream gate construction were reproduced using synthetic data; the missing check is explicit in `evaluate()`.
  - Blind spot: Full-resolution verification cost has not been measured; this review performed no real-photo render or rating.
- **Decision**: FIXED — Fix now (2026-11-06): moved the live presentation/source hash-and-pixel validator into common.file_bindings and called it before pilot votes are decoded. Added four eight-photo synthetic regressions for swapped strength presentations, a changed source, a missing presentation, and swapped pilot files after a committed freeze. Siblings: gate.evaluate fixed (uses the same shared validator); blind.build gate mode and live gate execution fixed through pilot.require_freeze (both tested); gate.audit n/a for private image verification (metadata-only contract; its separate history/path defects are tracked in F2/F3, both FIXED as of 2026-11-07). Reopened: none (acceptance script exit 0; affected 4.2/4.3 were already pending, 0.3/0.4 remain current).

### F2 — Metadata audit can report PASS for evidence the live gate rejects

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: scripts/s20/gate.py:457
- **Detail**: The plan promises that `--audit` re-derives the gate verdict from committed metadata. Unlike `evaluate()`, `audit()` does not enforce cleanliness, write-once seals/freeze, or strict commit ancestry. It reads the working-tree seals, exports and freeze directly. Reproduction: generate a valid synthetic PASS, append text to `gate-sealed.md`, and commit the replacement after the ratings. `gate.py --audit <bundle>` still exits 0 with `audit re-derives PASS`; ordinary gate execution exits 3, `set: order violation`. Thus the audit omits a mandatory BLOCKED branch and cannot establish the stated verdict from the evidence chain.
- **Fix**: Extract metadata-only evidence-state validation shared by live execution and audit. Enforce the complete clean/write-once/strict-order chain before deriving the audit verdict, and test replaced or reordered seals plus dirty exports/freeze without needing private images.
  - Strength: Makes both entry points agree on evidence validity while retaining the checkout-only audit.
  - Tradeoff: Requires separating Git-history checks from live image verification; calling the current live evaluator wholesale would break the metadata-only contract.
  - Confidence: HIGH — both review passes and the lead independently reproduced the differing exit codes on synthetic evidence.
  - Blind spot: Tests must preserve valid re-export and rewritten-history behavior while adding the shared checks.
- **Decision**: FIXED — Fix now (2026-11-06): extracted common.require_pilot_order, require_freeze_order and require_gate_order; audit now enforces the complete clean/write-once/strict-ancestry chain before reading the evidence. Added regressions for a recommitted seal, dirty seals/ratings/freeze/rules/baselines, seal+ratings in one commit, and a valid gate re-export audited without private images. Siblings: pilot.evaluate fixed (shared pilot-order helper); pilot.require_freeze fixed (shared freeze-order helper, STOP behavior preserved); gate.evaluate fixed (shared gate-order helper); blind.build gate mode inherits the pilot/freeze checks; nlm.py n/a (render rule cleanliness only, no seal/rating transition). Reopened: none (acceptance script exit 0; affected 4.2/4.3 already pending, 0.3/0.4 current). F3 is tracked separately and FIXED as of 2026-11-07.

### F3 — Audit opens a record symlink into the closed holdout before refusing it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s20/gate.py:463
- **Detail**: The audit's `raw()` reads `(bundle / name).read_bytes()` without `protocol.check_paths()`. Replacing a bundled record with a symlink to a synthetic validation JPEG causes the JPEG bytes to be read and hashed, followed by `binding failed: ... does not hash to its name`. Access was not refused before the read. This violates the plan's guard-before-any-read rule for records and key paths, and can open the still-closed holdout even though audit advertises that it opens no image. This review used a synthetic validation file only; no actual holdout file was read.
- **Fix**: Guard the bundle and every concrete resolved file path before reading audit keys, manifests or records; add a symlink read-trap test expecting access refusal before any bytes are opened. Check the sibling audit metadata readers for the same defect.
- **Decision**: FIXED — Fix now (completed 2026-11-07): evidence.guarded_path resolves and guards the actual path before read/stat; common.read_bytes translates refusals to the sanitized access-refused class. Audit guards the bundle plus every key, manifest and record read. Siblings: audit ratings/freeze/baselines/saved-report reads fixed through the shared reader; gate.file_reader and live gate ratings fixed through that reader; pilot ratings/freeze/result/idempotence reads and freeze existence checks fixed; evidence.read_seal fixed (keeps its library Refused contract). common.load_set n/a (already guards the set, key and manifest before reads); blind.verified_sources and nlm.render/verified_decoded n/a (concrete photo/record paths already guarded before access). Added synthetic read traps for all four key/manifest readers, a bundled record, saved report, a bundle-directory link into a held namespace, and the seal reader. Reopened: none (acceptance script exit 0 on 2026-11-07; affected 4.2/4.3 already pending, 0.3/0.4 remain current). No actual holdout bytes were read.

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-classical-denoise/change.md, context/changes/cloud-classical-denoise/plan.md, context/changes/cloud-classical-denoise/reviews/impl-review-phase-3-b83a7c4.md. The planned viewer under references/ was reviewed as implementation, despite living in the change folder.
- Boundary: one phase commit, `7236987 feat(cloud-classical-denoise): Evidence state, pilot rule and gate rule (p4)`. No later revision required a temporary checkout. The local Progress edit adds only the phase-4 SHA; the local temp_steps.md edit is excluded and unchanged.
- Canonical Progress: phases 0–4 have suffixed Automated rows; phases 5–6 are pending. No malformed n/a rows. Manual acceptance script exited 0: phase-4 rows 4.2 and 4.3 are pending, with no stale or unverifiable rows in this scope. Earlier 0.3/0.4 remain current; 2.4/3.3 are pending outside this scope.
- Automated criterion 4.1: `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/s20/tests` — exit 0; output: `Ran 143 tests in 208.670s`, `OK`. stdout/stderr were captured in /tmp/s20-phase4-review-tests.log and the command's own exit status was retained.
- Additional formatting check: `npx prettier --check context/changes/cloud-classical-denoise/references/compare-s20.html scripts/s20/configs/local-baselines.json` — exit 0; `All matched files use Prettier code style!` (2 files).
- All three findings were reproduced with temporary synthetic eight-photo fixtures. The lead independently reproduced pilot acceptance after a presentation swap, audit PASS after a second seal commit while live execution BLOCKED, and a bundled record symlink read before hash refusal. Temporary reproduction worlds were removed. No application code, real render, paid call, real private input or actual holdout access was needed for these reproductions.
- Plan matches outside the findings: live evidence order; pilot vote rule (none/STOP and weaker tie-break); live gate coverage, quality threshold, worst-NLM fidelity and BLOCKED precedence; cross-arm Auto/LUT bindings; Local baseline source check; pointer-block boundaries; printed seals and viewer seal check. The common.py shared extraction is justified rather than scope creep. The viewer/blind changes also contain the previously triaged phase-3 fixes, consistent with their saved decisions.
- Mutation check skipped: this offline Python/HTML evidence workflow touches none of the six product failure scenarios in test-plan.md §2 / Risk Response Guidance; Stryker is configured for the application TypeScript graph, not these tools.
- Lessons: 35 of 39 entries apply to impl-review (including entries with no Applies to restriction). Evidence claims and guard-before-read behavior were checked against the applicable priors.
- No implementation fix or Manual acceptance change was made. change.md is date-stamped only; status remains implementing because this is a phase review. The report and stamp are left uncommitted and recorded in the workflow carry file.
- Triage verification, F1 (2026-11-06, uncommitted working tree at recorded HEAD): pilot tests exit 0, 24 tests in 45.042s; full phase suite exit 0, 147 tests in 294.383s, OK. Negative control: temporarily removed the new pilot check; both selected swapped-image tests failed (4 assertions/subtests), including the previously accepted wrong freeze and gate construction. Restored the check unconditionally before the full green run. Logs: /tmp/s20-f1-pilot-tests.log, /tmp/s20-f1-negative-control.log, /tmp/s20-f1-full-tests.log. git diff --check passed. Implementation/test edits and this decision remain uncommitted and carried; F2/F3 are still pending.
- Triage verification, F2 (2026-11-06, uncommitted working tree at recorded HEAD): AuditTest plus test_evidence exit 0, 23 tests in 10.496s, including rewritten history and private-image-free PASS/FAIL reproduction. Temporarily removing the three audit order calls makes the three selected regression tests fail (9 assertions/subtests); calls restored unconditionally. Full phase suite exit 0, 151 tests in 304.986s, OK. Logs: /tmp/s20-f2-audit-tests.log, /tmp/s20-f2-negative-control.log, /tmp/s20-f2-full-tests.log. The core evidence inputs are committed/clean/order-checked; audit bundle records remain verified by the sealed hashes, and no live evaluator or image verification is called by audit. F2 edits and its decision remain uncommitted and carried; only F3 is pending.
- Triage verification, F3 (completed 2026-11-07, uncommitted working tree at recorded HEAD): audit/evidence tests exit 0, 27 tests in 10.439s. A preceding broader targeted run passed its pilot cases but found a test expectation mismatch: record refusals can aggregate into BlockedMany; the assertion now accepts either refusal envelope and still requires only access-refused reasons and no holdout open. Temporarily removing the resolved-path guard makes all four selected read-trap regression tests fail (8 assertions/subtests); guard restored unconditionally. Full phase suite exit 0, 155 tests in 253.872s, OK. Logs: /tmp/s20-f3-audit-tests.log, /tmp/s20-f3-negative-control.log, /tmp/s20-f3-full-tests.log. git diff --check and the final acceptance-state invocation passed. All tests use synthetic holdout traps, never real holdout images.

## Triage Summary

- Fixed: F1, F2, F3 (3).
- Pending findings: none. The original review verdict above describes the recorded commit; triage fixes remain uncommitted and carried.
- Manual acceptance: 4.2 and 4.3 remain pending. No Manual rows were reopened or confirmed.
