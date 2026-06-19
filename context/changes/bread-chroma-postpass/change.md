---
change_id: bread-chroma-postpass
title: Add a chroma-denoise post-pass and track the latest Bread release
status: new
created: 2026-06-18
updated: 2026-06-18
archived_at: null
issue: 51
---

## Notes

Post-MVP cloud-quality slice:

- Keep Bread on Replicate as the low-light enhancement model.
- Add a programmatic, adaptive YCbCr chroma-denoise post-pass after Bread to
  reduce color noise revealed in dark and near-black areas while preserving
  luminance detail.
- Stop hardcoding a Bread version hash. Use the provider-supported latest Bread
  model reference or an equivalent controlled resolution mechanism.
- Preserve observability and rollback safety by recording the resolved Bread
  version used for each prediction or deployment.
- Tune and verify the chroma-pass against real low-light photos before enabling
  it in production.
