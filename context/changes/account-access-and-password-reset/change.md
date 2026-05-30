---
change_id: account-access-and-password-reset
title: "Complete account access incl. password reset"
status: impl_reviewed
created: 2026-05-29
updated: 2026-05-30
review_round: 0
---

## Notes

Roadmap entry S-02. Sign-up / sign-in / sign-out already exist in the baseline; the real work of this slice is the **absent email-based password-reset flow (FR-015)** plus verifying the credential-stuffing NFR. Independent track — parallel with the entire Cloud AI path. Delivers PRD FR-002, FR-003, FR-004, FR-015 and the NFR "a few mistyped passwords don't lock out a legit user, but credential stuffing at scale is rejected."

Plan: `plan.md` (brief: `plan-brief.md`). Three phases — (1) request-reset leg + Supabase email wiring, (2) confirm + set-new-password leg, (3) production SMTP + NFR verification.

### Key planning decisions

- **API pattern**: match the existing form-POST → redirect-with-`?error` auth pattern (NOT the CLAUDE.md zod/JSON API rule — these are browser form handlers, like signin/signup/signout).
- **Token flow**: Supabase SSR `token_hash` + `verifyOtp` at a new `/auth/confirm` route (the documented SSR pattern); requires a minimal custom **recovery** email template.
- **Production email**: plan a phase to configure custom SMTP (e.g. Resend) in the Supabase dashboard so reset emails actually deliver past the built-in ~2-4/hr rate cap.
- **No enumeration**: forgot-password always shows generic success.
- **Post-reset**: auto sign-in (recovery session becomes full session after `updateUser`) → redirect to `/`.
- **Scope**: reset flow only — no logged-in "change password", no signup email-confirmation toggle.
- **Rate limiting**: rely on Supabase's built-in limits; verify + document (per-user limiting parked to v2).
- **Password rules**: match signup (min 6).
- **Testing**: manual end-to-end via local inbucket + light Vitest unit tests on extracted helpers.
