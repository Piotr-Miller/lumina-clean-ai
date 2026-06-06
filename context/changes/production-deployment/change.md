---
id: production-deployment
roadmap_id: S-07
status: impl_reviewed
created: 2026-06-04
updated: 2026-06-06
issue: 8
---

# S-07: Production deployment / go-live

Take LuminaClean live on Cloudflare Workers + a fresh prod Supabase project, with
the Cloud AI pipeline shipping **flag-OFF** (`CLOUD_PIPELINE_ENABLED=false` +
`CLOUD_DAILY_CAP=0`). Local engine + auth go live immediately; the cloud flip-ON
is gated separately on S-05 (done), S-08, and S-09 — out of scope here.

Folds in the publicly-exposed `/callback` security hardening cluster (replay
window, fetch timeout + size cap, SSRF allowlist) before go-live exposes it.

- Roadmap: `context/foundation/roadmap.md` → S-07
- GitHub issue: #8
- Plan: `context/changes/production-deployment/plan.md`
- Brief: `context/changes/production-deployment/plan-brief.md`
