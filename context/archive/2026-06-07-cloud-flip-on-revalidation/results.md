# D.1 flip-ON re-validation — RESULTS

**Date:** 2026-06-08 · **Outcome:** D.1 (the deferred S-08 + S-09 flip-ON closure criterion) is **CLOSED** — cloud is **LIVE in prod** (`luminaclean-prod`, `CLOUD_DAILY_CAP=3`) and the retention + cold-boot behavior is re-validated end-to-end.

## Verification matrix

| # | Assertion | Result | Evidence |
| --- | --- | --- | --- |
| Local 2a | failed-job source delete | ✅ PASS | `d1-retention-check.ts` (Phase 2) |
| Local 2b | create-job sweep + cap-slot delta | ✅ PASS | `d1-retention-check.ts` |
| Local 2c-i | late-callback idempotency (`already_terminal`) | ✅ PASS | `d1-retention-check.ts` |
| 3.4 | cold-boot source-URL survival | ✅ PASS | live prediction succeeded after a 132 s cold boot (Phase 3) |
| 4.1 | prod webhook config set | ✅ PASS | Vault `edge_function_url` + `db_webhook_secret`, both `is_set=true` |
| 4.2 | GUC→Vault migration | ✅ PASS | `20260608120000` applied clean local + prod; Vault trigger built a correct Bearer POST to `/start` (500-not-401); harness green |
| 4.3 | live prod happy-path | ✅ PASS | luminacleanai.com submit → `processing` → **succeeded**, enhanced result rendered + **downloaded**; prod SQL: `has_result=t, result_objs=1, source_objs=0` (source deleted on success) |
| 4.4 | cap-reject | ✅ PASS | "The daily Cloud AI limit has been reached" (`daily_cap_reached`) past the cap |
| 4.5 | failed-job retention (live) | ✅ PASS | RGBA PNG → Bread `Input size must have a shape of (*, 3, H, W). Got torch.Size([1, 4, 96, 96])` → `status=failed`, `source_objs=0` (source deleted on failure) |
| 4.6 | operator gate | ✅ leave **ON**, cap **3** (go-live) |
| 4.7 | record | ✅ this doc + production-config + roadmap |

## Findings surfaced during flip-ON (both config, not code defects)

### F1 — prod `REPLICATE_WEBHOOK_SIGNING_SECRET` was a local-test value, not Replicate's real account secret
`supabase/functions/.env` held `whsec_Mf…`, which `phase3-callback-test.ts` both *signs and verifies* with — so local-harness tests pass regardless of whether it's the real account secret. Replicate's actual default webhook signing secret (`GET /v1/webhooks/default/secret`) is `whsec_40…`. Prod `/callback` verified real Replicate callbacks against the wrong secret → 401 → rows stuck `processing`. **Fix:** set prod (and local `.env`) `REPLICATE_WEBHOOK_SIGNING_SECRET` to Replicate's real account secret. (This also retroactively explains the Phase-3 *local* stall.)

### F2 — prod `/start` created predictions WITHOUT a webhook (missing `EDGE_FUNCTION_URL`)
`enhanceFunctionBaseUrl()` derives the callback URL from the auto-injected `SUPABASE_URL`, assuming it equals `https://<ref>.supabase.co` in prod. In the hosted Edge runtime that value is **not** the public https URL, so the derived callback URL wasn't `https://` → `/start` took the no-webhook branch (`enhance/index.ts:233`) → Replicate never called back → rows stuck `processing` (confirmed: every prod prediction showed `webhook: NONE`). **Fix:** set prod Edge secret `EDGE_FUNCTION_URL=https://tebdkqpgjjypdethpezo.supabase.co/functions/v1/enhance` (the code's documented override; a no-op for the source-URL rewrite in prod). **Follow-up worth considering:** the code's `SUPABASE_URL`-derivation assumption doesn't hold in the hosted Edge runtime — either make `EDGE_FUNCTION_URL` mandatory in prod or fix the derivation. → lessons.md candidate.

## Final prod state (luminaclean-prod / tebdkqpgjjypdethpezo)

- **Cloud: ON.** Worker: `CLOUD_PIPELINE_ENABLED=true`, `CLOUD_DAILY_CAP=3`. Edge Function: `CLOUD_PIPELINE_ENABLED=true`, `REPLICATE_API_TOKEN`, `REPLICATE_WEBHOOK_SIGNING_SECRET` (real account secret), `DB_WEBHOOK_SECRET`, `EDGE_FUNCTION_URL`.
- **Webhook plumbing:** GUC→Vault migration applied; prod Vault holds `edge_function_url` + `db_webhook_secret`. Kill-switch: `wrangler secret put CLOUD_DAILY_CAP` → `0`.
- **Residual (self-healing):** ~4–5 `processing` rows from the broken-config testing phase (wrong signing secret / no webhook). Their sources are deleted by the create-job sweep once they pass the 1 h stale threshold, so the ≤24 h retention NFR still holds. Today's daily cap is consumed by this testing — resets at 00:00 UTC.

## Code coverage note (carried from the plan)

The deterministic Phase-2 harness + the live success prove the source/result delete primitives; the true F5/F9 result-orphan cleanup branch remains covered by the S-08 unit test + impl-review (not black-box reproducible). No app-code change was made for D.1 (the only repo change is the Vault webhook migration).
