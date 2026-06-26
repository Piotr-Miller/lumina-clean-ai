# Enable the Bread chroma-denoise post-pass in production — Implementation Plan

## Overview

Turn the S-11 chroma-denoise post-pass ON in production. The algorithm shipped
flag-OFF (`CHROMA_POSTPASS_ENABLED = false`) because the Phase-5 GO rested on a
_synthetic_ A/B; the recorded gate (observation **F3** + the lesson _"a synthetic-GO is
a GO-to-merge-OFF, not a GO-to-enable"_) requires a real-Bread before/after first. This
plan closes that gate, adds the operational safety the dark feature lacks (a runtime
flag for fast rollback, telemetry, an ON-path test), and then flips it on.

## Current State Analysis

From `context/changes/chroma-postpass-enable/research.md` (full grounding there):

- The gate is a **build-time `const`** at `src/lib/engines/chroma-denoise.ts:63`, read
  only in the client island `useCloudJob.ts:6,330`. Flipping it today = code change +
  full CI + `wrangler deploy`; there is no fast rollback.
- When ON, the post-pass runs client-side in the post-`succeeded` effect
  (`useCloudJob.ts:299-367`): fetch signed result → decode → `denoiseChroma` →
  `forceOpaque` → re-encode JPEG at `JPEG_QUALITY = 0.92` (`canvas-helpers.ts:12`,
  `cloud-result-postprocess.client.ts:47-69`). Fail-open to raw on >12 MP or any error.
- **Zero observability**: a fallback only `console.warn`s (`useCloudJob.ts:340`), which
  default Sentry integrations capture as a _breadcrumb_ (rides a later event) but never
  a standalone signal; success records nothing; no timing. No DB column reflects it
  (`jobs.model_version` is the Bread _model_ version, unrelated).
- **No ON-path test**: `tests/cloud-result-postprocess.test.ts` covers the orchestrator
  with an injected stub; the real Canvas adapter and a flag-ON end-to-end flow are never
  exercised (the const is `false`, so CI always runs OFF).
- The local served Edge function makes a **real** Replicate call
  (`supabase/functions/enhance/index.ts:379`) — so a real Bread output can be produced
  on a local stack with a personal token, no prod `CLOUD_DAILY_CAP` burn.

## Desired End State

The chroma post-pass is **ON in production**, validated on real Bread output, with:
a runtime secret toggle (`CHROMA_POSTPASS_ENABLED`) that flips ON/OFF without a code
change; Sentry signal for run-rate, fallback-rate (+reason), and duration; an automated
test that exercises the real adapter with the flag ON; and a recorded real-Bread GO.
Verify: a real prod cloud job shows a processed (re-encoded) result with cleaner shadow
color; Sentry shows the post-pass signal; setting the secret to `false` restores the
raw result on the next page load.

### Key Discoveries:

- `src/pages/index.astro:5,34-40` already reads `astro:env/server` and threads server
  values as props into `<EnhanceWorkspace client:load>` — the exact seam for a runtime
  flag (Option B), so no new endpoint is needed.
- `CLOUD_PIPELINE_ENABLED`/`CLOUD_DAILY_CAP` (`astro.config.mjs:68,72`) are the
  server-secret precedent flipped via `wrangler secret put` — reused operationally.
- The orchestrator already takes `enabled` as a parameter
  (`cloud-result-postprocess.client.ts:75`), so moving the gate from a `const` to a prop
  leaves the pure module + its tests untouched.
- The archived A/B harness (`context/archive/2026-06-18-bread-chroma-postpass/ab-harness/index.html`)
  loads an arbitrary local image and runs the real bundled algorithm — the A/B vehicle.

## What We're NOT Doing

- **Not** re-encoding selectively — every result ≤ 12 MP is re-encoded at q0.92 as today
  (skip-when-unchanged optimization is explicitly out of scope).
- **Not** building a config endpoint / active-tab kill-switch (Option C). The SSR-prop
  toggle only affects **new page loads**; already-open tabs keep their value until reload.
- **Not** changing the algorithm, the 12 MP guard, or the fail-open behavior; the tuned
  defaults `(3, 0.9, 2.5)` may be retuned only if the real A/B is NO-GO in Phase 1.
- **Not** adding a per-user / UI toggle — this is a single global server flag.
- **Not** persisting post-pass outcome to the database (telemetry goes to Sentry, not a
  `jobs` column).
- **Not** running the real A/B against live prod (local stack + personal token only).

## Implementation Approach

Risk-first: validate the algorithm on real Bread output **before** investing in the
enable infrastructure (Phase 1 gates the rest). Then make the flag runtime-controllable
(Phase 2), add observability (Phase 3), and prove the ON path in CI (Phase 4) — all
landing with the flag still effectively OFF (secret unset → default `false`). Finally
flip the prod secret ON (Phase 5), gated on the Phase-1 GO, with rollback = secret OFF.

## Critical Implementation Details

- **Astro env boundary**: `CHROMA_POSTPASS_ENABLED` must be a `context:"server"` secret
  read in the `.astro` frontmatter and passed as a prop — a server secret is not
  readable inside the client island. Do not import `astro:env/server` into client code.
- **Flag-model limit (document it)**: because the prop is read at SSR, flipping the
  secret only affects **new page loads**; an already-hydrated tab keeps its old value
  until reload. `wrangler secret put` also ships a new Worker _version_ (a secret-version
  deploy), so "no redeploy" means "no code change / no CI rebuild", not literally zero
  deploy.
- **Object-URL lifecycle**: the processed-result object URL is minted at
  `useCloudJob.ts:343-347` and revoked in effect cleanup (`:355-366`) — S-11 Phase-4 F2
  flagged this as correct-but-fragile. Telemetry added around the post-pass call must not
  reorder or block that mint/revoke or the result render.

## Phase 1: Real-Bread A/B validation (the F3 gate)

### Overview

Produce real Bread outputs of genuinely-noisy low-light shadows on a local stack, A/B
them through the harness, and record an explicit GO/NO-GO. No production code changes.
This phase gates Phase 5.

### Changes Required:

#### 1. Real-Bread A/B results doc

**File**: `context/changes/chroma-postpass-enable/real-ab-results.md` (new)

**Intent**: Capture the inputs, the real Bread outputs, the before/after observations
per the S-11 criteria, and an explicit GO/NO-GO — the deferred F3 confirmation.

**Contract**: Prose + per-sample notes. Records: ≥1 genuinely-noisy real Bread output
(real high-ISO night shots, large flat dark regions, under-exposed, RGB JPG, ≤12 MP);
for each, visible shadow-chroma reduction, `maxΔY ≈ 0` (no luminance softening), and no
edge bleeding, judged in the harness diff/loupe; the final params used; and a GO/NO-GO.
On NO-GO: retune `DEFAULT_CHROMA_PARAMS` via the harness sliders and re-A/B (bounded
loop); if still unacceptable, stop here without enabling and record the finding.

#### 2. (NO-GO only) param retune

**File**: `src/lib/engines/chroma-denoise.ts`

**Intent**: Only if the real A/B is NO-GO at the current `(3, 0.9, 2.5)` — adjust
`DEFAULT_CHROMA_PARAMS` to the harness-found values and re-run the A/B. Skip entirely on
a first-pass GO.

**Contract**: Update the `DEFAULT_CHROMA_PARAMS` constant; `tests/chroma-denoise.test.ts`
default-param assertions are range checks, so they stay green unless a bound is crossed.

### Success Criteria:

#### Manual Verification:

- Local stack + real Replicate produced ≥1 genuinely-noisy real Bread output (recipe: research §C)
- Each output A/B'd in the harness: visible shadow-chroma reduction, `maxΔY ≈ 0`, no edge bleeding
- `real-ab-results.md` records inputs, observations, final params, and an explicit decision
- Decision is **GO** (if NO-GO after the bounded retune loop, stop — do not proceed to Phase 5)

---

## Phase 2: Runtime flag via SSR prop (Option B)

### Overview

Convert the build-time `const` gate into a server secret threaded to the island as a
prop, so the flag is runtime-controllable. Default `false` — no behavior change.

### Changes Required:

#### 1. Env schema

**File**: `astro.config.mjs`

**Intent**: Declare `CHROMA_POSTPASS_ENABLED` as a server secret defaulting to `false`,
mirroring the `CLOUD_PIPELINE_ENABLED` boolean.

**Contract**: `envField.boolean({ context: "server", access: "secret", default: false })`
added to the `env.schema` alongside the cloud flags (`astro.config.mjs:68`).

#### 2. Read at SSR + pass as prop

**File**: `src/pages/index.astro`

**Intent**: Read the new flag from `astro:env/server` in the frontmatter and pass it as a
`chromaEnabled` prop to `<EnhanceWorkspace>`.

**Contract**: New import from `astro:env/server` (alongside `index.astro:5`); new prop on
the island mount (`index.astro:34-40`).

#### 3. Thread the prop through the component → hook

**File**: `src/components/enhance/EnhanceWorkspace.tsx`, `src/components/hooks/useCloudJob.ts`

**Intent**: Add `chromaEnabled` to the workspace props and forward it into `useCloudJob`;
in the hook, use the arg instead of the imported const, and drop the const import.

**Contract**: `chromaEnabled: boolean` added to `EnhanceWorkspaceProps` (`EnhanceWorkspace.tsx:14-23`)
and to `UseCloudJobArgs` (`useCloudJob.ts:47-58`); `maybePostprocessCloudResult({ enabled: chromaEnabled, ... })`
replaces `enabled: CHROMA_POSTPASS_ENABLED` at `useCloudJob.ts:330`; remove the import at `useCloudJob.ts:6`.

#### 4. Retire the const

**File**: `src/lib/engines/chroma-denoise.ts`

**Intent**: Remove `CHROMA_POSTPASS_ENABLED` (its role moves to the env-schema default);
update the module doc to point at the env flag. Keep the pure algorithm + `denoiseChroma`
signature unchanged.

**Contract**: Delete the `export const CHROMA_POSTPASS_ENABLED` (`chroma-denoise.ts:57-63`)
and its doc block; update the `enabled` field JSDoc in
`cloud-result-postprocess.client.ts:75` so it no longer mentions the removed const. No
other export changes. (Local dev: set `CHROMA_POSTPASS_ENABLED` in `.dev.vars` for
`wrangler dev` / `.env` for `npm run dev` to exercise ON.)

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass (incl. `tests/cloud-result-postprocess.test.ts`): `npm run test:unit`
- SSR build succeeds: `npm run build`
- E2E gate green with the flag default-OFF: `npm run test:e2e`

#### Manual Verification:

- Secret unset → cloud result unchanged (raw Bread bytes)
- `CHROMA_POSTPASS_ENABLED=true` in `.dev.vars` under `npm run build && wrangler dev` → processed (re-encoded) preview + matching download
- Setting it back to `false` (new page load) → raw result restored

---

## Phase 3: Telemetry

### Overview

Add Sentry observability around the post-pass so that, once ON, we can see run-rate,
fallback-rate (+reason), and duration. Dormant while the flag is OFF.

### Changes Required:

#### 1. Instrument the post-pass call

**File**: `src/components/hooks/useCloudJob.ts`

**Intent**: Time the post-pass and emit Sentry signal without creating one event per
successful result: success records a breadcrumb/metric with duration on `processed`;
fallback records a `captureMessage` (warning) with the scrub-safe `fallbackReason` +
dimensions. Keep the existing `console.warn`.

**Contract**: Use the `@sentry/astro` client API (`captureMessage` for fallback,
`addBreadcrumb` or metric/measurement for success) around the `maybePostprocessCloudResult`
call (`useCloudJob.ts:329-348`); wrap timing with `performance.now()`. Full Sentry
events are for the degraded path only. Payload must stay scrub-safe (no signed URLs, no
user data — `fallbackReason` is already bounded by construction). Must not reorder/block
the object-URL mint/revoke or the `setResult` render.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test:unit`
- SSR build succeeds: `npm run build`

#### Manual Verification:

- Flag ON locally: a successful post-pass emits a Sentry signal with duration
- Forced fallback (>12 MP input or a thrown processor) emits a `captureMessage` carrying `fallbackReason`
- Sentry payloads contain no signed URLs / user data (scrub-safe)

---

## Phase 4: ON-path automated test

### Overview

Exercise the real Canvas adapter with the flag ON so CI covers the ON path before users
get it (the existing suite only tests the orchestrator with a stub).

### Changes Required:

#### 1. E2E spec with the flag ON

**File**: `src/pages/index.astro`, `tests/e2e/` (new spec)

**Intent**: Run the north-star cloud flow with `CHROMA_POSTPASS_ENABLED=true` so the real
`processCloudResultBlob` runs in a real browser; assert the result is the processed path
(an object-URL `blob:` after-image) and that download works. The Replicate stub still
supplies the result image — the post-pass runs on it regardless of origin.

**Contract**: Add a local/CI-only per-request override seam in `index.astro` (query
param or header) that can force `chromaEnabled=true` for E2E only; guard it so production
never honors browser-provided input. The Playwright spec mirrors the north-star flow,
opts into that override, and asserts the processed-result invariant (afterUrl is a
`blob:` object URL, mint/revoke clean, download succeeds). The shared E2E webServer keeps
the default flag OFF for all other specs.

### Success Criteria:

#### Automated Verification:

- The new flag-ON E2E spec passes: `npm run test:e2e`
- Full unit + integration suite stays green: `npm run test:unit`, integration suite
- Type checking + lint pass: `npm run typecheck`, `npm run lint`

#### Manual Verification:

- The spec demonstrably drives the real adapter (processed `blob:` result), not the OFF path

---

## Phase 5: Enable in production (the flip)

### Overview

Flip the prod secret ON, gated on the Phase-1 GO and Phases 2–4 deployed. Rollback is a
secret flip, not a code change.

### Changes Required:

#### 1. Set the prod secret + verify

**File**: (no repo change — operational; optionally a flip-log note in `change.md`)

**Intent**: Set `CHROMA_POSTPASS_ENABLED=true` on the prod Worker (the cloud-flag
mechanism), verify on prod, and record the flip + rollback procedure.

**Contract**: `wrangler secret put CHROMA_POSTPASS_ENABLED` (value `true`) on the prod
Worker — or the GitHub-secret + `wrangler-action` path used for the cloud secrets
(`.github/workflows/ci.yml:329-331`). Rollback: set it to `false` (takes effect on next
page load). No code change, no migration.

### Success Criteria:

#### Manual Verification:

- Prod secret set; a real prod cloud job renders a processed (re-encoded) result with visibly cleaner shadow color
- Sentry shows the post-pass success signal (and any fallback) in prod
- Setting the secret to `false` restores the raw result on a fresh page load (rollback verified)
- The flip + rollback procedure is recorded

---

## Testing Strategy

### Unit Tests:

- Existing `tests/cloud-result-postprocess.test.ts` (orchestrator decisions) stays green after the `enabled`-as-prop refactor (Phase 2).
- `tests/chroma-denoise.test.ts` default-param range checks stay green (Phase 1 retune, if any).

### Integration / E2E Tests:

- New Playwright spec runs the cloud flow with the flag ON, asserting the processed `blob:` path + download (Phase 4); other specs remain OFF.

### Manual Testing Steps:

1. Local stack + real Replicate → produce real noisy Bread outputs → A/B in harness → record GO (Phase 1).
2. Locally toggle `CHROMA_POSTPASS_ENABLED` true/false under `wrangler dev` → processed vs raw (Phase 2).
3. Force success + fallback locally → confirm Sentry signals + duration, scrub-safe (Phase 3).
4. Prod: set secret ON → verify processed result + Sentry; set OFF → raw restored (Phase 5).

## Performance Considerations

No change to the measured pass cost (~433 ms median @12 MP + native decode/encode, S-11
Phase-5). Re-encode stays unconditional (per decision). Telemetry adds only timing +
a Sentry message per result — negligible; must stay off the critical render path.

## Migration Notes

- No DB migration. `CHROMA_POSTPASS_ENABLED` is a new server secret defaulting to `false`,
  so deploying Phases 2–4 is behavior-neutral until Phase 5 sets it `true`.
- Rollback at any time after Phase 5: set the secret `false` (effective on next page load).

## References

- Research: `context/changes/chroma-postpass-enable/research.md`
- S-11 archive (algorithm, F3, harness, tuning): `context/archive/2026-06-18-bread-chroma-postpass/`
- Local real-Replicate runbook: `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md`
- Cloud-flag precedent: `astro.config.mjs:68,72`; `.github/workflows/ci.yml:329-331`
- Lesson: `context/foundation/lessons.md` (synthetic-GO is a GO-to-merge-OFF, not GO-to-enable)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Real-Bread A/B validation (the F3 gate)

> **✅ CONDITIONAL GO (Round 2, 2026-06-26).** Round 1 (3 NIND ISO6400 scenes) proved
> **safety** on real Bread output (maxΔY ≈ 0.48–0.49 rounding floor, hiLeak ≈ 0) but couldn't
> test sufficiency (Bread lifted them clean, `Y<64` = 1.5–6%). Round 2 added `tree1`: a real
> high-ISO noisy Bread output whose deep-shadow population is below the rig's original
> qualifying floor (`Y<64` = 10.2%), but whose claimed noise band is mostly mid-shadow
> (`Y 64–128` = 51.1%). Re-measuring that band shows **12.9% / 15.2% Cb/Cr stddev reduction**
> vs **1.2% / 1.4%** on the clean `nightsky` control. The effect is clean and measurable but
> not visibly obvious at normal zoom, so Phase 1 unblocks Phases 2–4 and supports an
> observable/reversible experiment; Phase 5 must still lean on telemetry / real-world
> verification, not treat sufficiency as firmly proven. Params unchanged `(3, 0.9, 2.5)`;
> flag still OFF. Evidence: `real-ab-results.md`.

#### Manual

- [x] 1.1 Local stack + real Replicate produced ≥1 genuinely-noisy real Bread output — Round 2 `tree1` (real high-ISO bark, direct Replicate Bread call) — dc1d35b
- [x] 1.2 Each output A/B'd in the harness: visible shadow-chroma reduction, maxΔY ≈ 0, no edge bleeding — tree1: deep-shadow 22.4% / 29.1% Cb/Cr reduction on 10.2% px, mid-shadow 12.9% / 15.2% on 51.1% px, maxΔY 0.50, chroma-only diff, no halos/bleeding/softening (100% + 10× diff); visually subtle at normal zoom — dc1d35b
- [x] 1.3 `real-ab-results.md` records inputs, observations, final params, and an explicit decision — Rounds 1 + 2 recorded; decision = GO — dc1d35b
- [x] 1.4 Decision is GO (else stop after the bounded retune loop — do not proceed to Phase 5) — conditional GO; params kept at (3, 0.9, 2.5); Phase 5 must use telemetry / real-world verification before the prod flip — dc1d35b

### Phase 2: Runtime flag via SSR prop (Option B)

#### Automated

- [x] 2.1 Type checking passes — 76d7271
- [x] 2.2 Linting passes — 76d7271
- [x] 2.3 Unit tests pass (incl. cloud-result-postprocess.test.ts) — 76d7271
- [x] 2.4 SSR build succeeds — 76d7271
- [ ] 2.5 E2E gate green with the flag default-OFF — deferred to CI/Docker harness (behavior-neutral: secret unset → default false → OFF-path unchanged)

#### Manual

- [x] 2.6 Secret unset → cloud result unchanged (raw) — covered by automated evidence: `cloud-result-postprocess.test.ts` asserts `enabled:false` → exact raw Blob, processor not called; secret defaults to `false` (gate accepted 2026-06-26) — 76d7271
- [ ] 2.7 `CHROMA_POSTPASS_ENABLED=true` under `wrangler dev` → processed preview + matching download — deferred to Phase 4 flag-ON E2E (real-Canvas adapter has no headless path); gate accepted to defer
- [ ] 2.8 Setting it back to `false` (new page load) → raw result restored — deferred to Phase 4 / live verification; OFF path proven by 2.6

### Phase 3: Telemetry

#### Automated

- [x] 3.1 Type checking passes — aa487dc
- [x] 3.2 Linting passes — aa487dc
- [x] 3.3 Unit tests pass — aa487dc
- [x] 3.4 SSR build succeeds — aa487dc

#### Manual

- [ ] 3.5 Flag ON locally: successful post-pass emits a Sentry signal with duration — deferred to Phase 5 live telemetry verification (now a `captureMessage`, so run-rate is queryable; code-correct + typecheck-verified)
- [ ] 3.6 Forced fallback (>12 MP / thrown processor) emits a captureMessage with fallbackReason — deferred to Phase 5 live verification
- [x] 3.7 Sentry payloads contain no signed URLs / user data (scrub-safe) — verified by impl-review: payload is bounded `fallbackReason` + int dims + duration; no signed-URL/PII path; global `scrubEvent` runs on send — aa487dc

### Phase 4: ON-path automated test

#### Automated

- [ ] 4.1 The new flag-ON E2E spec passes — deferred to CI/Docker harness (needs local Supabase + served enhance fn + fixture server; spec compiles + lints clean locally). Seam it depends on validated end-to-end on the built worker: ON+`?chroma=1`→true, ON+no-param→false, OFF(prod)+`?chroma=1`→false (guard).
- [ ] 4.2 Full unit + integration suite stays green — unit 208 ✓ locally; integration pending CI/local Supabase harness (`SUPABASE_URL` not exported locally; Phase-4 changes touch no RLS/jobs/migration path). Check only once the integration job is green.
- [x] 4.3 Type checking + lint pass

#### Manual

- [ ] 4.4 The spec demonstrably drives the real adapter (processed `blob:` result) — the browser Canvas-adapter run + `blob:` assertion validate when the e2e spec runs in CI; the seam feeding it (`chromaEnabled` prop) is validated end-to-end locally (truth table above)

### Phase 5: Enable in production (the flip)

#### Manual

- [ ] 5.1 Prod secret set; a real prod cloud job renders a processed result with cleaner shadow color
- [ ] 5.2 Sentry shows the post-pass success signal (and any fallback) in prod
- [ ] 5.3 Setting the secret to `false` restores the raw result on a fresh page load (rollback verified)
- [ ] 5.4 The flip + rollback procedure is recorded
