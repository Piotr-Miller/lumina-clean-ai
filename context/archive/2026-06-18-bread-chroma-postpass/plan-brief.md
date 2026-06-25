# Bread chroma-denoise post-pass + pinned version resolution — Plan Brief

> Full plan: `context/changes/bread-chroma-postpass/plan.md`
> Research: `context/changes/bread-chroma-postpass/research.md`

## What & Why

Night/low-light Cloud (Bread) results still show colored noise in dark and near-black regions. S-11 adds an **adaptive YCbCr chroma-denoise post-pass** (browser-side) that cleans shadow color without softening luminance detail, and **pins the Bread model version** at bump time (no runtime "latest") with per-job version telemetry.

## Starting Point

Today the Edge Function fetches Bread's output and stores it verbatim; there is no post-processing and no per-job version record, and `BREAD_VERSION` is a hand-typed hash in a Deno-shared module (`bread.ts:15`). The client already fetches the cloud result blob (`useCloudJob`) and has a reusable Canvas/`ImageData` pipeline (`local-engine.ts`).

## Desired End State

A signed-in user's Cloud result is displayed and downloaded from the same processed JPEG/object URL with reduced shadow chroma noise (when enabled); the stored Supabase object remains the raw Bread output. Oversized or failed client processing safely falls back to the raw result. The pinned Bread version is resolved and input-schema-validated by a committed script and recorded on every job. At the end of S-11 the pass ships **flag-OFF** with tuned params and a GO/NO-GO; production enable is a separate follow-up.

## Key Decisions Made

| Decision                   | Choice                                                   | Why (1 sentence)                                                                              | Source            |
| -------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------- |
| Post-pass host             | Client-side Canvas                                       | Edge Function ruled out by a 2 s CPU cap; client has no platform limit and reuses tested code | Research          |
| Stored vs displayed        | Displayed/downloaded only                                | User-visible result is enough; server-side deferred to S-13                                   | Research          |
| Chroma operation           | Gaussian/box blur of Cb/Cr                               | Cheap, standard, leaves luminance untouched                                                   | Plan              |
| "Adaptive" mechanism       | Per-pixel shadow-weighted blend                          | Matches the spec (dark regions only), protects highlights                                     | Plan              |
| Gating                     | Build-time flag, default OFF                             | Lets code merge before tuning; clean prod-enable decision                                     | Plan              |
| Photo set                  | Plan a tuning phase                                      | Turns the blocker into an explicit, owned step                                                | Plan              |
| Version resolver           | Committed deliberate-bump script                         | Reviewable pin, git-revert rollback, test stays truthful, no drift                            | Plan              |
| Telemetry                  | Per-job `model_version` column                           | True per-prediction audit, queryable                                                          | Plan              |
| `model_version` write site | `markJobProcessing` only                                 | Known at create-time; `markJobSucceeded` must not overwrite                                   | Plan (Codex)      |
| Processed preview          | Managed object URL from the processed Blob               | Slider and download must show the same bytes                                                  | Plan review F1    |
| Failure/size policy        | Raw Bread fallback; 12 MP cap                            | A quality post-pass must never hide a successful cloud result                                 | Plan review F3/F4 |
| Resolver safety            | Validate the exact version's input schema before rewrite | A mechanically updated hash test cannot detect contract drift                                 | Plan review F5    |
| Phase 5 outcome            | Tune + A/B + GO/NO-GO, flag stays OFF                    | Production enable is a separate small follow-up after acceptance                              | Plan (Codex)      |

## Scope

**In scope:** client-side adaptive chroma-pass on the Cloud result (flag-OFF); build/deploy-resolved pinned `BREAD_VERSION`; per-job `model_version` telemetry; tuning + GO/NO-GO.

**Out of scope:** server-side / mutating the stored object; Local engine; user-facing toggle; flipping the flag ON in prod; the "alpha PNG source → Bread reject" input failure; any new paid infra.

## Architecture / Approach

Two independent workstreams. **B (server/tooling):** after rotating the exposed token, a committed `resolve:bread-version` script validates the exact Replicate version's `image`/`gamma`/`strength` schema before rewriting the pinned hash in `bread.ts` + its test; `jobs.model_version` is written once in `markJobProcessing`, including the E2E processing stub. **A (client):** a pure `chroma-denoise.ts` module (RGB→YCbCr → blur Cb/Cr → shadow-weighted recombine→RGB) is unit-tested, then a DOM adapter processes the cloud Blob behind a default-OFF flag. Canvas RGBA is forced opaque and encoded as JPEG; a managed object URL feeds the slider and the same Blob feeds download. A 12 MP/error guard falls back to raw Bread.

## Phases at a Glance

| Phase                | What it delivers                                                       | Key risk                                                   |
| -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Resolve-and-pin   | Rotate token; resolver validates schema and rewrites `bread.ts` + test | Credential safety; provider input-contract drift           |
| 2. Telemetry         | `jobs.model_version` written in `markJobProcessing`                    | Migration + Deno-side threading (no tsc cover)             |
| 3. Algorithm         | Pure, bounded, unit-tested chroma-denoise module                       | Chroma math, shadow weighting, buffer budget               |
| 4. Wiring (flag OFF) | Processed object-URL preview + matching download; raw fallback         | URL lifecycle, Canvas encoding, safe degradation           |
| 5. Tune + GO/NO-GO   | Quality A/B + small/typical/12 MP benchmark                            | Needs real photos; main-thread performance may force NO-GO |

**Prerequisites:** rotate the compromised `REPLICATE_API_TOKEN` and install the fresh value in hosted Supabase, `.env`, and `supabase/functions/.env`; a small representative low-light photo set for Phase 5.
**Estimated effort:** ~3–4 sessions across 5 phases (B is small; A's algorithm + tuning is the bulk).

## Open Risks & Assumptions

- Chroma blur can bleed color across edges — mitigated by bounded strength + shadow weighting; validated in Phase 5.
- The representative photo set must genuinely span very-dark / moderately-dark / mixed, or tuning under-generalizes.
- Browser CPU/memory are finite: the pass is capped at 12 MP, uses byte-sized bounded buffers, and falls back raw on limit/error. GO additionally requires ~12 MP ≤2 s on the reference desktop; otherwise record NO-GO and split Worker/chunking into a follow-up.
- The Replicate token shown during planning is compromised. Rotation is a blocking Phase 1 prerequisite even though the repo/history scan is clean.

## Success Criteria (Summary)

- With the flag ON, the slider uses a managed object URL for the processed JPEG and download uses the same Blob; limit/error falls back to raw Bread; flag OFF is byte-identical to today.
- Every new job records the pinned `model_version`; the pin is resolved by the committed script and revert-rollbackable.
- Phase 5 records quality plus small/typical/~12 MP performance evidence, ends with GO/NO-GO, and leaves the flag OFF.
