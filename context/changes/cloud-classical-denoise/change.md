---
change_id: cloud-classical-denoise
title: "Cloud AI as a classical full-resolution denoise pipeline, proven offline against real Local"
status: new
created: 2026-11-03
updated: 2026-11-03
archived_at: null
---

## Notes

**Registered 2026-11-03, deliberately NOT started.** Owner decision: this change goes first,
`local-jev-gate` is registered as a stub and waits for this change's step 1. Nothing below has
been run; no harness code has been written; no owner rating exists.

### Where this comes from

S-19 (`cloud-model-comparison`, archived 2026-11-03 →
`context/archive/2026-09-28-cloud-model-comparison/`) set out to pick the basic Cloud path's model
and **stopped before validation**: no candidate passed the tuning-photo core gate, the 12-photo
holdout of `s17-v2` was never opened, and Cloud stays paused (`CLOUD_DAILY_CAP=0` since
2026-10-28). Its `evaluations/outcome.md` and the phase files record, per candidate:

| Candidate                      | What happened                                                                                                                                             | Where                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Bread (production)             | ignores the input ICC profile, caps output at 1536 px, every setting in the production range (gamma ≥ 1.0) harms                                          | `research.md:604-609`, `frame.md:64`            |
| GPT Image 2.5, three configs   | better-looking on every rated pair, **less faithful than real Local on every rated pair** (8 outputs from 3 scenes); moderation blocked 3/7 on a portrait | `evaluations/phase5-tuning.md:42-59`            |
| NAFNet + gamma, NAFNet + curve | never preferred over its own no-denoise control (0/3, twice): green cast, blurred stars, lost detail                                                      | `evaluations/phase3-core.md`, `phase4-curve.md` |
| SCI, control-light, Kontext    | no denoising / 1 MP output                                                                                                                                | `research.md:587, 642`                          |
| Class C (Claid, Topaz, …)      | excluded by owner decision: competitors, not suppliers                                                                                                    | `change.md:346-350`                             |

Two cautions carried from the review of that outcome (owner-accepted 2026-11-03):

- S-19 rejected **configurations**, not models (`phase3-core.md:11`). "8 of 8" in Phase 5 is eight
  outputs from **three scenes**, not eight independent photos.
- **Deterministic does not mean faithful.** NAFNet is deterministic and still blurred stars and
  tinted skies. A classical denoiser (NLM, BM3D) removes detail with noise too — stars, texture
  and colour must be rated, not assumed.

The common thread: the real Local engine (`src/lib/engines/local-engine.ts`, a gamma LUT plus a
native Gaussian blur) was the most faithful result in every blind comparison, and loses only on
noise, because blur masks it rather than removing it. The quality bar
(`context/archive/2026-08-31-cloud-quality-below-local/quality-bar.md` § What a clear Cloud win
means) asks for exactly what no model delivered: _less noise, no loss of texture, colour or
highlight detail_.

### Hypothesis

The Cloud path does not need a pixel-generating model. It can be a **heavy, deterministic,
full-resolution pipeline run server-side** — the techniques `idea-notes.md` keeps out of the
_Local_ engine (NLM / BM3D-class denoising, local tone mapping, no WASM budget) — with fidelity
by construction, no output cap, no moderation, no GPU cold boot. "AI" then sits in the choice of
parameters, not in the pixels, and only if a chooser earns its cost (step 3).

This is a hypothesis. The change exists to test it offline, one variable at a time, before any
hosting, integration or product naming decision.

### Sequence (owner-accepted 2026-11-03; each step is its own gate)

1. **Denoising alone.** On the eight `s17-v2` tuning photos, a new arm
   `<denoiser>-gamma` (common sRGB input → classical denoise → Local's Auto gamma, no blur) is
   rated blind against two references: the matched **control** (same input → Auto gamma, no
   denoise — the existing `control` arm) and the **real Local** download. Same exposure on both
   sides, so denoise-vs-blur is the only variable. Candidates: OpenCV
   `fastNlMeansDenoisingColored` first; BM3D only if NLM shows a gain but damages stars/texture.
   **Gate:** preferred over its control on ≥ 6 of 8 photos, no severe regression, rated on
   **two axes** (visual quality and fidelity to the original, as in Phase 5) from the first round.
2. **Tone mapping, separately**, only after step 1 passes: local tone mapping with a black-point
   anchor and highlight protection, on the denoised image, against the same image with plain
   Auto gamma. S-19's Phase 4 curve was neutral (`phase4-curve.md:57-60`), so no exposure gain is
   assumed; a neutral result stops this arm and keeps Auto gamma.
3. **Auto / chooser**, only after a pipeline gain exists: deterministic heuristic
   (`src/lib/engines/auto-params.ts`, extended with a denoise strength) versus a VLM
   (Haiku 5.5 / Gemini Flash-Lite — the class-D candidates that pass sieve S1,
   `research.md:488`). The VLM spike measured cost and latency only, never parameter quality
   (`research.md:473-474`), so it has no demonstrated value yet and must earn its cost and
   dependency. The chooser is a **plug-in** that writes the same `local/<id>.auto.json` record
   `scripts/s19/local-arms.ts:36-38` already reads and hash-checks; `local-jev-gate` targets that
   interface and is not part of this change.
4. **Freeze one finalist** (denoiser, parameters, chooser) on tuning photos only; then
   **measure wall time at full resolution** (12 MP NLM on CPU may be tens of seconds — the ≤ 30 s
   p95 guardrail, `roadmap.md:383`) and the cold start of a CPU container (seconds, not the
   ~2 min GPU model boot, but still measured, not assumed). Hosting (Modal vs Cloudflare
   Containers) and the `enhance` pipeline integration are decided **after** the quality result,
   never before. Validation on the still-closed `s17-v2` holdout stays one-shot and needs its own
   owner-written approval record, as in S-19.

### What is reused, unchanged

- Benchmark `s17-v2` (`test-photos/s17-benchmark-v2.json`); the holdout is unopened and stays so
  until step 4.
- The S-19 harness: `scripts/s19/inputs.py` (common sRGB inputs — the ICC conversion that any
  candidate needs), `baseline.ts` (Auto records), `local-arms.ts` (arms `control`, `local-equiv`),
  `tally.py` (gate rule at `:325`, generalised from 3 to 8 photos), the blind viewer and the
  `secrets`-drawn, sealed-key protocol. Outputs go to the gitignored
  `test-photos/private/s19/arms/<arm>/`.
- The real Local baselines and their Auto records in the S-19 archive `references/s19-local/`
  (eight tuning photos, verified byte-for-byte).
- The quality bar and the fidelity definition (S-19 `change.md` § Fidelity definition): a
  confirmed content change is a severe regression; a blurred-away star is loss of detail.

### Why all eight tuning photos from the start

S-19's core/extension split (S17-03/04/07 first) existed only to bound paid calls before a gate.
Steps 1–2 here cost $0 (no vendor call), so there is no reason to rate three scenes and
extrapolate — the "three scenes" weakness of Phase 5 is avoided by design.

### Later extension, not in scope now

**Option 2 — a generative model as a tonal guide, not the output.** S-19 `change.md:405-406`
names "a tone-only transfer from GPT onto the original" as a fallback "used only if fidelity
problems are documented"; Phase 5 documented them. The 21 paid GPT/NAFNet outputs are on disk
and match the ledger (`test-photos/private/s19/attempts.jsonl`, checked 2026-11-03), so a
low-frequency gain map from a GPT output applied to the **denoised original** can be tried at $0,
after step 1, as a separate arm. It is not a second full track and is not run in parallel.

### Not in scope

- No change to the Local engine, its Auto or the free path (PRD §116: Local stays naive).
- No production integration, hosting, secret, cap change or `CLOUD_DAILY_CAP` > 0 before the
  holdout result meets the bar (S-19 `change.md:250`, return condition).
- No new vendor account, no paid pixel-model call, no class-C service.
- No holdout access before step 4 and an owner-written approval record.
- No edit to anything under `context/archive/`.

### Open decisions for the owner, before step 1 runs

- Confirm the step-1 gate as ≥ 6 of 8 over control (the Phase 3 rule was ≥ 2 of 3).
- Confirm NLM-first, BM3D-second (or run both arms in the same blind set at the cost of more
  pairs to rate).
- Whether a passing classical pipeline, which could in principle run in the browser as WASM,
  reopens the free/paid question in `local-engine-ceiling` (#188) and PRD §116 — a product
  decision to take **after** the result, recorded here so it is not forgotten.

### Roadmap placement (owner question, 2026-11-03: S-13 or S-14?)

**Neither — this is the successor of S-19, proposed as a new slice S-20.** Reasons:

- **S-13** (`premium-retinexformer-enhancement`, #60) is defined on the premise "Bread on
  Replicate remains the default Standard engine" and adds a **Premium** tier above it. This
  change asks what the _basic_ Cloud path is — the question S-19 left open. Folding it into S-13
  would conflate "what the toggle does" with "a paid learned model above the toggle".
- **S-14** (`premium-max-tier`, #61) is an epic above S-13 (prerequisite: S-13 done) and proposes
  NAFNet as its heavy post-pass — the denoiser that lost 0 of 3 to its own control twice in S-19.
- The S-19 row in `context/foundation/roadmap.md:50` hangs on the success criterion "cloud
  result is noticeably better than local", still unmet. This change inherits that criterion.
- The tier ladder is unchanged by this placement: if a classical pipeline becomes Standard, S-13
  (a learned model) stays the Premium candidate **above** it. `local-jev-gate` is not a slice
  at all — it touches Local — and sits in Parked like `local-engine-ceiling` (#188).

Issue labels on registration, following `github-issues.md`: `roadmap`, `slice`, `phase:post-mvp`,
`status:proposed` (not plan-ready by the owner's decision). The roadmap row and the issue are
written when the owner confirms; neither exists yet.

### Related

- `context/archive/2026-09-28-cloud-model-comparison/` — predecessor; immutable.
- `context/changes/local-jev-gate/` — the chooser candidate for Local; stub, sequenced after
  this change's step 1.
- `context/changes/local-engine-ceiling/` (#188) and the Cloud delivery-resolution half of S-18
  (`roadmap.md` § Parked) — both parked "pending S-19's model choice"; this change is the
  candidate that would unpark them.
- `context/changes/premium-retinexformer-enhancement/` (S-13) — the self-hosted learned-model
  route; stays parked as a Premium proposal, not a basic-path candidate.
