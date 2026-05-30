<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Account Access — Email-Based Password Reset

- **Plan**: context/changes/account-access-and-password-reset/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-05-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Both review agents found no drift, no missing items, and no critical safety issues.
Security-sensitive paths — anti-enumeration, open-redirect avoidance, session guards,
server-side validation, service-role key handling, XSS — are all handled deliberately,
with explanatory comments. The new endpoints are MORE compliant than the pre-existing
ones (they add the required `prerender = false`).

## Findings

### F1 — Broad local-tooling permission grants in the change diff

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .claude/settings.local.json:13-78
- **Detail**: The change range includes accumulated permission grants: `Bash(npm *)`, `Bash(npx *)`, `Bash(node *)`, and unscoped `Read`/`Edit`/`Write`. `npx *` effectively allows arbitrary package execution and unscoped `Write` allows writing anywhere. Local dev-tooling file (not shipped app surface), so blast radius is this workstation only — but it's unplanned scope riding along in the feature's commit history.
- **Fix**: Tighten `npm`/`npx`/`node` to specific subcommands and scope `Write`/`Edit` to the project root; or leave as-is (local-only) and note it's intentional. Not a code-correctness issue.
- **Decision**: FIXED — replaced `npm */npx */node *` with specific tool globs; scoped `Edit`/`Write` to project tree; kept `Read` unscoped.

### F2 — `email` read with unchecked `as string` cast

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/pages/api/auth/reset-password.ts:8
- **Detail**: `form.get("email") as string` casts without a null/type check. If the field is absent, `resetPasswordForEmail(null)` errors — but that error is intentionally swallowed and still returns generic success, so anti-enumeration is preserved. The cast matches the existing signin.ts:6 / signup.ts convention, so it's pre-existing house style, not a regression.
- **Fix**: Optionally `typeof email === "string" ? email : ""` for honesty; acceptable as-is for consistency with siblings.
- **Decision**: FIXED — coerced `form.get("email")` to a safe string (`typeof … === "string" ? … : ""`).

### F3 — Recovery-link script prints a live token to stdout

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (security)
- **Location**: scripts/generate-recovery-link.ts:71-77
- **Detail**: Prints a single-use recovery URL. The header comment + runtime output warn it's one-time/short-lived and not to share it; the service-role key is read only from `process.env` (never hardcoded). Residual risk: the token persists in shell history / terminal scrollback. Adequate for a manually-run local ops tool.
- **Fix**: Optionally add a one-line scrollback caveat to the header comment. No code change required.
- **Decision**: FIXED — added a shell-history/scrollback caveat to the script's SECURITY header comment. Also fixed pre-existing lint errors in the same file surfaced during verification: removed unnecessary optional chains (`no-unnecessary-condition`) and added a file-level `no-console` disable (the script was never linted when first written in 800852e; left unfixed it would break `npm run lint`/CI on Linux).

### F4 — Prod verified via built-in sender, not custom SMTP (documented)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/account-access-and-password-reset/phase-3-production-and-nfr.md §1, §4
- **Detail**: Plan check 3.2 reads "delivers via the configured SMTP provider," but verification used Supabase's built-in sender; custom SMTP was deferred to a future infra slice (now Parked in roadmap.md). This is a transparent, user-approved scope decision recorded in the doc with rationale and the known ~2–4/hr cap + same-browser PKCE caveat — not silent drift. The 3.2 row title was kept per the no-rename convention.
- **Fix**: None needed — already documented and parked. Noted for honesty.
- **Decision**: ACCEPTED — documented decision (built-in sender for MVP; custom SMTP parked in roadmap.md). No change.

### F5 — Older auth endpoints still lack `prerender = false`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/{signin,signup,signout}.ts
- **Detail**: The three NEW endpoints correctly export `const prerender = false` (project hard rule). The pre-existing signin/signup/signout omit it — so the new code is the compliant one and the old code is the deviation. Out of scope for this change; flagged as a future cleanup.
- **Fix**: Add `export const prerender = false` to the three older endpoints in a separate housekeeping change.
- **Decision**: FIXED — added `export const prerender = false` to signin.ts, signup.ts, signout.ts.

### F6 — Pre-existing RLS integration test fails without local Supabase

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/jobs.rls.test.ts
- **Detail**: `npx vitest run` fails this one suite with "missing required env var SUPABASE_URL". It's a foundation (F-01) integration test needing `npx supabase start` + env vars — unrelated to this change. The change's own test (auth-validation.test.ts) passes 5/5; typecheck is clean. Not a regression from this work.
- **Fix**: Run `npx supabase start` + export the three env vars before `npm test` to exercise that suite (per tests/README.md).
- **Decision**: ACCEPTED — pre-existing env-gated F-01 integration test, unrelated to this change. No change.
