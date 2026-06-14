# Review follow-ups — testing-e2e-north-star

Deferred items from phase reviews, to fold into a later phase.

## From Phase 1 impl-review (2026-06-12)

- [x] **F2 — document "never set `E2E_ALLOWED_OUTPUT_ORIGIN` in prod"** (Phase 4 docs).
      The seam (`supabase/functions/enhance/index.ts` SSRF call site) is default-off and
      verified so (1.5). Setting the env in prod would widen the SSRF allowlist. Currently
      only an inline code comment — add the operational warning to `cloud-live-smoke.md`
      and/or the CLAUDE.md CI/E2E note when Phase 4 writes the docs. No code change.
      **Done 2026-06-13:** warning added to `context/foundation/cloud-live-smoke.md` (top
      callout), `CLAUDE.md` (`npm run test:e2e` command note), and the `ci.yml` `e2e` job
      comment at the `E2E_ALLOWED_OUTPUT_ORIGIN` generation step.
