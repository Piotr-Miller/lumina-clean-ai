---
change_id: finder-verifier-frozen-sonnet
title: "Stage 2: the sealed verifier on frozen findings with sonnet-5 as the model"
status: implementing
created: 2026-10-10
updated: 2026-10-11
archived_at: null
---

## Notes

Stage 2 of the frozen-findings verifier measurement: the same sealed verifier, corpus, arms and criteria as finder-verifier-frozen, with anthropic/claude-sonnet-5 as the verifier model, as a new, separately pre-registered change (owner decision 4.7, 2026-10-10).

Predecessor: finder-verifier-frozen

2026-10-10: owner confirmed the predecessor's manual check 1.8 (`context/archive/2026-10-09-finder-verifier-frozen/plan.md`): the harness's failure output says what happened, which attempt, and what to do next. That plan's row stays `[ ]` because the archive is immutable; this note is the record. The successor's harness inherits the same messages.

## Owner decisions

From `research.md` § Open Questions (owner, 2026-10-10):

1. **Budget: variant (a).** The sealed admission reserve P stays as in the predecessor (`harness.mjs:457-465`; about $1.07–1.16 per attempt at $2 / $10 per M). The cap is raised instead: about $3.9 stop-and-ask and $4.5 hard, so that a series of about $2.2–2.7 can finish. The exact values are fixed in the pre-registration after the pre-flight re-reads the credit (last recorded about $5.39).
2. **A paid probe request goes before the series.** It checks, on the wire: no reasoning on any channel (including `reasoning_details` / `reasoning.encrypted`), the served provider (`Anthropic`, and whether the response carries a top-level `provider`), `service_tier`, and the A2 headroom (`prompt_tokens` against `b + 32·m + 32`). The plan decides its input and its place relative to the seal: a probe on a corpus batch would show verdicts before the seal.
3. **Plan assumptions confirmed (owner, 2026-10-10)**, with two clarifications:
   - the probe runs before the seal, outside the corpus;
   - its $0.60 limit covers retry and repair as well. The gate admits each request on the cost so far plus that request's bound, so a cheap first call can leave room for a retry. Budget protection stays conditional on A1–A3;
   - the credit threshold is $5.10 ($0.60 + $4.50) before the probe. Before the series the balance is re-checked against the series maximum of $4.50 only; the probe's spend, already gone from the balance, is not added again.
