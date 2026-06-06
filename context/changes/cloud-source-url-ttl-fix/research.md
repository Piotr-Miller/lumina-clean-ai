---
date: 2026-06-06T20:30:39Z
researcher: Claude (Opus 4.8)
git_commit: 9af1134f735ba7c3b02c5382ecd221c3b1ebab80
branch: master
repository: Piotr-Miller/lumina-clean-ai
topic: "S-09 cloud-source-url-ttl-fix — source signed-URL TTL vs Replicate cold-boot expiry, and aligned timing budgets"
tags: [research, codebase, cloud-pipeline, edge-function, replicate, supabase-storage, ttl, cold-boot]
status: complete
last_updated: 2026-06-06
last_updated_by: Claude (Opus 4.8)
---

# Research: S-09 cloud-source-url-ttl-fix

**Date**: 2026-06-06T20:30:39Z · **Git Commit**: 9af1134 · **Branch**: master · **Repo**: Piotr-Miller/lumina-clean-ai

## Research Question

Why does a slow Replicate cold boot fail a Cloud AI job at the source-fetch step, and what is the coherent set of timing/TTL changes (source-URL TTL + processing watchdog + result TTL) that fixes it? Scope: full cold-boot timing alignment + external constraint verification (Supabase max TTL, Replicate fetch behavior).

## Summary

**Root cause (confirmed):** Replicate fetches the input URL **at the start of `predict()` — after the container cold-boots** (Cog downloads URL inputs to a temp file inside the per-request path, after `setup()`), not at `predictions.create` time. The Edge Function signs the source READ URL with `SOURCE_URL_TTL_SECONDS = 300` (`supabase/functions/enhance/index.ts:40`), fixed at creation and **un-re-mintable** (Replicate holds the URL inside the prediction). Phase-0 measured cold boot ≈ 118–135s, but cold boots **>300s were observed under platform load** — so the URL expires before the cold worker fetches it → prediction dies at source-fetch with a 400, in any account.

**The fix is a timing-budget alignment, not a latency fix.** Three values share the cold-boot-ceiling root, but they serve **different purposes** and must NOT be set equal:

1. **`SOURCE_URL_TTL_SECONDS` (300s) → raise generously.** External docs: Supabase `createSignedUrl` has **no practical cap** (effectively unbounded; `3600` is Supabase's own canonical example), and Replicate's own prediction run-timeout is **30 min**, with cold boots documented at "several minutes, occasionally 10–30 min." → **Recommend ~3600s (1h)**, not the roadmap's tentative ~900s (which external evidence shows is still too low for the worst case). The source URL should be generous enough to **never be the failure cause**.
2. **`PROCESSING_WATCHDOG_MS` (180s) → raise, but it's a UX-patience budget, not "cover the worst-case cold boot".** You can't make a user stare 30 min; this is the "we've waited long enough → fail to a clear retry" budget (lessons: *surface a retry, don't hang*). Decouple it from the source TTL. **Open product call** on the exact value (suggest a few minutes).
3. **`RESULT_URL_TTL_SECONDS` (300s) → no change.** Independent, minted on `succeeded`, re-minted on demand; only needs to outlive a browser result fetch.

**Key correction to the roadmap:** the roadmap floated `~900s` for the source TTL (`roadmap.md:204`); external evidence supports **3600s** as the safer, doc-backed value. The Supabase max-TTL is a non-issue (no practical cap).

## Detailed Findings

### A. Code surface — signing path + every timing/TTL constant

**Source-URL signing flow** (`supabase/functions/enhance/index.ts`):
- `/start` → `signSourceWithRetry(admin, job.source_path)` (`:208`, def `:148-159`) → `createSignedReadUrl(admin, sourcePath, SOURCE_URL_TTL_SECONDS)` (`:152`).
- `createSignedReadUrl` (`src/lib/services/photo-job.service.ts:251-261`) → `admin.storage.from("photos").createSignedUrl(path, expiresInSeconds)` (`:256`). **TTL fixed at signing.**
- `toPublicStorageUrl` rewrites origin (local tunnel only; `:122-133`).
- Embedded into the prediction via `buildBreadInput(signedSourceUrl)` → `{ image, gamma, strength }` (`src/lib/services/bread.ts:35-41`), sent at `index.ts:237`. **Cannot be re-minted after creation.**

**All cloud-pipeline timing/TTL constants:**

| Constant | Value | Location | Bounds |
|---|---|---|---|
| `SOURCE_URL_TTL_SECONDS` | 300 | `enhance/index.ts:40` | source signed-read URL (Replicate fetches) ⟵ **S-09 core** |
| `SOURCE_SIGN_MAX_ATTEMPTS` | 6 | `enhance/index.ts:49` | re-sign retries on upload race (~4.5s) |
| `SOURCE_SIGN_RETRY_DELAY_MS` | 750 | `enhance/index.ts:50` | delay between sign retries |
| `OUTPUT_FETCH_TIMEOUT_MS` | 30_000 | `enhance/index.ts:57` | output download (AbortSignal, bounds whole read) |
| `MAX_OUTPUT_BYTES` | 25 MB | `enhance/index.ts:58` | output size cap |
| `QUEUED_WATCHDOG_MS` | 30_000 | `useCloudJob.ts:66` | client: queued → processing |
| `PROCESSING_WATCHDOG_MS` | 180_000 | `useCloudJob.ts:67` | client: processing → terminal ⟵ **S-09 (raise)** |
| `SLOW_HINT_MS` | 25_000 | `useCloudJob.ts:69` | cold-start reassurance UI |
| `RESULT_URL_TTL_SECONDS` | 300 | `useCloudJob.ts:52` | result signed-read URL (re-minted) — no change |
| `WEBHOOK_TOLERANCE_SECONDS` | 300 | `replicate-webhook.ts:114` | replay window (unrelated) |

**Budget ordering on a cold-boot job:** `QUEUED_WATCHDOG` (30s) → `SLOW_HINT` (25s) → `PROCESSING_WATCHDOG` (180s) → `SOURCE_URL_TTL` (300s). The bug: both `PROCESSING_WATCHDOG` (180s) and `SOURCE_URL_TTL` (300s) sit **below** the observed worst-case cold boot (>300s).

### B. Historical context — why 300s/180s, and the evidence they're too short

- **Cold-boot ceiling:** warm ≈ 4s; cold ≈ 118–135s (Phase-0); **worst observed >300s under load** (`lessons.md:91-92`, `roadmap.md:206`, `roadmap.md:229`).
- **Why 300s/180s:** S-04 sized them against the ~135s Phase-0 measurement — 300s source TTL looked like ~2× headroom; 180s watchdog = "ceiling + predict + callback + result fetch" (`useCloudJob.ts:62-64`; S-04 `plan.md:51`; `lessons.md:93`).
- **Why they're wrong:** the lesson generalizes — *"Warm latency badly understates the tail … sign any provider-fetched URL with a TTL that comfortably outlives the worst-case cold boot (NOT just the warm path)"* (`lessons.md:92-93`). The >300s tail breaks both the source TTL and the watchdog.
- **Privacy ceiling:** keep the source TTL "as short as the worst observed cold boot allows" — a longer signed READ URL widens the private-source exposure window (`roadmap.md:205`). (Mitigated: the source is deleted on terminal state via retention; S-08 closes the failed/abandoned gap.)
- **Keep-warm deferred** (cost, tension with S-05 cap) — S-09 makes a slow cold boot *succeed*, it does not make it *fast* (`lessons.md:93`, `roadmap.md:229`).
- **Sequencing:** S-09 touches only the source-signing path in the Edge Function — collision-free vs S-05/S-06/S-08 (`roadmap.md:200`). Flip-ON gate = S-05 ✓ + S-08 + S-09 (`go-live.md` flip-ON runbook).

### C. External constraints (Context7 / Exa — cited)

- **Supabase `createSignedUrl(path, expiresIn)`:** no practical cap. Server validates `expiresIn` (PR supabase/storage#1020, 2026-04-15) only against a safe-integer JWT bound (~astronomical); out-of-range → HTTP 400. `3600` is the canonical docs example; community soft-convention ceiling is 7 days (604,800s), not enforced. → **900s / 3600s / 86400s all fine.** Caveat: signed URLs are bearer tokens, not revocable by JWT-secret rotation (separate signing key) — keep TTL as short as the use case allows.
- **Replicate input-URL fetch timing:** Cog downloads URL inputs **inside `predict()` (per-request), after `setup()`/cold boot** — so the fetch can land **minutes after `predictions.create`** for a cold worker. No documented input-URL expiry rule, but the URL must be valid **when `predict()` runs**. Prediction run-timeout = **30 min**.
- **Cold-boot reality:** scale-to-zero + shared pools; Replicate docs say weight loading "can take several minutes"; field reports of 2–3 min typical and up to ~10–30 min under bad conditions. **Bread is a shared public model — no keep-warm control** unless wrapped in a paid Deployment (min instances ≥ 1).
- **Best-practice TTL for a provider-fetched input URL:** **≥ 1h (3600s), safe 1–2h** — must cover queue + cold boot + the 30-min run window, while limiting bearer exposure. Short TTLs (60–300s) are for browser display, not provider-fetched-after-cold-boot inputs.

## Code References

- `supabase/functions/enhance/index.ts:40` — `SOURCE_URL_TTL_SECONDS = 300` (**raise to ~3600**)
- `supabase/functions/enhance/index.ts:148-159, 208` — `signSourceWithRetry` + call site
- `src/lib/services/photo-job.service.ts:251-261` — `createSignedReadUrl` → `createSignedUrl(path, expiresIn)`
- `src/lib/services/bread.ts:35-41` — `buildBreadInput` (URL embedded in prediction)
- `src/components/hooks/useCloudJob.ts:67` — `PROCESSING_WATCHDOG_MS = 180_000` (**raise — UX-patience budget**)
- `src/components/hooks/useCloudJob.ts:52` — `RESULT_URL_TTL_SECONDS = 300` (no change)

## Architecture Insights

- **Source TTL and the client watchdog are different concerns and must be decoupled.** The source TTL should be *generous* (never be the failure cause for a slow-but-working cold boot). The watchdog is *user patience* (fail to a visible retry). Setting them equal (or making the watchdog "cover the 30-min worst case") would make users hang. The earlier framing "watchdog must outlive the whole cold boot" only holds up to the point where a retry is better UX than waiting.
- **The fix cannot re-mint after creation** — Replicate owns the URL once the prediction exists. So the only levers are (a) sign with a long-enough TTL up front, or (b) lazy-sign just before the model fetches (not feasible — Replicate pulls on its own schedule). → (a) is the practical fix.
- **F9 interaction:** raising `PROCESSING_WATCHDOG_MS` shrinks but doesn't eliminate the `markJobSucceeded` failed→succeeded resurrection race; **F9 (status-guard) is still independently needed** at flip-ON (`go-live.md` flip-ON pre-reqs).

## Historical Context (from prior changes)

- `context/archive/2026-05-31-cloud-ai-realtime-result/{plan.md,research.md}` — Phase-0 cold-boot measurements; original 300s/180s sizing rationale.
- `context/foundation/lessons.md:89-94` — "Size client timeouts AND provider-fetched signed-URL TTLs to the cold-boot ceiling, not warm latency."
- `context/foundation/roadmap.md` `### S-09` (`:194-207`) + promotion note (`:132`, `:206`) — the >300s observation, the ~900s candidate, the raise-vs-lazy-sign fix-shape, the privacy ceiling.
- `context/archive/2026-06-04-production-deployment/go-live.md` — flip-ON runbook; S-09 listed as a flip-ON prerequisite; F8/F9 hardening.
- `context/foundation/github-issues.md` — issue #12 (S-09).

## Open Questions

1. **Exact source TTL:** recommend **3600s (1h)**; confirm against the privacy ceiling (source is retention-deleted on terminal state anyway). Roadmap's ~900s is likely too low per external cold-boot evidence.
2. **Exact `PROCESSING_WATCHDOG_MS`:** product/UX call — how long does a user wait before "taking too long, try again"? (A few minutes, decoupled from the source TTL.) Note: a longer watchdog must still pair with the `SLOW_HINT` reassurance and a clear retry affordance.
3. **Fix shape:** raise-TTL (one-line, sufficient) vs lazy-sign (rejected — Replicate fetches on its own schedule). Recommend raise-TTL.
4. **Re-validation:** how to exercise a real >300s cold boot for validation (needs Replicate creds + a controlled flag flip) — shared with S-08's cloud-path test harness.
5. **Keep-warm (deferred):** out of S-09 scope (cost decision) — note it as the only true latency fix for a future call.
