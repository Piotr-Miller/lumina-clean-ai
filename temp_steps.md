# temp_steps.md — immediate next steps

> Rewritten 2026-09-26, replacing the 2026-09-24 list, whose steps are all done or superseded.
> **Short-lived by design**: this is the next-few-actions list. `temp_queue.md` holds the wider
> backlog (and is itself stale — see step 5); `context/foundation/roadmap.md` stays authoritative
> for what the project is building. Delete this file once the list is empty.

## Where things stand

Everything is merged. **Zero open PRs** after the one carrying this file.

**S-17 was reframed on 2026-09-26** (#255–#263). The green→magenta diagnosis is withdrawn: the three
web test photos already carry the cast in their shadows, the byte-proven aurora input explains 98.1 %
of its output magenta, and a Local-engine approximation shows the same cast. **Bread stays.** S-17 is
now _calibrate Cloud Auto exposure and verify quality against Local_ — status `ready`, issue #203.
The confirmed defect is overexposure at Auto's 1.50 / 0.1216 on one licensed photo (77.6 % of pixels
at V ≥ 0.90); gamma and strength moved together, so it is not attributed to gamma alone. Evidence and
limits: `context/changes/cloud-quality-below-local/defaults-experiment.md`.

Tools that now exist for this work:

- `scripts/spikes/bread-spike.ts` calls Bread directly on a local file, **with no daily cap**, and
  saves the raw output with its sha256. It is byte-equivalent to the app path (calibrated on
  `04e57d16`). Needs your own `REPLICATE_API_TOKEN`; keep it local.
- `scripts/measure-hue-shares.py` measures hue shares with its method fixed in the docstring.
- `test-photos/licensed/` has three CC/CC0 aurora scenes (`01`–`03`); `test-photos/private/` holds the
  three capturetheatlas sources (`ALL RIGHTS RESERVED`, never commit) and the 896 px run copies.

## Steps

1. **Define S-17's quality bar before any tuning.** What counts as "not washed out" (e.g. a ceiling
   on the share of pixels at V ≥ 0.90 or with a clipped channel), and how Cloud is compared with
   Local (same inputs, matched display scale). `change.md` requires this first.

2. **Plan S-17** with `/rune-plan` on `cloud-quality-below-local`, once step 1 is decided: a bounded
   Auto calibration plus the representative Cloud/Local quality gate.

3. **Review `references/01`–`07`.** AGENTS.md § Evidence images (#258) names them as derivatives of
   `ALL RIGHTS RESERVED` material awaiting a separate review; the rule does not approve them
   retroactively. Decide keep, remove, or assess a specific basis.

4. **Decide on the two parked changes.** `cloud-error-message-leak` has its framing written and can go
   straight to `/rune-plan` (invert `deriveDisplayError`'s default; map the codes with no copy).
   `finder-serialization-outage`: `ai-review` still fails with `AI_NoObjectGeneratedError` on every
   PR, most recently #255 — registration (roadmap entry, issue, `github-issues.md` row) is still
   undone.

5. **Refresh or retire `temp_queue.md`.** Its recommended option A ("Run A settles S-17") is done and
   did not settle it the way it expected, and option C's evidence is stale.
