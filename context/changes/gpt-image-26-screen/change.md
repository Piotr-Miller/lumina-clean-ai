---
change_id: gpt-image-26-screen
title: "Screening test of GPT-Image-2.6 Sunburst (complexity=low) as a Cloud AI output"
status: new
created: 2026-11-05
updated: 2026-11-05
archived_at: null
issue: 359
---

## Notes

a small, separate screening test of gpt-image-2.6-sunburst (quality=high, complexity=low, moderation=auto) as a Cloud AI output on the three Phase-5 scenes S17-03/04/07, 2 outputs each, fixed prompt from scripts/s19/configs/phase5-gpt.json, blind two-axis rating (quality, fidelity) against original and real Local; gate fixed before rendering; budget cap $1.50.

### Owner decisions (2026-11-05)

- **A separate change, not an annex to S-20.** S-20 (`cloud-classical-denoise`, #347) tests the
  hypothesis "no pixel-generating model"; its result stays clean. This screen does not change
  S-20's scope, sequence or gate, and does not depend on S-20's NLM outcome.
- **Parameters accepted as proposed:** `gpt-image-2.6-sunburst`, `quality=high`,
  `complexity=low`, `moderation=auto` (as production would run; a block is a result, not an
  error), scenes S17-03 / S17-04 / S17-07 (tuning photos — the `s17-v2` holdout stays closed),
  2 outputs per scene, the prompt from `scripts/s19/configs/phase5-gpt.json` unchanged, budget
  cap **$1.50**.
- **Gate, to be written into the config before any render:** zero "significant loss" or
  "severe regression" on all 6 outputs (S-20 fidelity scale, crop and reason mandatory), and
  fidelity at least a tie with real Local in the majority of pairs. A pass opens a wider
  comparison on all eight tuning photos — never a deployment.

### Why this exists

- S-19 Phase 5 (`context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-tuning.md:40-66`)
  rated GPT Image 2.5 better-looking but less faithful than Local in 8 of 8 pairs — eight outputs
  from **three scenes**, one configuration. That is grounds for scepticism, not a verdict on 2.6.
- None of S-19's GPT configs (`scripts/s19/configs/gpt-std.json`, `gpt-large.json`,
  `phase5-gpt.json`) set `complexity`. The image-generation guide
  (https://developers.openai.com/api/docs/guides/image-generation, read 2026-11-05) says the
  default is `high` and that higher complexity "can increase latency and introduce unwanted
  changes". Whether `complexity` existed for 2.5 is not confirmed.
- The two variables change together (model 2.5 → 2.6, complexity default → `low`), so a result
  cannot be attributed to either alone; the question is only "is 2.6 at `low` usable".

### Facts carried in (2026-11-05)

- Model ids `gpt-image-2.6-sunburst` / `gpt-image-2.6-flare`; `v1/images/edits` supported,
  `v1/responses` not (model pages). No seed, no input-fidelity parameter found for 2.6.
- Per-token rates identical to 2.5: image input $8, output $30, cached $2, text $5 per 1M
  (https://developers.openai.com/api/docs/pricing, read 2026-11-05). Not listed in the batch table.
- S-19 ledger (`test-photos/private/s19/attempts.jsonl`): 18 successful 2.5 calls, median
  **$0.0785** (range $0.077–$0.145), median wall **36.8 s** at ~2336×1552. Six 2.6 calls are
  therefore estimated at ~$0.50 — an estimate, since 2.6's token use may differ. Measure wall time
  against the ≤ 30 s p95 guardrail (`context/foundation/roadmap.md:383`).
- Size limits and `moderation` values come from a summary of the guide, not a verbatim read —
  confirm on the live page before the run.

### Sequencing note

Practical, not a dependency: run after S-20 step 1 has built its two-question blind viewer, so
2.6 is rated with the same tool and scale. Reuse the S-19 harness (`scripts/s19/run-candidate.py`,
budget ledger, sealed-key protocol); outputs go to the gitignored `test-photos/private/`.
