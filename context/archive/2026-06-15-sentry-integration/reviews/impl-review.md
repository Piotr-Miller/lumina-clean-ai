<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Sentry Integration (Astro 6 / workerd + Deno Edge Function)

- **Plan**: context/changes/sentry-integration/plan.md
- **Scope**: Phases 2 & 3 of 3 (Phase 1 reviewed separately in impl-review-phase-1.md)
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Deno scrub mirror omits breadcrumbs + contexts.trace.data

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (data-safety)
- **Location**: supabase/functions/enhance/index.ts:89-118
- **Detail**: The app scrub `scrubEvent()` covers two surfaces the Deno mirror does NOT: breadcrumbs (message + data, app ref sentry-scrub.ts:131-136) and `contexts.trace.data` (app ref sentry-scrub.ts:124-127). The Deno `scrubSentryEvent()` scrubs message, exception, request, user, spans, and extra but skips both. Plan P3.1 requires "keep the two in sync"; §3.3 calls breadcrumb redaction load-bearing. @sentry/deno attaches console breadcrumbs by default, so an Edge event can ship an unredacted console crumb (e.g. a warn carrying a storage path) the app scrub would catch. Acute risk is lower on the Edge (it never fetches the signed source URL directly; Replicate error text is already bounded), but it's a genuine privacy-seam divergence.
- **Fix**: Add breadcrumbs + contexts.trace.data branches to `scrubSentryEvent()` mirroring sentry-scrub.ts:124-136 (loop crumbs → redact message/data; redact contexts.trace.data via scrubRedactDeep).
  - Strength: Restores the field-for-field parity the plan requires; closes the only PII surface the mirror misses.
  - Tradeoff: Minor — ~8 lines, mirrors existing app-side code.
  - Confidence: HIGH — the app version is the proven template.
  - Blind spot: Deno-side scrub has no unit test (manual mirror); app tests don't exercise this copy.
- **Decision**: FIXED — breadcrumbs + contexts.trace.data branches added to scrubSentryEvent() (enhance/index.ts:116-126), matching the app scrub.

### F2 — Edge warning captures lack Sentry.flush() before returning

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: supabase/functions/enhance/index.ts:460, :503
- **Detail**: Both `Sentry.captureMessage(..., "warning")` sites (replay-guard :460, prediction-id mismatch :503) return a Response immediately with no flush. The two captureException sites (:370, :573) correctly `await Sentry.flush(2000)`. Per this change's own Phase-2 discovery (progress note 2.3: edge isolates can be frozen post-response, so manual capture needs flush() before return), these two security-relevant warnings may never be delivered. The `setObservabilityWarnCapture` hook (:133-135) shares the gap on any warn-and-return path (e.g. handleReap sweep warnings).
- **Fix**: `await Sentry.flush(2000)` before the two warning returns, matching the captureException sites.
  - Strength: Consistent with the fix already applied to the exception paths; guarantees the warnings arrive.
  - Tradeoff: Adds up to 2s to those (rare) 401/200 responses — acceptable for replay/mismatch events.
  - Confidence: HIGH — same runtime constraint, same remedy already in-file.
  - Blind spot: None significant.
- **Decision**: FIXED — await Sentry.flush(2000) added before both warning returns (enhance/index.ts:472, :516).

### F3 — Capture hooks not wrapped despite "never affect job logic" promise

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/lib/services/photo-job.service.ts:62 (comment promise :40); src/lib/services/reset-password.handler.ts:80,97
- **Detail**: photo-job.service.ts:40 promises "capture-hook failures must never affect job logic," but `captureWarning()`/`captureAuthError()` are called outside any try/catch, and bestEffortRemove() also promises never to throw. In practice the default is no-op and Sentry capture calls don't throw, so the risk is theoretical — but the guarantee is unenforced.
- **Fix**: Wrap the capture call in a try/catch (swallow), or accept as-is given the SDK contract — the explicit comment makes wrapping the safer match.
- **Decision**: SKIPPED — accepted as-is; default is no-op and Sentry capture calls don't throw, so risk is theoretical.

### F4 — deno.lock removed → Edge function deps no longer integrity-pinned

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: supabase/functions/enhance/deno.json:5 (commit 45c76b5)
- **Detail**: The stale deno.lock was removed (this session) to unblock `deno check` — correct call, but the Edge function now pins only `npm:@sentry/deno@^10.58.0` (a caret range) with no lockfile, so a future @sentry/deno 10.x minor could drift into the build. Already noted as a follow-up.
- **Fix**: Regenerate a complete lock when standalone Deno is available (`cd supabase/functions/enhance && deno cache index.ts`) and commit it.
- **Decision**: SKIPPED — tracked as a follow-up (needs standalone Deno, not installed locally). See follow-ups/review-fixes.md.

## Notes

- **Automated criteria (3.1–3.5, 2.1)**: verified via CI run 27672305292 on HEAD f9f11da — lint, unit (156; scrub 11), deno check, build all GREEN.
- **Stryker (3.6)**: consciously SKIPPED. The change to the §4 risk module photo-job.service.ts is the observability seam only (additive captureWarning calls + setter) — no business-logic change, so no business-relevant survived mutants to surface. Mutation-testing unchanged logic is out of scope for this diff (CLAUDE.md: "run only for code covered by the change").
- **Manual criteria** 2.3/2.4, 3.7–3.12 are honestly unchecked — they need the deployed env (post-merge). No rubber-stamping observed.
- **Session CI fixes** (eslint node globals, deno.lock removal, ci.yml --config) are in-scope corrections that make plan criteria 3.2/3.4 actually pass — not scope creep.
- **Seam architecture** is excellent: photo-job.service.ts + reset-password.handler.ts stay SDK-free; Sentry wired only at sentry.server.config.ts and the Deno init.
