---
change_id: reset-password-send-failure-surfacing
title: Surface password-reset send failures instead of always showing "sent"
status: implemented
created: 2026-06-15
updated: 2026-06-15
archived_at: null
---

## Notes

Swallowed-error fix surfaced by an audit of the API/server layer for the pattern "catch an error, log it, but never propagate it to the response". This was the **only genuine instance** found — see "Audit scope" below for why the others are deliberate and must stay.

### The bug

`src/pages/api/auth/reset-password.ts` (≈ lines 22–37):

```js
if (supabase) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    // logged…
    console.error("resetPasswordForEmail failed:", error.message);
  }
} else {
  console.error("resetPasswordForEmail skipped: Supabase is not configured");
}
return context.redirect("/auth/forgot-password?sent=1"); // …but ALWAYS "sent"
```

The route catches/checks every failure (send error, **rate-limit**, Supabase-not-configured) and logs it server-side, but then **unconditionally redirects to `?sent=1`** — telling the user "check your inbox" when no email was sent. The failure is observable only in server logs; the user is misled and silently stuck.

### Why the swallow exists — and why it over-swallows

The generic-success redirect is a **deliberate anti-enumeration measure** (don't reveal which emails have accounts). That intent is correct and must be preserved. But it over-swallows:

- Verified against Supabase docs (Context7, 2026-06-15): `resetPasswordForEmail` is anti-enumeration **by design** — it returns **no error for a non-existent email**. The errors it _does_ surface are infrastructure-class: **rate limit (429)**, SMTP/transport failure, or misconfiguration.
- Those errors are **independent of whether the account exists**, so surfacing a _neutral, generic_ failure on the error branch does **not** leak enumeration — yet it closes the silent-failure hole.
- The existing code comment already concedes the gap: "under the global email_sent cap, a legitimate over-cap request shows success yet delivers no email — accepted for MVP."

### Proposed fix (direction, not final code)

On the **error / not-configured** branch, redirect to forgot-password with a **neutral, non-enumerating** retry message instead of `?sent=1`, e.g.:

`/auth/forgot-password?error=<generic "We couldn't send the reset email right now. Please try again shortly.">`

- Keep the **success path generic** and unchanged (still `?sent=1`).
- **Do NOT echo `error.message`** into the response — it can carry specifics (rate-limit details, internal text). Use one fixed, account-agnostic string for ALL error causes so the response is byte-identical regardless of whether the email exists.
- Keep the server-side `console.error` (observability) — the fix adds propagation, it doesn't remove logging.
- The `forgot-password.astro` page already renders `?error=` (used by the malformed-form branch at line 11) and `?sent=1`, so the surface exists; confirm the copy reads neutrally.

### Anti-enumeration guard (the thing review must challenge)

The whole point is to surface the error **without** creating a timing/contents oracle:

- One identical error string for every failure cause (no branching copy).
- No `error.message` pass-through.
- Don't make the error vs success branch distinguishable by anything an attacker can correlate to an email's existence (Supabase already guarantees no-error-on-unknown-email, so error⇒infra, never enumeration).

### Audit scope (why this is the only finding)

Swept every catch-bearing file in `src/` + `supabase/functions/`. All other swallows are deliberate and documented — leave them:

- `cloud-create-job.handler.ts`, `timeout.handler.ts` — catch → log → **return 500** (propagates). Inner sweep catch is best-effort + documented.
- `signin.ts` / `signup.ts` / `update-password.ts` — Supabase error → redirect with `?error=` (propagates).
- `photo-job.service.ts` (`deleteObject`, `sweepStalePendingJobsForOwner`, `sweepAbandonedSourcesGlobally`) — best-effort cleanup, never user-facing, documented "never throws".
- `supabase/functions/enhance/index.ts` — `/start` catch → 500; `/callback` records the failure on the job row (surfaces to the user via Realtime) and returns 200 as a **deliberate Replicate ack** to stop retries. Inner `markJobFailed` swallows are best-effort.
- `replicate-webhook.ts` — verification returns `false` / fail-closed by design (documented).
- Client (`useCloudSubmit.ts`, `cloud-upload.client.ts`) — all map failures to user-facing messages.

### Open considerations for planning

- Confirm `forgot-password.astro`'s `?error=` rendering is neutral and not styled as a hard failure that scares legitimate users.
- Cheapest test layer: a hermetic route/handler test asserting the error branch redirects to `?error=` (not `?sent=1`) with a fixed string, and the success branch still `?sent=1`. Mirror the env-free-core split if the route needs to import `astro:env` (Lesson #4) — though this route uses the request-scoped `createClient`, so it may be testable without extraction.
- Decide whether the not-configured branch and the send-error branch share one message (recommended: yes — identical copy).
