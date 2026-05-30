<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Account Access — Password Reset

- **Plan**: context/changes/account-access-and-password-reset/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-05-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations
- **Commit reviewed**: 7c5b9ea

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Notes

All five planned changes implemented faithfully (config + recovery template, reset-password endpoint, forgot-password page, ForgotPasswordForm, signin link). Anti-enumeration correct (always `?sent=1`), no XSS (query params flow only through auto-escaping sinks), no open redirect (email `next` is a hardcoded literal), no secret leakage. Success criteria 1.1 (`astro check`), 1.2 (eslint), 1.3 (`supabase start`) passed this session; 1.4–1.7 confirmed manually by the user and verified programmatically (email link shape: `/auth/confirm?token_hash=…&type=recovery&next=/auth/reset-password` at origin `:4321`).

## Findings

### F1 — `form.get("email") as string` can pass null to the SDK

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/reset-password.ts:8
- **Detail**: If the `email` field is absent, `form.get` returns null and the `as string` cast lies. null reaches `resetPasswordForEmail(null)` → SDK errors → swallowed + logged → generic success still returned. Functionally safe (no crash, anti-enumeration holds) and inherited verbatim from signin.ts/signup.ts. Consistent with the plan's explicit "match siblings, no zod" decision — a latent robustness nit, not a plan deviation.
- **Fix**: `const email = (form.get("email") ?? "").toString();` (null-guard without pulling in zod, keeping parity with the plan's no-zod decision).
- **Decision**: PENDING

### F2 — Siblings still omit `prerender = false` (hard-rule gap)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signin.ts, signup.ts, signout.ts
- **Detail**: The new reset-password.ts correctly exports `prerender = false` (CLAUDE.md hard rule). The three existing auth endpoints don't. Not a defect in this phase — the new file is the compliant one — but the inconsistency is worth a follow-up.
- **Fix**: Add `export const prerender = false;` to the three existing auth endpoints in a separate cleanup change (out of scope here).
- **Decision**: PENDING

### F3 — Inherited baseline nits carried into the new files

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/ForgotPasswordForm.tsx:30; src/pages/api/auth/reset-password.ts:7
- **Detail**: (a) `React.SubmitEvent<HTMLFormElement>` is non-standard (React uses `React.FormEvent`) — copied verbatim from SignInForm/SignUpForm, compiles fine. (b) `await request.formData()` isn't try/caught — a malformed body would 500. Both are pre-existing patterns inherited from siblings, not introduced defects.
- **Fix**: Leave for a repo-wide cleanup; not worth diverging a single new file from its siblings.
- **Decision**: PENDING
