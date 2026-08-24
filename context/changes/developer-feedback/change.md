---
change_id: developer-feedback
title: Let a user leave feedback the developer can read at any time
status: new
created: 2026-08-24
updated: 2026-08-24
archived_at: null
issue: 182
---

## Notes

**Non-roadmap change**, classified `phase:post-mvp`. Registered for future
development — **not ready to plan**, because one design decision is
deliberately left open (see below).

Add a way for someone using LuminaClean AI to send feedback to the developer:
a bug report, a bad result, a feature request, or a note about a photo the
engine handled badly.

### Why this is a change and not a slice

Every slice row in `roadmap.md`'s At-a-glance table carries a **PRD refs**
value — slices discharge something `prd.md` promised (S-10 the 24h-retention
NFR, S-09 an MVP success criterion, S-11/S-12/S-15 named post-MVP obligations).
`prd.md` says nothing about feedback or contact, so there is nothing to
discharge. Size is not the discriminator: `landing-content` shipped three guide
pages, a sitemap and an OG card as a plain change, and `cloud-job-cancel` added
an API route plus an Edge sub-path as a plain change.

One objection, pre-empted because it looks compelling: the roadmap's
`main_goal: market-feedback`. Line 27 defines that as a **sequencing bias**
(order work to validate the core hypothesis earliest), not a mandate to build a
feedback feature. It creates no obligation here.

## Fixed requirement (decided)

**Feedback must be stored so the developer can read it at any time.** Not
fire-and-forget, not dependent on an inbox. A durable row is the deliverable.

⚠️ **The app cannot send email, and this is load-bearing.** There is no
`RESEND_API_KEY` in `src/` or `astro.config.mjs` — the live Resend/SMTP is
**Supabase's** sender, wired for auth mail (recovery, confirmation) only. Any
design that "emails the developer" needs new infrastructure that does not exist
today. This is the same trap that made the recorded FR-015 plan unworkable for
two months (it prescribed admin `generateLink`, which does not send mail, and
claimed the prerequisite was met because Resend was live on prod). Do not
repeat it.

So the default shape is a Postgres table read through the Supabase dashboard.
An app-level transactional sender, or any notification/digest on top, is a
**separate decision** and a separate change.

## Open question — deliberately unresolved (owner, 2026-08-24)

**Can anonymous visitors submit feedback, or is it signed-in only?**

This is the whole abuse surface, and both defences the obvious answer needs are
declared non-goals:

- The product's funnel is **anonymous Local use** (S-01). Auth-gating feedback
  silences exactly the users most worth hearing from — the ones who tried it
  once and never signed up.
- But **Turnstile / WAF / CAPTCHA is an explicit PRD non-goal**, and
  **per-user rate limiting is Parked**. An unauthenticated public write
  endpoint with neither is real, unmitigated exposure.

Resolve this before planning. Three readings, none chosen:

1. **Signed-in only** — smallest exposure, RLS does the work, loses the
   anonymous voice.
2. **Anonymous allowed, bounded in SQL** — mirrors S-05's global daily cap,
   which is the pattern this repo already uses and trusts for exactly this
   shape of risk (a blast-radius guardrail, not a business rule). No new
   dependency, consistent with the declared non-goals.
3. **Anonymous allowed, defended properly** — reverses the Turnstile non-goal.
   A PRD-level decision, not an implementation choice.

Reading 2 is the one most consistent with what the repo already does, but it is
recorded as an option, not a recommendation to be rubber-stamped.

## Constraints that will bind whatever is chosen

- **RLS is a hard rule** — granular per-operation, per-role policies on the new
  table. Insert-only for `anon`/`authenticated`, **no select**: a feedback
  table whose users can read each other's submissions is a data leak.
- **Explicit `GRANT`s including `service_role`.** Fresh local stacks on
  Supabase CLI 2.111+ no longer seed blanket grants; omitting them yields a
  `42501` that only reproduces on a clean machine (precedent: `jobs`, PR #109).
- **Migrations are not auto-applied by CI.** Merging deploys the Worker and the
  Edge Function, never the SQL — the prod migration is a manual `db push` plus
  verification.
- API route rules: `export const prerender = false`, uppercase `POST`, zod
  validation, `{ error: { code, message } }` with snake_case codes, 400 for
  validation and 500 for unexpected.
- Migration filename `YYYYMMDDHHmmss_short_description.sql`; shared types in
  `src/types.ts`; `cn()` for class merging; React island only where interactive.

## Rough shape (not a plan)

One migration (table + RLS + grants), one `POST /api/feedback` route, one small
React island, and whatever bound the open question implies. Small — but it
stays unplanned until the anonymous-vs-signed-in call is made.

## Next step

`/10x-plan developer-feedback` **after** the open question is resolved. Until
then this is a registered intent, tracked in `roadmap.md` §Parked and issue
[#182](https://github.com/Piotr-Miller/lumina-clean-ai/issues/182).
