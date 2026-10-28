# S-19 holdout replacement decision

Decision delegated by the owner, 2026-10-28.

## Decision

Use a new benchmark version, `s19-v1`, derived from frozen `s17-v1`: retain the same six tuning
photos and ten unexposed validation photos; replace S17-05 and S17-06 with two new phone photos
for **every candidate**, including Bread. The final scored validation set remains exactly twelve.
Do not edit `test-photos/s17-benchmark.json` or its hash file, recycle the old IDs, promote tuning
photos into validation, or count the exposed photos in the twelve.

The ten retained validation IDs are S17-08, S17-09, S17-10, S17-11, S17-12, S17-17, S17-18,
S17-19, S17-20 and S17-22. Keeping them avoids discarding untouched evidence. The six tuning
photos stay unchanged; the two exposed photos are not added to tuning.

## Replacement criteria fixed before collection

- Replacement for S17-05: a full-size published phone JPEG of a night street or facade with
  saturated signs/neon, lettering or fine detail, bright highlights and substantial dark surroundings.
- Replacement for S17-06: a full-size published phone JPEG of a night scene with street lighting,
  foliage or comparable fine natural texture, and already legible lit areas; retain the no-harm
  challenge rather than selecting only severely underexposed photos. Rain is optional.
- Both must exceed 1536 px on the long edge, fit the app's input limits, and have documented
  phone provenance (camera metadata or an explicit source statement). Do not require the same
  phone model, manufacturer, exact composition or EXIF orientation. Orientation already has its
  own tests and must not drive selection of the quality holdout.
- Use distinct scenes, not crops, re-encodes, adjacent burst frames or near-duplicates of any
  benchmark photo or previously evaluated input. Prefer different authors and scenes from one another.
- Use material with documented author and licence or public-domain basis. Before committing a
  photo to `test-photos/licensed/`, add its author and licence to `FETCH` in `test-photos/fetch.sh`.
  Record source page/revision, download URL, changes, dimensions, EXIF and SHA-256 in the new manifest.

Qualify **inputs only**: viewing originals to assess these criteria is allowed. Do not run Cloud,
Local or any candidate on a prospective replacement. Keep a collection log of sources examined,
qualification/rejection reasons and their order; take the first qualifying photo for each slot.
If a previously evaluated photo is discovered, reject it for exposure and record why. Do not
choose or replace a sample because an engine performs well or badly on it.

## Freeze and scoring

Create `test-photos/s19-benchmark.json` and `test-photos/s19-benchmark.sha256` once both files are
qualified, with new IDs S19-V01 and S19-V02, a parent-version reference to `s17-v1`, and this
replacement mapping. Verify six tuning entries, twelve validation entries, unique file hashes,
file integrity and recorded provenance. Freeze before any engine output on either new photo.
The manifest is not created by this decision: actual replacement photos are still to be collected.
S-19 cannot start final validation until that freeze exists.

Apply the existing threshold unchanged: **at least 8 clear Cloud wins out of 12, at most 1 moderate
loss, zero severe regressions**. All candidates use the same twelve inputs and the frozen
comparison protocol. Lock candidate versions, parameters and selection rules using tuning only
before opening validation outputs. Once outputs are opened, do not retune and report another
run on the same twelve as a fresh holdout; any such iteration needs a newly defined holdout.

## Preserve the adverse evidence

S17-05 and S17-06 remain exposed diagnostic/regression cases, with the existing exposure log and
Bread failures retained. Report their results separately from the twelve-photo score, for all
candidates under the locked configurations; do not silently erase them or count them as extra
wins/losses in the denominator. Passing the new holdout does not mean those known failures
were fixed. Any remaining severe failure needs an explicit release decision before reopening
Cloud, rather than being concealed by the replacement.

This is a replacement protocol, not a claim that the photos have already been selected or that
`s19-v1` has been frozen. The quality bar remains an internal acceptance gate, not a population
estimate.
