---
change_id: cancel-degradation-visibility
title: Make the cloud-cancel compute-kill degradation visible in prod logs
status: implemented
created: 2026-08-13
updated: 2026-08-13
archived_at: null
---

## Notes

`cloud-job-cancel` (PR #93) shipped a hard-cancel that stops the paid Replicate
prediction via the enhance Edge Function. That leg is **best-effort by design**:
when `EDGE_FUNCTION_URL` / `DB_WEBHOOK_SECRET` are absent the route degrades to a
DB-flip plus source-delete and returns a clean `{ canceled: true }`.

The degradation was correct. It was also **completely invisible**.

### The gap

`src/pages/api/enhance/cloud/cancel.ts:31` builds the seam config:

```ts
const edge = EDGE_FUNCTION_URL && DB_WEBHOOK_SECRET ? { url: …, secret: … } : null;
```

and `cancel.handler.ts` guarded the compute-kill with `if (canceled && edge)`.
When `edge` was `null` that branch was skipped **with no log at all** — the only
logging covered the case where the seam _is_ configured and the call fails.

So a prod Worker missing either secret would:

- tell the user the job was cancelled,
- flip the row to `failed` / `error_code: "canceled"`,
- delete the source object,
- and leave the Replicate prediction **running and billing**,

with nothing in the Worker logs to say so. The only way to detect it was a live
smoke that nobody runs twice. Both vars are `optional: true` in the
`astro.config.mjs` env schema, so no startup check catches it either.

### The change

One `console.error` on the `canceled && !edge` path, naming both variables and
stating the consequence in plain terms ("the Replicate prediction was NOT stopped
and keeps billing"). Two tests pin it:

- a matched row with `edge: null` must warn,
- a **no-op flip** (foreign or already-terminal job) must stay quiet — there is no
  in-flight prediction to leak, and warning there would cry wolf on every stale
  request.

### What this does NOT do

**It does not verify prod.** Whether `luminaclean-prod` actually has both secrets
set is still unchecked — `wrangler whoami` is unauthenticated in this
environment, so the check needs the maintainer's session:

```
npx wrangler secret list --name <prod-worker>
```

This change means that if they are missing, the _next real cancel_ says so in the
logs instead of failing silently forever. Verification and visibility are
different things; only the second one shipped here.

### Follow-up

Consider a startup-time warning as well, so the condition surfaces on deploy
rather than on first use. Not done here because it needs a decision about where
Worker-side config assertions belong.
