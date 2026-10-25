---
change_id: cloud-exif-orientation
title: "Cloud AI returns EXIF-rotated phone photos sideways"
status: implementing
created: 2026-09-27
updated: 2026-10-25
archived_at: null
---

## Notes

Cloud AI ignores EXIF orientation: Bread returns phone photos stored with orientation 6/8 rotated 90°. Found by the S-17 EXIF probe (context/changes/cloud-quality-below-local/calibration.md § EXIF probe, run ebme649xrsrgc0d0wjv857kkrw): S17-06 (stored 5712x4284, EXIF 6, displays portrait) came back 1536x1152 landscape with content sideways. The Cloud upload PUTs original bytes (src/lib/services/cloud-upload.client.ts:87-91), so production is very likely affected; not yet observed in the app. S-17 Phase 5 waits until the fix is live.

2026-10-25: owner decision — the Phase 2 spec reads the PUT body in a pass-through page.route (continued unmodified), since Chromium exposes File/Blob bodies to waitForRequest only intermittently; plan.md Phase 2 § PUT-body spec
