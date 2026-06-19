# Historical research notes

> Snapshot captured on 2026-06-15. Revalidate all provider availability,
> pricing, performance, model rankings, and corporate/platform claims before
> using them in a plan.

## Original decision context

- A sequential `Retinexformer -> Bread` fallback can double worst-case latency
  because provider failure may surface only after a callback failure or
  watchdog timeout.
- Deterministic input failures such as corrupt, unsupported, oversized, or RGBA
  inputs may affect both engines, so a second attempt can add cost without
  improving reliability.
- An explicit Premium opt-in keeps the operationally riskier self-hosted model
  off the default critical path.
- A Retinexformer ONNX deployment may require `pad -> infer -> unpad`
  preprocessing because common exports expect dimensions divisible by four.

## Provider landscape snapshot

- **fal.ai:** image/video-oriented queue and webhook APIs; potentially useful
  for hosted models, but callback payloads, signatures, and output allowlists
  differ from Replicate.
- **Modal:** Python-native serverless containers; candidate for self-hosting.
- **RunPod:** serverless GPU/container hosting; candidate for self-hosting.
- **Baseten, Beam, Koyeb, Novita, Cerebrium:** possible hosting alternatives
  that require fresh operational and pricing research.
- **Cloudflare platform direction:** potentially relevant because the frontend
  already runs on Cloudflare, but any relationship with Replicate and Workers
  AI must be checked against current official sources.

## Model landscape snapshot

- **Retinexformer:** low-light enhancement/restoration candidate. Its advantage
  over the production Bread pipeline must be demonstrated on LuminaClean's own
  image set.
- **NAFNet:** primarily denoise/deblur; not a complete low-light replacement
  without a separate brightening stage.
- **SUPIR and generative restoration models:** potentially strong perceptual
  restoration, but risk changing image content and may be too expensive or slow
  for this product.
- **Generative light-control models:** require strict fidelity testing because
  the product should preserve the user's actual photo.
- **Research-only alternatives:** RetinexMamba, Reti-Diff, DiffLL, and
  Diff-Retinex++ were noted as candidates but were not production-validated.

## Self-hosting seeds

- ONNX export using ONNX Runtime in a CPU/GPU container.
- Cog-packaged official Retinexformer implementation.
- Candidate deployment surfaces: Cloudflare Containers, Modal, or RunPod.

These are investigation starting points, not selected architecture.
