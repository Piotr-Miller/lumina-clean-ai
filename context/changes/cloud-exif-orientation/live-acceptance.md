# Live acceptance: Cloud EXIF orientation

Production check of the Phase 1–2 fix, run once on an orientation-6 phone photo (S17-06) and once
on an orientation-1 control. Text only, no screenshots (plan § What We're NOT Doing).

## Deployed revision

- **Master commit**: `53f5178d424a2adf585eddf118f8c6fea3052767`, the head of PR #313 after the
  rebase-merge (2026-10-25 16:24:31 UTC). The branch SHAs cited in `plan.md` Progress were
  rewritten by that merge: `65a8548` → `687e436` (p1), `d81db0d` → `c112198` (p2).
- **PR checks** (#313): `ci`, `integration`, `e2e` and `code-reviewer` passed. Advisory
  `ai-review` passed (`ai-cr:passed`), and its implementation review was APPROVED.
- **Master run** `40211523214` at `53f5178`: `ci`, `integration`, `e2e` and `code-reviewer`
  passed, and `deploy` succeeded at 16:31:14 UTC. `deploy-skipped-alarm` was skipped, as it
  should be when no gate fails.
- **Bundle**: `https://luminacleanai.com/_astro/EnhanceWorkspace.fWz-JT1f.js` contains
  `Couldn't prepare this photo for Cloud AI`. It also contains strings that exist only in the new
  code: `couldn't read the EXIF orientation` (the upload path's warning) and
  `orientation tag has component count` (the Phase 1 review fix F1).

## Check

- **Date of the check**: 2026-10-25 (confirmed by the owner). Both jobs were created after the
  deploy finished.
- **Who checked what**: the owner looked at BEFORE and AFTER in the app and at the control. The
  agent read the job rows (read-only Management API query against the production project,
  unlinked again afterwards) and measured the downloaded S17-06 file.

| Photo                                                                 | EXIF tag | Job id                                 | Created → succeeded (UTC) | Parameters                       |
| --------------------------------------------------------------------- | -------- | -------------------------------------- | ------------------------- | -------------------------------- |
| S17-06 `06-phone-rain-galaxys24ultra.jpg` (stored 5712 × 4284)        | 6        | `e3df6cc5-d22a-41d9-ad13-d4752a51a8c4` | 16:57:00 → 16:59:26       | gamma 1, strength 0.05           |
| Control `05-phone-walgreens-pixel7.jpg` (stored portrait 3072 × 4080) | 1        | `85ea0fef-a1f5-4055-be09-9a98a5647283` | 17:01:02 → 17:03:31       | gamma 1.5, strength 0.133 (Auto) |

These were the only two production jobs created after the deploy.

### S17-06 (orientation 6)

- **BEFORE and AFTER**: both upright portrait in the slider (owner).
- **Downloaded file**: `luminaclean-06-phone-rain-galaxys24ultra.jpg`, a 1152 × 1536 JPEG with no
  orientation tag. Its timestamp, 17:00 UTC, falls between this job's completion and the control's
  creation. The full frame is upright: sky at the top, street and parked cars at the bottom, with
  nothing on its side (agent). The plan expected about 1152 × 1536.
- **Result**: pass. Before the fix, S-17's direct probe on the same photo returned a sideways
  1536 × 1152 landscape (`context/archive/2026-08-31-cloud-quality-below-local/calibration.md:244-260`).

### Control (orientation 1)

- **Orientation and aspect**: unchanged, upright portrait (owner).
- **Job mapping**: by elimination. It is the second of the two post-deploy jobs, and no file was
  downloaded for it.
- **Result**: pass.

## Not assessed here

Image quality (exposure, noise) is not part of this check. It belongs to S-19
(`cloud-model-comparison`).
