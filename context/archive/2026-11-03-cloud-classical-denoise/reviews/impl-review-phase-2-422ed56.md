<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-20 Step 1 (1a: NLM) — Classical Denoise vs No-Denoise Control

- **Plan**: context/changes/cloud-classical-denoise/plan.md
- **Scope**: Phase 2 (phases 0–6)
- **Session**: fresh
- **Base**: e79b80d3 (Progress — Phase 1 commit)
- **Head**: 422ed562fec31ebf2c1f140b63132ba10e793884
- **Worktree**: excluded (only bookkeeping: plan.md Progress write-back and change.md; `temp_steps.md` is outside scope)
- **Checks ran at**: 422ed56 (HEAD; `--calibrate` ran in a temporary worktree so the committed record was not touched)
- **Manual acceptance**: 1 of 1 confirmed
- **Date**: 2026-11-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Test-only `S20_REPO` lets a real render skip the committed-rules gate, and nothing later re-checks it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/s20/evidence.py:36-37, scripts/s20/nlm.py:529-546
- **Detail**: `repo_root()` takes `S20_REPO` from the environment, and order step 2 (`require_committed_clean`, `require_calibrated`) runs against that tree. But `impl_sha` hashes the running file (`Path(__file__)`), and the output goes to `private_s20()`, which defaults to the real workspace. So `S20_REPO=<scratch repo> python3 scripts/s20/nlm.py --all` renders the eight real photos with a grid and an `nlm.py` that need not be committed in this repository. The scratch repo only has to hold committed copies plus a matching `--calibrate`. Nothing downstream catches it. `local-arms.ts nlm-gamma` (`:511-545`) copies the record's `config_sha256` without comparing it to anything and never reads `implementation_sha256`. The Phase 4 gate's binding list (plan § Phase 4 item 3) names "the frozen config" but not the implementation hash. The F1/F11 order control therefore depends on nobody setting a test variable in a real shell. The fix is cheap now, while there are zero renders. After Phase 5 renders it would mean re-rendering.
- **Fix A ⭐ Recommended**: Plan addendum for Phase 4. `pilot.py` and `gate.py` verify every NLM record's `implementation_sha256`, `config_sha256` and `opencv_version` against the bind line of the calibration record committed in this repository, and `test_gate.py` adds a case for each mismatch, reported as BLOCKED.
  - Strength: checks at the point of decision. It catches this bypass and any other path that produced a record (a hand-run, an old render), and it needs no change to `nlm.py`, so the bind, the record and the 2.4 acceptance stay valid.
  - Tradeoff: a bypassed render is caught only at pilot or gate time, after renders exist, not at render time.
  - Confidence: HIGH — the record already carries all three fields; this only adds a comparison.
  - Blind spot: the pilot is rated before `pilot.py` runs, so a bad render would cost a rating session before it is refused.
- **Fix B**: Also close it at the source. `nlm.py` refuses a real render when `S20_REPO` is set and `S20_PRIVATE` is not, and when `<root>/scripts/s20/nlm.py` does not hash to the running file.
  - Strength: refuses before any pixel is written, which matches the plan's "each step refuses" design.
  - Tradeoff: it changes `nlm.py`'s sha256, so `--calibrate` must be re-run and the record re-committed. That reopens 2.4, whose surface includes the record. It also does not cover records produced in other ways.
  - Confidence: MEDIUM — the tests always set both variables, so they keep passing, but a new test is needed.
  - Blind spot: the `S19_*` overrides in `protocol.py` have the same shape, an existing accepted pattern, and they stay open.
- **Decision**: FIXED — Fix A, widened to order step 3, which closes Fix A's blind spot: plan.md order table step 3, Phase 3 `blind.py` intent + `test_blind.py` cases, Phase 4 `pilot.py` intent, `gate.py` BLOCKED binding list and `test_gate.py` cases all verify each NLM record's `implementation_sha256`/`config_sha256`/`opencv_version` against the committed calibration bind; siblings: `blind.py` (both modes) fixed, so a bypassed render is refused before any rating; `scripts/s19/local-arms.ts` nlm-gamma n/a (its arm record names the NLM record, which `blind.py` verifies at step 3, so no unchecked path reaches a rater); `gate.py --audit` n/a (re-derives from the same metadata-only binding list); reopened: none

### F2 — The texture gate cannot fail, and the record does not say what the dark rows show

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/cloud-classical-denoise/evaluations/step1-calibration.md:47-58, 80-85
- **Detail**: The plan's texture tolerance (≤ +35 %) exists because "Immerkær is known to over-read texture as noise". The pre-registered texture (periods 16 and 24 px) is too smooth for the 3×3 kernel: on the noiseless texture alone σ̂ = 0.227 (measured at review, `nlm.immerkaer` on the 1024² fixture). The recorded bias is therefore +0.2 to +2.3 %, and the gate could not have failed at any σ. Lesson "A guard metric that only exists on success cannot detect failure" applies: this row reads "pass" without having been able to see the failure it names. Separately, the ungated rows show the regime night photos live in: near 0 under-reads σ̂_L by 47–67 %, near 255 by 31–45 %, and the dark ramp at σ 15 by 16 %. A low σ̂ gives a weaker `h` at every `k`. The Known-limit section mentions only white versus camera noise. The fixtures are pre-registered and the grid is committed, so retuning is ruled out; this is about telling the reader.
- **Fix A ⭐ Recommended**: Add a dated note to `change.md` Notes: the texture fixture measured ≈ 0.23 of noiseless σ̂, so the 0.35 gate did not test the over-read, and dark or clipped content under-reads σ̂ by up to 67 % in this record.
  - Strength: discloses the limit before the pilot, without touching `nlm.py`, the bind or the 2.4 acceptance.
  - Tradeoff: the disclosure sits beside the record instead of inside it.
  - Confidence: HIGH — the numbers are in the committed record and in one review measurement.
  - Blind spot: none significant.
- **Fix B**: Extend the record's Known-limit template in `nlm.py`, then re-calibrate and re-commit.
  - Strength: the published record speaks for itself.
  - Tradeoff: it changes `nlm.py`'s hash, so the record must be re-calibrated and re-committed and 2.4 reopens. Worth it only bundled with F1 Fix B or F3.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Decision**: FIXED — Fix A (change.md Notes, 2026-11-05 entry); siblings: none (the record and `nlm.py` stay untouched by choice; no other document interprets the calibration rows); reopened: none

### F3 — The record's "same bytes" claim depends on the machine's thread count

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s20/nlm.py:463 (record line 36)
- **Detail**: The record says "Re-running it on the same `nlm.py`, grid, OpenCV and numpy gives the same bytes", but it also prints `OpenCV threads {cv2.getNumThreads()}` (8 here), which depends on the machine's core count. On another machine the same tool rewrites the record with a diff. The bind line is unaffected, so renders are not blocked.
- **Fix**: At the next forced re-calibration (only if F1 Fix B or F2 Fix B is chosen), drop the thread-count line or add "on the same machine" to the claim. Otherwise skip it.
- **Decision**: FIXED — Fix now (thread-count line dropped from `nlm.py`'s record template; `--calibrate` re-run: PASS, only the bind's `implementation_sha256` (→ ab27728f…) and the set-up line changed, every σ̂ identical; `test_nlm.py` 25 tests pass; Prettier clean); siblings: none (grep for `getNumThreads`/`OpenCV threads` in scripts/s20/ finds no other use); reopened: 2.4

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-classical-denoise/change.md, context/changes/cloud-classical-denoise/plan.md, context/changes/cloud-classical-denoise/reviews/impl-review-phase-1-e79b80d.md, context/changes/cloud-classical-denoise/evaluations/step1-calibration.md (planned artifact, item 3)
- Lessons: 35 of 39 ledger entries apply to impl-review. The two that bear on this phase are "A guard metric that only exists on success cannot detect failure" (F2) and "A check that cannot say what it found…". Every refusal in `nlm.py` and `evidence.py` names its state, subject and way out.
- Automated: 2.1 `test_nlm.py` exit 0, 25 tests (no warnings under `-W default`). 2.2 grid assertion exit 0. 2.3 `--calibrate` exit 0 in a temporary worktree at 422ed56, with `git status` clean afterwards: the committed record reproduced byte for byte. Bind hashes equal `sha256sum` of `nlm.py` (e3b81d8d…) and `nlm-grid.json` (34f1a72b…) at HEAD.
- Cross-phase: the full S-20 suite (38 tests, including Phase 1's `test_arms.py` and the end-to-end `NlmGammaBindingTest`) and the S-19 suite pass. `formatK` (`toFixed(1)`) and `k_dir` (`:.1f`) agree on `k1.0` / `k1.5` / `k2.0`.
- `scripts/s20/evidence.py` is a Phase 4 file created early with only `require_committed_clean`. Phase 2's own order-step-2 refusal needs it, and its docstring says so. Not scope creep.
- The NLM record adds `sigma_hat_a` / `sigma_hat_b` beyond the contract: benign, and it supports the per-channel gate.
- Mutation check skipped: Stryker is configured for `src/lib/**` TypeScript, and this phase touches only offline Python tooling outside any test-plan risk.
