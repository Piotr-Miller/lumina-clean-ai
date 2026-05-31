<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Gated Cloud AI Submission (S-03)

- **Plan**: `context/changes/gated-cloud-upload/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: REVISE → SOUND (all 7 findings fixed in plan, 2026-05-31)
- **Findings**: 1 critical, 4 warnings, 2 observations — all FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

7/7 paths ✓, symbols ✓ (createPhotoJob, createAdminClient, validateImageFile, EngineId), brief↔plan ✓ after final cleanup. Verified: `createPhotoJob` returns `uploadUrl = signed.signedUrl` (photo-job.service.ts:44); storage-js builds `signedUrl` as an absolute URL with the token embedded; `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` are `context:"server", access:"secret"` (astro.config.mjs:19-21), imported only from `astro:env/server` (no client exposure). Raw signed-URL PUT is already used in `tests/jobs.rls.test.ts:124-184` and `scripts/f01-smoke.ts:124`. `npx vitest run` would run `tests/jobs.rls.test.ts`, which needs local Supabase (`tests/env.ts`, `tests/helpers/test-users.ts`). Blast radius low: `createPhotoJob` has no callers yet; `EnhanceWorkspace` used only in `index.astro`.

## Findings

### F1 — Cloud upload assumes a browser Supabase client that can't exist

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 §3 (`cloud-upload.client.ts`) + Critical Implementation Details (first bullet)
- **Detail**: The plan specifies the client uploads "via a browser supabase-js client" / "builds a fresh anon supabase-js client". Constructing a supabase-js storage client requires `SUPABASE_URL` + anon key, both declared `context:"server", access:"secret"` (astro.config.mjs:19-21) and imported only from `astro:env/server` (src/lib/supabase.ts:3, config-status.ts:1) — no `astro:env/client`/`PUBLIC_` exposure and no existing browser Supabase client. The island cannot build that client; Phase 2 stalls. The naive workaround (expose the anon key client-side) is a security downgrade. It's also unnecessary: `createPhotoJob` returns `uploadUrl = signed.signedUrl` (photo-job.service.ts:44) — storage-js builds this as an absolute URL with the token already in the query string. A plain `fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: file })` uploads with no SDK/URL/anon key — the exact pattern already proven in `tests/jobs.rls.test.ts:124-184` and `scripts/f01-smoke.ts:124`, and matching the plan's own "client-direct PUT" framing (Performance Considerations) + research §External.
- **Fix A ⭐ Recommended**: Raw `fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file })` in `cloud-upload.client`
  - Strength: Already proven by `tests/jobs.rls.test.ts` and `scripts/f01-smoke.ts`; needs no public env exposure; keeps bytes off the Worker; `uploadToken` already rides inside `uploadUrl` so the response DTO is unchanged.
  - Tradeoff: Bypasses the `uploadToSignedUrl` wrapper; helper sets Content-Type and checks HTTP status / maps 413·403 itself.
  - Confidence: HIGH — existing tests + smoke use this exact signed-URL PUT path; storage-js verified to return an absolute token-bearing URL.
  - Blind spot: Confirm no required header beyond Content-Type for the signed-upload endpoint (cache-control optional).
- **Fix B**: Add a browser-safe public Supabase URL/anon env + a browser client
  - Strength: Lets the client use `uploadToSignedUrl` ergonomics; reusable for future client-side Supabase calls.
  - Tradeoff: New env/config surface + a browser Supabase client pattern for one upload call; ships the anon key in the bundle.
  - Confidence: MEDIUM — viable, but the repo deliberately avoids client Supabase env.
  - Blind spot: Astro client-env naming + Cloudflare secret/public binding strategy need a separate check.
- **Decision**: FIXED via Fix A (raw fetch PUT to absolute uploadUrl; plan Phase 2 §3 + Critical Implementation Details + testing notes updated)

### F2 — Toggle visibility contradicts the recorded decision

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §2 (Engine-selection state + toggle UI) vs plan-brief Key Decisions
- **Detail**: The brief/decision says the toggle is **always visible** so Cloud stays visible as the sign-up funnel (FR-006/FR-007). The plan §2 contract says the toggle is "visible whenever a source is loaded" — i.e. hidden on the empty uploader state, which is the *after-upload* option the user did **not** pick. An anonymous visitor with no photo yet would never see that Cloud exists.
- **Fix**: Decide one behavior and make plan + brief agree. Recommended: render the toggle above the uploader/action area so Cloud is visible before upload; still gate submit inline after Cloud is selected.
- **Decision**: FIXED in plan (Phase 2 §2 now "always visible, rendered above the uploader"; brief already says always-visible)

### F3 — Malformed JSON can leak into `500 internal_error`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 — API route
- **Detail**: The plan returns `400 invalid_body` for zod failures but doesn't address `await context.request.json()` throwing on malformed JSON. If that call sits inside the broad try/catch, malformed JSON returns `500 internal_error`, violating the API error contract (400 for bad input).
- **Fix**: Parse the body in its own step: invalid JSON → `400 { error: { code: "invalid_body", message } }`; only unexpected service/config failures reach `500 internal_error`.
- **Decision**: FIXED in plan (Phase 1 §3 contract now mandates a defensive json() parse → 400 invalid_body)

### F4 — `npx vitest run` is too broad (runs Supabase-dependent RLS tests)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 & 2 Automated Verification; Progress 1.4 / 2.3
- **Detail**: The plan's unit-test criterion is `npx vitest run`, which collects all `tests/**/*.test.ts` — including `tests/jobs.rls.test.ts`, which needs a running local Supabase (`tests/env.ts`, `tests/helpers/test-users.ts`). On a machine without it, the S-03 success criterion fails for unrelated reasons. (Same class of issue noted in prior plan reviews.)
- **Fix**: Point the S-03 criterion at the new pure-logic test files explicitly (e.g. `npx vitest run tests/<schema>.test.ts tests/<upload-helper>.test.ts`); reserve full `npm test` for when local Supabase is up.
- **Decision**: FIXED in plan (Phase 1/2 criteria + Progress 1.4/2.3 now target `tests/cloud-create-job-schema.test.ts` and `tests/cloud-upload.client.test.ts`; full suite reserved for when local Supabase is up)

### F5 — `npm run build` is a weak type-check gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 & 2 Automated Verification ("Type checking passes: npm run build"); Progress 1.2 / 2.1
- **Detail**: `npm run build` = `astro build`, which compiles via esbuild and strips types without type-checking — a .ts/.tsx type error won't fail it. The repo ships `@astrojs/check`; `npx astro check` is the real type gate. As written, the type-checking criterion can pass while types are broken (type-aware eslint catches some, not all).
- **Fix**: Make `npx astro check` the type-checking command in both phases (keep `npm run build` as a separate build-succeeds check). Update Progress 1.2 / 2.1.
- **Decision**: FIXED in plan (both phases now gate on `npx astro check` + a separate build-succeeds check; Progress renumbered accordingly)

### F6 — Engine-toggle state reset is unspecified

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2 / §4
- **Detail**: EnhanceWorkspace will hold two independent flow states (useLocalEnhance "done" with a rendered slider; useCloudSubmit "submitted") plus engine selection. The plan says the Local done-branch is "only reachable via the Local engine" but not what happens to a stale result/submitted/error state when the user flips the toggle (the chosen UX preserves the photo). Without a rule, a user who runs Local→done then toggles to Cloud could see a stale slider/error above a Cloud action.
- **Fix**: Add one line to Phase 2 §4 contract: toggling the engine preserves the loaded source but clears the other engine's result/submitted/error state (render the action area purely from engine + auth + the active engine's status).
- **Decision**: FIXED in plan (Phase 2 §4 now has an explicit State-reset rule)

### F7 — `ImageEngine` comment in types.ts will be stale

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — touched engine types
- **Detail**: `src/lib/engines/types.ts` says S-03 will plug Cloud behind the `ImageEngine` contract, but the plan correctly chooses forked Cloud orchestration. The comment will mislead future readers.
- **Fix**: Add `src/lib/engines/types.ts` to Phase 2 for a comment-only update: `EngineId` stays shared, but `ImageEngine` is the Local-style Blob-returning contract; cloud orchestration is forked.
- **Decision**: FIXED in plan (Phase 2 §5 added — comment-only refresh of `src/lib/engines/types.ts`)
