<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Sentry Integration (Astro 6 / workerd + Deno Edge Function)

- **Plan**: context/changes/sentry-integration/plan.md
- **Scope**: Phase 1 of 3 (App SDK wiring + verification)
- **Date**: 2026-06-16
- **Verdict**: NEEDS ATTENTION → RESOLVED via triage 2026-06-16 (F1 + F2 FIXED, F3 ACCEPTED)
- **Findings**: 0 critical, 2 warnings, 1 observation — all triaged

## Verdicts

| Dimension           | Verdict                      |
| ------------------- | ---------------------------- |
| Plan Adherence      | PASS                         |
| Scope Discipline    | PASS                         |
| Safety & Quality    | WARNING → PASS (post-triage) |
| Architecture        | PASS                         |
| Pattern Consistency | PASS                         |
| Success Criteria    | PASS                         |

### Success Criteria evidence

- Automated: 1.1 typecheck (exit 0), 1.2 lint scoped to Phase 1 files (exit 0 — full `npm run lint` not run per lessons.md #33 Windows CRLF baseline), 1.3 build (exit 0), 1.4 unit 145 passed (exit 0).
- Manual: 1.5–1.9 all `[x]` with evidence in this session (wrangler dev boot, SSR + client events in Sentry, sign-in/protected-redirect against local Supabase).
- Mutation: skipped — Phase 1 touches no test-plan §4 risk module (`photo-job.service.ts`/`enhance/index.ts` untouched).

## Findings

### F1 — Placeholder scrub doesn't cover spans/breadcrumbs; the in-file comment overstates protection

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: sentry.server.config.ts:18-28,36-37 · sentry.client.config.ts:15-25,33-34
- **Detail**: `stripObviousUrls` only mutates `event.request.url` (drops query) and `event.request.query_string`. With tracing ON at 0.05 and a real DSN configured locally, the actual leak vector for this app is not closed: `browserTracingIntegration()` emits `http.client` spans whose `data["http.url"]`/`description` carry the full signed `result.*`/`source.*` URL incl. token, and `beforeSendTransaction` never walks `event.spans[]`. Same for fetch `breadcrumbs[].data.url`, `extra`, and `request.headers` (cookies). The docblock claims "signed URLs in spans are not shipped unscrubbed" — that assertion, and the plan's "no raw URL leaks before Phase 3" (plan:61), are inaccurate as written. (Empirically the SSR smoke showed `query_string` redacted, but a signed client span was never exercised.)
- **Fix A ⭐ Recommended**: Drop `tracesSampleRate` to 0 in Phases 1–2 until the Phase 3 shared scrub (spans + breadcrumbs + extra) lands; keep error capture on.
  - Strength: Closes the span/breadcrumb leak entirely with a one-char edit in two files; errors still flow. Matches the plan's privacy-first posture without faking coverage.
  - Tradeoff: No tracing signal until Phase 3 — but Phases 1–2 are about error capture, not latency.
  - Confidence: HIGH — removes the only event class (transactions) the placeholder can't protect.
  - Blind spot: None significant.
- **Fix B**: Extend the placeholder now to walk `event.spans[]` + `event.breadcrumbs[]` and redact URL query/signature.
  - Strength: Keeps the 5% tracing signal live through Phases 1–2.
  - Tradeoff: Pulls Phase 3 scrub work forward into a "placeholder"; duplicated in both files (F3 sync risk); easy to under-cover.
  - Confidence: MED — span/breadcrumb shapes vary; needs a real client trace to validate.
  - Blind spot: Resource/navigation spans may carry URLs in fields beyond `http.url`.
- **Either way**: correct the docblock comment so it doesn't assert protection the code doesn't provide.
- **Decision**: FIXED via Fix A — `tracesSampleRate: 0` in both configs (sentry.server.config.ts:34, sentry.client.config.ts:30); docblocks corrected to state tracing is off until Phase 3's span/breadcrumb scrub. `beforeSendTransaction` hooks kept wired. Phase 3 re-enables tracing alongside the shared scrub.

### F2 — `environment` unset → Phase 1 events default to "production"; dev/CI/prod mix

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: sentry.server.config.ts:30-38 · sentry.client.config.ts:27-35
- **Detail**: Neither init sets `environment` — only `tags.runtime`. The server/client contracts (plan #2/#3) literally listed `environment: <resolved>`, and the desired-end-state promises an "env-tagged" project, but only `release` is documented as deferred to Phase 3 — `environment` was dropped silently. `@sentry/cloudflare` won't infer it in workerd, so everything lands as "production". Concretely: this session's SSR/client test events are already in the prod stream tagged production, and local-dev errors during Phase 2/3 will look like prod incidents.
- **Fix**: Set `environment` from an env var (e.g. `SENTRY_ENVIRONMENT`, default "development") in both inits now — or, if intentionally deferred, add it to the plan's Phase 3 §5 deferral note next to `release`.
- **Decision**: FIXED — added `PUBLIC_SENTRY_ENVIRONMENT` (client/public, default "development") to env.schema (astro.config.mjs); client init reads it via astro:env/client; server entry reads `env.PUBLIC_SENTRY_ENVIRONMENT ?? "development"`; documented in .env.example. CI/prod must set it to "production".

### F3 — `stripObviousUrls` duplicated verbatim across both configs

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: sentry.server.config.ts:18-28 · sentry.client.config.ts:15-25
- **Detail**: Byte-for-byte duplicate. The constraint is real (server config is the workerd `main` entry, different SDK; the Deno init later can't import app `src/`). Acceptable for a one-phase placeholder — but a fix to one (e.g. F1's span-walk) can silently miss the other. Phase 3's planned `src/lib/observability/sentry-scrub.ts` extraction resolves it.
- **Fix**: No action now; ensure the Phase 3 extraction updates BOTH init sites.
- **Decision**: ACCEPTED — no action now. The duplicate stays as a short-lived Phase 1–2 placeholder; Phase 3's shared `src/lib/observability/sentry-scrub.ts` extraction must update both app init sites.

## Accepted drifts (not findings)

- Client DSN via `astro:env/client` instead of `import.meta.env.PUBLIC_SENTRY_DSN` — schema-validated equivalent, arguably better. Plan Adherence: PASS.
- Client scrub hooks (not in contract #3) — mandated by the plan's Implementation Approach (plan:61). In scope. Scope Discipline: PASS.
