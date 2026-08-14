---
change_id: cancel-degradation-visibility
title: Make the cloud-cancel compute-kill degradation visible in prod logs
status: implemented
created: 2026-08-13
updated: 2026-08-14
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

### Prod remediation — done 2026-08-14

Both secrets are now set on the prod Worker `lumina-clean-ai` (verified: 9 secrets,
`EDGE_FUNCTION_URL` and `DB_WEBHOOK_SECRET` both listed). The value was copied from
the existing Vault row `db_webhook_secret` rather than regenerated, because that
secret is shared by three consumers — the DB webhook that drives the whole cloud
pipeline, the enhance Edge Function, and now the Worker — and rotating it would
have required updating all three in lockstep.

Getting there needed one detour worth recording: `wrangler secret put` refused with
_"the latest version of your Worker isn't currently deployed"_. Cloudflare Workers
Builds uploads a version for every branch push, so any branch built after the last
production deploy leaves an undeployed version and trips that guard. The error
suggests deploying the latest version — which here would have shipped an
unidentified branch build (`Source: Unknown`, no tag, no message) to production.
The safe route was to deploy from **master** first (merge → CI `deploy`), which makes
the deployed version known code, and only then touch secrets.

**Operational rule: deploy from master, then set secrets — never the reverse.**

### Smoke: half verified (2026-08-14)

A real cancel was run against prod. Job `cb2b72a6-949b-4e53-b8eb-cb4cd7cb5cb8`:
created `07:53:32` with a `replicate_prediction_id` already written, cancelled
`07:53:41` — nine seconds in, so there genuinely was in-flight compute to kill.
Result: `status: failed`, `error_code: canceled`.

**Verified: the DB-flip half works in production.**

**NOT verified: the compute-kill half.** The Supabase Edge Function logs could not
answer it — they show nothing after `07:00`, missing not only the cancel but the
`07:53` job START, which provably happened because only the Edge Function holds
the Replicate token and a prediction id got written. Those logs are lagging, so
their emptiness is a **tooling gap, not evidence**; reading it as "the cancel
never fired" would be an artifact dressed up as a finding.

Cloudflare Worker logs would answer it (`observability` is enabled in
`wrangler.jsonc`, so they are retained), but `wrangler tail` is live-only — there
is no historical log query, and the observability API needs a token this
environment does not have. A live tail was set up for a second attempt and then
stood down.

### Still open: proving the compute-kill

Two ways, whenever it is worth doing:

1. **Free, evidence already exists** — Cloudflare dashboard → Workers →
   `lumina-clean-ai` → Logs, around `07:53:41`. A
   `cancel: edge compute-cancel returned 401 (best-effort)` line means the secret
   is present but WRONG and Replicate is still billing; no `cancel:` line at all
   means it worked.
2. **Deterministic, costs one cloud op** — run `npx wrangler tail lumina-clean-ai`
   (positional; `--name` is rejected for tail) and repeat the cancel while it
   streams. Do NOT pass `--search cancel`: a successful cancel logs nothing, so
   the filter makes success indistinguishable from a dead tail.

Until one of those runs, treat the compute-kill as unproven. A wrong
`DB_WEBHOOK_SECRET` produces exactly what was observed above: clean UI, correct DB
row, prediction left running.

### Previously stated as still open

Presence is not correctness. A wrong `DB_WEBHOOK_SECRET` fails exactly like a
missing one — the compute-cancel is best-effort, so a 401 is logged and swallowed
and Replicate keeps billing. The remaining verification is a prod smoke: start a
cloud job, hit "Start over" mid-processing, and confirm the Replicate prediction
actually stops.

The log line this change added is what makes that smoke readable either way: if the
seam is still misconfigured it now says so explicitly instead of the run looking
clean.

### Follow-up

Consider a startup-time warning as well, so the condition surfaces on deploy
rather than on first use. Not done here because it needs a decision about where
Worker-side config assertions belong.
