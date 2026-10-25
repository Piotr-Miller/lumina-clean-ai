---
change_id: cloud-exif-orientation
title: "Cloud AI returns EXIF-rotated phone photos sideways"
status: impl_reviewed
created: 2026-09-27
updated: 2026-10-25
archived_at: null
---

## Notes

Cloud AI ignores EXIF orientation: Bread returns phone photos stored with orientation 6/8 rotated 90°. Found by the S-17 EXIF probe (context/archive/2026-08-31-cloud-quality-below-local/calibration.md § EXIF probe, run ebme649xrsrgc0d0wjv857kkrw): S17-06 (stored 5712x4284, EXIF 6, displays portrait) came back 1536x1152 landscape with content sideways. The Cloud upload PUTs original bytes (src/lib/services/cloud-upload.client.ts:87-91), so production was very likely affected. Fixed in production since 2026-10-25 (master `53f5178`), and S17-06 plus an orientation-1 control passed there: see `live-acceptance.md`. This unblocks S-19 and in-app runs of phone photos.

2026-10-25: owner decision — the Phase 2 spec reads the PUT body in a pass-through page.route (continued unmodified), since Chromium exposes File/Blob bodies to waitForRequest only intermittently; plan.md Phase 2 § PUT-body spec

2026-10-25: re-confirmed 1.6 — was accepted at 65a8548fca099e4fa7bc80baddf94738247f45e4; accepted at cd5a05dd465bdf0091875a27181a91a14c7c23d0

2026-10-25: re-confirmed 2.5 — was accepted at 35dbbd5a1ced0103d3804cc6f33a4220d468afb8; accepted at cd5a05dd465bdf0091875a27181a91a14c7c23d0
