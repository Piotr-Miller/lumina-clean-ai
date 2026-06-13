# Cloud Live Smoke (manual)

The **live** Cloud-AI path — real Replicate, real cold boot, real provider
signature — is deliberately **not** a PR gate. The PR-gated `e2e` job stubs the
pipeline (a self-signed `/callback`, no token), so it structurally cannot catch
the **config-only** failure class that has burned this project before:

- **F1 — wrong provider signing secret.** A self-signing harness signs and
  verifies with the same `.env` value, so it passes with _any_ secret. In prod,
  Replicate signs with its **real** account secret; a mismatch → every callback
  fails verification (treated as ignore) → the row stalls in `processing` with
  no surfaced error, while the cost-incurring prediction succeeded provider-side.
  (lessons.md: "A self-signing local webhook harness can't catch a wrong
  provider signing secret".)
- **F2 — missing `EDGE_FUNCTION_URL`.** In the hosted Edge runtime the
  auto-injected `SUPABASE_URL` is **not** the public https URL, so deriving the
  callback URL from it yields a non-https URL and the webhook guard silently
  takes the no-webhook branch → Replicate never calls back → the row stalls.
  (lessons.md: "Hosted Supabase Edge Functions: the auto-injected `SUPABASE_URL`
  is NOT the public https URL".)

This smoke is the gate for that class. Run it **before/after any
pipeline-config change** (signing secret rotation, function redeploy, project
repoint) and at flip-ON. It is maintainer-driven and out-of-band — schedule it
or walk it manually; do not wire it into CI.

> ⚠️ **`E2E_ALLOWED_OUTPUT_ORIGIN` is a local/CI-only stub seam — NEVER set it in
> production.** It widens the Edge Function's SSRF output-fetch allowlist
> (`supabase/functions/enhance/index.ts`, `isAllowedOutputUrl`) to an extra
> non-https origin. It is default-off and verified so (plan Phase 1, criterion
> 1.5). Prod Worker/Edge secrets must not carry it.

## What "pass" means

A real signed-in submit of a night JPG goes `queued → processing → succeeded`
and the before/after slider renders via Realtime **without a refresh**, against
the **real** Replicate model — and the two F-checks below are green.

## Procedure

The full local-pipeline-with-live-Replicate mechanics (tunnel, env wiring, DB
GUCs, WARM-vs-cold caveat) are in the archived runbook —
`context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md`
(read-only). This doc adds the **F1/F2 verification checks** on top of it.

### Against a local live-Replicate stack

1. Stand up the live path per the archived runbook **Phase 3 additions** (tunnel
   via `cloudflared`, `EDGE_FUNCTION_URL` + `REPLICATE_API_TOKEN` in
   `supabase/functions/.env`, DB GUC synced to the tunnel, re-serve the
   function). cloudflared mints a new URL each run — re-sync `EDGE_FUNCTION_URL`
   **and** the DB GUC together every session.
2. **F1 check — use Replicate's REAL signing secret, not the local test value.**
   Fetch it and set it as the served secret:
   ```
   curl -s -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
     https://api.replicate.com/v1/webhooks/default/secret
   # → { "key": "whsec_…" }   ← put this exact value in supabase/functions/.env
   #   (REPLICATE_WEBHOOK_SIGNING_SECRET), then RESTART `functions serve`
   #   (secrets are read at startup).
   ```
   Without this you are still self-signing — the smoke would pass with a wrong
   secret, defeating its purpose.
3. Submit a JPG via the UI (sign in → Cloud AI → Process). Watch
   `queued → processing → succeeded` via Realtime; the slider must render with no
   refresh.
4. **F2 check — confirm the webhook is actually on the prediction** (not just
   that a prediction was created):
   ```
   curl -s -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
     https://api.replicate.com/v1/predictions/<prediction_id> | jq '.webhook'
   # → must be the https EDGE_FUNCTION_URL/callback…  (NOT null / NONE)
   ```
   `webhook: null` means `EDGE_FUNCTION_URL` wasn't honored — the callback will
   never arrive and the row will stall. Get `<prediction_id>` from the
   `functions serve` logs or the `jobs.replicate_prediction_id` column.
5. **Test WARM, not just cold** (archived runbook + lessons.md
   "insert-webhook-outraces-upload"): submit a **second** time while the function
   is warm — `/start` runs in ~80ms and can beat the client's source PUT; the
   bounded source-sign retry must absorb it. A cold-only pass hides this.

### Against production

Same two checks, against the deployed function:

- **F1:** the deployed `REPLICATE_WEBHOOK_SIGNING_SECRET`
  (`supabase secrets set` on the prod project) must equal Replicate's real
  account secret (step 2 above). On flip-ON this was the actual gap (a stale
  `whsec_Mf…` local-test value vs Replicate's `whsec_40…`).
- **F2:** `EDGE_FUNCTION_URL` must be set explicitly to the public https
  function URL on the prod project (do **not** rely on the in-function
  `SUPABASE_URL`). Verify `webhook` is present on a real prod prediction.
- Also confirm the **deployed Worker actually talks to the intended Supabase
  project** — Worker runtime secrets don't auto-repoint when a new project
  appears (lessons.md: "A new prod Supabase project does NOT repoint the deployed
  Worker"). Cheapest check: `curl` a server-rendered page and grep the served
  HTML/JS for the `*.supabase.co` ref.

## Related

- Test plan: `context/foundation/test-plan.md` §2 R1, §5 "pre-prod / flip-ON
  smoke" gate, §6.3 (the PR-gated stub recipe this complements).
- Lessons: the four R1 rules in `context/foundation/lessons.md` (self-signing
  harness; hosted `SUPABASE_URL`; source-URL TTL vs cold boot; async
  fire-and-forget timeout backstop).
- Archived live-run mechanics:
  `context/archive/2026-06-07-cloud-flip-on-revalidation/local-runbook.md`.
