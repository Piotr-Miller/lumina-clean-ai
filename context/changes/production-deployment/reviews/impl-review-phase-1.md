<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-07 Production Deployment — Phase 1

- **Plan**: `context/changes/production-deployment/plan.md`
- **Scope**: Phase 1 of 4 (Harden the /callback Edge Function)
- **Date**: 2026-06-05
- **Commit**: efd831f
- **Verdict**: APPROVED (with 2 minor warnings)
- **Findings**: 0 critical, 2 warnings, 1 observation — all 3 FIXED 2026-06-05 (triaged)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Evidence

- **Drift**: 4/4 planned changes MATCH. Correct security wiring order — SSRF allowlist called BEFORE the output fetch; freshness checked AFTER signature verification. No scope creep (extra test cases for look-alike hosts are benign reinforcement).
- **Automated criteria**: 1.1 `npm run test` 86/86 (replicate-webhook suite 28/28) ✓ · 1.4 eslint clean ✓ · 1.3 `deno check` NOT run (no deno binary; deferred to Phase 3 CI) · 1.2 covered ✓.
- **Manual criteria**: 1.5 (stale→401, fresh→proceeds) ✓ · 1.6 (disallowed host→failed, no fetch) ✓ · 1.7 (success-store) deferred to go-live.
- **Security probes** (allowlist): subdomain spoof (`replicate.delivery.evil.com`), `@`-userinfo (`replicate.delivery@evil.com`), punycode, case, query/fragment smuggling, non-https — all rejected. Replay window genuinely closed (timestamp is signature-bound).
- **Dual-runtime constraint**: `replicate-webhook.ts` stays free of `@/` and Deno/npm-specific APIs (URL, Number, Math, Date, endsWith only). Intact.

## Findings

### F1 — Size cap can overshoot by one chunk before throwing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/functions/enhance/index.ts:284-294 (readBodyCapped)
- **Detail**: The reader adds each chunk's length to `total`, then checks `total > maxBytes` after the fact. The over-cap chunk isn't retained (throw precedes push), but peak resident memory is ≈ maxBytes + one chunk rather than a hard maxBytes. Negligible at a 25 MB cap with KB-sized stream chunks — not exploitable, just imprecise.
- **Fix**: Check `total + value.byteLength > maxBytes` BEFORE pushing the chunk, so the bound is strict.
- **Decision**: FIXED — applied 2026-06-05 (pending commit)

### F2 — req.text() + pre-mutation guards run outside the try/catch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: supabase/functions/enhance/index.ts:307-339
- **Detail**: The raw-body read (`await req.text()`), signature check, freshness check, and `new URL(req.url)` all run before the handler's try/catch. verifyReplicateSignature / isWebhookTimestampFresh are never-throw, but a mid-body client abort during `req.text()` would throw OUT of handleCallback unhandled — a platform 500 with no JSON envelope and no markJobFailed. Low likelihood (Replicate sends a complete body), and Replicate would retry the 500, so no data corruption.
- **Fix**: Wrap the raw-body read (and the pre-mutation section) so a body-read failure returns a controlled 400 rather than an unhandled rejection.
- **Decision**: FIXED — applied 2026-06-05 (pending commit)

### F3 — Untested branches: readBodyCapped + userinfo-host allowlist case

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria (coverage)
- **Location**: index.ts:270-302 (readBodyCapped); tests/replicate-webhook.test.ts
- **Detail**: readBodyCapped lives in the Deno-only index.ts (outside the Vitest graph), so its over-cap / missing-body branches have no automated test — only the manual serve path exercises them. Separately, the allowlist suite doesn't cover the userinfo trick (verified safe at runtime: `https://replicate.delivery@evil.com` → host `evil.com` → rejected).
- **Fix**: Add `expect(isAllowedOutputUrl("https://replicate.delivery@evil.com/x")).toBe(false)` to lock it against regression. (readBodyCapped stays manual-only unless extracted to the dual-runtime module.)
- **Decision**: FIXED — applied 2026-06-05 (pending commit)
