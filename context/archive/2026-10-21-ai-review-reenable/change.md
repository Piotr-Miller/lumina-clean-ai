---
change_id: ai-review-reenable
title: "Re-enable advisory AI review with the ported finder serialization fix"
status: archived
outcome: completed
created: 2026-10-21
updated: 2026-10-21
archived_at: 2026-10-21T18:56:28Z
---

## Notes

Predecessor: finder-serialization-outage, advisory-review-analysis

Re-enable the advisory ai-review job: port the finder serialization fix (prompt-carried format, own parser, novita routing) from feat/finder-serialization-outage onto master, keep z-ai/glm-4.6 via novita, flip the false && guard only after the owner raises the OpenRouter key limit, and rewrite the review.yml / AGENTS.md / close-out pointers. Owner decision 2026-10-21 reverses the 2026-10-19 close-out of advisory-review-analysis.

2026-10-21: owner decisions (before and during `/rune-plan`) — finder stays `z-ai/glm-4.6` routed to novita;
the owner raises the OpenRouter key limit before the guard is removed; land it as this change; a live probe passes
when the review parses and is posted (`findings: []` still passes); on a failed probe `false &&` goes back before
merge; T2 is included. plan.md § Definitions.

2026-10-21: owner confirmed the OpenRouter key limit and credit behind `OPENROUTER_API_KEY` were raised — confirmed,
figure not stated — and gave the go to push and open the PR (Phase 4 precondition, plan.md § Definitions "Budget
raised").
