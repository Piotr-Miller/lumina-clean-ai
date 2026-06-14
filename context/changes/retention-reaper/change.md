---
change_id: retention-reaper
title: Scheduled retention reaper for lingering source objects past 24h (Risk #5)
status: implementing
created: 2026-06-14
updated: 2026-06-14
archived_at: null
---

## Notes

Scheduled retention reaper that deletes lingering source objects (raw user photos) for non-succeeded jobs past the 24h NFR window, backstopping the on-failure deletion. Surfaced live on prod 2026-06-14: two source.jpg from 2026-06-06 failed-timeout jobs (ba58f913, f6fcbb69) lingered ~7.7 days in the photos bucket — a breach of "source not retained beyond 24h" (Risk #5). Root cause: those predate the S-08 failure-path source-deletion fix; the CURRENT pipeline deletes source on failure correctly (today's e7209d26 timeout left no orphan), but there is NO automatic reaper (pg_cron was explicitly out of original MVP scope, idea-notes.md) so legacy/edge-case orphans persist until manual cleanup. This change reconsiders that exclusion: add a scheduled sweep (likely pg_cron + an owner-agnostic service-role delete of storage objects whose job is terminal-non-succeeded and whose source is older than 24h), plus the integration coverage for failure/abandon-path source deletion that test-plan §3 Phase 2 / Risk #5 calls for. The 2 found orphans were already manually deleted + verified (0 lingering sources now).
