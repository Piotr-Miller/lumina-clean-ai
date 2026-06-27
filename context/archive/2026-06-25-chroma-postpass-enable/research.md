---
date: 2026-06-25T19:20:22+0200
researcher: Claude (Opus 4.8)
git_commit: 82f73f0f141d84a640572689ad0b77dc5e774a68
branch: master
repository: Piotr-Miller/lumina-clean-ai
topic: "Enable the Bread chroma-denoise post-pass in production (flag ON)"
tags: [research, codebase, chroma-postpass, feature-flag, cloud-result, telemetry, replicate, a-b-testing]
status: complete
last_updated: 2026-06-25
last_updated_by: Claude (Opus 4.8)
---

# Research: Enable the Bread chroma-denoise post-pass in production (flag ON)

**Date**: 2026-06-25T19:20:22+0200
**Researcher**: Claude (Opus 4.8)
**Git Commit**: 82f73f0
**Branch**: master
**Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

What does it take to enable the client-side chroma-denoise post-pass in production
(flip `CHROMA_POSTPASS_ENABLED` → `true`), given the S-11 review's observation **F3**
(the Phase-5 GO rested on a _synthetic_ A/B; real-Bread confirmation was deferred to
this change)? Scope (chosen): real-Bread A/B path, flag/rollback model, user-facing
impact, telemetry/observability. A/B source: **local stack + real Replicate token**.

## Summary

Enabling the pass is, mechanically, a one-line flip of a build-time `const`
(`src/lib/engines/chroma-denoise.ts:63`). But the recorded gate and three real gaps
mean it is **not** a one-line change in practice:

1. **Quality gate (HIGH, the crux).** Per Phase-5 **F3** and the S-11 lesson
   _"a synthetic-ground-truth A/B GO is a GO-to-merge-OFF, not a GO-to-enable"_, the
   flip must be gated on a **real-Bread before/after on genuinely noisy shadows** —
   not another synthetic test. A clean local recipe exists (below) and costs only a
   few cents of personal Replicate credit (no prod `CLOUD_DAILY_CAP` burn).
2. **No fast rollback (rollback risk).** The flag is a `const` baked into the client
   bundle, read inside a React island. ON/OFF today = code change + full CI +
   `wrangler deploy`. Threading it as a server-rendered island prop (Option B below)
   removes the code-change/CI-rebuild step — but it is **not** a true instant
   kill-switch: `wrangler secret put` still ships a new Worker _version_, and an
   already-hydrated tab keeps its old prop until reload (only new page loads pick it
   up). Stopping _active_ tabs too needs the value re-checked near result-load time
   (Option C).
3. **Zero production observability.** After enabling we'd have **no signal** of how
   often the pass runs vs. falls back (>12 MP / processor error), nor timing — the
   only record is a client `console.warn`, which (with default Sentry browser
   integrations) is captured only as a **breadcrumb** that may ride along on some
   _later_ event, never a standalone run-rate/fallback/timing signal.
4. **No ON-path test.** Existing tests exercise the orchestrator with an injected
   stub; the real Canvas adapter and the flag-ON end-to-end path are never run in
   unit/E2E/CI.

What ON actually changes for the user: every successful Bread result ≤ 12 MP is
decoded, chroma-denoised, and **re-encoded to a fresh JPEG at quality 0.92** on the
main thread, then shown/downloaded instead of the raw Bread bytes (fail-open to raw
on oversize/error). The before/after slider's "before" (the user's original upload)
is untouched.

## Detailed Findings

### A. Consumer wiring — what flipping ON does end-to-end

The post-pass lives in `useCloudJob.ts`'s "on `succeeded`, load result" effect
(`src/components/hooks/useCloudJob.ts:299-367`):

- Result blob: signed read URL minted (`createSignedUrl(resultPath, RESULT_URL_TTL_SECONDS=300)`, `useCloudJob.ts:64,312-321`) → `loadCloudResult(afterUrl)` (`src/lib/services/cloud-result.client.ts:45-56`) does `fetch().then(r => r.blob())`.
- Dimensions: from a parallel `new Image()` decode — `img.naturalWidth/Height` (`cloud-result.client.ts:30-37`).
- The gate call: `maybePostprocessCloudResult({ enabled: CHROMA_POSTPASS_ENABLED, blob, width, height })` (`useCloudJob.ts:329-334`).
- Object URL: minted **only** when `outcome.processed` (`useCloudJob.ts:343-347`); raw path keeps the signed URL + raw bytes byte-for-byte. Revoked in effect cleanup (`useCloudJob.ts:355-366`) — the signed URL is never an object URL, so deliberately never revoked.
- Download: `resultBlob` → `<DownloadButton>` (`src/components/enhance/EnhanceWorkspace.tsx:231`, `DownloadButton.tsx:18-26`) mints a throwaway object URL on click.
- The processor (`src/lib/services/cloud-result-postprocess.client.ts:47-69`): `createImageBitmap` → canvas `getImageData` → `denoiseChroma` (defaults `{3, 0.9, 2.5}`) → `forceOpaque` → `canvasToBlob("image/jpeg", JPEG_QUALITY)`.
- **`JPEG_QUALITY = 0.92`** (`src/lib/engines/canvas-helpers.ts:12`).
- Only consumer of the const: `useCloudJob.ts:6` (import) + `:330` (use). No env/runtime path anywhere (grep-confirmed).
- Before/after slider: "before" is `sourceUrl` from `useLocalEnhance` (the user's local upload), independent of the cloud path (`src/components/enhance/EnhanceWorkspace.tsx:57,116,124`). Only the "after" panel changes when ON.

**User-facing delta when ON:** the after-image and download become a generationally
re-compressed JPEG (q0.92) of the Bread output — applied to every result ≤ 12 MP even
where the chroma change is negligible — plus a synchronous main-thread cost. Download
filename stays `.jpg` (`deriveDownloadName`, `image-helpers.ts:83-92`). Fail-open to
raw on oversize/error.

### B. Flag / rollback model

Cloud kill-switch precedent — **server secrets**, flipped via `wrangler secret put`
(no code change / CI rebuild — though `wrangler secret put` does ship a new Worker
_version_; they're "runtime" because read per request, server-side):

- `CLOUD_PIPELINE_ENABLED` `envField.boolean({context:"server", access:"secret"})` (`astro.config.mjs:68`), read in the Deno Edge function `Deno.env.get(...)` (`supabase/functions/enhance/index.ts:324`).
- `CLOUD_DAILY_CAP` `envField.number({context:"server", access:"secret"})` (`astro.config.mjs:72`), read in the API route (`src/pages/api/enhance/cloud/create-job.ts:2,30`).
- These persist across deploys (`.github/workflows/ci.yml:329-331`) — that's _why_ they're true runtime switches.

The chroma flag is **different**: it's read in a **client island** (`useCloudJob.ts`),
where a `context:"server"` secret is not readable. Options to make it runtime-controllable:

- **Option A — `astro:env/client` PUBLIC var.** Still **inlined at build** (like `PUBLIC_SENTRY_DSN`, `astro.config.mjs:76`). Flipping it needs a rebuild + redeploy — only marginally better than today (env-sourced vs code-sourced). Not worth it.
- **Option B — server-rendered → island prop (RECOMMENDED for the common case).** The workspace is mounted on `src/pages/index.astro:34-40` (`<EnhanceWorkspace client:load .../>`), which **already** reads `astro:env/server` (`index.astro:5`) and threads server values (`supabaseUrl`, `supabaseAnonKey`, `accessToken`) as props (declared `src/components/enhance/EnhanceWorkspace.tsx:14-23`, forwarded into `useCloudJob` `:45-51`). Add `CHROMA_POSTPASS_ENABLED` as a server secret (default false), read it in `index.astro` frontmatter, pass a `chromaEnabled` prop → `useCloudJob` arg, replace the `const` import. The `const` becomes the schema `default` so the pure module + its tests stay intact. (Value is server-rendered into client HTML — fine, it's a quality toggle, not a secret.) **What it buys / its limits:** flipping it is a `wrangler secret put` with **no code change and no CI rebuild** — but `wrangler secret put` ships a new Worker _version_ (a secret-version deploy, not literally zero-deploy), and because the value is read at **SSR**, only **new page loads** pick up a flip. An already-hydrated React tab keeps its old value until reload — so B is a fast _operational_ toggle, **not** a true "stop everything now" kill-switch.
- **Option C — config endpoint the island re-checks near result-load time.** The only option that also affects **already-open tabs** without a reload, since the value is fetched per result rather than baked at page render. Cost: a new `prerender=false` GET route (zod + the `{error:{code,message}}` shape per Hard rules) + an async/race surface in the currently-synchronous `succeeded` effect (`useCloudJob.ts:329`). Choose it only if "active tabs must stop too" is an actual requirement; otherwise B is lighter.

Rollback **today** (const): branch → PR (master is PR-only) → CI (`ci`+`integration`+`e2e`) → `deploy` job rebuilds + `wrangler-action` (`.github/workflows/ci.yml:314-369`). Multi-minute, merge-gated, not operator-grade.

### C. Real-Bread A/B via local stack (closes F3) — chosen path

The local served Edge function makes a **genuine** Replicate call — it is **not**
stubbed: the real `predictions.create` POST is at `supabase/functions/enhance/index.ts:379`,
hitting the URL const declared at `:159`. The Playwright stub
(`tests/e2e/helpers/replicate-stub.ts`) is a separate path. So
`supabase functions serve enhance` + a real token = real Bread, against the **local**
DB (the global cap lives in local Postgres, so prod's `CLOUD_DAILY_CAP=3` is untouched).

Authoritative runbook: `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md`
(+ `context/foundation/cloud-live-smoke.md` adds verification checks). The A/B harness
`context/archive/2026-06-18-bread-chroma-postpass/ab-harness/index.html` is a `file://`
tool that loads an arbitrary local image, runs the **real bundled algorithm**
(`chroma-denoise.iife.js`), and shows before/after wipe + difference + 100% loupe.

Recipe (condensed; see runbook for full detail):

1. `npx supabase start` → `npx supabase db reset` (creates `photos` bucket + enqueue trigger).
2. `cloudflared tunnel --url http://127.0.0.1:54321` (Replicate must reach the local function; URL re-mints each run).
3. Set DB GUCs `app.settings.edge_function_url` (= tunnel `/functions/v1/enhance`) + `app.settings.db_webhook_secret`.
4. `supabase/functions/.env`: `CLOUD_PIPELINE_ENABLED=true`, `DB_WEBHOOK_SECRET` (= GUC), `REPLICATE_API_TOKEN` (**real**), `EDGE_FUNCTION_URL` (= tunnel). **Do NOT set `E2E_ALLOWED_OUTPUT_ORIGIN`** (local/CI stub seam; never prod).
5. (F1-correct) use Replicate's real signing secret: `GET https://api.replicate.com/v1/webhooks/default/secret` → `REPLICATE_WEBHOOK_SIGNING_SECRET`.
6. `npx supabase functions serve enhance --env-file supabase/functions/.env` (re-serve after any .env edit).
7. `.dev.vars`: `CLOUD_PIPELINE_ENABLED=true`, `CLOUD_DAILY_CAP=5`, local `SUPABASE_*`. Then `npm run build && npx wrangler dev --port 4321` (NOT `npm run dev` — that's Node, not workerd).
8. Sign in → Cloud AI → upload a genuinely-noisy night JPG (RGB, not RGBA — Bread rejects alpha) → Process; watch `queued→processing→succeeded`.
9. Capture the Bread output JPG (save the AFTER image) to the scratchpad (NOT under `context/archive/`).
10. Open `ab-harness/index.html`, load the captured JPG, inspect with the difference view + loupe; tune `(blurRadius, maxStrength, shadowCurve)` around the `(3, 0.9, 2.5)` default.

**Good test input** (the prior samples failed F3 because they lacked flat-shadow chroma
noise): a real high-ISO handheld **night phone shot**, straight-from-camera JPG (not
editor-denoised), with large flat dark regions (sky/wall/asphalt), under-exposed so
Bread lifts substantially, 8-bit RGB, ≤ 12 MP.

Secrets: REAL = `REPLICATE_API_TOKEN` (+ ideally the real signing secret); generated =
`DB_WEBHOOK_SECRET`; local-only-never-prod = `E2E_ALLOWED_OUTPUT_ORIGIN`. Footgun: the
tunnel URL re-mints each run — keep `.env` `EDGE_FUNCTION_URL` and the DB GUC in sync or
the callback is `null` and the row stalls in `processing`.

### D. Telemetry, tests, residual risk

**Telemetry — MAJOR GAP.** On fallback, the only action is `console.warn` (`useCloudJob.ts:340-341`);
success records nothing (`:344-348`); no timing anywhere. Client Sentry is wired
(`sentry.client.config.ts:21` = `integrations: [browserTracingIntegration()]` merged
with the defaults; `@sentry/astro` in `astro.config.mjs:26-41`, `tracesSampleRate 0.05`).
The default browser integrations DO capture `console.warn` as a **breadcrumb** — so a
fallback warn can ride along on a _later_ event — but there is **no
`captureConsoleIntegration`**, so the warn is never a standalone Sentry event; and a
processor throw is swallowed in the try/catch (`cloud-result-postprocess.client.ts:121-127`)
so it's not an exception either. The
only post-pass-adjacent DB column, `jobs.model_version`
(`supabase/migrations/20260621120000_add_model_version_to_jobs.sql:14`), records the
**Bread model version** server-side and is unrelated to whether the client pass ran.
→ After enabling we'd have **zero** run-rate / fallback-rate / timing signal.

**Tests — no ON-path coverage.** `tests/cloud-result-postprocess.test.ts` covers the
orchestrator decision logic only, always with an **injected fake processor** (flag-off,
over-12MP guard, enabled+stub success, throw→fallback, plus `forceOpaque`). The real
`processCloudResultBlob` (Canvas decode/encode) is never exercised; `denoiseChroma` is
unit-tested on raw buffers (`tests/chroma-denoise.test.ts`) but not through the browser
wiring. No E2E spec touches the flag (grep clean); since the const is `false`, CI always
runs OFF.

**Risks (prioritized):**

- **HIGH — no real-world quality validation** yet (F3 / the lesson). Turning ON without the real-Bread A/B violates the recorded gate.
- **HIGH — telemetry blind spot** (above).
- **MED — generational JPEG re-encode at q0.92** of every cloud result (`canvas-helpers.ts:12`); changes the downloaded bytes/size even when chroma barely changes.
- **MED — main-thread jank** ~0.4 s algorithm + decode/encode at ≤12 MP, no Web Worker (`chroma-denoise.ts:18-19`, Phase-5 ~433 ms median @12 MP).
- **MED — no automated ON-path test** (unit or E2E/CI).
- **LOW — Bread outputs > 12 MP possible**: `buildBreadInput` sends no resize param (`src/lib/services/bread.ts:35-41`), the function caps download at 25 MB but not pixels (`enhance/index.ts:172-174`); >12 MP → silent raw fallback (safe, but invisible without telemetry). RGBA flatten is a practical no-op (Bread = RGB JPEG). Object-URL lifecycle relies on effect-cleanup ordering (S-11 Phase-4 F2, fragile-but-correct).

## Code References

- `src/lib/engines/chroma-denoise.ts:63` — `CHROMA_POSTPASS_ENABLED = false` (the flag; build-time const)
- `src/lib/engines/chroma-denoise.ts:44-48,55` — tuned defaults `{3,0.9,2.5}`, 12 MP guard
- `src/lib/services/cloud-result-postprocess.client.ts:47-69,101-128` — Canvas adapter + fail-open orchestrator
- `src/lib/engines/canvas-helpers.ts:12` — `JPEG_QUALITY = 0.92`
- `src/components/hooks/useCloudJob.ts:6,299-367,329-348` — sole consumer; result-load effect; post-pass call + `console.warn`-only fallback
- `src/pages/index.astro:5,34-40` — server `astro:env/server` read + island mount (the SSR-prop seam for Option B)
- `src/components/enhance/EnhanceWorkspace.tsx:14-23,45-51,231` — island props + `useCloudJob` wiring + download
- `astro.config.mjs:68,72,76` — `CLOUD_PIPELINE_ENABLED`/`CLOUD_DAILY_CAP` server secrets; `PUBLIC_SENTRY_*` example
- `supabase/functions/enhance/index.ts:159,379,324` — Replicate URL const (`:159`) + the real `predictions.create` POST (`:379`, not stubbed); `CLOUD_PIPELINE_ENABLED` gate (`:324`)
- `sentry.client.config.ts:21` — `integrations: [browserTracingIntegration()]` (defaults merged → console warns become breadcrumbs, not standalone events)
- `src/lib/services/bread.ts:35-41` — Bread input (no resize/output-size param)
- `tests/cloud-result-postprocess.test.ts` — orchestrator tests (injected stub; no real adapter)
- `.github/workflows/ci.yml:314-369` — deploy job (rollback path today)

## Architecture Insights

- The post-pass is a **client-side, post-`succeeded` quality layer** that is purely
  additive and fail-open — it can never fail a job, only degrade to the raw result.
  That makes it low-blast-radius, but also **invisible**: every safety fallback is silent.
- The flag's placement (client island) is the single reason the cloud kill-switch
  pattern can't be copied — the runtime-flip property requires crossing the SSR→island
  boundary, which `index.astro` already does for other server values.
- "GO" was deliberately split by S-11 into **GO-to-merge-dark** (done, synthetic) and
  **GO-to-enable** (this change, real). The architecture already supports merging dark
  safely; what's missing is the evidence + the operational safety (kill-switch +
  telemetry) to turn it on responsibly.

## Historical Context (from prior changes)

- `context/archive/2026-06-18-bread-chroma-postpass/tuning-results.md` — Phase-5 GO; real samples lacked flat-shadow chroma noise → synthetic ground-truth A/B; "final confirmation on a real Bread output is deferred to the production-enable change" (`:82-119,143`).
- `context/archive/2026-06-18-bread-chroma-postpass/reviews/impl-review-phase-5.md:75-87` — **F3** (synthetic-A/B caveat, MEDIUM, PENDING; fix = real-Bread before/after at enable).
- `context/archive/2026-06-18-bread-chroma-postpass/reviews/impl-review.md:63-78` — full-plan **F3** (resolver heuristic) + **F4** (12 MP guard trusts caller dims; defense-in-depth intact). (Note: the synthetic-A/B caveat is Phase-5 F3, not full-plan F3.)
- `context/foundation/lessons.md:145-157` — the two S-11 lessons: (1) don't lint generated IIFE bundles / don't trust `<cmd> | tail` exit codes; (2) **"synthetic-ground-truth A/B GO is a GO-to-merge-OFF, not a GO-to-enable"** — directly governs this change.
- `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md` + `context/foundation/cloud-live-smoke.md` — the live-Replicate-locally mechanics reused for the A/B.

## Related Research

- `context/archive/2026-06-18-bread-chroma-postpass/research.md` — original S-11 research (chroma-pass placement, resolve-and-pin).

## Open Questions (for the plan)

1. **Flag model decision**: keep the build-time `const`, or promote to a runtime
   kill-switch via the SSR-prop (Option B)? Recommendation leans B (no-redeploy OFF
   is cheap insurance for a quality/perf feature), but it's a design call for `/10x-plan`.
2. **Telemetry scope**: minimum = a Sentry breadcrumb/`captureMessage` on fallback +
   the `processed` outcome; ideal = run-rate + duration metric. How much is in scope vs.
   a fast-follow?
3. **Real-Bread A/B acceptance criteria**: what is the explicit GO bar on the real
   output — visible shadow-chroma reduction, `maxΔY ≈ 0` (no luminance softening), no
   edge bleeding — and on how many genuinely-noisy inputs?
4. **Re-encode waste**: should ON re-encode _every_ result, or skip the JPEG flatten
   when the pass changed effectively nothing? (Possible optimization; likely out of
   scope for the first enable, but worth noting.)
5. **ON-path test**: a browser-env test of the real `processCloudResultBlob` + one E2E
   run with the flag ON — required before enable, or acceptable as a fast-follow?
