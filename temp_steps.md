# temp_steps.md — immediate next steps

> Refreshed 2026-09-28 (after #269–#271). **Short-lived by design**: this is the next-few-actions
> list and the **only** such list. `context/foundation/roadmap.md` stays authoritative for scope,
> including parked work. Delete this file once the list is empty.

## Where things stand

Everything is merged. **Zero open PRs** after the one carrying this file.

**S-17 is closed** (2026-09-28, #269, issue #203 closed; archive commit `00088d3` on master). It is
archived at `context/archive/2026-08-31-cloud-quality-below-local/`.

- The Bread calibration series ended. Within the range tested, it gave no basis for a reliable
  Cloud Auto rule. Tested: gamma 0.5–1.5 at strength 0.05, and gamma 0.5 at strength 0.0 on two
  photos.
- Bread gained on 4 of 6 tuning photos, two of them only slightly. S17-02 is harmed at every
  setting.
- **Decision B:** a model comparison instead of calibration.
- Phases 4–6 of the S-17 plan were not carried out.

**S-19 `cloud-model-comparison`** is registered (#270, issue #271, status `proposed`). It chooses
the basic Cloud path's model by a holdout comparison on `s17-v1`. Bread at low gamma and weak
denoise is one candidate. The S-18 delivery half and `local-engine-ceiling` (#188) are parked on its
result.

**`cloud-exif-orientation`** is a separate change: Bread returns EXIF-6/8 phone photos rotated 90°.
It is likely live in production (the upload sends the original bytes), though not yet observed in
the app. Its folder is still untracked. It is a precondition for S-19's in-app runs.

Tools (still valid for S-19):

- `s17-v1` benchmark: 18 inputs in `test-photos/licensed/`, **6 tuning / 12 validation**. Manifest
  `test-photos/s17-benchmark.json`, hashes `test-photos/s17-benchmark.sha256` (verify before runs).
  **The 12 validation photos have never been opened by any model run — keep it that way until the
  comparison.**
- Quality bar and all Bread evidence: `context/archive/2026-08-31-cloud-quality-below-local/`
  (`quality-bar.md`, `calibration.md`).
- `scripts/spikes/bread-spike.ts`: Bread directly on a local file, with no daily cap and the raw
  output saved with its sha256. Needs your own `REPLICATE_API_TOKEN`; keep it local.
- `scripts/s17/contact-sheet.py`: works on tuning photos only and refuses validation ids. It needs
  numpy and Pillow, which the system `python3` lacks, so use a venv.
- `scripts/measure-hue-shares.py`, `scripts/prod-fetch-results.py`,
  `scripts/prod-result-dimensions.py`: diagnostics. Production credentials stay with the
  maintainer.
- **Replicate credit is below $5**, so creates are throttled to 6 a minute. Top it up before
  larger runs.
- **Daily cap:** the plan to raise `CLOUD_DAILY_CAP` to 10 for validation days went away with S-17
  Phases 4–6. Any raise for S-19 is decided in its plan. The cap is currently 3.

## Steps

1. **Fix `cloud-exif-orientation`** (recommended first). It is a user-facing bug, small, and
   independent of the model choice.
   - Maintainer: approve a branch.
   - Agent: commit the folder, then `/rune-plan cloud-exif-orientation`.

2. **Research S-19:** `/10x-research cloud-model-comparison`. It makes no Replicate runs. It covers
   the candidate models for the basic Cloud path (cost, cold start, contract), a comparison protocol
   that keeps the holdout closed, and whether Local is compared too. It can run in parallel with
   step 1. In-app comparison runs wait for step 1 in production.

3. **Review `references/01`–`07`.** They are now under
   `context/archive/2026-08-31-cloud-quality-below-local/references/`. AGENTS.md § Evidence images
   names them as derivatives of `ALL RIGHTS RESERVED` material awaiting a separate review; the rule
   does not approve them retroactively. Decide: keep, remove, or assess a specific basis. The folder
   is archived, so removal would need a deliberate exception to archive immutability.

4. **Decide on the three waiting changes.**
   - **`developer-feedback`** needs one maintainer decision: _can anonymous visitors submit
     feedback, or only signed-in users?_ After that it can be planned. Its constraints are in its
     `change.md`. It is not on the roadmap.
   - **`cloud-error-message-leak`** has its framing written and can go straight to `/rune-plan`.
   - **`finder-serialization-outage`**: `ai-review` failed with `AI_NoObjectGeneratedError` on #269
     but passed on #270, so it is intermittent, not constant. Registration (roadmap entry, issue,
     `github-issues.md` row) is still undone.

5. **Decide what to do with `.claude/settings.local.json`.** It keeps collecting allow-list entries
   from sessions; commit them periodically or leave them local.
