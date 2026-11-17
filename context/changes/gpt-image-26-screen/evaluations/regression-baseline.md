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

The Phase 2 commit, run after it landed. Results are recorded in the section below.
