<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cloud AI Realtime Result

- **Plan**: context/changes/cloud-ai-realtime-result/plan.md
- **Scope**: Phase 4 of 6 (Realtime subscription plumbing)
- **Date**: 2026-06-01
- **Verdict**: APPROVED (with one recommended reliability fix)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (2 approved, documented extras: enhance/index.ts race retry, replicate-webhook.ts type-only) |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (astro check 0 errors; lint clean; build green; manual 4.4/4.5/4.6 confirmed via HAR) |

## Findings

### F1 — Realtime teardown unsubscribes the channel but never disconnects the client socket

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (resource leak)
- **Location**: src/components/hooks/useCloudJob.ts:54,75-84
- **Detail**: Each effect run creates a fresh `createBrowserClient` (line 54); cleanup calls only `channel.unsubscribe()` (line 82), never disconnecting that client's WebSocket. The Phase-4 HAR confirms the leak: after each Start-over the channel sends `phx_leave`/`phx_close`, but the underlying socket keeps heartbeating — 4 rapid resubmits left 3 orphaned sockets alive (reclaimed only by GC). `useLocalEnhance` releases every resource it owns; this hook should match that bar for the socket. (Agent 2 posited a microtask race between the `cancelled` check and the `channel` assignment — NOT real; both run synchronously inside the `.then` with no yield. The socket leak is the genuine issue.)
- **Fix**: In cleanup, disconnect the per-run client, not just the channel — `if (channel) void client.removeChannel(channel);` plus `void client.realtime.disconnect();` (client is in scope at line 54). Optionally add `if (cancelled) return;` at the top of the postgres_changes callback (line 66) for uniform lifecycle safety. ~4 lines, no happy-path behavior change.
  - Strength: Matches `useLocalEnhance`'s resource discipline; removes the orphaned-socket accumulation the HAR shows.
  - Tradeoff: Minimal — a few lines in one cleanup function.
  - Confidence: HIGH — leak is reproduced in the captured trace; fix is the standard supabase-js teardown.
  - Blind spot: None significant.
- **Decision**: FIXED (2026-06-02) — cleanup now calls `client.removeChannel(channel)` + `client.realtime.disconnect()` and the postgres_changes callback gained an `if (cancelled) return;` guard. Re-verified: astro check 0 errors, ESLint clean, build green.

### F2 — setAuth().then() has no .catch (subscription-never-established case)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Reliability
- **Location**: src/components/hooks/useCloudJob.ts:59
- **Detail**: If `setAuth` rejects (network / token decode), the subscription silently never forms and the UI sits on the "processing" fallback forever. Phase 4 explicitly defers failure UX + the watchdog to Phase 5, so acceptable now — but Phase 5's timeout watchdog must cover "subscription never established," not only "job never completes."
- **Fix**: Carry into Phase 5 planning (watchdog must fire even if no subscription/terminal event ever arrives).
- **Decision**: PENDING

### F3 — SUPABASE_KEY is declared access:"secret" yet sent to the browser

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality (security)
- **Location**: src/pages/index.astro:5,38
- **Detail**: The value IS the publishable anon key (sb_publishable_…), RLS-gated and safe to expose; both review agents confirmed no service-role key reaches the browser graph. The only wrinkle is naming/classification: the var is `SUPABASE_KEY` declared `access:"secret"` in astro.config.mjs, now surfaced as the `supabaseAnonKey` prop. Pre-existing single-key convention, out of Phase-4 scope.
- **Fix**: None needed; recorded so the security check is on the record.
- **Decision**: PENDING
