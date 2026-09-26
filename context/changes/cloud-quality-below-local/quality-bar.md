# S-17 quality bar

> Agreed with the maintainer on 2026-09-26, **before any tuning**, as `change.md` requires. A working
> product bar for this change, not an industry standard. Recorded 2026-09-27; the substance is the
> maintainer's proposal, translated from Polish without additions. Applies to the frozen benchmark
> `s17-v1` (`test-photos/s17-benchmark.json`, 6 tuning / 12 validation).

## Two separate success conditions

1. **Auto improves the photo's legibility while keeping the scene's night character.**
2. **Cloud gives a noticeably better result than Local.**

Fixing Auto does **not** by itself confirm Cloud's advantage.

## What correct Auto behaviour means

- Shadows become more legible.
- Significant detail in highlights and shadows is preserved.
- No obvious washing-out, unnatural colour cast or excessive smoothing appears.
- Brightening the image alone is not enough to pass.

## How measurements are used

- Record the share of pixels with V ≥ 0.90 and the share of pixels with any channel equal to 255.
- Treat them as **diagnostic indicators**: a high channel value does not by itself prove lost detail.
- **No single limit for all scenes** — lamps, snow and saturated aurora behave differently.
- The earlier 30 % / 6 % remains a **hypothesis to test**, not an acceptance criterion.

## Regression test for the known aurora

1. First choose and visually accept a reference result.
2. Then record its parameters, measurements and allowed tolerances.
3. Freeze the exact input and the measurement method.
4. Every later Auto change must keep the accepted quality of this example.

## Photo set

- 6 photos for tuning and 12 different ones for final validation.
- The split is fixed before the experiment.
- Covers auroras, a city with lamps, dark landscapes and people in low light, including full-size
  phone photos.
- Only photos with documented provenance and appropriate usage rights.
- If parameters are tuned against the validation set, a new set is needed for the final assessment.

## How Cloud and Local are compared

- Identical input files for both engines.
- The **real Local engine run in the app**, not an approximation.
- Each engine uses its own Auto.
- Assess the final results available to the user.
- Random A/B labels without engine names; the original shown alongside.
- Equal presentation size and corresponding image regions, without enlarging Cloud beyond its
  resolution.
- The resolution difference of the downloadable files is recorded separately; this test does not
  close the problem of Cloud delivering a smaller file.

## What a clear Cloud win means

- Noticeably better legibility of detail or less noise.
- No significant loss of texture, colour naturalness or highlight detail.
- Brightening alone or stronger blurring does not win.

## Pass threshold for the comparison

- **At least 8 clear Cloud wins out of 12 photos.**
- **At most 1 moderate loss.**
- **Zero severe regressions.**
- The remaining results may be ties.

## What counts as a severe regression

- Loss of significant detail, e.g. faces, terrain texture or aurora structure.
- Clearly unnatural colour.
- Extensive washing-out.
- An artefact that disqualifies the photo.

Checked against the original **and** against Local — both engines can make the same mistake.

## How the result is interpreted

- The maintainer may be the only rater for internal MVP acceptance.
- The 12-photo result is a **decision gate for S-17**, not proof of superiority on all night photos.
- If Auto passes and Cloud does not reach the threshold, the Auto improvement is accepted and Cloud's
  advantage over Local stays **unconfirmed**.
