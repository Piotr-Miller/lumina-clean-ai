# Bread chroma-denoise post-pass + pinned version resolution — Implementation Plan

## Overview

S-11 delivers two independent workstreams for the Cloud (Bread) path:

- **A — Adaptive chroma-denoise post-pass (client-side).** A new, DOM-free YCbCr chroma-denoise runs **in the browser** on the fetched Cloud result: blur only the Cb/Cr channels, recombine with the original luminance, weighted per-pixel by darkness (strong in near-black, ~zero in highlights). It improves the _displayed and downloaded_ image; the stored Supabase object stays the raw Bread output. Ships behind a **default-OFF** build-time flag.
- **B — Resolve-and-pin the Bread version.** Replace the hand-typed `BREAD_VERSION` hash with a value resolved from Replicate at bump time by a committed script (no runtime "latest"), and record the pinned version per job (`jobs.model_version`).

The two workstreams are sequenced B (low-risk, server-side) then A (the user-visible quality work).

## Current State Analysis

- The cloud pipeline's output handling lives entirely in the Edge Function `supabase/functions/enhance/index.ts`. `/callback` fetches the Replicate output and stores it verbatim (`index.ts:548-578`); the **Edge runtime cannot host a full-res pixel pass** (hard 2 s CPU cap, no image lib) — hence the client-side host (locked decision, `change.md`).
- `BREAD_VERSION` is a hand-typed hash in `src/lib/services/bread.ts:15`, a **pure module shared across the Deno boundary** (relative-imported by the Edge Function at `index.ts:25`, used in the prediction body at `index.ts:334-337`). Runtime already calls the **version-pinned** Replicate endpoint — the only gap is that the hash is hand-typed. `tests/bread.test.ts:6` asserts the literal hash.
- The jobs table (`supabase/migrations/20260528120000_create_jobs_table.sql:30-42`) has **no `model_version` column**; per-job writes go through `markJobProcessing`/`markJobSucceeded` (`src/lib/services/photo-job.service.ts:178-239`).
- The client already has the exact image pattern to reuse: `ImageData` 4-byte-stride processing + `canvasToBlob` (`src/lib/engines/local-engine.ts:50-72`), `buildGammaLut` (`src/lib/engines/image-helpers.ts:64-71`). The cloud result is fetched client-side in `useCloudJob` (`loadCloudResult` → `setResult`, `useCloudJob.ts:297-327`).

Full grounding: `context/changes/bread-chroma-postpass/research.md`.

## Desired End State

- The exposed Replicate API token is rotated before any resolver call; the fresh token is installed in the hosted Edge Function and the two local env files that actually consume it.
- A committed npm script resolves the latest Bread version, validates its input contract, and rewrites `bread.ts` + its test; bumps land via PR; rollback = git-revert. Every real or E2E-stubbed processing job records the pinned `model_version`.
- A pure, unit-tested chroma-denoise module exists and is wired into the cloud result path behind a **default-OFF** flag. With the flag off, behavior is byte-identical to today. With it on, both the slider and download consume the processed Blob through a managed object URL.
- The post-pass is bounded to 12 MP, degrades safely to the raw Bread result on an unsupported size or processing failure, and has an explicit performance/memory GO gate before production enablement.
- Params are tuned on a representative low-light set, A/B results + a **GO/NO-GO** decision are recorded. The flag is still OFF at the end of S-11; turning it ON in production is a separate follow-up after acceptance.

Verify: `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npx supabase db reset` + integration suite, `deno check` on the Edge Function all green; flag-off cloud flow unchanged; tuning doc present with a GO/NO-GO.

## What We're NOT Doing

- **Not** running the pass server-side / **not** mutating the stored Supabase object (deferred to if/when S-13 needs the processed cloud file).
- **Not** touching the Local engine (S-11 is Cloud/Bread only; S-12 owns user-facing params).
- **Not** adding a user-facing toggle (the pass stays internal).
- **Not** flipping the flag ON in production (separate follow-up).
- **Not** fixing the unrelated "alpha PNG source → Bread reject" input failure mode (out of scope).
- **Not** introducing a Cloudflare-Worker WASM path or any new paid infra.

## Implementation Approach

Workstream B first because it is low-risk, purely server/tooling-side, and independent of the algorithm. Then build the chroma-pass as a pure testable module (A core), wire it into the client behind a dark flag, and finish with a tuning + GO/NO-GO phase that leaves the flag OFF.

## Critical Implementation Details

- **`model_version` is written ONCE, in `markJobProcessing`** (alongside `replicate_prediction_id`), where the version is known at prediction-create time. `markJobSucceeded` must **not** write or overwrite it.
- **Canvas buffers are RGBA.** `getImageData` always returns 4 channels. The chroma math touches R/G/B only; before export the wiring must **force every alpha byte to 255 (opaque)** and export as `image/jpeg` (no alpha). "Keeps RGB" is insufficient — an un-forced alpha would composite unpredictably on JPEG flatten.
- **Processed preview and download share one Blob.** When enabled, create a browser object URL from the processed JPEG and use it as `afterUrl`; the raw signed URL must not remain the slider source. Revoke that object URL when the job changes, the load effect is cancelled, or the hook unmounts.
- **Failure is quality degradation, not result loss.** If the post-pass exceeds its 12 MP guard or decoding/Canvas/encoding fails, return the raw Bread Blob + signed URL, log a bounded warning, and still render the successful cloud job.
- **Memory stays bounded.** The pure algorithm may allocate full-frame byte buffers for Cb, Cr, and one reusable blur scratch buffer, but no full-frame `Float32Array`s and no per-pixel objects/allocations. At 12 MP this caps typed-array working storage at roughly 36 MB beyond the existing RGBA `ImageData`/Canvas backing stores.
- **`bread.ts` must stay pure** (no `astro:env`, no Deno globals, Web-standard APIs only — lesson #4): it crosses the Deno boundary. The resolver script edits the _value_ of `BREAD_VERSION`, never adds imports.
- **A version bump is schema-checked before files change.** Resolve `latest_version.id`, fetch that exact version, and verify its OpenAPI input schema still exposes compatible `image`, `gamma`, and `strength` fields. Prepare and validate both text replacements in memory before writing either file.
- **The Edge Function gets no tsc/eslint coverage** (lesson: excluded from the Astro graph) — validate `enhance/index.ts` changes with `deno check --config supabase/functions/enhance/deno.json`.
- **`REPLICATE_API_TOKEN` is never committed.** The token shown in the planning conversation is compromised and must be rotated before Phase 1. Install the fresh value in the Replicate dashboard, hosted Supabase Edge Function secret, local `.env`, and local `supabase/functions/.env`; this repo does not use `.dev.vars` for that token.

## Phase 1: Resolve-and-pin the Bread version

### Overview

Rotate the compromised token, then replace the hand-typed hash with a value a committed script resolves and contract-validates from Replicate; bumps are reviewable PRs, rollback is git-revert.

### Changes Required:

#### 0. Security prerequisite: rotate the exposed token

**External/local configuration**: Replicate dashboard, hosted Supabase Edge Function secret, `.env`, `supabase/functions/.env`
**Intent**: Revoke the token exposed during planning before any implementation or resolver request uses it.
**Contract**: Generate a fresh Replicate token; update the hosted Edge Function with `supabase secrets set REPLICATE_API_TOKEN=...`; update the two gitignored local files; confirm the old token receives an authentication failure. Do not copy the token into committed files, command transcripts, `.dev.vars`, or the review report.

#### 1. Pure resolver/rewrite logic

**File**: `scripts/lib/bread-version-resolver.ts` (new)
**Intent**: Keep response validation, input-contract checks, and exact text replacement independently unit-testable without executing the CLI or touching real files.
**Contract**: Validate a 64-hex `latest_version.id`; validate the exact version's OpenAPI input schema has compatible `image`, `gamma`, and `strength` properties; require exactly one `BREAD_VERSION` constant match and exactly one pinned-hash test match; build both rewritten file contents in memory and throw before any write on a missing/duplicate match or incompatible schema.

#### 2. Version resolver CLI

**File**: `scripts/resolve-bread-version.ts` (new)
**Intent**: Resolve the current `mingcv/bread` version from Replicate and rewrite the pinned constant + its test assertion, printing old→new for the PR diff. Run on demand (deliberate bump), never automatically at deploy.
**Contract**: Reads `REPLICATE_API_TOKEN` from env (fails clearly if absent). Fetch the model to obtain `latest_version.id`, then fetch that exact version's schema. Delegate all validation/rewrite work to `bread-version-resolver.ts`; only after both new file contents are valid write `src/lib/services/bread.ts` and `tests/bread.test.ts`. Idempotent (no-op if already current). Update the test description from "locked Phase-0" to reviewed/pinned wording. Leave `scripts/spikes/bread-spike.ts` explicitly frozen as historical Phase-0 evidence rather than silently treating it as a runtime pin.

#### 3. npm script

**File**: `package.json`
**Intent**: Expose the resolver as a named script.
**Contract**: Add `"resolve:bread-version": "tsx scripts/resolve-bread-version.ts"` to `scripts`.

#### 4. Resolver tests

**File**: `tests/bread-version-resolver.test.ts` (new), `tests/bread.test.ts`
**Intent**: Prove valid rewrites and fail-closed behavior for incompatible or ambiguous updates.
**Contract**: Cover a valid model+version response, already-current no-op, malformed hash, missing `image`/`gamma`/`strength`, and zero/multiple text matches. `tests/bread.test.ts` continues to assert the committed pin, with wording that no longer claims it is permanently locked to Phase 0.

#### 5. Bump/rollback note

**File**: `context/changes/bread-chroma-postpass/change.md` (or a short `README` in the change folder)
**Intent**: Document the bump workflow (run script → review hash diff → PR → merge → deploy rebuilds Worker + `enhance`) and rollback (revert the pin commit), and that the token comes from a secret.
**Contract**: Prose only.

### Success Criteria:

#### Automated Verification:

- Resolver contract/rewrite unit tests pass (valid, incompatible schema, ambiguous match, no-op): `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- `tests/bread.test.ts` passes against the reviewed pinned hash

#### Manual Verification:

- The exposed Replicate token is revoked; the fresh token is installed in hosted Supabase plus `.env` and `supabase/functions/.env`; the old token is rejected
- Running `REPLICATE_API_TOKEN=… npm run resolve:bread-version` resolves the real `latest_version.id` and rewrites both files; the PR diff shows a clean hash change (or a no-op if already current)
- A deliberately incompatible mocked input schema causes a fail-closed exit and leaves both target files unchanged
- Revert of the pin commit restores the prior hash

---

## Phase 2: Per-job `model_version` telemetry

### Overview

Persist the pinned version on each job at prediction-create time.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_model_version_to_jobs.sql` (new)
**Intent**: Add a nullable column recording the Bread version a job ran. Older rows stay null.
**Contract**: `alter table public.jobs add column model_version text;` No new RLS policy needed (a column inherits the table's existing policies; service-role writes it). Follow the migration-naming convention.

#### 2. Types + command DTO

**File**: `src/types.ts`
**Intent**: Add `model_version` to the job entity and to the `markJobProcessing` command input.
**Contract**: Add `model_version: string | null` to the job entity; thread a `modelVersion` field into the processing-command DTO.

#### 3. Service write (processing only)

**File**: `src/lib/services/photo-job.service.ts`
**Intent**: `markJobProcessing` writes `model_version` alongside `replicate_prediction_id`. `markJobSucceeded` is unchanged.
**Contract**: Extend the `markJobProcessing` UPDATE (`:228-239`) to set `model_version`. Do not touch `markJobSucceeded`.

#### 4. Edge Function passes the version

**File**: `supabase/functions/enhance/index.ts`
**Intent**: Pass `BREAD_VERSION` into the `markJobProcessing` call at `/start`.
**Contract**: At the `markJobProcessing` call (~`index.ts:372`), include `modelVersion: BREAD_VERSION`.

#### 5. Telemetry tests and E2E processing stub

**Files**: `tests/photo-job-helpers.test.ts`, `tests/jobs.rls.test.ts`, `tests/e2e/helpers/replicate-stub.ts`
**Intent**: Cover the full telemetry blast radius and keep stubbed E2E rows representative of real processing rows.
**Contract**: Make `MarkJobProcessingCommand.modelVersion` required. Update every unit caller and exact payload assertion. In the real-Supabase success test, advance the row through `markJobProcessing(..., modelVersion: BREAD_VERSION)` and assert `model_version` survives `markJobSucceeded`. Update `flipToProcessing` to write `model_version` too, defaulting to the shared `BREAD_VERSION`, rather than leaving E2E processing rows as an undocumented telemetry exception.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Integration suite (incl. `jobs.rls.test.ts`) passes: `npm test`
- Unit tests assert required `modelVersion` is written and `markJobSucceeded` does not overwrite it: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Edge Function static check passes: `deno check --config supabase/functions/enhance/deno.json supabase/functions/enhance/index.ts`

#### Manual Verification:

- A submitted cloud job's row shows `model_version` = the pinned hash; an unrelated/older row is null

---

## Phase 3: Chroma-denoise algorithm (pure module)

### Overview

The testable core: a DOM-free function that reduces Cb/Cr noise in dark regions while preserving luminance.

### Changes Required:

#### 1. Chroma-denoise module

**File**: `src/lib/engines/chroma-denoise.ts` (new)
**Intent**: Operate on an RGBA pixel buffer: derive Y/Cb/Cr per pixel, blur (separable Gaussian/box) only Cb/Cr, then recombine to RGB using the **original Y** and a **per-pixel shadow weight** (blend toward the denoised chroma strongly where luma is low, ~0 in highlights). Bounded, conservative defaults. Pure (no DOM).
**Contract**: A function over `(data: Uint8ClampedArray, width: number, height: number, params)` operating in place, where `params = { blurRadius, maxStrength, shadowCurve }`. Touches R/G/B; leaves alpha to the caller. All outputs clamp to `[0,255]`. Export conservative defaults plus `MAX_CHROMA_POSTPASS_PIXELS = 12_000_000`. Validate `data.length === width * height * 4` and reject larger images before allocating. Use byte-sized full-frame Cb/Cr arrays plus one reusable byte scratch buffer; no full-frame float buffers and no allocation inside pixel/kernel loops.

#### 2. Unit tests

**File**: `tests/chroma-denoise.test.ts` (new)
**Intent**: Lock the algorithm's invariants on synthetic buffers.
**Contract**: Assert: (a) Cb/Cr variance drops in a synthetic noisy near-black block; (b) luminance (Y) per pixel is preserved within tolerance; (c) a bright/clean region is ~unchanged (shadow weight ≈ 0); (d) RGB round-trip stays in range; (e) deterministic output for fixed params; (f) malformed dimensions and >12 MP input fail before full-frame allocation; (g) alpha is unchanged by the pure algorithm.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- (none — pure module; visual validation is Phase 5)

---

## Phase 4: Wire into the cloud result, flag default-OFF

### Overview

Apply the pass to the fetched cloud result behind a dark flag, with explicit RGBA→opaque→JPEG handling, a processed preview object URL, and fail-open fallback to the raw Bread result.

### Changes Required:

#### 1. Build-time flag

**File**: `src/lib/engines/chroma-denoise.ts` (or a small flags module)
**Intent**: A committed boolean gate, default `false`, flipped only by a later follow-up.
**Contract**: `export const CHROMA_POSTPASS_ENABLED = false;`

#### 2. Browser adapter + injectable orchestration seam

**File**: `src/lib/services/cloud-result-postprocess.client.ts` (new)
**Intent**: Keep DOM/Canvas work out of `useCloudJob` while exposing a Node-testable seam for flag, limit, and fallback behavior.
**Contract**: Export a real `processCloudResultBlob(blob, width, height)` adapter that decodes the Blob, draws it to Canvas, reads RGBA, runs `denoiseChroma`, forces every alpha byte to 255, writes pixels back, and encodes `image/jpeg` at the chosen quality. Also export `maybePostprocessCloudResult({ enabled, blob, width, height, processor? })`: disabled → original Blob; over 12 MP → original Blob + fallback reason without invoking the processor; processor success → processed JPEG; processor throw/encode failure → original Blob + bounded fallback reason. The optional processor injection exists only to test orchestration under Node; no DOM is touched at module import time.

#### 3. Wire processed preview + lifecycle into the cloud result load

**File**: `src/components/hooks/useCloudJob.ts`
**Intent**: When enabled and successful, use the same processed Blob for both slider and download; otherwise preserve today's raw signed-URL + Blob behavior.
**Contract**: After `loadCloudResult`, call `maybePostprocessCloudResult`. If it returns a processed Blob, create `URL.createObjectURL(processedBlob)`, store that object URL as `afterUrl`, and store the same Blob for `DownloadButton`. If disabled/fallback, retain the raw signed URL and raw Blob byte-for-byte. Revoke only the generated object URL on cancellation, job/input change, and unmount; never revoke the signed URL. Check `cancelled` before and after the async pass so a stale job cannot publish a result. A post-pass failure logs a scrub-safe warning but does not set `RESULT_LOAD_MESSAGE` or turn a succeeded job into failure.

#### 4. Tests

**Files**: `tests/cloud-result-postprocess.test.ts` (new), `tests/chroma-denoise.test.ts`
**Intent**: Lock every deterministic contract without pretending Node Vitest contains a browser Canvas codec.
**Contract**: Under Node with an injected processor, assert: flag-off returns the original Blob and never calls the processor; over-limit returns raw without calling it; enabled success returns the processor's JPEG; processor failure returns raw. Unit-test the pure alpha-forcing helper with all alpha bytes becoming 255. Real Canvas decode/encode and the processed object-URL preview are browser/manual verification; the existing E2E remains the flag-OFF regression gate.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (flag-off no-op, over-limit/error fallback, injected flag-on processor, opaque-alpha helper): `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- E2E gate green (flag off → unchanged): `npm run test:e2e`

#### Manual Verification:

- With the flag locally forced ON, the slider source is a generated object URL for the processed JPEG; the cloud result shows reduced shadow/near-black color noise and the downloaded bytes match that displayed result
- A forced processor failure and an image over 12 MP both render/download the raw Bread result instead of surfacing a cloud-job failure
- With the flag OFF, the cloud result is unchanged from current behavior

---

## Phase 5: Tune on real low-light photos + GO/NO-GO

### Overview

Tune the default params against a representative set, record A/B, and decide GO/NO-GO. The flag stays OFF.

### Changes Required:

#### 1. Tuning + decision record

**File**: `context/changes/bread-chroma-postpass/tuning-results.md` (new)
**Intent**: Capture the representative set (very dark / moderately dark / mixed), the chosen params, before/after A/B observations, and an explicit **GO/NO-GO** recommendation for a future production-enable follow-up.
**Contract**: Prose + before/after notes. Include measured processing time at small, typical, and ~12 MP sizes; record the algorithm's deterministic typed-array allocation budget and observed browser behavior; verify the raw fallback. GO requires acceptable quality, no visible UI lock beyond the agreed budget, and a ~12 MP pass completing within 2 seconds on the maintainer reference desktop. If the benchmark fails, record NO-GO and open a separate Web Worker/chunking follow-up. State clearly that the flag remains OFF and enabling is a separate change.

#### 2. Param tuning (flag stays off)

**File**: `src/lib/engines/chroma-denoise.ts`
**Intent**: Adjust the conservative default params (blur radius, shadow curve, max strength) per the A/B findings. No flag change.
**Contract**: Update the default-params constant; re-align `tests/chroma-denoise.test.ts` expectations if thresholds move.

### Success Criteria:

#### Automated Verification:

- Unit tests still pass with tuned params: `npm run test:unit`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- A/B on ≥3 real low-light photos (very dark / moderately dark / mixed) confirms cleaner shadow color without luminance softening
- Small/typical/~12 MP benchmark and forced fallback checks are recorded; GO requires ~12 MP ≤2 s on the reference desktop, otherwise NO-GO + Worker/chunking follow-up
- `tuning-results.md` records the set, params, A/B, performance/memory evidence, and a GO/NO-GO decision; the flag is confirmed still OFF

---

## Testing Strategy

### Unit Tests:

- Resolver schema validation + exact fail-closed rewrite logic (mocked Replicate responses) — Phase 1
- `markJobProcessing` requires/writes `model_version`; `markJobSucceeded` does not overwrite — Phase 2
- Chroma math invariants (chroma-variance drop, Y preserved, highlight no-op, clamp, determinism, size guard) — Phase 3
- Flag-off no-op + over-limit/error fallback + injected flag-on processor + opaque-alpha helper — Phase 4

### Integration Tests:

- `jobs.rls.test.ts` + full suite against ephemeral Supabase after the `model_version` migration — Phase 2

### Manual Testing Steps:

1. Rotate the exposed token and prove the old token is rejected (Phase 1 prerequisite)
2. Run the resolver with the fresh token → compatible-schema check + clean hash diff / no-op (Phase 1)
3. Submit a cloud job → row has `model_version` = pinned hash (Phase 2)
4. Flag ON locally → processed object-URL preview + matching download; force error/oversize → raw fallback; flag OFF → unchanged (Phase 4)
5. A/B and benchmark the representative set, record GO/NO-GO (Phase 5)

## Performance Considerations

The pass runs client-side and **after** the job is `succeeded`, so it does not touch the cold-boot watchdog budgets (`useCloudJob.ts:87-88`), but browser CPU/memory are still finite. Cap the pass at 12 MP. Keep full-frame temporary storage to byte Cb + Cr + one reusable byte scratch buffer (~36 MB at 12 MP) in addition to Canvas/ImageData; do not use full-frame floats or per-pixel allocations. The Local engine is not a valid performance proxy because its blur is native `ctx.filter`; Phase 5 must benchmark this JavaScript pass directly. Unsupported size or any processing/encoding failure falls back to the raw Bread result. A GO requires ~12 MP processing within 2 seconds on the reference desktop; otherwise the flag stays OFF and Worker/chunking becomes a separate follow-up.

## Migration Notes

- `jobs.model_version` is additive and nullable — existing rows are unaffected; no backfill.
- **Security prerequisite (blocking Phase 1):** the token was exposed in the planning conversation. Rotate it in Replicate, update the hosted Edge Function secret plus local `.env` and `supabase/functions/.env`, and prove the old token is rejected. The repo/history scan being clean does not make the exposed live credential safe.

## References

- Research: `context/changes/bread-chroma-postpass/research.md`
- Identity + locked host decision: `context/changes/bread-chroma-postpass/change.md`
- Reusable client image pattern: `src/lib/engines/local-engine.ts:50-72`, `src/lib/engines/image-helpers.ts:64-71`
- Pin point + consumers: `src/lib/services/bread.ts:15`, `supabase/functions/enhance/index.ts:25,334-337`
- Telemetry write site: `src/lib/services/photo-job.service.ts:228-239`
- Cloud result wiring: `src/components/hooks/useCloudJob.ts:297-327`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Resolve-and-pin the Bread version

#### Automated

- [x] 1.1 Resolver contract/rewrite tests pass (valid, incompatible schema, ambiguous match, no-op) — d86f1cb
- [x] 1.2 Type checking passes — d86f1cb
- [x] 1.3 Linting passes — d86f1cb
- [x] 1.4 `tests/bread.test.ts` passes against the reviewed pinned hash — d86f1cb

#### Manual

- [x] 1.5 Exposed token rotated in hosted/local consumers; old token rejected — d86f1cb
- [x] 1.6 `resolve:bread-version` validates the real latest schema and rewrites both files (clean PR diff / no-op) — d86f1cb
- [x] 1.7 Incompatible schema fails closed with both target files unchanged — d86f1cb
- [x] 1.8 Revert of the pin commit restores the prior hash — d86f1cb

### Phase 2: Per-job `model_version` telemetry

#### Automated

- [x] 2.1 Migration applies cleanly (`supabase db reset`) — d6341a1
- [x] 2.2 Integration suite (incl. `jobs.rls.test.ts`) passes — d6341a1
- [x] 2.3 Unit tests assert required `modelVersion` write and no success overwrite — d6341a1
- [x] 2.4 Type checking passes — d6341a1
- [x] 2.5 `deno check` on the Edge Function passes — d6341a1

#### Manual

- [x] 2.6 A submitted cloud job's row shows `model_version` = pinned hash; older row null — d6341a1

### Phase 3: Chroma-denoise algorithm (pure module)

#### Automated

- [x] 3.1 Unit tests pass (quality invariants, size guard, alpha preservation, bounded buffers) — 7dab1a2
- [x] 3.2 Type checking passes — 7dab1a2
- [x] 3.3 Linting passes — 7dab1a2

### Phase 4: Wire into the cloud result, flag default-OFF

#### Automated

- [x] 4.1 Unit tests pass (no-op, injected success, opaque alpha, raw fallbacks)
- [x] 4.2 Type checking passes
- [x] 4.3 Linting passes
- [x] 4.4 E2E gate green (flag off → unchanged)

#### Manual

- [x] 4.5 Flag ON → processed object-URL preview; download matches displayed JPEG
- [x] 4.6 Processor error and >12 MP input fall back to raw Bread result
- [x] 4.7 Flag OFF → cloud result unchanged from current behavior

### Phase 5: Tune on real low-light photos + GO/NO-GO

#### Automated

- [ ] 5.1 Unit tests still pass with tuned params
- [ ] 5.2 Type checking passes
- [ ] 5.3 Linting passes

#### Manual

- [ ] 5.4 A/B on ≥3 real low-light photos confirms cleaner shadow color without luminance softening
- [ ] 5.5 Small/typical/~12 MP benchmark + fallback evidence recorded; GO requires ~12 MP ≤2 s
- [ ] 5.6 `tuning-results.md` records quality/perf evidence + GO/NO-GO; flag confirmed still OFF
