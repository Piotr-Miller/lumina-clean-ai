# Regression baseline — GPT26 and S-19 suites (Linux host)

Plan Phase 1, rows 1.1 and 1.3. The S-19 result comes from `scripts/gpt26/regression.py`, which
runs the suite in a detached, disposable worktree of the named commit and removes it afterwards.
The GPT26 suite runs in the live checkout:
`TMPDIR=/tmp python3 -B -m unittest discover -s scripts/gpt26/tests`.

## Environment (2026-11-24)

| Item              | Value                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host              | Linux 7.3.4-300.fc45.x86_64 (Fedora), the owner's host with the private corpus                                                                                                  |
| Python            | 3.15.2 (`/usr/bin/python3`)                                                                                                                                                     |
| Pillow            | 12.3.0                                                                                                                                                                          |
| NumPy             | **2.5.5** — the screen's baseline recorded 2.5.4; accepted by owner decision 2026-11-24 (`change.md` § Owner decisions)                                                         |
| OpenCV            | 4.13.0 (`cv2.__version__`; distro package, no pip metadata)                                                                                                                     |
| scikit-image      | 0.26.0                                                                                                                                                                          |
| PyWavelets        | 1.8.0                                                                                                                                                                           |
| Node dependencies | live `node_modules` linked into the worktree; `package-lock.json` sha256 `120849f1603f584d1275797b809201f09960ac95fdc4adf97c913b57ef1896a6`, identical to the screen's baseline |

Compared against `context/archive/2026-11-05-gpt-image-26-screen/evaluations/regression-baseline.md`
(read only). NumPy is the only difference.

## GPT26 suite

- **Before Phase 1** (HEAD `7387271c79813b6c2922588adb3f74a6f8286947`, clean tree): `Ran 130 tests`,
  `FAILED (errors=65)`; exit **1**. All 65 errors were `FileNotFoundError` for
  `context/changes/gpt-image-26-screen/references/compare-gpt26.html`, the screen viewer that moved
  into the archive. This is the hard-wired path Phase 1 removes.
- **After Phase 1** (working tree of the phase commit): `Ran 180 tests`, `OK`; exit **0**.

## S-19 suite

`python3 scripts/gpt26/regression.py --suite s19 --rev HEAD` (HEAD = `7387271c79813b6c2922588adb3f74a6f8286947`,
run as the phase gate before the phase commit)

- Result: `Ran 85 tests`, `OK`; exit **0**.
- Phase 1 changes nothing under `scripts/s19/` or `scripts/s20/`
  (`git diff --quiet HEAD -- scripts/s19 scripts/s20` exit 0), and the S-19 suite reads no
  `scripts/gpt26/` file (the only mentions in `scripts/s19/` are two comments in
  `run-candidate.py`). The gate run therefore covers the same S-19 bytes as the candidate commit.

### At the candidate commit

`python3 scripts/gpt26/regression.py --suite s19 --rev HEAD` (HEAD = `3bce55e3a3f5cebae0849285802f9c0cb79e2e60`,
`feat(gpt-image-26-wider): Study-driven GPT26 tooling (p1)`), run right after the phase commit.

- Result: `Ran 85 tests`, `OK`; exit **0**, in the same environment and with the same lockfile.
- That SHA is a branch commit and will be rewritten at merge (lesson 279); the result is tied to
  the bytes it tested, which the line above shows to be unchanged for S-19.

## Review-fix revision (2026-12-04)

The phase-1 review fixes (`fix(gpt-image-26-wider): Phase-1 review fixes F1–F6 (p1)`) change
`scripts/s19/run-candidate.py`: an optional `write_guard` on the S-19 run context, off by default,
which only GPT26 sets (finding F2). The statement above that Phase 1 changes nothing under
`scripts/s19/` therefore holds for `3bce55e` only, not for the final Phase 1 state.

`python3 -B scripts/gpt26/regression.py --suite s19 --rev HEAD` (HEAD = `49341050e68cf819bb30863b0b70e896a5498f08`)

- Result: `Ran 85 tests`, `OK`; exit **0**, in the same environment and with the same lockfile
  (NumPy 2.5.5, `package-lock.json` sha256 `120849f1…`).
- The GPT26 suite in the working tree of that commit: `Ran 190 tests`, `OK`; exit **0**.
- S-20 code imports nothing from `scripts/s19/run-candidate.py`, so the S-20 suite is not affected.
