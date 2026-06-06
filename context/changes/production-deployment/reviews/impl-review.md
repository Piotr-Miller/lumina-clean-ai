<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-07 Production Deployment / Go-Live

- **Plan**: context/changes/production-deployment/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-06-06
- **Verdict**: NEEDS ATTENTION (none block the cloud-OFF go-live; F1/F3/F4/F8 are flip-ON pre-reqs — for S-07 as shipped, effectively APPROVED)
- **Findings**: 0 critical · 3 warnings · 5 observations
- **Triage (2026-06-06)**: F1–F7 FIXED; F8 DEFERRED to S-08/flip-ON. Verified: 87/87 unit tests green; `index.ts` type-check via CI `deno check`.
- **Re-review (2026-06-06, commit `1e79656`)**: independent verification of the F1–F7 fixes → **APPROVED, 0 new findings**. Confirmed happy paths intact, no dangling `constantTimeEquals` refs in code, F4's AbortSignal-bounds-streamed-read comment is factually correct, `npx supabase` resolves the pinned devDep, YAML valid. No regressions introduced.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS (87/87 unit, lint clean, CI green, `deno check` green in CI) |

> Strengths confirmed: HMAC verify on raw body, replay-window freshness, SSRF host-suffix
> allowlist, bounded+size-capped streaming download — all MATCH plan intent; CI deploy
> gating (`needs: ci` + master-push-only) and secret handling correct (matches the
> runtime-vs-build-time secret lesson); `.gitattributes` + Prettier `endOfLine:auto`
> resolves the recurring CRLF lesson at the root. No CRITICAL findings.

## Findings

### F1 — /callback prediction-id cross-check is fail-OPEN when stored id is null

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; matters at flip-ON
- **Dimension**: Safety & Quality
- **Location**: supabase/functions/enhance/index.ts:369
- **Detail**: Integrity cross-check `payload.id && job.replicate_prediction_id && payload.id !== …` only fires when both ids exist. A non-terminal job with a null stored prediction id would accept any signature-valid completion. Not currently reachable (`/start` always stores the id; HMAC gate authenticates Replicate) — defense-in-depth only.
- **Fix**: Make it fail-closed — if a `processing` job has a null prediction id, log + reject rather than skip the check. Address before flip-ON.
- **Decision**: FIXED (2026-06-06)

### F2 — Two different `constantTimeEquals` under the same name

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; obvious
- **Dimension**: Pattern Consistency
- **Location**: supabase/functions/enhance/index.ts:69 vs src/lib/services/replicate-webhook.ts:44
- **Detail**: index.ts digests both inputs with SHA-256 then compares (also hides length); the service one compares chars over max-len. Both sound, but same-named security primitives with different guarantees are a maintenance trap.
- **Fix**: Rename to disambiguate (`digestEquals` vs `charConstantTimeEquals`) or consolidate to one.
- **Decision**: FIXED (2026-06-06)

### F3 — webhook-signature header split is whitespace-fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; obvious
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/replicate-webhook.ts:94
- **Detail**: `split(" ")` mis-handles double/trailing spaces (empty entries skipped). No exploit (a forged entry still must pass HMAC), but brittle to header whitespace variation.
- **Fix**: Split on `/\s+/` and filter empties.
- **Decision**: FIXED (2026-06-06)

### F4 — Output read-loop not bounded by the 30s timeout

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — mitigated by allowlist
- **Dimension**: Safety & Quality
- **Location**: supabase/functions/enhance/index.ts:397,402
- **Detail**: `AbortSignal.timeout(30s)` bounds fetch headers; the streamed read loop (under the 25 MB cap) isn't re-bounded by it. A slow trickle under the cap could outlive 30s. Mitigated by the `*.replicate.delivery` allowlist.
- **Fix**: Wrap the whole download in a deadline, or apply the abort signal to the read loop. Pre-flip-ON.
- **Decision**: FIXED (2026-06-06) — on inspection the existing `AbortSignal.timeout` passed to `fetch` already aborts the in-flight `reader.read()`, so the streamed body read IS bounded by the 30s budget; clarified the comment to document this (no logic change needed).

### F5 — CI installs unpinned `supabase` CLI

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria (CI determinism)
- **Location**: .github/workflows/ci.yml:63
- **Detail**: `npm i -g supabase` — a breaking CLI release could break deploys non-deterministically.
- **Fix**: Pin to the `^2.x` already in devDependencies.
- **Decision**: FIXED (2026-06-06)

### F6 — Error-code vocabulary inconsistency

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: supabase/functions/enhance/index.ts:163,321
- **Detail**: Edge function uses `code: "misconfigured"` for missing-secret 500s; `create-job.ts` uses `internal_error` for the analogous case.
- **Fix**: Align on one code vocabulary across the boundaries.
- **Decision**: FIXED (2026-06-06)

### F7 — Plan prose/Progress says `npm run test`; impl uses `test:unit`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence (doc staleness)
- **Location**: context/changes/production-deployment/plan.md:199,346
- **Detail**: The `test:unit` rename (excludes the Docker-only RLS suite) is the correct call; the plan text just wasn't reconciled.
- **Fix**: Touch up plan.md prose to say `test:unit`.
- **Decision**: FIXED (2026-06-06)

### F8 — Orphan source object on partial storage-delete failure

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — scope-acknowledged
- **Dimension**: Architecture / Data safety
- **Location**: src/lib/services/photo-job.service.ts:141-147
- **Detail**: If Storage `remove` fails after the row flips `succeeded`, the source is orphaned (only a console.warn). Known MVP limitation; no sweeper. Only relevant once cloud is ON.
- **Fix**: Track a retention/cleanup sweep for flip-ON (gestured at in S-08).
- **Decision**: DEFERRED (2026-06-06) — to S-08 / flip-ON. Out of MVP scope; only relevant once cloud is ON.
