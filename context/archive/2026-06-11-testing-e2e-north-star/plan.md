# E2E North-Star (risks #1+#6) Implementation Plan

## Overview

Build the Phase-4 browser layer of the test-plan rollout: a **deterministic, stubbed-pipeline** Playwright spec proving the north-star flow (signed-in upload → Cloud AI → Realtime result renders **without refresh**) plus the **stall→terminal** spec proving a stuck job never hangs as an eternal spinner — wired into CI as a PR gate in a dedicated `e2e` job. The live cold-boot path (real Replicate) stays a documented **manual smoke**, never a PR gate.

One spec protects two risks: red on **#1** = spinner instead of a result; red on **#6** = result committed but never rendered.

## Current State Analysis

- E2E infra from the standalone (#2) work is in place: `playwright.config.ts` (testDir `tests/e2e`, `setup` project → `auth.setup.ts` → storageState `playwright/.auth/user.json`, webServer reuse), levers `tests/e2e/seed.spec.ts` + `tests/e2e/RULES.md`, `@playwright/test` 1.60 installed. **Browsers not yet installed** (`npx playwright install chromium` pending).
- The stub seam is proven (`scripts/spikes/phase3-callback-test.ts`): a svix-signed `POST /callback?jobId=…` against locally served `supabase functions serve enhance` flips a `processing` row terminal. The **only** gap to full offline determinism: the success `output` URL must pass the SSRF allowlist (https + `replicate.delivery` — `supabase/functions/enhance/index.ts:419-421`, `src/lib/services/replicate-webhook.ts:229-237`) and the function **really fetches it** (index.ts:428) to materialize the result object.
- Budgets (client): `QUEUED_WATCHDOG_MS = 30_000`, `PROCESSING_WATCHDOG_MS = 300_000`, `SLOW_HINT_MS = 25_000` (`src/components/hooks/useCloudJob.ts:77-80`) — not env-overridable, and we are NOT making them so.
- Full grounding (anchors, break targets, wiring, history): `context/changes/testing-e2e-north-star/research.md`.

## Desired End State

`npm run test:e2e` locally (with the local stack + `functions serve` running) and the CI `e2e` job both run green: setup → seed + dashboard specs (#2) → **north-star spec** (#1+#6 happy path, seconds of wall-clock) → **stall spec** (#1 stall half, ~30 s). `deploy` is gated by `needs: [ci, integration, e2e]`. A maintainer can run the documented live smoke before/after any pipeline-config change and verify the F1/F2 class (real signing secret, `EDGE_FUNCTION_URL`, webhook present on the prediction).

### Key Discoveries:

- Crafted signed callback = zero-code stub seam; success path needs an env-gated extra allowed origin because the function fetches the output (research §Q1).
- `markJobSucceeded` guards `.eq("status","processing")` (`src/lib/services/photo-job.service.ts:165-166`) and the callback cross-checks `replicate_prediction_id` (index.ts:394-400) — the spec must flip the row to `processing` **with** a prediction id before POSTing, and must do it **< 30 s** after submit (queued watchdog).
- The browser decodes the result bytes (`src/lib/services/cloud-result.client.ts:27-56`) under storage RLS — the stub's output must be a **real RGB JPG**; RGBA PNG is the documented failure fixture.
- `/callback` ignores `CLOUD_PIPELINE_ENABLED`; with the DB webhook unwired (Vault/GUC unset — the local/CI default) a submitted row simply stays `queued`. That unwired state **is** the stall fixture for Phase 3.
- The signer recipe exists (`phase3-callback-test.ts:48-51`) and the verifier is unit-testable from Vitest (`src/lib/services/replicate-webhook.ts:72-106`) — the helper can be proven hermetically before any browser runs.

## What We're NOT Doing

- **No live Replicate anywhere in CI** — no tokens, no tunnels, no cold boots (test-plan §3 ordering rationale).
- **No scheduled smoke automation** — manual runbook only (decision Q4); prod cap is 3/day.
- **No browser spec for risk #3** (429 cap message) — needs a second webServer with `CLOUD_DAILY_CAP=0`; integration + hermetic layers own the cap (decision Q5).
- **No env-overridable client watchdog budgets** — the stall spec pays the real 30 s instead of adding test-only knobs to prod client code.
- **No `/start` coverage via a Replicate mock** (research seam 3) — degenerates into seam 1 anyway; revisit only if `/start` becomes a gate requirement.
- **Not implementing #15** (`edge-function-url-hardening`) — Phase 1 touches the same file; keep the seam edit minimal and conflict-free.
- No E2E for risks #4/#5 (integration layer owns them). The seed/dashboard specs stay as shipped — **except** REVIEW-class fixes surfaced by their FIRST-ever execution, which are explicitly in scope for Phase 2 (criterion 2.1).

## Implementation Approach

Phase 1 builds the harness (the one-line-ish env seam + Node helpers proven by a hermetic unit test). Phases 2–3 are **`/10x-e2e` territory** — one risk, one spec, PLAN→GENERATE→REVIEW→VERIFY with a deliberate break each. Phase 4 wires the dedicated CI job and syncs the docs. Skills interleave on this plan: 1 → `/10x-implement`, 2–3 → `/10x-e2e`, 4 → `/10x-implement`.

## Critical Implementation Details

- **Timing & lifecycle — the < 30 s flip.** The north-star spec must capture `jobId` from the create-job response (`page.waitForResponse` on `/api/enhance/cloud/create-job`) and complete the service-role flip (`status='processing'`, `replicate_prediction_id`) well inside `QUEUED_WATCHDOG_MS`. Locally this is milliseconds; do the flip immediately after the submit assertion, before any other waiting.
- **Container → host reachability.** The Edge Function fetches the stub output from inside the edge-runtime container. `host.docker.internal` works on Docker Desktop (Windows/macOS) but is **not guaranteed on Linux CI runners** — the CI step must probe it and fall back to the docker bridge gateway IP (`172.17.0.1`) when absent. The fixture server must bind `0.0.0.0`.
- **`functions serve` lifecycle.** Env values are read at serve startup (restart after `.env` edits — archived runbook:88). CI starts serve in the background and must readiness-probe it (a `GET` to the function URL returns the router's 404 — that IS the ready signal) before running Playwright. Specs hard-fail with a clear message if the function is unreachable (same hard-fail convention as `tests/env.ts`).
- **Shared storageState user.** Both new specs run as the `setup`-project account; job rows must be correlated by the captured `jobId` (cleanup deletes exactly that job + its storage prefix), never by "all rows for the user" — parallel specs share the account.

## Phase 1: Pipeline harness (seam + helpers + hermetic proof)

### Overview

Make the success path fully offline (env-gated extra allowed origin for the output fetch) and build the Node-side helpers the specs will use, proven by a hermetic Vitest round-trip before any browser exists.

### Changes Required:

#### 1. Env-gated extra allowed output origin

**File**: `supabase/functions/enhance/index.ts` (call site :419-421) + `src/lib/services/replicate-webhook.ts` (signature) + `tests/replicate-webhook.test.ts` (new cases)

**Intent**: Allow the E2E stub's output URL through the SSRF gate without weakening production: when `E2E_ALLOWED_OUTPUT_ORIGIN` is set (e.g. `http://host.docker.internal:8787`), a URL starting with exactly that origin is also accepted. Unset (prod default) → behavior byte-identical to today.

**Contract**: Additive optional parameter — `isAllowedOutputUrl(raw: string, extraOrigin?: string)` — so the shared module stays pure (no env reads, Vitest-testable; sole prod caller is index.ts:419). The env `E2E_ALLOWED_OUTPUT_ORIGIN` is read Deno-side at the call site and passed as the second argument; exact-origin prefix match, no wildcard, http allowed only via this explicit origin. Extend `tests/replicate-webhook.test.ts` with extraOrigin accept/reject cases (existing single-arg cases unchanged). Documented inline as a test seam. Coordinate-with-#15 note: additive, does not change the `EDGE_FUNCTION_URL` derivation that #15 will harden. `deno check` must stay green.

#### 2. Signed-callback + flip helpers

**File**: `tests/e2e/helpers/replicate-stub.ts` (new)

**Intent**: Reusable Node helpers for the specs: build a svix-signed callback request and flip a job row to `processing`.

**Contract**: `signCallback({ secret, body }) → { headers, rawBody }` reproducing the verifier's scheme — HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}` keyed by base64-decoded `whsec_`-stripped secret, emitted as `webhook-signature: v1,<base64>` (recipe: `phase3-callback-test.ts:48-51`; verifier: `replicate-webhook.ts:72-106`). `flipToProcessing(admin, jobId, predictionId)` — service-role UPDATE setting both fields. Secret source: `process.env.REPLICATE_WEBHOOK_SIGNING_SECRET` falling back to reading `supabase/functions/.env` (names match the function's env file).

#### 3. Fixture server + RGB fixture

**File**: `tests/e2e/helpers/fixture-server.ts` (new) + `tests/e2e/fixtures/night-rgb.jpg` (new, committed)

**Intent**: A one-shot `node:http` server the Edge Function can fetch the "model output" from, serving a small real RGB JPG (≥96×96 — the smallest Bread-verified shape; also the upload fixture for the specs).

**Contract**: `serveFixture({ port }) → { url, close }`; binds `0.0.0.0`; `Content-Type: image/jpeg`. The JPG must decode in the browser (`cloud-result.client.ts` does a real `Image` decode) — no 1×1 stunt files.

#### 4. Hermetic signer↔verifier round-trip test

**File**: `tests/replicate-stub.helpers.test.ts` (new, Vitest)

**Intent**: Prove the helper's signature is accepted by the real verifier (and rejected when tampered) before any E2E run depends on it — kills the whole "stub signs wrong" failure class hermetically.

**Contract**: Sign with `signCallback`, assert `verifyReplicateSignature` accepts; flip one byte of body/timestamp/secret, assert rejection. Runs in `npm run test:unit` (no Docker).

### Success Criteria:

#### Automated Verification:

- Hermetic suites green: `npx vitest run tests/replicate-stub.helpers.test.ts tests/replicate-webhook.test.ts`
- Deno static check green: `deno check supabase/functions/enhance/index.ts`
- Lint + types green on touched files: `npx eslint <touched> && npx tsc --noEmit`

#### Manual Verification:

- With the local stack + `functions serve` (env including `E2E_ALLOWED_OUTPUT_ORIGIN`), a seeded `processing` row + helper-signed callback whose output points at the fixture server ends `succeeded` with `result_path` set and the source object deleted (re-run of the phase3 harness flow through the new helpers).
- With `E2E_ALLOWED_OUTPUT_ORIGIN` unset, the same callback returns HTTP 200 with the row flipped `failed`/`error_code: callback_failed` and the source object deleted — today's exact contract (200 is deliberate: it stops provider retries); the seam is default-off.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: North-star spec — result renders without refresh

### Overview

The PR-gate happy path: real UI submit, stubbed completion, Realtime-driven render. Protects #1 ("result appears, not a spinner") and #6 (the render path).

Setup first: install chromium locally (`npx playwright install chromium`) and bring the EXISTING gate (setup + seed + dashboard specs) to green — this is their first-ever execution; REVIEW-class fixes to those specs are in scope here (see What We're NOT Doing).

### Changes Required:

#### 1. North-star spec

**File**: `tests/e2e/north-star-cloud-result.spec.ts` (new; generated from seed + RULES via the /10x-e2e loop)

**Intent**: Signed-in (storageState default) → upload `night-rgb.jpg` → select Cloud AI → "Process with Cloud AI" → capture `jobId` via `waitForResponse` → `flipToProcessing` (< 30 s) → start fixture server → POST helper-signed `/callback` (`status:"succeeded"`, output = fixture URL) → assert, **without any reload**: slider `role="slider"` (aria-label per `BeforeAfterSlider.tsx:54-62`) visible, button "Download" visible, text "Enhancing in the cloud…" gone.

**Contract**: Preconditions hard-fail loudly (function URL unreachable → clear setup error). Cleanup deletes exactly the captured job row + its storage prefix (service role; setup/cleanup only). Provenance header ties the spec to risks #1+#6 and the seed. One test, one file.

#### 2. Realtime warmup helper (addendum — discovered mid-phase, back-recorded per impl-review F2)

**File**: `tests/e2e/helpers/realtime-ready.ts` (new)

**Intent**: Warm the local Realtime tenant before the browser subscribes. An idle tenant re-initializes on first join and DROPS `postgres_changes` events committed during that warmup — a real flake that would hit every fresh CI boot. Setup-only (precondition hard-fail spirit); Phase 4's CI determinism depends on it.

### Success Criteria:

#### Automated Verification:

- Browsers installed + existing gate green on FIRST execution: `npx playwright install chromium && npx playwright test seed anon-dashboard-redirects-to-signin`
- Spec green against the running stack: `npx playwright test north-star-cloud-result`
- Full local gate still green: `npx playwright test` (setup + #2 specs + this one)
- Lint + types green: `npx eslint tests/e2e && npx tsc --noEmit`

#### Manual Verification:

- Deliberate-break check (pick ≥1, confirm red, revert): succeeded-wins derivation (`useCloudJob.ts:324-332`) or `cloudResultReady` render guard (`EnhanceWorkspace.tsx:80-88`) — the spec must fail when the risk materializes.
- Visually: the slider appears without refresh in headed mode.

**Implementation Note**: pause for manual confirmation before proceeding.

---

## Phase 3: Stall spec — stuck job surfaces a terminal failure

### Overview

The "never hangs forever" half of #1: with the pipeline deliberately unwired, the queued watchdog must surface the timeout alert at ~30 s instead of an eternal spinner.

### Changes Required:

#### 1. Stall spec

**File**: `tests/e2e/cloud-stall-surfaces-timeout.spec.ts` (new; via the /10x-e2e loop)

**Intent**: Signed-in → upload → submit → do nothing. Assert within a ~40 s expect budget: `role="alert"` with the exact copy "Cloud processing took too long. Please try again." (`useCloudJob.ts:83`), buttons "Try again" and "Start over" visible, spinner text gone.

**Contract**: Requires the DB webhook unwired (CI default; local precondition documented in the spec header — a wired local pipeline would legitimately advance the row and the spec would not see the 30 s timeout). UI-only assertions (admin client never asserts). The spec sets `test.setTimeout(60_000)` per-file — the wait exceeds Playwright's default 30 s test timeout (config deliberately sets none; the rest of the gate stays fast). Cleanup by captured `jobId` removes the job row AND its storage prefix, idempotently (the upload PUT landed even though processing never started; the timeout endpoint flips the row `failed` server-side). _(Post-review addendum, impl-review F2: file timeout raised to 75_000 — outer margin for a cold CI webServer compile + the hydration retry ahead of the 30 s watchdog; internal layering 30 < 40 < 75 unchanged.)_

### Success Criteria:

#### Automated Verification:

- Spec green (~35 s wall-clock): `npx playwright test cloud-stall-surfaces-timeout`
- Full local gate green: `npx playwright test`

#### Manual Verification:

- Deliberate-break check: gut `failByTimeout`/deadline arming (`useCloudJob.ts:150-164` or `:222`) → spec goes red (eternal spinner reproduced), revert.

**Implementation Note**: pause for manual confirmation before proceeding.

---

## Phase 4: CI `e2e` job + docs sync

### Overview

A dedicated CI job runs the whole Playwright gate on every push/PR; `deploy` gains the third gate. Docs catch up (CLAUDE.md, test-plan cookbook, live-smoke runbook).

### Changes Required:

#### 1. `e2e` job

**File**: `.github/workflows/ci.yml`

**Intent**: New job parallel to `integration`: boot the ephemeral stack, serve the function with a generated env, run Playwright (chromium), upload the report on failure. Gate `deploy` on it.

**Contract**: Steps mirror `integration`'s hardening (Supabase image cache + retry — lessons.md), plus: generate `supabase/functions/.env` (generated `whsec_` secret via openssl, dummy `DB_WEBHOOK_SECRET`, `CLOUD_PIPELINE_ENABLED=false`, `E2E_ALLOWED_OUTPUT_ORIGIN` pointing at the resolved container-reachable host); background `npx supabase functions serve enhance --env-file …` + readiness probe (router 404 = ready); resolve host (`host.docker.internal` probe → fallback `172.17.0.1`) and export for the spec's fixture server URL; Playwright browser cache (`~/.cache/ms-playwright` keyed on the lockfile) + `npx playwright install chromium --with-deps` on miss; export the three `SUPABASE_*` vars (existing `status -o env` pattern — quote-stripping sed included); `npm run test:e2e`; `actions/upload-artifact` of `playwright-report/` on failure. `deploy.needs` → `[ci, integration, e2e]`. No GitHub secrets (fork-PR-safe, like `integration`). The job's determinism on a fresh boot relies on the Realtime warmup precondition (`tests/e2e/helpers/realtime-ready.ts` — see Phase 2 addendum); no extra CI step needed, the spec runs it itself.

#### 2. Docs sync

**File**: `CLAUDE.md` (CI section + Commands), `context/foundation/test-plan.md` (§6.3 cookbook, §5 e2e gate row → wired, §3 Phase 4 row → complete + change folder), `context/foundation/cloud-live-smoke.md` (new)

**Intent**: CLAUDE.md describes the third job + `npm run test:e2e`; test-plan's §6.3 gets the real cookbook entry (levers, storageState, stub seam, budgets); the live-smoke doc captures the manual procedure (tunnel, real signing secret via `GET /v1/webhooks/default/secret`, `EDGE_FUNCTION_URL`, verify webhook present on the prediction — the F1/F2 checks), referencing the archived runbook.

**Contract**: §6.3 replaces its "TBD — see §3 Phase 4" stub; §7/§2 untouched (lesson boundary — no strategy changes). The smoke doc lives in foundation (archives are immutable).

### Success Criteria:

#### Automated Verification:

- Workflow parses and the `e2e` job goes green on the PR run (`gh run watch`)
- `deploy` lists three needs (assert in YAML)
- Lint green on edited markdown (lint-staged)

#### Manual Verification:

- One full master run post-merge: ci + integration + e2e green, deploy executes.
- Cache effectiveness sanity: second run's e2e job restores both caches (images + browsers).
- Live-smoke doc walked through once end-to-end (or explicitly scheduled by the maintainer).

**Implementation Note**: final phase — run the epilogue after manual confirmation.

---

## Testing Strategy

### Unit Tests:

- Hermetic signer↔verifier round-trip (Phase 1) — accept + tamper-reject cases.

### Integration Tests:

- Unchanged (`jobs.rls.test.ts` etc.); the E2E layer sits above them.

### Manual Testing Steps:

1. Phase-1 harness round-trip against the local stack (seeded row → signed callback → `succeeded` + retention).
2. Headed run of the north-star spec — watch the slider appear without refresh.
3. Deliberate breaks per Phases 2–3 (red → revert → green).
4. Live smoke per `cloud-live-smoke.md` (out-of-band, maintainer-driven).

## Performance Considerations

- North-star spec: seconds (no cold boot — the stub completes instantly).
- Stall spec: ~30-35 s by design (real watchdog budget) — accepted into the PR gate (decision Q2).
- CI `e2e` job estimated ~5-7 min cold, ~4-5 min warm (image + browser caches).

## Migration Notes

None — additive. The seam env is default-off; prod behavior unchanged.

## References

- Research: `context/changes/testing-e2e-north-star/research.md` (seams ranked, budgets, anchors, break targets)
- Harness precedent: `scripts/spikes/phase3-callback-test.ts`
- Levers: `tests/e2e/seed.spec.ts`, `tests/e2e/RULES.md`
- Archived runbook (read-only): `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pipeline harness (seam + helpers + hermetic proof)

#### Automated

- [x] 1.1 Hermetic suites green: `npx vitest run tests/replicate-stub.helpers.test.ts tests/replicate-webhook.test.ts` — 7286858
- [x] 1.2 Deno static check green: `deno check supabase/functions/enhance/index.ts` — 7286858
- [x] 1.3 Lint + types green on touched files — 7286858

#### Manual

- [x] 1.4 Local seeded-row → signed-callback → `succeeded` + retention via new helpers — 7286858
- [x] 1.5 Seam default-off confirmed (env unset → 200, row failed/callback_failed, source gone) — 7286858

### Phase 2: North-star spec — result renders without refresh

#### Automated

- [x] 2.1 Browsers installed + existing gate green on FIRST execution — d6ba832
- [x] 2.2 Spec green: `npx playwright test north-star-cloud-result` — d6ba832
- [x] 2.3 Full local gate green: `npx playwright test` — d6ba832
- [x] 2.4 Lint + types green on tests/e2e — d6ba832

#### Manual

- [x] 2.5 Deliberate-break confirmed red (succeeded-wins or render guard), reverted — d6ba832
- [x] 2.6 Headed run: slider appears without refresh — d6ba832

### Phase 3: Stall spec — stuck job surfaces a terminal failure

#### Automated

- [x] 3.1 Spec green: `npx playwright test cloud-stall-surfaces-timeout` — 08a8f10
- [x] 3.2 Full local gate green: `npx playwright test` — 08a8f10

#### Manual

- [x] 3.3 Deliberate-break confirmed red (watchdog gutted → eternal spinner), reverted — 08a8f10

### Phase 4: CI `e2e` job + docs sync

#### Automated

- [x] 4.1 `e2e` job green on the PR run — PR #24 (CI runs 27469053657, 27470188773)
- [x] 4.2 `deploy.needs` = [ci, integration, e2e] — 6382d0e
- [x] 4.3 Markdown lint green (lint-staged) — 6382d0e

#### Manual

- [x] 4.4 Full master run: three jobs green, deploy executes — master run 27472673373
- [x] 4.5 Second run restores image + browser caches — master 27472673373 (supabase-images cache HIT; chromium cache populated, restores on subsequent runs)
- [x] 4.6 Live-smoke doc walked through or explicitly scheduled — live smoke prod 2026-06-14 (cold+warm `succeeded`; F1 implicit via succeeded, F2 explicit: `.webhook` = prod `…/enhance/callback`)
