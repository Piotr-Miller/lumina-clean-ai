---
change_id: cloud-model-comparison
title: Compare Cloud AI model candidates on the s17-v1 benchmark
status: new
created: 2026-09-28
updated: 2026-09-28
archived_at: null
---

## Notes

Decision B from S-17 (maintainer, 2026-09-28): compare models for the **basic Cloud path** on the
`s17-v1` benchmark. Bread at low gamma and weak denoise is **one candidate**. The lower-denoise
Cloud setting is a hypothesis to compare here, not scope to ship. It does not resume Cloud Auto
calibration.

Fixed inputs:

- Benchmark `s17-v1` (`test-photos/s17-benchmark.json`, hashes in `test-photos/s17-benchmark.sha256`):
  six tuning photos and twelve validation photos.
- **Holdout:** the twelve validation photos stay unopened for every model. Tuning results only
  prepare the candidates; judging whether a candidate generalises needs that holdout.
- Quality bar: `context/archive/2026-08-31-cloud-quality-below-local/quality-bar.md`.
- Evidence for Bread so far: `context/archive/2026-08-31-cloud-quality-below-local/calibration.md`.
  Across the three probes Bread gains on 4 of 6 tuning photos, 2 of them small. There is no basis
  for a reliable Auto rule. S17-02 is harmed even at strength 0.

Decided in this change, not before: the candidate models and the comparison protocol.

Out of scope: S-13 (a separate Premium proposal) and `cloud-exif-orientation` (a separate
change, but a precondition for any in-app run of phone photos).

This is a decision about the direction of the work. It does not claim that another model has
already proven better.
