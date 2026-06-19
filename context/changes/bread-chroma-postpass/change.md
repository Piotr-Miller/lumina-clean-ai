---
change_id: bread-chroma-postpass
title: Add a chroma-denoise post-pass and pin a build/deploy-resolved Bread release
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
- Stop manually hardcoding a Bread version hash. Resolve the current Bread
  release at **build/deploy time** and **pin the resolved hash**; runtime always
  calls the pinned hash. Rollback = revert to the previous resolved hash. Do
  **not** follow "latest" at runtime.
- **Contract:** Bread input must remain RGB; the chroma post-pass output must
  remain RGB or be deliberately normalized before any downstream write, UI, or
  future S-13 pipeline reuse.
- Treat resolved-version telemetry as an audit add-on, not the safeguard against
  drift (the pin is the safeguard).
- Tune and verify the chroma-pass against real low-light photos before enabling
  it in production.
