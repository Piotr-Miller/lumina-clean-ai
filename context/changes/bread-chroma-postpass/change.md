---
change_id: bread-chroma-postpass
title: Add a chroma-denoise post-pass and pin a build/deploy-resolved Bread release
status: implementing
created: 2026-06-18
updated: 2026-06-21
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

## Locked decision (2026-06-20, post-research)

**Host: client-side (browser Canvas).** Research (`research.md`) found the
Supabase Edge Function ruled out by a hard 2 s CPU cap, and a Cloudflare-Worker
WASM path means paid plan + new infra. Decision: run the chroma-pass **in the
browser on the fetched Cloud (Bread) result**, so:

- the user **sees** the chroma-denoised result, and the **downloaded** file is
  denoised too (both consume the same result Blob);
- the **stored** Bread result in Supabase (`result.<ext>`) stays **unchanged**
  (raw Bread output);
- **no** paid Cloudflare Worker / no new server infrastructure;
- server-side (so the _stored_ artifact is denoised) is **deferred** — revisit
  only if/when **S-13** actually needs the processed file in the cloud.

Scope reminder: the chroma-pass applies to the **Cloud (Bread)** result only,
not the Local engine. Canvas pixels are RGBA; the implementation must force
alpha opaque before JPEG export. When enabled, the processed Blob must feed
both a managed object URL for the slider and the download; limit/error falls
back to the raw Bread result. The
**version resolve-and-pin** workstream (build/deploy resolver → pinned
`BREAD_VERSION` + `model_version` telemetry) stays in S-11 and is independent of
this host choice.

## Plan-review decisions (2026-06-20)

- Rotate the Replicate token exposed during planning before Phase 1; update the
  hosted Edge Function secret plus local `.env` and
  `supabase/functions/.env`, then prove the old token is rejected.
- The resolver validates the exact version's `image` / `gamma` / `strength`
  input schema before rewriting either the pin or its literal test.
- Client processing is capped at 12 MP, uses bounded byte buffers, and falls
  back to the raw result on limit/error.
- Phase 4 creates and owns an object URL from the processed JPEG so the slider
  and download consume the same bytes.
- Phase 5 includes a small/typical/~12 MP benchmark. GO requires the ~12 MP pass
  to finish within 2 seconds on the maintainer reference desktop; otherwise the
  flag stays OFF and Web Worker/chunking becomes a follow-up.

### Rotation prerequisite — DONE (2026-06-21)

The exposed Replicate token was rotated and the **old token revoked** (exposure
closed). Hosted prod Edge Function secret verified updated via digest change
(`7d9d80…357b` → `f079e4…d01e`, value never displayed); local `.env` +
`supabase/functions/.env` updated by the maintainer. Phase 1's blocking security
prerequisite (Progress 1.5) is satisfied.

## Bump / rollback workflow (version pin)

`BREAD_VERSION` (`src/lib/services/bread.ts`) is the single committed pin,
relative-imported and bundled by both the Worker build and the `enhance` Edge
Function — so changing it once moves both.

- **Bump:** `REPLICATE_API_TOKEN=… npm run resolve:bread-version` resolves the
  current `mingcv/bread` version, contract-checks its `image`/`gamma`/`strength`
  input schema, and rewrites `bread.ts` + `tests/bread.test.ts` (fails closed on
  a malformed id, drifted schema, or ambiguous match). Review the hash diff →
  PR → merge to master; the `deploy` job rebuilds the Worker and redeploys
  `enhance`, both picking up the new pin. The token comes from a secret/env and
  is never committed.
- **Rollback:** git-revert the pin commit → merge → redeploy. No runtime config
  to flip; the hash is baked at build/deploy.
- The Phase-0 spike (`scripts/spikes/bread-spike.ts`) is frozen historical
  evidence — it carries its own copy of the hash and is NOT a runtime pin.
