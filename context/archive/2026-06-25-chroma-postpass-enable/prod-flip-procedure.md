# Phase 5 — Prod flip + rollback procedure

Change: `chroma-postpass-enable`. This records how the chroma post-pass is turned
ON / OFF in production and how the flip was verified (plan items 5.1–5.4).

## The control

- **Secret:** `CHROMA_POSTPASS_ENABLED` — `envField.boolean({ context: "server", access: "secret", default: false })` (`astro.config.mjs:80`).
- **Worker:** `lumina-clean-ai` (Cloudflare). Read SSR-side in `src/pages/index.astro:28` and threaded to the island as the `chromaEnabled` prop → consumed by `useCloudJob.ts` via `cloud-result-postprocess.client.ts`.
- **Default OFF.** Unset (or `false`) ⇒ the post-pass is skipped and the raw Bread result renders.
- **Live application:** Cloudflare applies a `secret put` immediately — **no redeploy required**. A _fresh_ page load picks up the new value (it's read at SSR time, so an already-open tab keeps its old value until reload).
- ⚠️ **`E2E_CHROMA_OVERRIDE` must NEVER be set in prod.** It's the local/CI-only `?chroma=1` seam; in prod it's unset, and even if mis-set the override is additionally gated to loopback hostnames. Verified absent from the prod secret list on 2026-06-27.

## Flip ON (5.1)

```sh
echo true | npx wrangler secret put CHROMA_POSTPASS_ENABLED
```

- **Done:** 2026-06-27 — `✨ Success! Uploaded secret CHROMA_POSTPASS_ENABLED` (Worker `lumina-clean-ai`, exit 0). Confirmed present via `wrangler secret list`.

### Verify the flip is live (real prod cloud job)

1. Sign in on the prod site and upload a genuinely noisy night JPG (real high-ISO shadow noise — Bread already denoises, so a clean shot won't show a visible delta).
2. Select **Cloud AI** → process. Confirm the before/after shows **cleaner shadow color** (reduced Cb/Cr speckle in the dark areas) and **Download** works.
3. ⚠️ **Daily-cap budget:** prod is bounded by `CLOUD_DAILY_CAP` (last known = 3 ops/day, global across all users). Use 1–2 verification jobs, not the whole quota.
4. Note on subtlety: Bread returns a downscaled RGB PNG (~1.5 MP), so the ≤12 MP guard never trips on real output and the benefit is **intentionally subtle** — judge shadow chroma, not sharpness.

**Observation:**

- Date / job: 2026-06-27 — input `01-very-dark-iso160000.jpg`, job rendered a processed Cloud AI result; Download worked (file `luminaclean-01-very-dark-iso160000-post.jpg`).
- Visible result: processed result renders with clean, neutral shadows. Visible delta vs raw on **this** input is negligible — the frame is crushed near-black (Y mean ≈36, ~100% deep-shadow Y<64, mid-shadow Y 64–128 = 0.04%), so there's almost no mid-shadow chroma-noise band for the pass to act on. A naive OFF(PNG)-vs-ON(JPEG) diff is invalid (separate Bread jobs + PNG-vs-JPEG blocking). Rigorous benefit is the Phase-1 same-output A/B on `tree1` (12.9–29% Cb/Cr reduction) — see `real-ab-results.md`. Functional pass: pipeline runs ON, post-pass executes (see 5.2), no highlight leak (max |ΔY|=13).

## Telemetry check (5.2)

The post-pass emits exactly two client-side Sentry signals (scrub-safe: bounded reason + integer dims + duration, no URL/PII; global `scrubEvent` runs on send):

| Outcome                                    | `Sentry.captureMessage` text                | level     | `extra`                                           |
| ------------------------------------------ | ------------------------------------------- | --------- | ------------------------------------------------- |
| Success                                    | `chroma post-pass applied`                  | `info`    | `width`, `height`, `durationMs`                   |
| Fallback (>12 MP guard or processor throw) | `chroma post-pass: fell back to raw result` | `warning` | `fallbackReason`, `width`, `height`, `durationMs` |

Confirm the **`chroma post-pass applied`** info event appears in Sentry (prod env) for the verification job, with a sane `durationMs` (~hundreds of ms at ~1.5 MP). A `fell back to raw result` warning is expected only on the guard/throw paths.

**Observation:**

- Sentry success event seen? YES — issue `130690572` (`chroma post-pass applied`, level `info`), project `luminacleanai-astro`, `environment: production`, `release: 7d36bede...` (matches master HEAD `7d36bed`), 2026-06-27 18:55:18. Breadcrumbs show the full happy path (create-job → signed upload → jobs → result.png, all 200). Scrub-safe: message carries no URLs; breadcrumb signing tokens redacted.
- Any fallback events? None.

## Rollback (5.3)

```sh
echo false | npx wrangler secret put CHROMA_POSTPASS_ENABLED
```

(`wrangler secret delete CHROMA_POSTPASS_ENABLED` also reverts to the `false` default; setting `false` explicitly is preferred for an auditable value.)

Then reload a **fresh** page and confirm a cloud job renders the **raw** Bread result again (after-image is the signed storage URL, not a fresh `blob:`). Re-set to `true` afterward if leaving the feature ON.

**Observation:**

- Rollback verified (raw result returns)? YES — 2026-06-27: set secret `false`, fresh-reloaded, ran a cloud job on the same input. Download was `luminaclean-01-very-dark-iso160000.png` — the **raw Bread `result.png` served straight from the signed storage URL** (no Canvas re-encode → PNG, not the `-post.jpg` the ON path produces). No new `chroma post-pass applied` Sentry event for that job (pass skipped before any signal).
- Final state left in prod: **ON** — flag restored to `true` after the rollback test (`echo true | npx wrangler secret put CHROMA_POSTPASS_ENABLED`, exit 0; present in `wrangler secret list`).

## Gate reference

The enable gate (real-Bread before/after, not synthetic) was met in Phase 1 — see `real-ab-results.md` (F3 ✅ GO: 22–29% shadow Cb/Cr stddev reduction on a genuinely noisy real input, 0.2% null on a clean control, no halos/bleeding). Tuned params `DEFAULT_CHROMA_PARAMS = { blurRadius: 3, maxStrength: 0.9, shadowCurve: 2.5 }`.

## After this is complete

Check off plan items 5.1–5.4, then `/10x-archive` the change (moves the folder to `context/archive/`, stamps `change.md`, syncs roadmap + GitHub issue).
