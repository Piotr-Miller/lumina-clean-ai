# temp_steps.md — immediate next steps

> Refreshed 2026-09-27. **Short-lived by design**: this is the next-few-actions list.
> `temp_queue.md` holds the wider backlog (and is itself stale — see step 6);
> `context/foundation/roadmap.md` stays authoritative for what the project is building. Delete this
> file once the list is empty.

## Where things stand

Everything is merged. **Zero open PRs** after the one carrying this file.

**S-17** — _calibrate Cloud Auto exposure and verify quality against Local_ — status `ready`, issue
#203. **Bread stays.** The green→magenta diagnosis was withdrawn on 2026-09-26: the three web test
photos already carry the cast in their shadows. The confirmed defect is overexposure at Auto's
1.50 / 0.1216 on one licensed photo (77.6 % of pixels at V ≥ 0.90); gamma and strength moved
together, so it is not attributed to gamma alone. Evidence and limits:
`context/changes/cloud-quality-below-local/defaults-experiment.md`.

**Done since the last refresh:**

- The **S-17 quality bar was agreed** with the maintainer on 2026-09-26 — now recorded in
  `context/changes/cloud-quality-below-local/quality-bar.md`.
- The **benchmark is frozen** (#265): `s17-v1`, 18 inputs in `test-photos/licensed/`, **6 tuning / 12
  validation**, including faces, dark non-aurora landscapes and full-size phone JPEGs. All three
  previously used auroras sit in tuning. Manifest `test-photos/s17-benchmark.json`, hashes
  `test-photos/s17-benchmark.sha256` (verify before runs), gallery `test-photos/s17-gallery.html`,
  selection notes `context/changes/cloud-quality-below-local/photo-candidates.md`. All 15 Commons
  files were checked against the Commons API: byte-identical to the originals, author and licence
  match.
- **Daily cap**: agreed to raise `CLOUD_DAILY_CAP` to **10 only for the validation days**, then back
  to 3. Not changed yet.

Tools:

- `scripts/spikes/bread-spike.ts` — Bread directly on a local file, **no daily cap**, raw output
  saved with its sha256; byte-equivalent to the app path (calibrated on `04e57d16`). Needs your own
  `REPLICATE_API_TOKEN`; keep it local. Covers tuning, the aurora regression test and diagnostics.
  The app is needed only for final validation, because the Cloud result users see is post-passed in
  the browser.
- `scripts/measure-hue-shares.py` — hue shares, method fixed in its docstring.
- `test-photos/private/` — capturetheatlas sources (`ALL RIGHTS RESERVED`, never commit) and 896 px
  run copies.

## Steps

1. ~~**Record the agreed quality bar in the repo.**~~ Done 2026-09-27:
   `context/changes/cloud-quality-below-local/quality-bar.md`.

2. **Plan S-17** with `/rune-plan` on `cloud-quality-below-local`. Open items the plan must settle
   first:
   - **EXIF orientation on the Cloud path.** The app sends raw bytes; if Bread ignores the
     orientation flag while the browser honours it for Local, the two engines' outputs are rotated
     relative to each other. `06-phone-rain-galaxys24ultra.jpg` carries orientation 6 — one direct
     run settles it.
   - **Large inputs in `bread-spike.ts`.** `21-kangchenjunga.jpg` is 17.3 MB, too large for the
     data-URI input; the script needs a URL path for such files if they are ever run directly.
   - **Where the Auto candidate is deployed** for in-app validation, and the dated raise and revert
     of `CLOUD_DAILY_CAP`.
   - **Blind A/B tooling**: randomised labels with the key kept separately.

3. **Review `references/01`–`07`.** AGENTS.md § Evidence images (#258) names them as derivatives of
   `ALL RIGHTS RESERVED` material awaiting a separate review; the rule does not approve them
   retroactively. Decide keep, remove, or assess a specific basis.

4. **Decide on the two parked changes.** `cloud-error-message-leak` has its framing written and can go
   straight to `/rune-plan` (invert `deriveDisplayError`'s default; map the codes with no copy).
   `finder-serialization-outage`: `ai-review` still fails with `AI_NoObjectGeneratedError` on every
   PR, most recently #265 — registration (roadmap entry, issue, `github-issues.md` row) is still
   undone.

5. **Decide what to do with `.claude/settings.local.json`.** It keeps collecting allow-list entries
   from sessions; commit them periodically or leave them local.

6. **Refresh or retire `temp_queue.md`.** Its recommended option A ("Run A settles S-17") is done and
   did not settle it the way it expected, and option C's evidence is stale.
