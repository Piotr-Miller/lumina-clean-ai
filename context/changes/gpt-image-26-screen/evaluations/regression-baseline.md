# Regression baseline — S-19 and S-20 suites (Linux host)

Plan Phase 2, item 5. Every result below comes from `scripts/gpt26/regression.py`, which runs the
suite in a detached, disposable worktree of the named commit (cleaned up afterwards). The
command is always `TMPDIR=/tmp python3 -B -m unittest discover -s scripts/<suite>/tests`. No
earlier green host checkout stands in for these results.

## Environment (2026-11-17)

| Item              | Value                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host              | Linux 7.3.4-300.fc45.x86_64 (Fedora), the owner's host with the private corpus                                                                                                                                  |
| Python            | 3.15.2 (`/usr/bin/python3`)                                                                                                                                                                                     |
| Pillow            | 12.3.0                                                                                                                                                                                                          |
| NumPy             | 2.5.4                                                                                                                                                                                                           |
| OpenCV            | 4.13.0 (`cv2.__version__`; distro package, no pip metadata)                                                                                                                                                     |
| scikit-image      | 0.26.0                                                                                                                                                                                                          |
| PyWavelets        | 1.8.0                                                                                                                                                                                                           |
| Node dependencies | live `node_modules` linked into the worktree; `package-lock.json` sha256 `120849f1603f584d1275797b809201f09960ac95fdc4adf97c913b57ef1896a6`, byte-identical at every revision below (owner decision 2026-11-17) |

## Pre-hook revision

`1a8ae5698d3156a195be022f7f1b2d17f6bd30e0` (`fix(gpt-image-26-screen): phase-1 review fixes F1, F2`),
captured before any Phase 2 edit to `scripts/s19/`.

### S-19 — PASS

`python3 scripts/gpt26/regression.py --suite s19 --revision 1a8ae5698d3156a195be022f7f1b2d17f6bd30e0`

- Result: `Ran 85 tests`, `OK`; exit **0**.
- The first run, without `node_modules` in the worktree, exited 1 with 5 failures and 7 errors.
  All 12 failed for one reason: `npx --no-install tsx` (curve and auto-params tests) and prettier
  (spike index) were unavailable ("npx canceled due to missing packages"). That run is not a
  baseline. It is the reason for the lockfile-checked link.

### S-20 — FAIL (recorded; decided in Phase 3)

`python3 scripts/gpt26/regression.py --suite s20 --revision 1a8ae5698d3156a195be022f7f1b2d17f6bd30e0`

Fixture overlay, read from the archive blobs at that revision and verified as byte-identical:

| Archive blob → legacy path (`context/changes/cloud-classical-denoise/…`) | sha256                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `change.md`                                                              | `19a80e39d8f2af7c2d0b5877c34099f07bdaac04a936e88333afd6d68e06acfb` |
| `evaluations/pilot-result.json`                                          | `66208eeddfa9e749c2792a65b537f691d5370a4abf4b7efa0734f2dc2c034c71` |
| `evaluations/step1-gate.json`                                            | `4b94fe707d3fdf4f2f7d6a4ab9201e0bd44968d21fd0ee92318a8fbd83a413c5` |
| `evaluations/step1-calibration.md`                                       | `2f359b79748f7493fdaed07080e762035384e3f2123b4da8ee20535b8811fc21` |

- Result: `Ran 285 tests`, `FAILED (failures=1, errors=56, skipped=4)`; exit **1**.
- Cause of 56 errors and the 1 failure (`test_gate.PublishKeepTest.test_the_printed_round_trip_commands_work`):
  `scripts/s20/blind.py` `committed_bind()` reads `step1-calibration.md` with `git show HEAD:<path>`.
  The overlay puts it on disk but not in `HEAD` ("exists on disk, but not in 'HEAD'"). Most
  errors are in `test_blind` and `test_pilot`. Full output was in `/tmp/gpt26-regression-s20-1a8ae5698d31.log`
  (host-local, not kept).
- One further error: a test needs `evaluations/step1-premise.md`, which is not in the overlay.
- **The four-file overlay is insufficient** (plan Phase 2 item 5: "stop and report"). Criterion
  3.2 does not run until the owner decides the remedy in Phase 3 (owner decision 2026-11-17).
  Nothing was suppressed.

## Candidate revision

`d69ec557e0b93576b8337220f15adc53013f07ef` (`feat(gpt-image-26-screen): Runner for this screen (p2)`),
the committed Phase 2 hooks in `scripts/s19/run-candidate.py`.

### S-19 — PASS

`python3 scripts/gpt26/regression.py --suite s19 --revision HEAD` (HEAD = `d69ec55`)

- Result: `Ran 85 tests`, `OK`; exit **0**, in the same environment and with the same lockfile as
  the pre-hook run.
- The historical pins were unchanged before and after the hook edits. That covers
  `scripts/s19/inputs.py`, `scripts/s19/configs/*.json` and `scripts/s19/series/*.json`, compared
  by sha256.

S-20 was not rerun at the candidate. Phase 2 does not touch `scripts/s20/`, and its criterion
3.2 waits on the Phase 3 overlay decision.

## Review-fix revision

`b8d1bae2673330046fcaf52174352ecfa76e80ac` (`fix(gpt-image-26-screen): phase-2 review fixes F1–F3`),
which changes `scripts/s19/run-candidate.py` and `scripts/s19/protocol.py` again after the candidate
above.

### S-19 — PASS (2026-11-20)

`python3 scripts/gpt26/regression.py --suite s19 --revision HEAD` (HEAD = `b8d1bae`)

- Result: `Ran 85 tests`, `OK`; exit **0**, in the same environment and with the same lockfile.
- `scripts/s19/inputs.py`, `scripts/s19/configs/` and `scripts/s19/series/` are unchanged against
  the pre-hook revision (`git diff --quiet 1a8ae56 b8d1bae -- …` exit 0).

## Phase 3 — S-20 with the overlay commit (2026-11-20)

The S-20 remedy of the owner decision 2026-11-18: `scripts/gpt26/regression.py` restores five
metadata files (the four above plus `evaluations/step1-premise.md`) from the archive blobs of the
tested revision and makes ONE disposable overlay commit in the detached worktree, its parent the
tested revision, changing exactly those five paths. The overlay commit is never merged, pushed or
referenced by a branch; it disappears with the worktree. Same environment and lockfile as above.

| Archive blob → legacy path (`context/changes/cloud-classical-denoise/…`) | sha256                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `change.md`                                                              | `19a80e39d8f2af7c2d0b5877c34099f07bdaac04a936e88333afd6d68e06acfb` |
| `evaluations/pilot-result.json`                                          | `66208eeddfa9e749c2792a65b537f691d5370a4abf4b7efa0734f2dc2c034c71` |
| `evaluations/step1-gate.json`                                            | `4b94fe707d3fdf4f2f7d6a4ab9201e0bd44968d21fd0ee92318a8fbd83a413c5` |
| `evaluations/step1-calibration.md`                                       | `2f359b79748f7493fdaed07080e762035384e3f2123b4da8ee20535b8811fc21` |
| `evaluations/step1-premise.md`                                           | `0d13704b1b9ebd3ae9b4252b19ee29e9a052d25cf9a83e606362871ed2fb9dbe` |

The hashes are identical at both revisions below.

### Pre-hook revision — S-20 PASS

`python3 scripts/gpt26/regression.py --suite s20 --revision 1a8ae5698d3156a195be022f7f1b2d17f6bd30e0`

- Overlay commit `2ed062f81cd72f9c5443a377f4bc6f60352d2ef4`, parent `1a8ae5698d3156a195be022f7f1b2d17f6bd30e0`,
  changes exactly the five fixture paths.
- Result: `Ran 326 tests`, `OK (skipped=4)`; exit **0**. The harness ran from the working tree, with
  `scripts/gpt26/regression.py` byte-identical to the one committed in `624ed60`.

### Candidate revision — S-20 PASS

`python3 scripts/gpt26/regression.py --suite s20 --revision HEAD` (HEAD = `624ed607560e10741efeb6864294055e487220bb`,
`feat(gpt-image-26-screen): Blind set builder and gate rule (p3)`)

- Overlay commit `baec923680c6103f951724ddebf1d7bd961664eb`, parent `624ed607560e10741efeb6864294055e487220bb`,
  changes exactly the five fixture paths.
- Result: `Ran 326 tests`, `OK (skipped=4)`; exit **0**.

The four skips are the suite's own static `unittest.skip(IN_PROCESS)` markers
(`scripts/s20/tests/test_blind.py:530-536`), present at both revisions; nothing was skipped or
suppressed by the harness. The red run above counted 285 tests; that count is not compared or
analysed here.

### Review-fix revision — S-20 PASS

`python3 -B scripts/gpt26/regression.py --suite s20 --revision HEAD` (HEAD = `1a272717ff5d9393481900ef8c61d3c9f463116f`,
`fix(gpt-image-26-screen): Phase-3 review fixes F1–F2 (p3)`), run 2026-11-21 after the phase-3
implementation review.

- Overlay commit `dab0fbe0173145e89a67305b72f4f9ecf0366cb7`, parent `1a272717ff5d9393481900ef8c61d3c9f463116f`,
  changes exactly the five fixture paths.
- Result: `Ran 326 tests`, `OK (skipped=4)`; exit **0**. The same four static skips.
