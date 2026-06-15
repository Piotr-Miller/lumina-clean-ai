---
change_id: retinexformer-hd-opt-in
title: Add Retinexformer as an opt-in "HD / better quality" cloud engine
status: new
created: 2026-06-15
updated: 2026-06-15
archived_at: null
---

## Notes

Add Retinexformer as an opt-in "HD / better quality" cloud engine for logged-in users, while Bread on Replicate stays the proven default/primary engine. Retinexformer (self-hosted via ONNX container or Cog, NOT a hosted API — no managed endpoint exists on any provider) is never on the critical path; the user explicitly chooses "slower but better".

Rationale: keep the battle-tested, cheap Bread path as default; introduce the higher-quality but operationally riskier self-hosted model behind an explicit user choice rather than a sequential fallback chain (which would double worst-case latency in the async webhook pipeline and mostly rescue self-inflicted infra risk).

Draft only — recorded for later planning, no work started.

### Decision context (from the discussion that produced this change)

- **Why not a fallback chain (Retinexformer → Bread):** in the async webhook pipeline a "failure" surfaces as a `failed` callback or watchdog timeout minutes later, so a sequential fallback doubles worst-case latency exactly when the user already waits longest (cold boot >300s observed under load — see `supabase/functions/enhance/index.ts:43-50`). Most deterministic failures (RGBA, corrupt, oversize) are correlated → both engines fail → fallback only wastes a second cold boot + GPU cost. Fallback mainly rescues self-inflicted infra risk from the new self-hosted primary.
- **Why opt-in instead:** keep the risky self-hosted component off the critical path; user knowingly trades latency for quality. Local Canvas engine already provides the "something rather than nothing" degradation tier.
- **Retinexformer availability:** no managed/turnkey API anywhere (not on Replicate, fal.ai, HF Inference, Modal, or RunPod). Practical self-host options: ONNX export (`Kazuhito00/Retinexformer-ONNX-Sample`, MIT, onnxruntime, CPU/GPU — most lightweight) on Cloudflare Containers / Modal / RunPod, or Cog-package the official `caiyuanhao1998/Retinexformer` repo. ⚠️ ONNX export expects fixed/padded input (multiple of 4) → container needs pad→infer→unpad pre/post-processing (see original `test_from_dataset.py`).
- **Open considerations for planning:** persist `engine_used` on the job so the before/after slider knows which engine produced the result; `CLOUD_DAILY_CAP` accounting (per-job vs per-attempt) — Risk #2; output must be RGB not RGBA (cf. Bread RGBA rejection lesson); whether HD mode is gated by the same global cap or a separate budget.

### Side note: inference-provider & Bread-alternative landscape (research snapshot, 2026-06-15)

Captured here so the HD-engine planning isn't locked to one provider/model. Not decisions — just the option space surveyed (via Exa).

**Providers similar to Replicate** (serverless GPU / model hosting). Closest peers for an image-enhancement workload:

- **fal.ai** — image/video-first, per-output billing, webhook/queue API almost 1:1 with our async pipeline (submit → `webhook_url` → POST callback with `request_id`/`status`/`payload`). Differs from Replicate: payload shape, signature scheme, output CDN (`*.fal.media` vs `*.replicate.delivery`). Easiest turnkey migration if we ever leave Replicate.
- **Modal** — Python-native serverless, own containers, sub-sec cold starts on warm pools. Best fit for self-hosting a custom model (e.g. Retinexformer) without Cog.
- **RunPod** — cheapest raw GPU + serverless; has a documented "Cog → Serverless" migration path (reuses our existing Cog/Replicate know-how).
- **Baseten** (Truss, Replicate-like DX), **Beam** (fast cold-boots, $30/mo free), **Koyeb**, **Novita**, **Cerebrium**, bare-metal (**CoreWeave/Spheron/GigaGPU**) for sustained 24/7.
- LLM-centric (less relevant to denoise): Together AI, Fireworks, HF Inference Endpoints, OpenRouter.
- ⚠️ **Cloudflare has agreed to acquire Replicate** and fold its catalog into Workers AI. We're already on Cloudflare Workers — worth tracking, as our cloud engine could eventually converge with native Workers AI (fewer hops, no external SSRF allowlist).

**Alternatives to the Bread model** (low-light enhance + denoise):

- **Retinexformer** — SOTA, ICCV 2023, NTIRE 2024 runner-up / 2025+2026 winner lineage; same fidelity-preserving paradigm as Bread but markedly better, still lightweight (~15.6 GFLOPs). No hosted API anywhere → always self-host (this change's HD engine).
- **fal-ai/control-light** (FLUX.2 [klein] LoRA) — turnkey on fal.ai, single `strength` param. But **generative** → may alter content/detail; needs A/B on night photos before trusting (undermines "is this really my photo").
- **NAFNet** (`fal-ai/nafnet/denoise`, also Replicate) — denoise/deblur only, **does not brighten** → not a Bread replacement on its own.
- **SUPIR** (Replicate/fal.ai) — spectacular generative restorer but A100, ~5 min, **$0.41/run (~680× Bread)** → kills the daily cap; wrong product shape.
- **schvffler/low-exposure** (Replicate, H100, ~9s, $0.013) — undocumented black box; skip.
- Research-only (no hosting): RetinexMamba, Reti-Diff, DiffLL, Diff-Retinex++ — better metrics, immature.

**Retinexformer self-host options** (no managed API exists): ONNX export `Kazuhito00/Retinexformer-ONNX-Sample` (MIT, onnxruntime, CPU/GPU, all variants — most lightweight) on Cloudflare Containers / Modal / RunPod; or Cog-package `caiyuanhao1998/Retinexformer`; blace.ai is a C++ desktop port (not a server API).
