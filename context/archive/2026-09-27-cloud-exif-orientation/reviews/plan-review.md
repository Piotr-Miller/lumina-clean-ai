<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Cloud EXIF Orientation

- **Plan**: context/changes/cloud-exif-orientation/plan.md
- **Mode**: Deep
- **Date**: 2026-10-25
- **Plan sha256**: 3dd214a5fe474b304279c5e63034735c40867f994f781984cae4725279020cc7
- **Plan sha256 after triage**: 00b47181b38aa632059cc958d9e388e795f279deb857081c789bd8638af2650b
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | PASS    |
| End-State Alignment    | WARNING |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

## Grounding

14/14 implementation paths valid or planned creations; callers and shared helpers verified; brief matches plan; all four recorded command statuses reproduced. `npm run test:unit` passed (418 tests), `npm run typecheck` passed, and `npm run lint` exited 0 with 86 existing warnings. The exact stale-pointer command exited 0 as recorded, but matched only two pointers; see F3. Progress has matching phases and verification rows, and its five Manual rows are pending. Lessons: 29/39 entries applied to this review.

Definitions: five product/user policy definitions and one unchanged code contract (Download); no unresolved requirement definition found. Ranking, deduplication and tie-breaking walkthroughs do not apply to this mechanical image transformation. An independent metadata-boundary experiment is recorded in F1.

The preparation-before-admission approach fits the existing code: `submitCloudJob` has one app caller (`useCloudSubmit.ts:53`), which already surfaces thrown messages. Its POST precedes PUT (`cloud-upload.client.ts:76-91`), and `admit_cloud_job` genuinely serializes admission through a transaction-scoped advisory lock. The canvas helper is reusable without module-level DOM effects; RGBA recovery is its only app caller. Source dimensions already come from browser decoding (`EnhanceWorkspace.tsx:135-141`), and the result panes and download share the Cloud result bytes (`useCloudJob.ts:356-398`). No downstream rotation changes are needed. The observe-PUT spec needs no fixture server; CI disables the real pipeline.

## Findings

### F1 — The header window silently misses readable orientation tags

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Critical Implementation Details — Detector window; Phase 1 — Orientation detector
- **Detail**: The plan treats “Exif not found within the window” as absent. A local synthetic JPEG (80 × 40 stored pixels, orientation 6, red top-left marker) with five maximum-length APP2 segments before its Exif segment placed the Exif identifier at byte 327,709, beyond the proposed 256 KiB window. Chromium still displayed and drew it upright at 40 × 80, with the red marker in the top-right. The planned detector would upload its original 80 × 40 pixels silently, preserving the defect. The 64 KiB limit bounds an individual segment, not the entire metadata region ([ExifTool documentation](https://exiftool.org/writing.html)). The experiment used generated files under `/tmp/`; no repository photographs or evidence images were added.
- **Fix**: Walk segment headers using bounded file slices until Exif, SOS or EOI; read the relevant Exif segment fully. Add the late-Exif case to the tests.
  - Strength: Covers browser-readable tags without decoding unaffected photos.
  - Tradeoff: More involved file reading than one prefix read.
  - Confidence: HIGH — reproduced locally in Chromium.
  - Blind spot: No census of how frequently real inputs use this layout.
- **Decision**: FIXED — proposed fix; edited: Definitions, Implementation Approach, Critical Implementation Details — Detector traversal, Phase 1 — Orientation detector / Pre-POST preparation / Unit tests, Testing Strategy — Unit Tests, Performance Considerations; synced plan-brief.md Architecture / Approach and Open Risks & Assumptions; reopened: none

### F2 — Request capture does not establish upload completion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — PUT-body spec
- **Detail**: `page.waitForRequest` proves dispatch, not acceptance by Storage. The planned pixel assertions could pass after a rejected PUT, or cleanup could run before the upload finishes and leave an object behind. Existing north-star coverage waits for the processing state specifically to establish that submission settled (`tests/e2e/north-star-cloud-result.spec.ts:165-168`).
- **Fix**: Await and assert the captured PUT’s successful response before cleanup, and ensure cleanup waits for any in-flight upload even when an assertion fails.
- **Decision**: FIXED — proposed fix; edited: Phase 2 — PUT-body spec; reopened: none

### F3 — The stale-pointer command cannot detect the roadmap pointer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Automated Verification, stale-pointer command
- **Detail**: The fixed-string pattern contains escaped backticks inside single quotes. Those backslashes become literal characters. Running the exact command finds only two pointers, despite the recorded claim that all three match. Removing those backslashes finds the roadmap prerequisite at `context/foundation/roadmap.md:339` too. As written, the final check could pass while that prerequisite remains stale.
- **Fix**: Remove the backslash escapes and use a Markdown code span that can contain literal backticks.
- **Decision**: FIXED — proposed fix; edited: Phase 3 — Automated Verification; reopened: none

## Triage Summary (2026-10-25)

- **Fixed**: F1, F2, F3 (all proposed fixes).
- **Skipped / Accepted / Dismissed**: none.
- **Verdict after fixes**: SOUND (REVISE → SOUND).
- **Verification**: The corrected pointer command exits 0 and detects all three outstanding pointers, as expected before Phase 3. All three Progress phase headings match the body, all 18 verification rows remain pending, and the acceptance-state script reports all five Manual rows pending. No acceptance rows needed reopening. `git diff --check` passes.
- **Scope**: Plan and brief corrections only; implementation and deployment have not started. The initial review and its historical verdict remain above; all finding decisions are resolved.
