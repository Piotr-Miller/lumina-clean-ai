# finder-sonnet-effort — blind hand-read, PR #269 — 3d0adc1…fca2778

> Plan Phase 4 §1. Every published finding of every valid run on this PR, deduplicated into rows **without the
> arm or run that produced it**. Row membership lives only in `hand-read-key.json`; do not open it until every row
> in both hand-read files is classified. Variants are listed in arbitrary order. The head worktree is
> `~/.cache/finder-sonnet-gate/wt-269`.
>
> **Rule (gate.md § Pre-registration §4):** the owner classifies every row `accepted` or `rejected`, with a
> one-sentence reason. A run passes only with **zero rejected** findings; unresolved counts as rejected. **#269:** each run's findings must also include **D2**.

**Dedup rule used:** findings merge into one row only when they make the same claim about the same code. A
claim repeated for a second file, or a broader claim that contains a narrower one, stays a separate row.

**Status:** dedup **approved by the owner** (2026-10-07, before any classification); D2 proposals **approved by the owner** (2026-10-07): no row matches D2; agent pre-sort added (plan Phase 4 §1 step 3); classification **complete by the agent at the owner’s request** (2026-10-07), before opening the key.

**Classification authority:** The owner instructed the agent to perform the classifications (“Zrob to”). These are delegated agent decisions, not a claim that the owner personally hand-read each row as the sealed protocol prescribes; the seal is unchanged.

## R269-01 — manifest_roi() re-reads and re-parses the manifest on every call

- **Variant a** (nit, performance, `scripts/measure-hue-shares.py:117–124`): manifest_roi() re-reads and re-parses the whole s17-benchmark.json manifest from disk on every call. When measure() is invoked for many labels in one run (the documented batch usage: `label=path [label=path ...]`), this repeats the same file read/parse for each image.
  _Suggestion:_ Cache the parsed manifest entries (e.g. functools.lru_cache or a module-level dict) the first time it is loaded.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate, negligible.** `:121` re-reads the manifest on every `manifest_roi()` call, which happens once per label through `exposure()` (`:147`); a run measures a handful of labels.
- **Classification:** **accepted** — reason: manifest_roi() reads and parses the same manifest again for each matching label, although the overhead for this small batch is negligible.

## R269-02 — Image.open(path) in measure() is never closed

- **Variant a** (nit, style, `scripts/measure-hue-shares.py:135–140`): `original = Image.open(path)` is never explicitly closed (relies on GC); minor resource-handling nit, harmless for a short-lived CLI script but inconsistent with the explicit `with open(path, "rb")` used just above for hashing.
  _Suggestion:_ Use `with Image.open(path) as original:` or otherwise close the handle for consistency.
- **Variant b** (nit, style, `scripts/measure-hue-shares.py:150–161`): `exposure()` opens `original` via `Image.open(path)` in `measure()` and never closes it (no `with`/context manager), leaving the file handle open until GC.
  _Suggestion:_ Use `with Image.open(path) as original:` or explicitly close it after use, consistent with the rest of the script's careful resource handling.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate, harmless.** `:158` opens the image without `with` or `close()`, uses it through `:180`, and leaves it to the garbage collector or process exit. Variant b's wording is slightly off: `measure()` opens it and passes it to `exposure()`.
- **Classification:** **accepted** — reason: measure() opens the original image without an explicit close or context manager, a minor resource-handling omission for this short-lived tool.

## R269-03 — No test for browser-stats.ts comparison / threshold / exit-code logic

- **Variant a** (minor, testing, `scripts/s17/browser-stats.ts`): This file performs a non-trivial comparison (percentile binning, tolerance thresholds, exit-code semantics) between offline and browser-computed luma stats, but like the other new S-17 scripts there is no automated test exercising the comparison/threshold logic (e.g. with synthetic stats objects) to catch a regression in the bad/pass logic.
  _Suggestion:_ Add a small unit test for the comparison function (extract it from the Playwright-driving `main`) covering the percentile-bin rounding and the pass/fail thresholds.
- **Variant b** (minor, testing, `scripts/s17/browser-stats.ts:41–46`): The parity-check tolerances (`CONTINUOUS_TOLERANCE = 0.001`, percentile bin equality) gate whether the browser-based diagnostic is considered trustworthy for Phase 2/3 tuning, but there's no test exercising `compare`/exit-code logic (e.g. a fixture pair of offline/browser JSON files with a deliberately introduced mismatch) to confirm the threshold logic actually flags differences as intended.
  _Suggestion:_ Add a lightweight test that feeds two synthetic `LumaStats` objects (one matching, one with a field just inside/outside tolerance) through the comparison logic and asserts the resulting exit status, to guard the threshold arithmetic itself from future edits.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate absence; premise overstated.** The comparison is inline in `main()` (`:162-191`) and has no test; vitest runs `tests/**/*.test.ts` only. But the file calls itself "a repeatable diagnostic, not the tuning source" (`:2-3`) and leaves accepting parity to the maintainer (`:29-30`), so variant b's "gate whether … trustworthy for Phase 2/3 tuning" overstates its role.
- **Classification:** **accepted** — reason: Synthetic comparisons should protect the diagnostic’s documented tolerance and exit-status contract even though its output is not the tuning source and the maintainer decides parity.

## R269-04 — None of the new scripts/s17 harness scripts has automated tests

- **Variant a** (minor, testing, `scripts/s17/decode-inputs.py:1–197`): The offline Auto harness (ICC→sRGB conversion, EXIF-orientation handling, the custom `point_bilinear`/`jpeg-draft` resampler, and ROI geometry in contact-sheet.py) is new, numerically sensitive logic that directly feeds tuning decisions (gamma/strength selection), yet none of the new scripts in `scripts/s17/` ship with any automated tests — correctness currently rests entirely on the prose in the docstrings and the manual `browser-stats.ts`/`desktop-stats.ts` cross-checks.
  _Suggestion:_ Add at least unit tests for the pure numeric pieces (`point_bilinear` against known small arrays, `manifest_roi`/ROI-slicing arithmetic, `exposure_stats`) so a regression in the resampling or ROI math is caught before it silently changes tuning parameters.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate absence; premise overstated.** No `scripts/s17` file has a test. But `browser-stats.ts:6-10` says Phase 2–3 tune from the desktop Chrome stats, and the offline path (`decode-inputs.py` + `auto-values.ts`) is a cross-check, so "directly feeds tuning decisions" overstates it.
- **Classification:** **accepted** — reason: The new decode, resampling and ROI arithmetic lack automated regression checks for the cross-check’s numeric results, although the claim that this path directly supplies the tuning baseline is overstated.

## R269-05 — No unit test pins point_bilinear's output

- **Variant a** (minor, testing, `scripts/s17/decode-inputs.py:64–90`): `point_bilinear` is a hand-written 2-tap bilinear resampler that the harness relies on to reproduce Chromium's canvas sampling (and whose output directly drives gamma/strength tuning decisions per the docstring's own claim about S17-04 crossing the clip guard). There is no unit test pinning this function's output against known inputs/expected pixels, so a future refactor or numpy-version edge case (e.g. off-by-one in `np.floor`/clamping) could silently shift tuning numbers without any test failing.
  _Suggestion:_ Add a small pytest (or equivalent) that feeds `point_bilinear` a synthetic array with known expected output (e.g. a 2x2 gradient) and asserts exact pixel values, plus a regression test comparing against a stored golden output for one of the s17-v1 tuning photos.
- **Variant b** (minor, testing, `scripts/s17/decode-inputs.py:77–91`): `point_bilinear` reimplements the custom 2-tap bilinear sampler that the harness relies on to reproduce the browser's canvas downscaling (the docstring even cites a measured 0.13-level match vs. 2.4-level for Pillow's bilinear). This numerically sensitive function, which directly feeds tuning decisions in `calibration.md`/the plan, has no automated unit test (e.g. comparing against a few hand-computed pixels or against `browser-stats.ts`'s live browser output in CI) — only the ad hoc `browser-stats.ts` cross-check, which requires Playwright/Chromium and isn't run automatically.
  _Suggestion:_ Add a small pytest (or equivalent) that feeds `point_bilinear` a tiny synthetic array with a known expected result, to catch regressions in the resampling math independent of the heavier browser-parity harness.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate absence; premise overstated.** `point_bilinear` (`:80-104`) has no test. The premise caveat of R269-04 applies: it feeds the offline cross-check, not the tuning baseline. Both variants cite lines a few rows early.
- **Classification:** **accepted** — reason: A tiny hand-computed image can pin point_bilinear’s sampling, clamping and rounding independently of browser runs, protecting the offline cross-check rather than the desktop tuning baseline.

## R269-06 — BASELINE_SHA256 provenance is not self-contained in the file

- **Variant a** (nit, documentation, `scripts/s17/desktop-stats.ts:23–24`): BASELINE_SHA256 is a hardcoded hex digest pinning the tuning source; if the baseline file is ever regenerated for a legitimate reason, the only guidance is the comment pointing to "the plan" (an external doc not shown here), so a reviewer reading just this file can't verify the invariant independently.
  _Suggestion:_ Consider adding a short note of which command regenerates the baseline and what the plan document/section is named, so the hash's provenance is self-contained in-repo.

- **Agent pre-sort against the head** (a proposal, not a classification): **Mostly inaccurate.** The file already says how a baseline is produced (`:1-14`) and what to do when it changes (`:93-99`: "restore it, or record the new one in the plan and BASELINE_SHA256 first"), and `:36` dates the decision. Only the plan's path is not named.
- **Classification:** **rejected** — reason: The file already documents the baseline capture command and the procedure for replacing its pinned hash, contradicting the claim that its only guidance points to an unspecified plan.

## R269-07 — No test for desktop-stats.ts compare() decision logic

- **Variant a** (minor, testing, `scripts/s17/desktop-stats.ts:101–123`): The `compare()` function contains the same kind of threshold/rounding logic as browser-stats.ts (clip-guard side flips, Auto value equality) with no test coverage, and a bug here would silently mis-report whether retuning is required.
  _Suggestion:_ Extract `compare`'s core decision logic into a pure function and add unit tests with crafted LumaStats fixtures that straddle the CLIP_GUARD boundary.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate absence.** `compare()` (`:87-137`) has no test. Unlike `browser-stats.ts`, its exit status is a stated gate: "refresh the baseline and recompute before tuning" (`:19-20`).
- **Classification:** **accepted** — reason: compare() has an explicit retuning-gate exit contract but no boundary tests for clip-guard flips or unrounded Auto changes that could alter that decision.

## R269-08 — --compare crashes when the tuning photos are missing, because photos load before the branch

- **Variant a** (minor, correctness, `scripts/s17/desktop-stats.ts:141–162`): The module-level code unconditionally reads every tuning photo from disk and throws on any sha256 mismatch before the `--compare` branch is even checked (line 154-163, `argv`/`compareAt` parsed only afterwards at line 153). This means `--compare`, which only needs the manifest entries and the two JSON files being diffed, will crash if the (gitignored, licensed) photo files are missing or stale on the machine running the comparison — a plausible situation for a review/CI machine that only has the stats JSON files checked in.
  _Suggestion:_ Move the photo-loading/validation loop (and the `modules`/`html` construction used only for serving) behind the `compareAt === -1` branch, or gate it in a `main()`-like entry point so `--compare` only touches the manifest and the two stats files it actually compares.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate defect; premise partly wrong.** The photo-loading loop (`:141-151`) runs before the `--compare` branch (`:153-163`), so `--compare` throws when a tuning photo is missing or altered. But the six tuning photos are committed under `test-photos/licensed/` (all six tracked at the head), not gitignored as the finding says, so the trigger is a partial or stale checkout. The default baseline itself is in gitignored `test-photos/private/` (`:37`).
- **Classification:** **accepted** — reason: --compare unnecessarily loads and validates all photos before branching, so missing or altered photos abort a JSON-only comparison, although the photos are tracked rather than gitignored.

## R269-09 — DATA_URI_MAX_BYTES = 1,000,000 is described as 1 MB

- **Variant a** (nit, documentation, `scripts/spikes/bread-spike.ts:52`): `DATA_URI_MAX_BYTES = 1_000_000` is commented/described as "1 MB" in both the file header and inline comment, but 1 MB is conventionally 1,048,576 bytes; the actual threshold is 1,000,000 bytes (≈0.95 MiB). Harmless but slightly inconsistent with itself when matching Replicate's stated 1 MB guidance.
  _Suggestion:_ Either rename the constant/comment to "1,000,000 bytes (~1 MB)" or use 1_048_576 if true binary-MB parity with Replicate's guidance is intended.

- **Agent pre-sort against the head** (a proposal, not a classification): **Inaccurate.** 1,000,000 bytes is exactly 1 MB in SI units; 1,048,576 bytes is a MiB. Reading Replicate's "1 MB" as SI is also the more conservative choice for an inline-size limit.
- **Classification:** **rejected** — reason: 1,000,000 bytes is exactly one SI megabyte; 1,048,576 bytes is one mebibyte, so the existing MB description is correct.

## R269-10 — Upload cleanup only in main()'s finally: a throw between upload and the try would leak (stated as latent)

- **Variant a** (minor, correctness, `scripts/spikes/bread-spike.ts:205–219`): `deleteUpload` is only invoked from the `finally` of `main()`, which wraps `runPrediction`; however if `localInput` itself throws after a successful upload but before `runPrediction` is called (e.g. a later exception between upload and the `try/finally`), the uploaded file would never be cleaned up. Currently the code path from `localInput` to the `try` block has no intervening throwable statements, so this is latent rather than active, but it's fragile to future edits.
  _Suggestion:_ Move the upload + prediction + cleanup into a single try/finally scope (or return the ImageInput from inside the try) so any future refactor can't reintroduce an uncovered throw between upload and cleanup.

- **Agent pre-sort against the head** (a proposal, not a classification): **Partly accurate; its own assessment is wrong.** True: `deleteUpload` runs only from `main()`'s `finally` (`:91-96`), which begins after `localInput` returns, so anything inside `localInput` that ends the process or throws after the upload skips it (`await res.json()` at `:189` can throw). Wrong: it calls this latent, but `localInput` already exits at `:191-194` after a successful upload. That exit is D2, and you approved that this row does not match it.
- **Classification:** **accepted** — reason: Cleanup begins only after localInput returns, so a JSON-decoding exception after a successful upload can bypass deletion now; the latent-only qualification is wrong and this still does not identify D2’s missing-URL exit.

## R269-11 — Dead imageLabel.startsWith("data:") check in the sidecar

- **Variant a** (minor, correctness, `scripts/spikes/bread-spike.ts:245–246`): The sidecar's `input` field checks `run.imageLabel.startsWith("data:")`, but `imageLabel` is always set to either the local file path or a URL (`localPath ?? imageUrl`/`input.image`), never the data URI itself, so this branch can never be true. It reads as if it guards against logging a data URI but never actually does anything.
  _Suggestion:_ Remove the dead check or compare against `input.transport === "data-uri"` instead, which is the actual signal available.
- **Variant b** (nit, style, `scripts/spikes/bread-spike.ts:245–246`): `run.imageLabel` is always set from `localPath ?? input.image`, so for the local-file path it is always the filesystem path, never a `data:` URI — the `imageLabel.startsWith("data:")` branch in the sidecar can never be true. The check is vestigial and could mislead a future reader into thinking data URIs still reach this branch.
  _Suggestion:_ Remove the dead `startsWith("data:")` check (or if intentionally defensive, add a comment explaining it can no longer trigger) so the sidecar-writing logic reads as it actually behaves.

- **Agent pre-sort against the head** (a proposal, not a classification): **Accurate.** `imageLabel` is `localPath ?? input.image` (`:81`), so it is either a local path or an http(s) URL (`remote` or `DEFAULT_IMAGE_URL`); `startsWith("data:")` at `:243` can never be true. The data URI lives in `input.image`, which is not what is checked.
- **Classification:** **accepted** — reason: imageLabel receives a local path or an HTTP(S) URL rather than the inline data URI, making the sidecar’s data-prefix check vestigial for the documented inputs.

## D2 match proposals

**D2** (gate.md § Pre-registration §4): `scripts/spikes/bread-spike.ts` `localInput` — when the upload response has
no `urls.get`, `process.exit(1)` at `:191–194` runs after the upload and before `uploadedFileId` is returned, so
`deleteUpload` (`:199–213`) never sees the file. **Match:** the finding cites `bread-spike.ts` in `localInput`'s
upload path or `main`'s cleanup **and** claims the file is not deleted or leaks on that exit.

- **R269-10 — proposed: not a match.** It cites the cleanup path in `bread-spike.ts`, but it says no current
  path between the upload and the `try/finally` can throw ("latent rather than active") and does not name the
  missing-`urls.get` exit. That leaves the second half of the match unmet: it does not claim the file leaks on
  that exit.
- **Every other row — proposed: not a match.** No other row cites `localInput`'s upload path or `main`'s
  cleanup. R269-09 and R269-11 cite `bread-spike.ts`, but at the data-URI threshold and the sidecar.

Owner decision on the D2 proposals: **approved as proposed** (2026-10-07). No row matches D2.

## Per-run results after key reveal (2026-10-07)

All row classifications, including the R247-13 split, were written before opening the key. These results are derived from the delegated agent classifications above; they do not assert completion of the sealed owner-personal classification step.

| Run             | Published | Accepted | Rejected rows | D2     | Result |
| --------------- | --------: | -------: | ------------- | ------ | ------ |
| `low-269-r1`    |         4 |        3 | R269-06       | absent | FAIL   |
| `low-269-r2`    |         4 |        4 | none          | absent | FAIL   |
| `medium-269-r1` |         4 |        4 | none          | absent | FAIL   |
| `medium-269-r2` |         3 |        2 | R269-09       | absent | FAIL   |

Coverage verified against all eight cached `review.json` files: 32 published findings, each mapped exactly once across 26 classified rows (25 original rows plus the pre-reveal PNG/JPEG split). No D2 match was added.
