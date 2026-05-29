<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Account Access — Password Reset

- **Plan**: context/changes/account-access-and-password-reset/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-05-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations
- **Commit reviewed**: 5fa5798

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

All four planned changes implemented faithfully: recovery confirm route (`confirm.ts` — `verifyOtp` + hardcoded `/auth/reset-password` destination, `type` sanity check, friendly error redirects, no attacker-controlled `next`), session-guarded set-new-password page (`reset-password.astro`), `ResetPasswordForm` (reuses shared primitives + SignUpForm validation rules), and `update-password.ts` (server-side validation → `updateUser` → redirect `/`, sibling redirect style). The extracted `validateNewPassword` helper + Vitest test are explicitly sanctioned by the plan's Testing Strategy. Both review sub-agents independently verified the security-sensitive paths (open-redirect guard, `type` validation, XSS-safe error reflection through React/Astro auto-escaping sinks, recovery-session reliance). Automated criteria 2.1 (`astro check` → 0 errors), 2.2 (eslint clean on touched files), 2.3 (`vitest` → 5 passed) verified this session; manual 2.4–2.8 confirmed by the user.

## Findings

### F1 — update-password surfaces a raw Supabase error when no recovery session

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/update-password.ts:25-27
- **Detail**: The endpoint validated passwords then called `updateUser()` directly, relying on Supabase to reject when no recovery-session cookie is present (plan-sanctioned, not exploitable). In that edge case the user saw a raw Supabase message (e.g. "Auth session missing!") instead of the friendly "link expired" copy. Mirrored signin/signup raw-error passthrough.
- **Fix**: Added a `getUser()` guard before `updateUser()` that redirects to `/auth/forgot-password` with the "That reset link has expired. Please request a new one." copy, matching the `reset-password.astro` page guard.
- **Decision**: FIXED (Fix now)

### F2 — Unplanned eslint.config.js change (tooling adaptation)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:62-74
- **Detail**: A file outside the plan's Phase 2 list was modified — `@typescript-eslint/no-misused-promises` disabled, scoped to `**/*.astro`. Required because the typed rule *crashes* (throws) on the frontmatter top-level `return Astro.redirect(...)` guard — a known `astro-eslint-parser` limitation, and this is the repo's first frontmatter redirect. Scoped to `.astro` only; the rule still runs on `.ts`/`.tsx`. Necessary to satisfy success criterion 2.2, disclosed at commit time. Both review agents judged it justified and low-risk.
- **Fix**: None needed — the scoped disable is the fix and is already in place (committed in 5fa5798). Captured as a recurring rule in `context/foundation/lessons.md`.
- **Decision**: ACCEPTED-AS-RULE (typed-eslint-crashes-on-astro-frontmatter-return)
