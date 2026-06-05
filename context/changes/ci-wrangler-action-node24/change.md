---
change_id: ci-wrangler-action-node24
title: Bump wrangler-action for Node.js 24 before the Node 20 runner deadline
status: new
created: 2026-06-05
updated: 2026-06-05
archived_at: null
issue: 13
---

## Notes

Bump `cloudflare/wrangler-action@v3` to a Node.js 24-compatible version before GitHub forces Node 20 actions to Node 24 on 2026-06-16 (Node 20 removed from runners 2026-09-16). Maintenance chore, not a roadmap slice; surfaced as a deploy-job deprecation annotation during the production-deployment go-live.

- GitHub issue: [#13](https://github.com/Piotr-Miller/lumina-clean-ai/issues/13)
- Source: deploy job annotation on run [27033884831](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/27033884831)
