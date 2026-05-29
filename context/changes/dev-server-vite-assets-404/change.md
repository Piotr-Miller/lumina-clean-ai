---
change_id: dev-server-vite-assets-404
title: npm run dev 404s Vite client assets, so React islands never hydrate
status: impl_reviewed
created: 2026-05-29
updated: 2026-05-29
archived_at: null
---

## Notes

npm run dev does not serve Vite client assets (/@vite/client, /@id/astro:scripts/before-hydration.js, /src/styles/global.css all 404) so React islands never hydrate; only the page HTML returns 200. Affects ALL islands (auth forms too), not feature-specific. Discovered while manually verifying local-engine-enhance-flow on 2026-05-29; worked around via `npm run build && npx wrangler dev` (workerd) which serves real hashed bundles and hydrates correctly. Likely cause: the `overrides: { vite: ^7.3.2 }` in package.json vs the Vite that Astro 6.3.1 expects, or the @astrojs/cloudflare adapter's dev behavior. Investigate and restore working dev-server hydration.
