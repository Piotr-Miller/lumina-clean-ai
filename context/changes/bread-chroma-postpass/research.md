---
date: 2026-06-20T00:00:00Z
researcher: Claude (Opus 4.8)
git_commit: e06a9c298d7693c38b603d6726a9f09a7ccc49eb
branch: feat/bread-chroma-postpass
repository: Piotr-Miller/lumina-clean-ai
topic: "S-11 bread-chroma-postpass — where the adaptive YCbCr chroma-denoise post-pass runs, and how to resolve-and-pin the Bread version at build/deploy"
tags: [research, codebase, bread, replicate, edge-function, image-processing, version-pinning]
status: complete
last_updated: 2026-06-20
last_updated_by: Claude (Opus 4.8)
---

# Research: S-11 `bread-chroma-postpass`

**Date**: 2026-06-20
**Researcher**: Claude (Opus 4.8)
**Git Commit**: e06a9c2 (`feat/bread-chroma-postpass`, off master)
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

For S-11 (`bread-chroma-postpass`): (1) **where** should an adaptive YCbCr chroma-denoise post-pass run (Edge Function / Cloudflare Worker / client), given CPU/memory ceilings and the RGB contract; and (2) **how** to resolve the latest Bread model version at build/deploy time and pin the resolved hash (no runtime "latest"), with rollback and telemetry. Scope: codebase + external (Replicate / Deno / Cloudflare docs).

## Summary

Two separable workstreams.

1. **Chroma post-pass host — the hard decision.** The "obvious" server-side insertion point (the Edge Function `/callback`, between fetching Bread's output and storing it) is **ruled out by an external hard limit**: Supabase Edge Functions cap at **2 s of CPU time per request** (and `waitUntil` does NOT extend it). A full-resolution RGB→YCbCr→denoise-chroma→RGB→re-encode pass is almost entirely CPU-bound and blows past 2 s on a typical 12 MP phone photo. The Edge runtime also ships **no image library** today (`deno.json` has only supabase-js + Sentry). The two viable hosts are:
   - **Client-side (browser Canvas) — RECOMMENDED primary.** No platform CPU/memory cap (runs on the user's device), reuses the existing tested client image pipeline (`buildGammaLut`, `ImageData` 4-byte stride, `canvasToBlob`), trivially supports the "adaptive" analysis (pixel stats), keeps RGB naturally, and runs **after** the job is `succeeded` so it does **not** touch the cold-boot watchdog. **Caveat:** it processes the _displayed/downloaded_ image, not the _stored_ Supabase object.
   - **Cloudflare Worker WASM endpoint — fallback IF the stored artifact must be denoised** (e.g. for S-13 reuse). Paid plan, CPU raisable to minutes, but bounded by the **128 MB isolate memory** (~≤10–12 MP) and needs `photon-rs`/custom WASM (the first-party Images binding cannot express per-channel YCbCr). Meaningfully more infra/cost/complexity, and the SSR Worker is not in the cloud-result path today.

   **The decision hinges on one question** (for `/10x-plan`): must the _stored_ `result.<ext>` be chroma-denoised (downstream write / future S-13 reuse), or is the _user-visible_ result sufficient? The change notes mention "downstream write … or future S-13 pipeline reuse," which leans server-side — but client-side is far cheaper and delivers the user-visible outcome.

2. **Version resolve-and-pin — low-risk, well-understood.** Runtime already calls the **version-pinned** Replicate endpoint (`POST /v1/predictions` with `version: BREAD_VERSION`), so we are _not_ on "run-latest" today; the only problem is that `BREAD_VERSION` is a **hand-typed hash** (`bread.ts:15`). The fix: a build/deploy-time resolver hits `GET /v1/models/mingcv/bread` → `latest_version.id`, writes the resolved hash into the pinned constant, and runtime keeps calling the fixed hash. Rollback = git-revert the pin commit → redeploy. Add a `model_version` telemetry column (new migration) threaded through `markJobProcessing`/`markJobSucceeded`. Reconcile `tests/bread.test.ts:6` (it asserts the literal hash).

## Detailed Findings

### 1. The cloud pipeline & the server-side insertion point

The async pipeline's output handling lives entirely in the Edge Function `supabase/functions/enhance/index.ts` (the only logic module; siblings are `deno.json` + `deno.lock`). Routing: `Deno.serve` at `index.ts:630-646` → `/start` (`handleStart`, `index.ts:279-392`), `/callback` (`handleCallback`, `index.ts:436-606`), `/reap`.

The **fetch → (process) → store** span is the success branch of `handleCallback` (`index.ts:548-578`):

| Step                            | Line               | Detail                                                                                             |
| ------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| SSRF allowlist check            | `index.ts:543-546` | `isAllowedOutputUrl(outputUrl, E2E_ALLOWED_OUTPUT_ORIGIN)` (`replicate-webhook.ts:239-259`)        |
| Output **fetched**              | `index.ts:553`     | `fetch(outcome.outputUrl, { signal: AbortSignal.timeout(OUTPUT_FETCH_TIMEOUT_MS=30s) })`           |
| Content-Type read               | `index.ts:557`     |                                                                                                    |
| Bytes read (≤25 MB)             | `index.ts:558`     | `readBodyCapped(outputRes, MAX_OUTPUT_BYTES)` → **encoded `Uint8Array`** (never decoded to pixels) |
| **← post-pass would slot here** | between 558–561    | requires decode → YCbCr → denoise → re-encode, replacing `bytes` + reconciling `contentType`/`ext` |
| Extension derived               | `index.ts:559`     | `resultExtensionFromContentType` (`replicate-webhook.ts:205-219`)                                  |
| Result **stored**               | `index.ts:561-564` | `admin.storage.from(PHOTOS_BUCKET).upload(\`${user_id}/${id}/result.${ext}\`, bytes, …)`           |
| Terminal flip                   | `index.ts:573`     | `markJobSucceeded` (guarded `.eq("status","processing")`)                                          |

A post-pass **failure** placed _before_ the upload already falls into the existing catch (`index.ts:579-605`): Sentry capture, delete `resultPath` if uploaded, `markJobFailed("callback_failed")`, return 200. So the error path is structurally handled **provided the pass runs before the upload**.

### 2. Host feasibility matrix (the crux — external limits)

| Host                              | CPU ceiling                                             | Memory                             | Image lib                                                                                           | Full-res YCbCr verdict                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase Edge Function (Deno)** | **2 s CPU/request (hard; `waitUntil` does NOT extend)** | 256 MB                             | none today; only WASM/pure-JS work (no `sharp`); `magick-wasm` is Supabase's pick                   | **NOT feasible** for full-res — per-pixel convert+blur+re-encode on ~12M px exceeds 2 s CPU; even simple `magick-wasm` resizes hit the cap on 3+ × 4 MB JPEGs. OK only for thumbnails. |
| **Cloudflare Worker (paid)**      | default 30 s, **raisable to 5 min**                     | **128 MB isolate** (V8+WASM+image) | `env.IMAGES` (whole-image only — **no per-channel YCbCr**); `@cf-wasm/photon` for custom pixel math | **Partially feasible** (paid, CPU raised) up to ~10–12 MP; **128 MB** caps the largest photos. First-party Images binding can't express the algorithm.                                 |
| **Client (browser Canvas)**       | none (user device)                                      | none (user device)                 | native Canvas `ImageData` + reusable repo helpers                                                   | **Feasible** at full res; the existing local engine already does per-channel `ImageData` work.                                                                                         |

Sources: [Supabase Edge limits](https://supabase.com/docs/guides/functions/limits), [Supabase CPU-limit troubleshooting](https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits), [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [CF higher CPU limits 2025-03-25](https://developers.cloudflare.com/changelog/2025-03-25-higher-cpu-limits/), [CF Images bindings](https://developers.cloudflare.com/images/transform-images/bindings/), [`@cf-wasm/photon`](https://www.npmjs.com/package/@cf-wasm/photon).

### 3. Client-side image pipeline (reusable for a Canvas pass)

The local engine already implements the exact pattern a chroma-pass needs:

- `src/lib/engines/local-engine.ts:50-72` — offscreen canvas → `ctx.getImageData` → iterate `i += 4` (RGBA stride), map R/G/B via a LUT (alpha untouched) → `ctx.putImageData` → `canvasToBlob` (`:29-43`, JPEG q=0.92).
- `src/lib/engines/image-helpers.ts:64-71` — `buildGammaLut(gamma)` → `Uint8ClampedArray[256]`, pure/DOM-free/unit-tested (`tests/image-helpers.test.ts`). A chroma-denoise LUT/kernel utility would live alongside it.
- `src/lib/engines/types.ts` — `ImageEngine` seam (`EngineId = "local"|"cloud"`, `EnhanceResult { blob,width,height,mimeType }`).
- Cloud result is fetched **client-side**: `useCloudJob.ts:297-327` mints a signed read URL and calls `loadCloudResult(afterUrl)` (`src/lib/services/cloud-result.client.ts:45-56`, parallel decode + `fetch().blob()`). A Canvas pass could run on `loaded.blob` before `setResult` (`useCloudJob.ts:318`) → feeds both `BeforeAfterSlider` and `DownloadButton`. **This mutates the displayed/downloaded artifact only — the stored Supabase object is unchanged.**

No YCbCr/chroma logic exists anywhere yet (grep: only a "luminance noise" comment).

### 4. Version pinning topology (codebase) + Replicate mechanism (external)

- **Definition & consumers:** `BREAD_VERSION` (`src/lib/services/bread.ts:15`) + `buildBreadInput` (`:35-41`). Imported by the Edge Function via **relative path** `import { BREAD_VERSION, buildBreadInput } from "../../../src/lib/services/bread.ts"` (`index.ts:25`), used in the prediction body `{ version: BREAD_VERSION, input: buildBreadInput(signedSourceUrl) }` (`index.ts:334-337`), POSTed at `index.ts:348-359`. The **app never calls Replicate** — only the Edge Function. Also imported by `tests/bread.test.ts:2` which **asserts the literal hash** (`:6`). `scripts/spikes/bread-spike.ts:22` keeps its own copy (not the runtime path).
- **Build/deploy seam:** no codegen/prebuild exists in the repo (`package.json` scripts = `astro build` + `husky`). The `deploy` job (`.github/workflows/ci.yml:305-359`) runs `npm run build` → `wrangler deploy` (with a `preCommands` seam `:334-336`) and `supabase functions deploy enhance --use-api` (`:357`). Because the function bundles `bread.ts` **by relative path at deploy time**, writing the resolved hash into `bread.ts` is automatically consumed by both the Worker and the Edge Function with no extra wiring.
- **Replicate mechanism (external):** `GET /v1/models/{owner}/{name}` → `.latest_version.id` (64-hex), or `GET /v1/models/{owner}/{name}/versions` → `results[0].id`. Runtime stays on `POST /v1/predictions` with `"version": "<hash>"` (the pinned path — already in use). Replicate explicitly recommends pinning a version id rather than the model-level run-latest endpoint. Resolve once at deploy, bake, treat a version bump as a reviewable dependency bump. Sources: [Replicate HTTP API](https://replicate.com/docs/reference/http), [Create a prediction](https://replicate.com/docs/topics/predictions/create-a-prediction).
- **Telemetry:** jobs table (`supabase/migrations/20260528120000_create_jobs_table.sql:30-42`) has **no `model_version` column** (only `replicate_prediction_id`). Per-job writes go through `markJobProcessing`/`markJobSucceeded` (`src/lib/services/photo-job.service.ts:178-239`); persisting the resolved version needs a migration + a field on the command DTO in `src/types.ts`.
- **Rollback:** git-native. One constant is the single source of truth (consumed by both build targets); revert the pin commit → merge to master → `deploy` rebuilds/redeploys with the prior hash. `tests/bread.test.ts:6` couples the test to the pinned value — reconcile (regenerate or relax the assertion) when the hash becomes build-resolved.

### 5. RGB/RGBA contract

- **Input:** upload accepts **both** JPG and PNG (`src/types.ts:46-49`; `ImageUploader.tsx:68`; bucket allows jpeg/png/heic, `20260528120100_create_photos_storage.sql:28`). **No alpha-flattening / RGB normalization anywhere** — the source is passed to Bread verbatim (`buildBreadInput` just forwards the signed URL). An alpha PNG reaches Bread and **fails** (`Input size must have a shape of (*, 3, H, W)`) — a known unhandled failure mode ([[bread-rejects-rgba-input]]; `tests/e2e/north-star-cloud-result.spec.ts:52-56`).
- **Output:** stored verbatim (`index.ts:561-564`), never re-encoded/normalized. A chroma-pass must keep its output **3-channel RGB** at the boundary it runs (upload boundary `index.ts:561` for server-side; before `setResult` for client-side) so the stored/displayed result and any future S-13 re-feed stay within the `(*,3,H,W)` contract.

### 6. Watchdog / cold-boot interaction

`src/components/hooks/useCloudJob.ts`: `QUEUED_WATCHDOG_MS=30s` (`:87`), `PROCESSING_WATCHDOG_MS=300s` (`:88`). A **server-side** post-pass runs inside `/callback` **before** `markJobSucceeded`, so its CPU time counts against the already-tight 300 s PROCESSING budget (cold boot alone can approach it — see [[size-client-timeouts-and-provider-fetched-signed-url-ttls-to-the-external-models-cold-boot-ceiling-not-its-warm-latency]]); a slow pass risks the watchdog firing and racing the `processing`-guarded success. A **client-side** pass runs **after** `succeeded`, so it does not touch any watchdog.

## Code References

- `supabase/functions/enhance/index.ts:548-578` — `/callback` success branch: output fetch → store (server-side insertion span)
- `supabase/functions/enhance/index.ts:334-359` — prediction body (`version: BREAD_VERSION`) + POST
- `supabase/functions/enhance/index.ts:579-605` — callback catch (post-pass failure already handled if placed pre-upload)
- `supabase/functions/enhance/deno.json` — import map (no image lib)
- `src/lib/services/replicate-webhook.ts:239-259` — `isAllowedOutputUrl` (SSRF allowlist); `:205-219` — extension mapping
- `src/lib/services/bread.ts:15,35-41` — `BREAD_VERSION`, `buildBreadInput`
- `tests/bread.test.ts:6` — literal-hash assertion (reconcile on resolve-and-pin)
- `src/lib/services/photo-job.service.ts:178-239` — `markJobProcessing`/`markJobSucceeded` (telemetry threading)
- `supabase/migrations/20260528120000_create_jobs_table.sql:30-42` — jobs schema (no `model_version`)
- `.github/workflows/ci.yml:305-359` — `deploy` job (build/deploy resolver seam at `:334-336`)
- `src/lib/engines/local-engine.ts:50-72` + `image-helpers.ts:64-71` — reusable Canvas/LUT pattern
- `src/components/hooks/useCloudJob.ts:88,297-327` — watchdog budget; client result load (`setResult` at `:318`)
- `src/lib/services/cloud-result.client.ts:45-56` — client fetch/decode of the cloud result

## Architecture Insights

- **The constraint inverts the intuitive design.** "Post-pass after Bread, before we store the result" reads as an Edge Function job, but the Edge runtime's 2 s CPU cap makes full-res per-pixel work infeasible there. The cheapest _feasible_ host is the **client**, at the cost of only touching the _displayed_ artifact.
- **`bread.ts` is the single pin point** (relative-imported by the Deno function, bundled at deploy) — both the version pin and any shared chroma constants belong there or in a sibling pure module (lesson #4: no `astro:env`, no Deno globals, Web-standard APIs only).
- **The two workstreams are independent and separable** — version resolve-and-pin is low-risk and could ship first; the chroma-pass host is the genuinely open decision.
- **"Adaptive" favors pixel-access hosts** (client or Worker-WASM): estimating shadow-region chroma noise to tune strength needs the decoded buffer, which the Edge Function cannot afford.

## Historical Context (from prior changes)

- `context/changes/cloud-ai-realtime-result/spike-findings.md` — Phase-0 spike that locked `BREAD_VERSION`/gamma/strength; subjective quality was called "inconclusive" on a noise chart, not a real low-light color photo (the gap this slice addresses). Cold ≈ 118–135 s.
- [[bread-rejects-rgba-input]] (memory) — the RGB-only input contract, discovered S-04 Phase-3 live E2E.
- `context/foundation/lessons.md` — lesson #4 (shared module portability), the Deno-excluded-from-tsc/eslint lesson (`deno check` is the only static coverage for the function), the cold-boot/TTL lesson (watchdog budget), and the SSRF-allowlist seam.

## Related Research

- `context/changes/adaptive-enhancement-parameters/frame.md` — S-12 frames user-facing `gamma`/`strength` sliders; its "S-11's chroma post-pass stays internal" boundary is consistent with both host options here. The contract reconciliation between S-11 and S-12 (change notes) still applies.

## Open Questions

1. ~~**[Decision for `/10x-plan`] Stored vs. displayed artifact.**~~ **RESOLVED (2026-06-20): client-side Canvas.** The user-visible result is sufficient; the displayed + downloaded image is chroma-denoised, the stored Bread `result.<ext>` stays raw, no paid Worker / new infra. Server-side is deferred to if/when S-13 needs the processed cloud file. (Questions 2 and 3 below — Worker cost and large-photo memory — are therefore moot for S-11.) See `change.md` → "Locked decision".
2. **Cost/plan implications** if Worker-WASM: requires the Cloudflare **paid** plan + CPU-limit bump; confirm current pricing and the 5-min CPU ceiling still holds for the account's plan.
3. **Large-photo memory** on the Worker path: 128 MB isolate caps ~10–12 MP — define a max dimension / downscale policy, or rule the Worker path out for full-res.
4. **Adaptive algorithm definition** — how to estimate shadow/near-black chroma noise and map it to a bounded denoise strength; needs the representative low-light photo set (a change-notes blocker) for tuning + A/B.
5. **`tests/bread.test.ts` reconciliation** — once the hash is build-resolved, decide whether the test reads the generated value or the assertion is relaxed.
6. **Resolver placement** — Worker `preCommands` (line-by-line) vs. a dedicated npm `prebuild` script vs. a CI step that writes `bread.ts`; and how the Edge Function deploy (`supabase functions deploy`) picks up the same resolved value (it bundles `bread.ts`, so writing there covers both).
