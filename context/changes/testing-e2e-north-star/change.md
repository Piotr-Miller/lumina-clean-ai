---
change_id: testing-e2e-north-star
title: E2E on the north-star flow — Cloud AI result renders without refresh (test-plan Phase 4, risks #1+#6)
status: implementing
created: 2026-06-11
updated: 2026-06-12
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "E2E on the north-star flow + gating guardrail".
Risks owned here: #1 (cloud job stalls in `processing` → user sees a permanent spinner) and #6 (Realtime result that landed before SUBSCRIBED never renders / watchdog false-fails) — in the browser these are one inseparable flow: signed-in upload → Cloud AI → Realtime result appears WITHOUT refresh. One spec protects both: red on #1 = spinner instead of result; red on #6 = result committed but never rendered.
Risk #2 (anon gating) — the phase's other named target — is already covered standalone by tests/e2e/seed.spec.ts (UI gate + API probe) and tests/e2e/anon-dashboard-redirects-to-signin.spec.ts (middleware perimeter); reviewed against the five anti-patterns, NOT yet run (browsers not installed). Risk #3's E2E increment (user-facing 429 message) is thin — decide in planning whether it joins this change or stays integration-only (§6.4/§6.6 already cover the route).

E2E infrastructure already in place (this session): @playwright/test 1.60 + playwright-cli 0.1.14; playwright.config.ts (testDir tests/e2e, webServer reuse, storageState pattern: `setup` project → auth.setup.ts → playwright/.auth/user.json; anon specs opt out per file); tests/e2e/RULES.md + seed.spec.ts as the two quality levers. Missing: browsers (`npx playwright install chromium`).

What research must ground (test-plan §2 Guidance for #1/#6 + plan §3 ordering rationale):

- The stub boundary: PR-gating E2E must target the WARM or STUBBED pipeline — live Replicate is ~2 min cold boot, non-deterministic, costs money. Replicate is called SERVER-side from supabase/functions/enhance (Deno), so `page.route()` cannot intercept it — find where the server actually calls out and whether/how it can be pointed at a stub (env? mock server? local functions serve?).
- Local pipeline completeness: what of signed upload → DB webhook → Edge Function → Replicate → callback → Realtime actually runs against `npx supabase start` + `npm run dev` today (functions serve? vault webhook config? signing secret? EDGE_FUNCTION_URL?).
- Watchdog budgets and decision points (src cloud-timings + the Realtime hook): the queued→processing→terminal split, catch-up read on subscribe — these set the test's wait budgets and the deliberate-break targets.
- The split: which scenario is the PR gate (stubbed/warm happy path + stall→terminal-failure half) vs the scheduled/manual live cold-boot smoke.

After creating the folder, follow the downstream continuation rule (suggest /10x-research next — the stub boundary and local-pipeline wiring questions above are exactly what planning needs grounded first).
