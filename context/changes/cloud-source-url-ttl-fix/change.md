---
id: cloud-source-url-ttl-fix
roadmap_id: S-09
status: implemented
created: 2026-06-06
updated: 2026-06-07
issue: 12
---

# S-09: Source signed-URL TTL fix (cold-boot reliability)

A Cloud AI job must survive a slow Replicate cold boot: the source READ URL the Edge
Function signs must still be valid when the (possibly cold) model fetches it at
`predict()` start. Today `SOURCE_URL_TTL_SECONDS = 300` expires before cold boots that
exceed 300s (observed under load), so the prediction dies at the source-fetch step (400).

Flip-ON prerequisite (gated with S-05 done + S-08) — not a deploy blocker (cloud ships OFF).

- Roadmap: `context/foundation/roadmap.md` → S-09
- GitHub issue: #12
- Research: `context/changes/cloud-source-url-ttl-fix/research.md`
