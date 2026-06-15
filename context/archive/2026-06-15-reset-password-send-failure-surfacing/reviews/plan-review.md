<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Surface password-reset send failures (swallowed-error fix)

- **Plan**: context/changes/reset-password-send-failure-surfacing/plan.md
- **Mode**: Deep
- **Date**: 2026-06-15
- **Verdict**: REVISE → SOUND (all 3 findings fixed in plan, triaged 2026-06-15)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

All three findings are LOW-impact / quick fixes — the plan's approach, grounding, and lessons-alignment are fundamentally sound.

## Grounding

5/5 existing paths ✓ (`reset-password.ts`, `forgot-password.astro`, `supabase.ts`, `cloud-create-job.handler.ts`, `cloud-create-job.handler.test.ts`); both new files correctly absent ✓; brief↔plan consistent ✓; `lessons.md` prior (Lesson #4 — server-only modules separate from `astro:env/server` importers) backs the test-layer choice ✓; `ForgotPasswordForm` confirmed to render `serverError` via `<ServerError>` (forgot-password.astro:30 → ForgotPasswordForm.tsx:52) ✓; Supabase no-error-on-unknown-email verified via Context7 ✓; `contract-surfaces.md` absent (check skipped) ✓; Progress↔Phase consistency: 7/7 success-criteria mapped (1.1–1.7), phase blocks use plain bullets ✓.

## Findings

### F1 — Unresolved owner of the malformed-form ?error= redirect

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change #2 (and #1's core contract)
- **Detail**: The plan defers a design decision — "the malformed-form `?error=` redirect may stay in the wrapper or move into the core — keep one owner; document which." The current route owns a formData try/catch (`reset-password.ts:8-12`). Leaving it open makes the core's input contract ambiguous (parsed `email` vs raw `request`), which the implementer would have to guess.
- **Fix**: Pin it — the core takes `request`, owns the formData parse + the malformed→`?error` branch, so all redirect outcomes live in one tested place (the malformed-form path becomes unit-testable too). The route just builds the client, calls the core, and redirects.
- **Decision**: FIXED (Fix in plan)

### F2 — Plan doesn't call out preserving the no-redirectTo call

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, change #1
- **Detail**: The existing route calls `resetPasswordForEmail(email)` with NO `redirectTo` on purpose (`reset-password.ts:18-21`: the recovery email template hardcodes the post-confirm target; passing `redirectTo` pulls in Supabase's redirect allowlist). The plan describes the core's call but doesn't flag this as an invariant — an implementer "improving" it by adding `redirectTo` could silently break the recovery link.
- **Fix**: Note in change #1 that the core must call `resetPasswordForEmail(email)` with no options (preserve the existing `reset-password.ts:18-21` behavior).
- **Decision**: FIXED (Fix in plan)

### F3 — Test's "same path for two emails" case is near-tautological

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, change #3, test case (d)
- **Detail**: The redirect path never contains the email in either branch, so "identical output for two emails" is true by construction. The real enumeration guarantee rests on Supabase returning no error for unknown emails (mocked away in the unit test) + not leaking `error.message`. The test proves path-mapping + no-message-leakage; it can't prove enumeration safety. The brief's Open Risks already records the Supabase-behavior assumption, so this is mostly a don't-over-claim point.
- **Fix**: Frame case (d) as "output is independent of the email argument" and lean on the no-message-leakage assertion; rely on the documented Supabase-behavior assumption for branch-routing safety (don't claim the test proves enumeration).
- **Decision**: FIXED (Fix in plan)
