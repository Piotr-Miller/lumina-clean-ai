---
change_id: cloud-exif-orientation
title: "Cloud AI returns EXIF-rotated phone photos sideways"
status: new
created: 2026-09-27
updated: 2026-09-27
archived_at: null
---

## Notes

Cloud AI ignores EXIF orientation: Bread returns phone photos stored with orientation 6/8 rotated 90°. Found by the S-17 EXIF probe (context/changes/cloud-quality-below-local/calibration.md § EXIF probe, run ebme649xrsrgc0d0wjv857kkrw): S17-06 (stored 5712x4284, EXIF 6, displays portrait) came back 1536x1152 landscape with content sideways. The Cloud upload PUTs original bytes (src/lib/services/cloud-upload.client.ts:87-91), so production is very likely affected; not yet observed in the app. S-17 Phase 5 waits until the fix is live.
