---
change_id: retinexformer-hd-opt-in
title: Add Retinexformer as an opt-in Premium enhancement engine
status: new
created: 2026-06-15
updated: 2026-06-18
archived_at: null
---

## Notes

Planned roadmap slice **S-12**, classified as `phase:post-mvp`.

Add Retinexformer as an explicitly selected, slower Premium enhancement engine
for signed-in users. Bread on Replicate remains the default Standard engine.
Retinexformer is not an automatic fallback and is not chained after Bread.

Target architecture:

```text
Standard:
Bread/Replicate -> chroma-pass[bread]

Premium:
Retinexformer self-hosted -> chroma-pass[retinexformer]
```

The Retinexformer chroma-pass has its own profile and may be skipped when image
analysis shows that the model output does not need additional chroma cleanup.

### Sequencing

- Prerequisite: **S-11 `bread-chroma-postpass`**.
- Start with an offline benchmark, not production integration.
- Treat Retinexformer's quality advantage as a hypothesis until the benchmark
  demonstrates a measurable improvement.
- Continue to implementation only after an explicit GO decision.

### Benchmark gate

Compare `Bread + chroma-pass[bread]` with
`Retinexformer + chroma-pass[retinexformer]` on 20-50 representative real
low-light photos. Evaluate:

- shadow and near-black chroma noise;
- skin-tone and color fidelity;
- preservation of texture and fine detail;
- artifacts and over-smoothing;
- latency, memory, cold-start behavior, and per-job cost.

### First Premium release

- explicit user opt-in; do not label the mode "HD", because it does not imply
  increased resolution or upscaling;
- persist `engine_requested`, `engine_used`, and the resolved model version;
- separate Premium timeout and cost/entitlement policy;
- no automatic retry through the other cloud engine;
- RGB output contract; RGBA output is rejected or normalized deliberately;
- use a verified self-hosted deployment, such as an ONNX container or Cog.

Provider availability and hosting claims must be revalidated during research.
Use dated wording such as "no verified managed endpoint as of the research
date", not permanent claims that an endpoint exists nowhere.

Historical provider/model notes were moved to `research-notes.md`. They are
context seeds, not current research findings.
