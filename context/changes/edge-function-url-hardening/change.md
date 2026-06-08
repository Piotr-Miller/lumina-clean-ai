---
change_id: edge-function-url-hardening
title: Fail-fast guard for the Edge callback URL (no silent no-webhook branch in prod)
status: new
created: 2026-06-08
updated: 2026-06-08
archived_at: null
---

## Notes

Surfaced as a follow-up during **D.1** (`cloud-flip-on-revalidation`, archived 2026-06-07). The Edge Function (`supabase/functions/enhance/index.ts`) derives the callback URL from the auto-injected `SUPABASE_URL` (`enhanceFunctionBaseUrl()`), assuming it equals `https://<ref>.supabase.co`. In the **hosted** Edge runtime that value is NOT the public https URL, so the derived callback URL isn't `https://` → `/start` silently takes the **no-webhook** branch (`enhance/index.ts:233`) → Replicate never calls back → jobs stall in `processing` with no error. This cost real debugging time at flip-ON until `EDGE_FUNCTION_URL` was set explicitly.

**Goal:** make the failure loud instead of silent. Either make `EDGE_FUNCTION_URL` **mandatory in prod** (fail-fast at `/start` with a clear error if the resolved callback URL is not `https://`), or fix the derivation so it can't silently fall through to no-webhook. The lesson is already recorded (`context/foundation/lessons.md` — "Hosted Supabase Edge Functions: the auto-injected `SUPABASE_URL` is NOT the public https URL"); this change adds the code-level guardrail the lesson asks for.

**Scope guard:** small, surgical hardening of `enhance/index.ts` only — not a pipeline redesign. Currently functional in prod (the secret IS set); this prevents a silent regression if it's ever unset.
