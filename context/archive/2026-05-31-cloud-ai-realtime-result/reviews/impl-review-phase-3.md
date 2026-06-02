<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cloud AI Realtime Result

- **Plan**: context/changes/cloud-ai-realtime-result/plan.md
- **Scope**: Phase 3 of 6 (Pipeline completion — Edge Function /callback)
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations
- **Commit reviewed**: 7a0b531

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Context: pipeline ships behind `CLOUD_PIPELINE_ENABLED` (OFF in prod until S-05). No correctness or critical-security defects found; all planned `/callback` contract elements MATCH. Warnings are hardening items + an already-approved scope note.

Success criteria verified: 3.1 `npx vitest run tests/replicate-webhook.test.ts` → 18 pass (incl. canonical svix vector); 3.2 Edge Function serves locally (probe). Manual 3.3–3.6 verified live end-to-end this session (succeeded + failed + bad-sig + real-Replicate signature accepted).

## Findings

### F1 — No webhook-timestamp freshness window (replay)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/replicate-webhook.ts:70-104
- **Detail**: svix signs `${id}.${timestamp}.${body}` but the timestamp is never checked against "now", so a captured valid webhook stays valid forever. svix recommends ±5 min tolerance. Mitigated by the prediction-id cross-check + `already_terminal` idempotency (replaying a processed job is a no-op); residual risk is a replay landing on a still-`processing` row.
- **Fix**: Reject when `abs(now − webhookTimestamp) > 300s` — inside `verifyReplicateSignature` (inject a clock to keep it pure/testable) or as a guard in `handleCallback` before parsing.
  - Strength: Closes the only signature-layer gap; cheap, localized.
  - Tradeoff: Needs an injectable clock to keep the pure module testable; clock-skew false-rejects if window too tight.
  - Confidence: HIGH — standard svix practice.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — Output fetch is unbounded + untimed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/functions/enhance/index.ts ~290-295 (and the /start Replicate-create fetch ~186)
- **Detail**: `new Uint8Array(await outputRes.arrayBuffer())` buffers the whole image into edge-runtime RAM (~128–256MB) with no Content-Length guard, and there's no timeout on the external fetches. A hung/oversized output can OOM or stall the invocation, leaving the row stuck `processing`.
- **Fix**: Add `AbortSignal.timeout(...)` to the external fetches and a Content-Length sanity cap before buffering.
  - Strength: Removes the stall/OOM failure mode at the external boundary.
  - Tradeoff: Minor extra code; need a sensible size/time bound.
  - Confidence: HIGH — standard external-fetch hardening.
  - Blind spot: Real-world Bread output size distribution not measured.
- **Decision**: PENDING

### F3 — Two unplanned additions touch /start + scripts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/functions/enhance/index.ts:104-115 (toPublicStorageUrl); scripts/spikes/phase3-callback-test.ts
- **Detail**: Phase 3 planned only `/callback`. The commit also added `toPublicStorageUrl` to `/start` (EDGE_FUNCTION_URL-gated local-tunnel source-URL rewrite; verified prod no-op) and a deterministic test harness. Both justified local-dev/test enablers, prod-safe, discussed + approved this session.
- **Fix**: None needed — acknowledged. Optional: note as an addendum in plan.md so future reviews don't re-flag.
- **Decision**: PENDING

### F4 — Output URL not host-allow-listed (SSRF defense-in-depth)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/functions/enhance/index.ts ~290
- **Detail**: outputUrl is fetched server-side with no scheme/host check. Not independently exploitable (payload is signature-authenticated), but constraining to `https` + `replicate.delivery`/`*.replicate.com` is belt-and-suspenders.
- **Fix**: Allow-list scheme+host before fetching the output.
- **Decision**: PENDING

### F5 — Result object can orphan on late row-update failure

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/functions/enhance/index.ts ~298-318
- **Detail**: Order is upload(upsert) → markJobSucceeded(row UPDATE → source delete). If the row UPDATE fails after upload, the catch flips the row to `failed` while `result.<ext>` already exists → orphaned object + user sees failed. Low frequency; upsert makes upload retry-safe.
- **Fix**: Accept for MVP, or best-effort delete the just-uploaded object in the catch path.
- **Decision**: PENDING

### F6 — Prediction-id cross-check degrades to query-param trust when ids absent

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Correctness
- **Location**: supabase/functions/enhance/index.ts ~271
- **Detail**: Guard is `payload.id && job.replicate_prediction_id && mismatch`. If either id is missing it's skipped and the callback proceeds on the (unauthenticated) jobId query param alone. Payload is signature-authenticated so risk is low.
- **Fix**: Consider logging the degraded case, or treat present-payload-id vs missing-row-id as suspicious.
- **Decision**: PENDING

### F7 — Duplicate constantTimeEquals implementations

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/functions/enhance/index.ts:54-65 (SHA-256-digest variant) vs src/lib/services/replicate-webhook.ts:44-51
- **Detail**: Two constant-time comparators coexist (defensible — different input shapes), but duplicated logic that could drift. Style nit.
- **Fix**: Optionally consolidate, or leave with a cross-reference comment.
- **Decision**: PENDING
