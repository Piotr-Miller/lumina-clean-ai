<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Calibrate Cloud Auto exposure and verify quality against Local

- **Plan**: context/changes/cloud-quality-below-local/plan.md
- **Scope**: Phase 1 of 7
- **Base**: b3746971c81d604031d5b1c817b497379c31b0b5 (previous-phase boundary)
- **Head**: c46c3714c591a9d67e1154fc2d67f081aaae3113
- **Worktree**: excluded (uncommitted `.claude/settings.local.json`)
- **Checks ran at**: c46c3714c591a9d67e1154fc2d67f081aaae3113 (current HEAD)
- **Manual acceptance**: 3 of 3 confirmed — 1.6, 1.7, 1.8
- **Date**: 2026-09-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Upload cleanup can discard a successful result

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/spikes/bread-spike.ts:135
- **Detail**: `deleteUpload` runs before `saveOutput`. It handles a non-2xx response but not a rejected `fetch`; a transient network failure during DELETE aborts the script after a paid prediction succeeds, before the raw bytes, SHA-256, and sidecar are saved. Exceptions during prediction or polling also skip cleanup.
- **Fix**: Save a successful output independently of cleanup, and perform best-effort deletion in `finally` with network errors reported as warnings.
- **Decision**: FIXED — `main` now runs the prediction inside `try`/`finally`. The output is saved before best-effort cleanup, and a rejected DELETE is logged as a warning that states the consequence. A failed create sets `exitCode` instead of exiting, so cleanup still runs. The 1.4 bogus-token regression still exits 1 with `HTTP 401`.

### F2 — A changed tuning baseline can receive a passing comparison

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s17/desktop-stats.ts:73
- **Detail**: The default desktop baseline is the authoritative tuning source and its SHA-256 is pinned in the plan. `--compare` only warns when that hash differs, then can exit 0 against the substituted baseline. The current private baseline does match the recorded hash; the guard is defective on a future mismatch.
- **Fix**: Exit nonzero before comparison when the default baseline's hash differs from the pinned hash.
- **Decision**: FIXED — `--compare` exits 1 before comparing when the default baseline's sha256 differs from `BASELINE_SHA256`. It also exits 1 with a clear message when the baseline file is missing (found during triage). Verified: appending one byte to the baseline gave exit 1; after restoring, the sha256 is `088fc3f1…` again.

### F3 — Browser diagnostic can stamp changed image bytes with the frozen hash

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/s17/browser-stats.ts:102
- **Detail**: The script checks the offline JSON's `input_sha256` against the manifest, but serves the photo's current bytes without hashing them. If a photo changed after offline decoding, the browser sample would still be written with the manifest SHA, misleading the three-way comparison. `desktop-stats.ts` checks the bytes it serves.
- **Fix**: Hash each current photo before sampling and stop if it differs from the manifest.
- **Decision**: FIXED — `browser-stats.ts` hashes every photo it will serve against the manifest before launching the browser, and serves those same bytes. Verified: a full run over the six photos reported no hash error.

### F4 — Desktop comparison misses small Auto changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/s17/desktop-stats.ts:65
- **Detail**: The plan says `--compare` exits 2 if any Auto value changes. `autoLine()` rounds gamma and strength to two decimals and Local blur to one, and `compare()` bases its exit code on those formatted strings. A real smaller change can exit 0 as “same Auto.”
- **Fix**: Compare the numeric recommendation fields for the exit decision; round only when printing them.
- **Decision**: FIXED — the exit decision compares the unrounded `recommendParams` numbers. Rounding happens only for display, and a change below display precision is labelled as such. Verified: S17-01 p50 +0.0001 gives exit 2 (`CHANGED (below display precision)`); the visible-tab download still gives exit 0.

### F5 — Progress claims exact sampler parity that the plan disproves

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/cloud-quality-below-local/plan.md:676
- **Detail**: Checked row 1.6 says full `LumaStats` and Auto values “match the browser on all six,” while the Phase 1 decision records 18/60 offline and 34/60 headless differing stats fields and one headless Local gamma difference. The revised manual criterion is a documented comparison with desktop as the tuning source, which appears to have been met; the checked row still asserts the superseded criterion.
- **Fix**: Keep the immutable Progress title, but add an explicit Phase 1 note that its exact-parity wording was superseded and the checked mark confirms the revised comparison criterion; link that note from the row without replacing its title.
- **Decision**: FIXED (adapted) — the Phase 1 decision note now states that the 1.6 Progress title is superseded and that its `[x]` confirms the revised comparison criterion. The row itself is unchanged: `progress-format.md` makes titles immutable and allows no prose or links in Progress, so the note is not linked from the row.

## Review Notes

- **Bookkeeping in diff**: context/changes/cloud-quality-below-local/plan.md
- The phase boundary includes six Phase 1 commits, ending with the live-run record. No product code or prohibited benchmark material changed.
- Applicable lessons: 34 of 37 entries. The evidence-premise and human-readable-check lessons were most relevant.
- Automated 1.1: `npm run typecheck` passed (exit 0).
- Automated 1.2: `npm run lint` passed (exit 0; 83 warnings, 0 errors).
- Automated 1.3: `npm run test:unit` passed (31 files, 418 tests).
- Automated 1.4: bogus-token run on S17-01 used the 6.9 MB upload path and exited 1 with `HTTP 401 {"detail":"Invalid token"}`. The initial sandbox run could not start `tsx` because its IPC pipe was denied; the outside-sandbox rerun exercised the upload path.
- Automated 1.5: `sha256sum -c test-photos/s17-benchmark.sha256` passed for the manifest and all 18 photos.
- Manual 1.7 evidence checked locally: the private output PNG hashes to `edec533050106489b96ea503980ed557149d53e3ea7eda50f5752b53d69a097c`, matching its sidecar and the plan. Rows 1.6 and 1.8 rely on the recorded desktop comparison and maintainer acceptance.
- Mutation check skipped: Phase 1 changed measurement scripts and bookkeeping, not code behind a risk in `context/foundation/test-plan.md` §2.
