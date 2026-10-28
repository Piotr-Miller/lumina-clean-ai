---
change_id: cloud-pause-message
title: "Tell users Cloud AI is paused for a quality review, not over today's limit"
status: archived
outcome: completed
created: 2026-10-28
updated: 2026-10-28
archived_at: 2026-10-28T21:18:09Z
---

## Notes

2026-10-28: 1.7 confirmed by the owner after the master deploy of 0464e55 (run 40769217235): signed in on luminacleanai.com, a Cloud submit shows "Cloud AI is temporarily unavailable due to maintenance. Please use the Local engine in the meantime." Progress rows 1.1-1.6 repointed from the branch commit 10ed5cf to master d9d8058 (PR #322 rebase-merge).

Owner decision 2026-10-28: a separate small change before S-19 (`cloud-model-comparison`, #271).

Cloud AI has been paused in production since 2026-10-28T20:33:24Z with the kill-switch
`CLOUD_DAILY_CAP=0` (see `context/changes/cloud-model-comparison/change.md` § Production pause).
The owner confirmed end-to-end on 2026-10-28, signed in on luminacleanai.com: a Cloud submit shows
"The daily Cloud AI limit has been reached. Try the Local engine, or come back tomorrow."

That copy is wrong for a pause that lasts until S-19 meets its bar. Target copy (owner, in Polish):
„Cloud AI czasowo niedostępne podczas weryfikacji jakości. Skorzystaj z Local.” — the UI is
English, so the plan settles the English wording.

Where the copy lives today:

- `src/lib/enhance-strings.ts:252` — UI string for `daily_cap_reached` (what the user saw).
- `src/lib/services/cloud-create-job.handler.ts:51` — API body message ("Please try again
  tomorrow."), pinned as unchanged by the S-16 Phase 5 record in `production-config.md`.

Open for the plan: how the app tells a kill-switch pause (cap 0) from a real daily cap (cap > 0) —
for example a distinct error code when the cap is 0 — so the ordinary daily-limit message stays
correct once Cloud is back.
