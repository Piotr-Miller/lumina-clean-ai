---
change_id: disable-workers-dev-subdomain
title: Disable the workers.dev subdomain so prod is reachable only at luminacleanai.com
status: new
created: 2026-06-06
updated: 2026-06-06
archived_at: null
issue: 14
---

## Notes

GitHub issue: [#14](https://github.com/Piotr-Miller/lumina-clean-ai/issues/14)


Once `luminacleanai.com` is the established production domain, disable the default
`lumina-clean-ai.pmiller-software.workers.dev` route on the Worker so production is
served **only** at the branded domain (cleaner, more professional, avoids two URLs
serving the same prod app). Optional polish — not a go-live blocker.

**Do this AFTER S-07 go-live testing is finished** — the `workers.dev` URL is still
referenced by tests/scripts/docs during the cutover. Before disabling, repoint the
remaining hardcoded references:

- `scripts/generate-recovery-link.ts` `DEFAULT_APP_ORIGIN` → `https://luminacleanai.com`
- `context/changes/production-deployment/go-live.md` (prod URL references)
- any `workers.dev` mentions in `README.md` / `CLAUDE.md`
- confirm Supabase `luminaclean-prod` Site URL + redirects are on `luminacleanai.com`

Then in Cloudflare → Workers & Pages → `lumina-clean-ai` → Domains/Settings, disable the
`workers.dev` subdomain (and optionally the Preview URLs). Verify `luminacleanai.com`
still serves and the `workers.dev` URL no longer responds.
