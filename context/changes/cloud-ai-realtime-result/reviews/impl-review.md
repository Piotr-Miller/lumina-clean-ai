<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cloud AI Realtime Result (S-04)

- **Plan**: context/changes/cloud-ai-realtime-result/plan.md
- **Scope**: Full plan, Phases 0–5
- **Date**: 2026-06-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Notes: No plan drift across any phase. The only deviation from the plan's literal "~60s watchdog" (→ two-phase 30s queued / 180s processing, with re-check-before-fail + catch-up read on SUBSCRIBED) is intentional and documented in `change.md` (Phase 5 addendum) and `lessons.md`, matching Phase-0 spike-finding #1. Timeout route is correctly auth-gated and owner-scoped (no IDOR); only the anon/publishable key + a short-lived user JWT reach the browser (never the service-role key). Realtime channel/socket/timer teardown is thorough and StrictMode-safe. Automated success criteria (eslint clean, `astro check` 0 errors/0 warnings, `vitest` 16/16, `npm run build` complete) passed on the final source earlier in the implementing session (source unchanged since); manual checks 5.5–5.9 verified live against the local stack + ngrok tunnel.

## Findings

### F1 — Timeout POST not aborted on unmount

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/hooks/useCloudJob.ts:137-145 (failByTimeout fetch)
- **Detail**: The watchdog's `POST /api/enhance/cloud/timeout` has no `AbortController` tied to the effect cleanup. If the component unmounts (Start-over) just as `failByTimeout` fires, the request still completes in the background. It is owner-scoped + idempotent, the `.catch` swallows errors, and no state is set from the response — so it is benign, just an untracked in-flight request.
- **Fix**: Thread an `AbortController`, abort it in the effect cleanup, and pass its `signal` to the fetch. (Or accept as-is given idempotency.)
- **Decision**: PENDING

### F2 — No .catch on realtime.setAuth()

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/hooks/useCloudJob.ts (the `client.realtime.setAuth(accessToken).then(...)` chain)
- **Detail**: If `setAuth` rejects (token/transport issue), the subscription silently never establishes; the watchdog then correctly fails the job, but the root cause presents as a generic timeout rather than a diagnosable auth/transport error.
- **Fix**: Add a `.catch` on the `setAuth` chain that `console.warn`s (with the `eslint-disable-next-line no-console` the repo uses elsewhere) so a token/transport failure is visible.
- **Decision**: PENDING

### F3 — decodeDimensions has no load timeout

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/cloud-result.client.ts:23-34 (decodeDimensions)
- **Detail**: A signed result URL that never fires `onload`/`onerror` would leave the promise pending forever. Very low risk (short-TTL signed URL, reliable browser image loading) and consistent with the existing `useLocalEnhance.decodeImage` pattern.
- **Fix**: Optional — none needed; matches existing repo pattern.
- **Decision**: PENDING
