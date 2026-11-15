<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-20 Step 1 (1a: NLM) — Classical Denoise vs No-Denoise Control

- **Plan**: context/changes/cloud-classical-denoise/plan.md
- **Scope**: Phase 0 (phases 0–6)
- **Session**: fresh
- **Base**: 8b37ef8b0b013c545ddca68a947b5480fae95601 (merge-base; also Phase 0 commit parent)
- **Head**: 595c87ab2ae5658389ba4ca64e17660b4b70b016
- **Worktree**: included(context/changes/cloud-classical-denoise/plan.md)
- **Checks ran at**: 595c87ab2ae5658389ba4ca64e17660b4b70b016, with the listed worktree progress/acceptance updates
- **Manual acceptance**: 2 of 2 confirmed (0.3, 0.4 current)
- **Date**: 2026-11-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

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

### F1 — The measurement script omits two concrete paths from its guards

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/cloud-classical-denoise/evaluations/step1-premise.md:130
- **Detail**: The plan's Critical Implementation Details require `check_paths` before reading or stating any image-bearing record, explicitly including the Phase 0 probe. `timed()` guards only `common` and `target`, then reads `inputs/S17-06.json` at line 131 without guarding it. A tuning-named sidecar symlink to a validation-named record therefore reaches `read_text` instead of being refused. A synthetic read trap reproduced this before opening any holdout bytes or rendering an image; explicitly passing that same synthetic sidecar to `check_paths` refuses it. The sibling `facts()` correctly guards its ordinary records, but omits `ARCH / "S17-01.jpg"` from its path list before calling `.exists()` at line 115. The record's blanket assertion that every concrete path was guarded is consequently too strong. The current metadata and baseline checks reproduced successfully; this finding does not establish actual holdout access or invalidate the measured dimensions/hashes.
- **Fix**: Append an erratum preserving the original script and its recorded checksum, provide a corrected replay that guards the timing sidecar and the archive-absence path before access, and record a guarded metadata recheck plus synthetic refusal check. Do not repeat the one-render exception to correct this documentation.
- **Decision**: FIXED — appended an erratum and checksum-verified guarded replay, with guarded facts and synthetic refusal checks; siblings: `facts()` archive-absence path fixed in the replay, `scripts/s19/viewer-inputs.py` n/a (guards derived record paths before reading), no other Phase 0 probe copy found in the active change or `scripts/s19` (`scripts/s20` does not exist yet); reopened: 0.3, 0.4.

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-classical-denoise/change.md, context/changes/cloud-classical-denoise/evaluations/step1-premise.md, context/changes/cloud-classical-denoise/plan-brief.md, context/changes/cloud-classical-denoise/plan.md, context/changes/cloud-classical-denoise/reviews/plan-review.md, context/foundation/roadmap.md.
- **Excluded local change**: temp_steps.md, an unrelated local planning/status edit. The included plan edit only adds Phase 0 commit suffixes and the two acceptance revisions.
- **Progress**: 0.1 and 0.2 carry the reachable Phase 0 commit; phases 1–6 remain pending and are outside this review. Both Phase 0 Manual rows are `current` according to `bash .agents/skills/rune-impl-review/scripts/acceptance-state.sh context/changes/cloud-classical-denoise/plan.md` (exit 0). There are no Phase 0 n/a or paid rows.
- **Lessons**: 35 of 39 ledger entries apply to the implementation-review stage and were read. The relevant priors were measuring premises before building, distinguishing verified evidence from assertions, and checking status pointers.
- **0.1 verification**: `python3 -I -c "import cv2, numpy; print(cv2.__version__)"` — exit 0; stdout `4.13.0`.
- **0.2 verification**: `python3 -B scripts/s19/protocol.py check-access --ids S17-01 S17-02 S17-03 S17-04 S17-05 S17-06 S17-07 S17-21` — exit 0; stdout `{"allowed": ["S17-01", "S17-02", "S17-03", "S17-04", "S17-05", "S17-06", "S17-07", "S17-21"]}`.
- **Additional evidence verification**: a scratch Python invocation extracted the appendix, verified its SHA-256 as `0ab3647bfd6759f283a860646aadbd30a9da742e35e64d95e2ede770d3c2f6e0`, and ran `facts()` with a reviewer preflight guard for the otherwise omitted archive-absence path. Exit 0: dimensions and common-file bindings 8/8, published Local hashes 7/7, parsed Auto records 8/8, exact S17-01 private hash matching the record, and archived S17-01 JPEG absent. Every reported Auto dimension and absence of EXIF orientation was also asserted. No images were displayed or published.
- **F1 reproduction**: the same invocation used a temporary synthetic sidecar symlink and intercepted `Path.read_text` before the open. Output: `Concrete path guard refuses synthetic sidecar symlink as expected.` followed by `Timing-script reproduction: unguarded sidecar read reached the trap; no holdout bytes read, no image decode or render.` This is an ad hoc review probe, not a new repository test.
- **Timing limit**: the recorded 13.31 s measurement was inspected against the exact appendix and its declared 10/10, 7/21 parameters; it was not rerun. Deletion without viewing is a historical execution assertion, not something this checkout can independently establish. The record explicitly excludes product latency and cold-start claims.
- **Formatting**: `npx prettier --check context/changes/cloud-classical-denoise/evaluations/step1-premise.md` — exit 0; `All matched files use Prettier code style!`.
- **Patterns and scope**: compared the record-path guarding with `scripts/s19/viewer-inputs.py` and `scripts/s19/protocol.py`. No production code, archive file, image bytes, paid call, holdout render, or later-phase implementation is in the reviewed diff. The plan, brief and prior plan review were adopted planning records, not missing later-phase work.
- **Mutation check**: skipped. Phase 0's offline premise measurements do not touch the behaviors behind risks 1–6 in `context/foundation/test-plan.md` §2 / Risk Response Guidance (cloud stall, auth gating, daily cap, IDOR, retention, watchdog). No mapped application risk module changed.
- **Disposition**: APPROVED with one minor warning under the skill's verdict rule; no failing automated checks. No implementation fix or Progress edit was made by this review. The phase review leaves `change.md.status` as `implementing` and stamps `updated: 2026-11-05` (already its value). Report and stamp are left uncommitted and recorded in the carry ledger.

## Triage (2026-11-05)

- **F1**: owner chose Fix now. The original measurement script and its checksum were preserved. The appended replay fixes both omitted guard paths in memory and runs only `facts()`.
- **Verification**: documented replay exit 0; dimensions/common bindings 8/8, published Local hashes 7/7, parsed Auto records 8/8, S17-01 full hash and archive absence verified. Historical appendix hash unchanged; corrected script hash `1624de556d4bbf51fe04fe728bca6da72b63c8f51ccdba535116d38f1f62a149`.
- **Synthetic checks**: corrected timing-sidecar symlink refused before read/decode/filter; corrected archive-absence symlink refused before `.exists()` or image metadata access. Both passed; no extra render or holdout-byte read.
- **Acceptance reopening**: after the premise edit, `acceptance-state.sh` exited 0 and marked 0.3 and 0.4 `stale`, both naming the edited premise record. Both rows were reopened with their suffixes removed and the former acceptance revisions recorded in `change.md`. Row 0.3 uses the Phase 0 fallback surface, so it covers the premise record even though OpenCV remains installed. Neither row has been re-confirmed.
- **Current worktree acceptance**: 0 of 2 confirmed — pending: 0.3, 0.4. The report header and verdict above retain the original reviewed-revision evidence; this triage section records subsequent edits.
- **Final checks**: Prettier check passed for the premise, plan, change record and report; `git diff --check` passed. The historical appendix checksum was rechecked after formatting. The acceptance script exited 0 with both reopened rows `pending`.
- **Outcome**: triage complete; fixed F1, no pending findings. The premise, plan, change record and review remain uncommitted and carried for the next workflow commit. Commit them together before asking for acceptance through `$rune-implement cloud-classical-denoise phase 0`.
