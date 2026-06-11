---
change_id: ci-wrangler-action-node24
title: Bump wrangler-action for Node.js 24 before the Node 20 runner deadline
status: archived
created: 2026-06-05
updated: 2026-06-11
archived_at: 2026-06-11T09:34:53Z
issue: 13
---

## Notes

Bump `cloudflare/wrangler-action@v3` to a Node.js 24-compatible version before GitHub forces Node 20 actions to Node 24 on 2026-06-16 (Node 20 removed from runners 2026-09-16). Maintenance chore, not a roadmap slice; surfaced as a deploy-job deprecation annotation during the production-deployment go-live.

- GitHub issue: [#13](https://github.com/Piotr-Miller/lumina-clean-ai/issues/13)
- Source: deploy job annotation on run [27033884831](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/27033884831)

## Resolution (archived 2026-06-11)

`cloudflare/wrangler-action@v3` → `@v4` (node24) shipped in the `deploy` job of `.github/workflows/ci.yml`; issue #13 was closed at that time. Folder archived after the fact during the `actions/cache@v4 → @v5` follow-up (PR #17), which cleared the last remaining node20 action. With `checkout@v5`, `setup-node@v5`, `wrangler-action@v4`, and `cache@v5`, no node20 JS actions remain before the 2026-06-16 deadline.
