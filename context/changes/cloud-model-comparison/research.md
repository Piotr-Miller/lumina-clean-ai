# Research: cloud-model-comparison

2026-10-29. No codebase research was run for this change; the blocking question was external.
Spikes below.

Scope agreed with the owner on 2026-10-29 (`temp_steps.md`, step 2): four candidate classes, one
spike section each, run documentary-first. Every paid experiment waits for the owner's consent,
so each section's empirical half is pending. Documentary reads were done by four parallel
read-only agents. Nine of their quotes were re-fetched by the lead session on the same day and
all matched the source:

- Deep-Image training and price;
- Topaz EULA §3.3.4;
- Claude Haiku/Sonnet 5.5 prices;
- Gemini API terms on unpaid vs paid data use and the EEA rule;
- fal 90-day storage and `X-Fal-Store-IO`;
- fal control-light price and size silence;
- OpenAI `gpt-image-2.5-sunburst` model page;
- BFL API terms §2(b).

**The sieve applied in every section** (from `temp_steps.md`, step 2):

- **S1:** a production API.
- **S2:** output long side ≥ 1536 px for a ~12 MP (4000 × 3000) phone input.
- **S3:** a price per photo.
- **S4:** retention of and training on API inputs (user photos).
- **S5:** commercial rights to the output.
- **S6:** latency.

Class D replaces S2 with schema-enforced JSON output, because it returns parameters, not pixels.

Reference points:

- Bread costs **$0.00060/run** (`replicate.com/mingcv/bread`, read 2026-10-29).
- The Bread run behind the original pause took ~3 s to predict.
- Measured median cost is $0.00061 over 15 predictions
  (`context/archive/2026-09-13-bread-unit-cost-verification/change.md:63-99`).

## Spike: Does any restoration / low-light / denoise model other than Bread pass the sieve on some host? (2026-10-29, 15:00)

Documentary read of Replicate model pages, fal.ai, Hugging Face Inference Endpoints, Modal and
RunPod. The Replicate model API (`api.replicate.com/v1/models/…`) returned **401** without a
token, so every Replicate figure comes from the public HTML pages.

**What the previous source said.**
`context/archive/2026-08-31-cloud-quality-below-local/research.md:51` (2026-09-20):

- "Retinexformer — the parked S-13 answer — is not on Replicate at all."
- `:168-170`: Retinexformer is absent, and "Same for Zero-DCE, RetinexNet, KinD, URetinex-Net,
  LLFlow, DiffLL, CIDNet."
- `:174-181` gives the cluster table and calls it "none updated since Feb 2024".
- `:183`: "`vis-opt-group/sci` is the one credible drop-in."

**Documentary half.**

- **Prior claims, re-checked.**
  - **Retinexformer and the others are still absent:** 55 slug probes under cjwbw, chenxwh,
    lucataco, zsxkib and camenduru all returned HTTP 404.
  - **No new version since Feb 2024:** bread 2023-07-19, sci 2022-06-09, night-enhancement
    2022-08-13, lednet 2023-01-05.
  - **Bread's figures stand:** "approximately $0.00060 … within 3 seconds" (Apache-2.0).
  - **SCI's figures stand:** "$0.00025 … within 2 seconds" (MIT, in `CVPR/LICENSE` and
    `TPAMI/LICENSE`). Its only input is `model_type`.
  - **LEDNet is still non-commercial:** "Redistribution and use for non-commercial purpose"
    (S-Lab 1.0).
  - **One price is refuted.** `cjwbw/night-enhancement` now reads "approximately $0.00057 to
    run", not $0.00046.
  - **Cold boot:** Replicate says "When a model hasn't been used for a little while, we turn it
    off … can take several minutes" (https://replicate.com/docs/topics/models/run-a-model, read
    2026-10-29). The "~2 min" figure is not in the docs.
- **Replicate data and output terms (S4, S5 for every Replicate model).**
  - Data: "all input parameters, output values, output files, and logs are automatically removed
    after an hour, by default"
    (https://replicate.com/docs/topics/predictions/data-retention, read 2026-10-29).
  - Output: "Replicate hereby grants to you all right, title and interest, if any, in and to
    Output" (https://replicate.com/terms §5.1, read 2026-10-29).
- **`fal-ai/control-light`: a generative low-light model.** It is a "LoRA fine-tune of FLUX.2
  [klein] 9B … 4-step inference" with `webhookUrl` and a "Commercial use" label
  (https://fal.ai/models/fal-ai/control-light/api, read 2026-10-29).
  - Price: "$0.03 per megapixels".
  - Size: the docs give no limit. The only example output is `"width": 768`, `"height": 1360`
    (https://fal.ai/models/fal-ai/control-light/llms.txt, read 2026-10-29).
  - Range: a ~1 MP output costs ≈ $0.03; a 12 MP output would cost $0.36.
  - Base model licence: `flux-non-commercial-license`. Its clause 2(d) says "You may use Output
    for any purpose (including for commercial purposes)", while 1(c) excludes use "in direct
    interactions with or that has impact on end users"
    (https://huggingface.co/black-forest-labs/FLUX.2-klein-9B/resolve/main/LICENSE.md, read
    2026-10-29).
  - Whether fal holds a commercial licence that covers its callers: docs silent.
- **`fal-ai/nafnet/denoise`: denoise only, with no exposure input.**
  - Price: "Your request will cost $0.0225 per megapixel", so ≈ $0.27 at 12 MP if the size is
    kept.
  - Size: the denoise page does not state any size behaviour, and its example output is 512 ×
    512 (https://fal.ai/models/fal-ai/nafnet/denoise/llms.txt, read 2026-10-29). The sibling
    deblur page says "Matches input dimensions".
  - Licence: NAFNet is MIT.
- **fal data terms (S4 for both fal models).**
  - Storage: "Request inputs and outputs are stored in the platform for 90 days by default."
    Opt-out: "add the `X-Fal-Store-IO: 0` header". "ZDR is not enabled by default."
    (https://fal.ai/docs/documentation/model-apis/media-expiration, read 2026-10-29).
  - Training: "Company will not use Client Content to create, train, develop … Company's
    products or services", except for "Pending Enterprise Ready" models
    (https://fal.ai/legal/api-services, read 2026-10-29).
  - Output rights: these terms do not "entitle Client to any Intellectual Property Rights in any
    Output Content" (same page).
- **NAFNet on Replicate (`megvii-research/nafnet`).** "approximately $0.032 to run";
  "Predictions typically complete within 144 seconds" on a T4
  (https://replicate.com/megvii-research/nafnet, read 2026-10-29). That is 53× Bread's price
  and 48× its time.
- **Retinexformer, self-hosted.**
  - Code: "MIT License … Copyright (c) 2023 Yuanhao Cai". Weights are on Google Drive and Baidu
    (https://github.com/caiyuanhao1998/Retinexformer, read 2026-10-29). There are no official
    weights on the Hugging Face Hub.
  - Weight licence, and time and memory at 12 MP: docs silent.
  - GPU prices:
    - Modal T4 "$0.000164" per second (https://modal.com/pricing);
    - HF Inference Endpoints T4 "$0.5" per hour, billed per minute
      (https://huggingface.co/docs/inference-endpoints/pricing);
    - RunPod Serverless 16 GB "$0.58/hr" (https://www.runpod.io/pricing).

    All three read 2026-10-29.

  - Retention:
    - Modal keeps inputs and outputs "Up to 7 days, then deleted"
      (https://modal.com/docs/guide/security);
    - HF "does not store any customer data in terms of payloads";
    - RunPod keeps async results for "30 minutes".

    Training statements: docs silent for Modal and HF.

  - Cold start: HF scales to zero after "idle … for over 15 minutes" and returns "`502 Bad
Gateway` while the new replica is initializing"
    (https://huggingface.co/docs/inference-endpoints/autoscaling, read 2026-10-29).
- **`colinhughes2121/ai-low-light-photo-fixer` (Replicate).** This is the only low-light model
  newer than Feb 2024 that was found (version 2026-05-23).
  - "This model doesn't have a readme".
  - Its `strength`/`seed` inputs suggest a generative model.
  - S2, S3, S5 and S6: docs silent.

**Empirical half, pending owner consent.** Smallest experiment: one call on tuning photo S17-04
(`test-photos/licensed/04-phone-whitehouse-iphone13pro.jpg`) for each of these candidates:

- `fal-ai/control-light`, ≤ $0.36;
- `fal-ai/nafnet/denoise`, ≈ $0.27;
- `vis-opt-group/sci`, $0.00025.

The fal calls send `X-Fal-Store-IO: 0`. The run records output width × height, predict time and
the billed amount. Output size is the number that settles S2 and S3 for both fal models.

**Not yet checked:**

- Replicate model API metadata (needs a token);
- Replicate site search (rendered empty);
- the input schema of `megvii-research/nafnet`;
- output size and latency of both fal models;
- whether either fal model is "Enterprise Ready";
- whether fal's "Commercial use" label covers the FLUX.2 [klein] base licence;
- the Retinexformer weight licence and its 12 MP cost;
- GA statements for Modal, RunPod and HF;
- fal endpoints beyond these two.

**What this settles:**

- **The 2026-09-20 Replicate picture still holds:** Retinexformer is absent, nothing is newer in
  the cluster, and SCI remains the only Replicate model that passes S1 and S3–S6.
- **SCI's S2 rests on the repo's own measurement, not on its docs:** "It preserves resolution
  exactly" (`research.md:190`, 2026-09-20). It also does no denoising.
- **No new class-A candidate passes the sieve on documents alone.** The two fal models stay open
  only on output size and latency, which one call each would settle.

## Spike: Does any generative image-editing API (OpenAI GPT Image, Gemini, FLUX Kontext) pass the sieve? (2026-10-29, 15:00)

Documentary read of developers.openai.com, ai.google.dev, docs.bfl.ai / bfl.ai legal pages, and
the host pages on fal and Replicate.

**What the previous source said.**

- `temp_steps.md:18` (2026-10-29): "OpenAI GPT Image 2/2.5 — status i cennik niepotwierdzone u
  OpenAI, tylko u pośredników". In English: status and pricing unconfirmed at OpenAI, only at
  intermediaries.
- `context/changes/premium-retinexformer-enhancement/research-notes.md:40-44` (2026-06-15):
  "SUPIR and generative restoration models: potentially strong perceptual restoration, but risk
  changing image content … Generative light-control models: require strict fidelity testing".

**Documentary half.**

- **OpenAI GPT Image 2.5 exists at OpenAI.** This refutes the 2026-10-29 note.
  - Model ID "`gpt-image-2.5-sunburst`", "Default snapshot:
    `gpt-image-2.5-sunburst-2026-09-08`", "Image edit | `v1/images/edits` | Supported". There is
    no preview label (https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst, read
    2026-10-29).
  - The changelog for Sep 8, 2026 says: "Released GPT Image 2.5 Sunburst and GPT Image 2.5
    Flare". `gpt-image-2` (snapshot `2026-04-21`) is still listed.
- **OpenAI S2 passes.** "neither edge may exceed 3840 pixels. The total pixel count must be
  between 655,360 and 8,294,400 … Resolutions above `2560x1440` are experimental"
  (https://developers.openai.com/api/docs/guides/image-generation, read 2026-10-29).
  - `2048x1536` is exactly 4:3 and not experimental.
  - The edit reference says instead "the maximum supported resolution is `3840x2160`". The two
    pages conflict.
- **OpenAI S3 is only partly known.**
  - Rates: "$8 per million image input tokens … $30 per million image output tokens"
    (https://developers.openai.com/api/docs/pricing, read 2026-10-29).
  - "Token rates match GPT Image 2. The GPT Image 2 calculator does not estimate GPT Image 2.5
    token consumption." (model page).
  - Output cost at `2048x1536`, from the token formula in OpenAI's own calculator script:
    high 2,223 tokens ≈ $0.067; xhigh ≈ $0.119; max ≈ $0.267.
  - Input-image token count for edits: docs silent.
- **OpenAI S4 passes, with zero data retention by approval.**
  - "data sent to the OpenAI API is not used to train or improve OpenAI models (unless you
    explicitly opt in…)".
  - The table row reads `/v1/images/edits` | No | 30 days.
  - ZDR: "Image generation is Zero Data Retention compatible when using
    `gpt-image-2.5-sunburst` …", but "subject to prior approval by OpenAI".
  - CSAM-flagged images are "retained for manual review, even if Zero Data Retention … is
    enabled".
  - Source: https://developers.openai.com/api/docs/guides/your-data, read 2026-10-29.
- **OpenAI S5 passes.** "Customer: (a) retains all ownership rights in Input; and (b) owns all
  Output" (https://openai.com/policies/services-agreement/, effective 2026-01-01; WebFetch got
  403, so it was read through exa on 2026-10-29).
- **OpenAI fidelity: there is no parameter on 2.5.**
  - `input_fidelity` "Supports `high` and `low` on `gpt-image-1.5`", and for gpt-image-2 "omit
    this parameter". The reference does not mention 2.5.
  - The prompting guide warns: "Repeated edits can still change details you intended to preserve
    … If a region must remain pixel-identical, composite the approved edit into the original
    image instead of relying on prompting alone"
    (https://developers.openai.com/api/docs/guides/image-prompting, read 2026-10-29).
- **Gemini `gemini-nano-banana-2.1` passes S1 and S2.**
  - Status: "Stable: `gemini-nano-banana-2.1`", latest update October 2026
    (https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1, read 2026-10-29).
  - 4:3 sizes: "1K 1200x896 … 2K 2400x1792 … 4K 4800x3584"; "By default, the model matches the
    output image size to that of your input image"
    (https://ai.google.dev/gemini-api/docs/image-generation, read 2026-10-29).
- **Gemini Nano Banana 2.1 S3: ≈ $0.052 per photo at 2K, before thinking tokens.**
  - "Equivalent to $0.0336 per 1K image, $0.0504 per 2K image, and $0.113 per 4K image". Input
    is "$1.50 (text/image/video)" (https://ai.google.dev/gemini-api/docs/pricing, read
    2026-10-29).
  - The 4K token count conflicts between pages: 3780 on the pricing page, 2520 in the image
    guide.
- **Gemini `gemini-3-pro-image`: ≈ $0.135 at 2K.**
  - "Image input is set at 560 tokens or $0.0011 per image"; "1K and up to 2K consume 1120
    tokens … $0.134 per image" (pricing page above).
- **Gemini S4: paid tier only; the image models have no free tier.**
  - Paid: "Google doesn't use your prompts (including … images …) or responses to improve our
    products". Unpaid: content is used "to provide, improve, and develop Google products".
  - "You may use only Paid Services when making API Clients available to users in the European
    Economic Area, Switzerland, or the United Kingdom."
  - Source for the three quotes above: https://ai.google.dev/gemini-api/terms, effective
    2026-03-23, read 2026-10-29.
  - Abuse-monitoring retention: "Google retains the following data for fifty-five (55) days"
    (https://ai.google.dev/gemini-api/docs/usage-policies).
  - ZDR is available only through Vertex AI (https://ai.google.dev/gemini-api/docs/zdr).
- **Gemini S5 passes, with a watermark.** "Google won't claim ownership over that content" (terms
  above). "All generated images include a SynthID watermark" (image-generation guide).
- **Gemini fidelity: prompt only.** The guide's "High-fidelity detail preservation" section is
  prompt text.
- **FLUX.1 Kontext [pro]/[max] fails S2.**
  - "All outputs are ~1MP total. Supports ratios from 3:7 to 7:3"
    (https://docs.bfl.ml/kontext/kontext_image_editing, read 2026-10-29). A 4:3 output therefore
    has a ≈ 1182 px long side.
  - BFL calls it "a previous-generation model … For new projects, we recommend FLUX.2"
    (https://docs.bfl.ai/kontext/kontext_overview).
- **The BFL API fails S4 by default.** "the Company may use Inputs and Outputs to train and
  improve its artificial intelligence models"
  (https://bfl.ai/legal/flux-api-service-terms §2(b), revised 2026-08-04, read 2026-10-29). The
  opt-out is by email, with "Training Opt Out" in the subject (https://bfl.ai/legal/privacy-policy).
  This applies to every model on BFL's own API, including FLUX 3 Image and FLUX.2.

**Empirical half, pending owner consent.** Smallest experiment, one edit each, on two tuning
photos:

- S17-04 (phone, lettering);
- S17-07 `test-photos/licensed/07-night-portrait.jpg` (a face).

Candidates and approximate cost per photo:

- `gpt-image-2.5-sunburst` at `2048x1536`, quality high: ≈ $0.07 plus unknown input;
- `gemini-nano-banana-2.1` at 2K: ≈ $0.05.

Each call records:

- `usage` input-image tokens, which settles the undocumented OpenAI input cost;
- output width × height;
- wall time.

A visual diff of the lettering and the face against the input gives a first look at content
drift. That look is not a quality judgement.

**Not yet checked:**

- the input-image token count for 2.5 edits;
- the actual Gemini output size for a 4000 × 3000 input;
- Gemini thinking-token volume;
- Vertex AI pricing and ZDR terms;
- the base Google APIs Terms;
- BFL's EU-version terms and FLUX 3 Image GA status;
- fal and Replicate data terms for hosted Kontext;
- C2PA behaviour on OpenAI outputs;
- https://openai.com/api/pricing/ and https://openai.com/enterprise-privacy/ (HTTP 403 to curl).

**What this settles:**

- OpenAI GPT Image 2.5 Sunburst/Flare, Gemini Nano Banana 2.1 and Gemini 3 Pro Image pass S1,
  S2, S4 (paid tier) and S5 on their vendors' pages, and fail nothing documented.
- **S3 is partly unknown for OpenAI. S6 is undocumented for all of them.**
- **None of them offers a fidelity parameter.**
- FLUX.1 Kontext fails on output size, and BFL's own API fails on training by default.

## Spike: Does any commercial photo-enhancement API pass the sieve? (2026-10-29, 15:00)

Documentary read of Claid.ai / Let's Enhance, Deep-Image.ai, Topaz Labs, Cloudinary, Picsart,
Adobe Firefly Services and VanceAI. No vendor page returned 403 or a login wall.

**What the previous source said.** No prior claim found in `context/changes/**`,
`context/archive/**` or `context/foundation/`.

**Documentary half.**

- **Deep-Image.ai passes all six items on its own pages.**
  - The API `POST /rest_api/process_result` takes `enhancements` from "denoise" "deblur" "clean"
    "face_enhance" "light" "color" "white_balance" "exposure_correction"
    (https://deep-image.ai/api-reference, read 2026-10-29).
  - Denoise: "Resolution of the image remains the same"
    (https://documentation.deep-image.ai/image-processing/denoise-and-sharpen).
  - Price, training and webhook: "From $0.04 / €0.04 per image"; "One credit covers all standard
    enhancements in one request"; "We don't use your images to train AI models."; "Receive a
    callback when a job completes, instead of polling"
    (https://deep-image.ai/about-api, read 2026-10-29).
  - Retention and ownership: "Your images are stored for 40 days and deleted afterwards."; "You
    are the only owner of your work and hold all the copyright." (https://deep-image.ai/app/plans).
  - Not documented: an API input size limit, how to delete before the 40 days, latency figures.
- **Claid.ai / Let's Enhance (one API) is borderline.**
  - Auto-light: `operations.adjustments.hdr` is "ML Color Adjustments — Balance out colors and
    lighting" (https://docs.claid.ai/image-editing-api/image-operations/color-adjustments.md). It
    costs 1 credit, and "Self-serve API plans start at $59 for 1,000 credits", so ≈ $0.059 per
    photo (https://claid.ai/business). Linking that price line to the `hdr` operation is an
    inference; no page maps the two.
  - Denoise: no noise-reduction operation is in the API reference.
  - S4: Claid's own pages conflict. "never use customer data for model training"
    (https://claid.ai/api-pricing) vs a licence to use content "solely in de-identified form, to
    improve our products and services" (https://claid.ai/terms).
- **Topaz Labs fails S5 for this use.**
  - Technically it fits:
    - endpoints `/image/v1/denoise/async` ("Removes common low-light and compression noise") and
      `/image/v1/lighting/async` ("Adjust V2");
    - "Input: 512 MP / Output: 512 MP" (https://developer.topazlabs.com/image-models/denoise/normal);
    - "1 credit per 24 megapixels of output" and "$0.10 / credit" on the $50/mo plan, so
      ≈ $0.20 per photo for denoise plus lighting.
  - Its data terms pass: "Topaz Labs never uses customer inputs or outputs to train its models"
    (https://developer.topazlabs.com/resources/zero-data-retention-zdr-policy).
  - But EULA §3.3.4: "You may not use the API … to provide live, automated processing services to
    third parties … integrate the Services into any third-party application or service … without
    the express prior written consent of Topaz"
    (https://downloads.topazlabs.com/web-assets/Topaz+-+EULA+-+Feburary+2026.pdf, read
    2026-10-29).
- **Cloudinary: S4 is unknown for self-serve accounts.**
  - Operations: `e_enhance` performs "Exposure enhancement: Adjusting underexposed images", and
    `e_gen_restore` performs "Noise Reduction"
    (https://cloudinary.com/documentation/image_enhancement).
  - Price: 100 transformations each, so ≈ $0.044–0.088 per photo on Plus
    (https://cloudinary.com/documentation/transformation_counts, https://cloudinary.com/pricing).
  - Data: the AI FAQ says "We may use users' data and content to … develop, and improve our
    Services … in an aggregated and non-identifiable form", and "Enterprise customers are deemed
    opt-out by default" (https://cloudinary.com/products/cloudinary_ai/faq). Which customers the
    MSA's no-training clause covers was not established.
- **Ruled out on S1 or S2.**
  - **Picsart:** `/adjust` takes manual sliders only. Ultra Enhance accepts "Up to 4Mpx
    (2048x2048) input images" (https://docs.picsart.io/reference/image-ultra-enhance).
  - **Adobe:** "The Lightroom API will reach end-of-life on July 31, 2026", and access needs "An
    active Enterprise contract with Firefly Services included"
    (https://developer.adobe.com/firefly-services/docs/lightroom/getting-started/).
  - **VanceAI:** denoise, but no auto-light tool and no public API price.

**Empirical half, pending owner consent and an account.** Smallest experiment: one Deep-Image
call with `denoise` + `light` + `exposure_correction` on S17-04 (1 credit, ≈ $0.04). It records
output width × height, wall time and whether the webhook fires. Claid's 50 trial credits could
run its `hdr` operation on the same photo at no cost. Both need a sign-up, which this spike did
not do.

**Not yet checked:**

- **Claid:** the full Terms (integration or resale clause), the API input limit and webhooks.
- **Deep-Image:** the minimum plan price (rendered in JavaScript), the input limit and the full
  Terms (integration clause).
- **Cloudinary:** retention terms and MSA scope.
- **Picsart:** S3–S6.
- **Adobe:** S2–S6.
- **VanceAI:** S2, S4, S5 and pricing.
- **Not examined at all:** Remini, Autoenhance.ai, Photoroom and Imagen AI.

**What this settles:**

- Deep-Image.ai passes all six items on its own pages. The open points are its full Terms and
  its input limit.
- Topaz is the strongest technical fit but forbids exactly this integration without written
  consent.
- Claid and Cloudinary stay unresolved on data use (S4).

## Spike: Does any vision-language model API pass the sieve as a parameter chooser for "Auto"? (2026-10-29, 15:00)

Documentary read of platform.claude.com, developers.openai.com and ai.google.dev, plus each
vendor's commercial terms.

- **Redirects:** docs.claude.com → platform.claude.com (302); platform.openai.com →
  developers.openai.com (301).
- **Cost basis:** per-call costs are one 4000 × 3000 image plus 300 output tokens at list
  price. They exclude prompt text and thinking tokens, which all three vendors bill as output.

**What the previous source said.**

- `context/foundation/test-plan.md:428`:
  "a vision model judging before/after improvement is an unstable, expensive oracle; cost
  exceeds signal." That sentence is about a judge, not a parameter chooser.
- `context/archive/2026-06-18-adaptive-enhancement-parameters/plan.md:36` (2026-06): "No vision
  model / ML / CLIP for Auto (deterministic only)." That is a scope decision, not a vendor fact.

**Documentary half.**

- **Claude.**
  - Models: `claude-haiku-5-5` is "Status: Active (latest)", with "Text and images → text"
    (https://platform.claude.com/docs/en/models/haiku-5-5/overview, read 2026-10-29).
  - Structured outputs "constrain Claude's responses to follow a specific schema", via
    "constrained decoding". The feature is GA, and the page's use cases include "extract data
    from images"
    (https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
  - Image tokens: "⌈width / 28⌉ × ⌈height / 28⌉ visual tokens", with a 4,784-token cap on 4.7+
    models (https://platform.claude.com/docs/en/build-with-claude/vision). 4000 × 3000 resizes to
    2212 × 1659, which is 4,740 tokens.
  - Prices: Haiku 5.5 "$0.10 / MTok" in and "$0.50 / MTok" out; Sonnet 5.5 "$2 / MTok" and
    "$10 / MTok" (https://platform.claude.com/docs/en/about-claude/pricing, read 2026-10-29).
    That gives **≈ $0.00062 per call on Haiku 5.5** and ≈ $0.0125 on Sonnet 5.5.
- **Claude S4 and S5.**
  - Training: "Anthropic may not train models on Customer Content from Services".
  - Output: "Anthropic hereby assigns to Customer its right, title and interest (if any) in and
    to Outputs" (https://www.anthropic.com/legal/commercial-terms).
  - Retention: two Anthropic pages disagree.
    - "not retained by default" (https://platform.claude.com/docs/en/manage-claude/api-and-data-retention);
    - "delete inputs and outputs on our backend within 30 days"
      (https://privacy.claude.com/en/articles/7996866).
- **OpenAI.**
  - Model: `gpt-6-luna` lists "Input modalities: text, image", plus `structured_outputs` and
    `image_input` (https://developers.openai.com/api/docs/models/gpt-6-luna, read 2026-10-29).
  - Structured Outputs "ensures the model will always generate responses that adhere to your
    supplied JSON Schema" (https://developers.openai.com/api/docs/guides/structured-outputs).
  - **Image tokenisation is documented for `gpt-5.6-*` but not for `gpt-6-luna`**
    (https://developers.openai.com/api/docs/guides/images-vision).
  - Cost on the documented `gpt-5.6-luna` at `detail: high` (2,942 tokens): ≈ $0.00095 per call.
    At the default `auto` (14,100 tokens): ≈ $0.0032.
  - S4: API data is "not used to train or improve OpenAI models", and abuse logs are kept "for up
    to 30 days" (https://developers.openai.com/api/docs/guides/your-data).
  - S5: "owns all Output" (services agreement, read via exa).
- **Gemini.**
  - Model: `gemini-3.1-flash-lite` is "Stable" and accepts "Text, Image"
    (https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite, read 2026-10-29).
  - JSON Schema output is shown with an image input in
    https://ai.google.dev/gemini-api/docs/image-understanding.
  - Image tokens: "`unspecified` (Default) | 1120"
    (https://ai.google.dev/gemini-api/docs/media-resolution).
  - Price: "$0.25 (text / image / video)" in and "$1.50" out, so **≈ $0.00073 per call**
    (https://ai.google.dev/gemini-api/docs/pricing).
  - S4 and S5 follow the same Gemini API terms as the class-B section: the paid tier does not
    train, the unpaid tier does, and EEA/CH/UK users may be served only through Paid Services.
- **S6 is unknown for all three.** The docs give only relative labels such as "Fastest" and "a
  low-latency, cost-effective multimodal model".

**Empirical half, pending owner consent.** Smallest experiment: one schema-constrained call per
cheap model on S17-04. The schema asks for `{gamma, strength}` within the UI ranges. Models:
`claude-haiku-5-5`, `gemini-3.1-flash-lite` and `gpt-6-luna`, ≈ $0.001 each. Each call records:

- `usage` input tokens against the computed figures (4,740 / 1,120 / undocumented);
- whether the returned numbers respect the schema bounds;
- wall time.

This settles cost and latency only. Whether the chosen parameters are good is not an external
fact and is not this spike's question.

**Not yet checked:**

- `gpt-6-luna` and `gpt-6.1-terra` image tokenisation;
- whether Anthropic and OpenAI enforce numeric `minimum`/`maximum` (confirmed for Gemini only);
- how Anthropic's two retention statements fit together;
- Gemini 3.1 Flash-Lite's default thinking level;
- free-tier terms for Anthropic and OpenAI;
- latency figures;
- an open-weight host.

**What this settles:**

- On the paid tiers, Claude Haiku 5.5 and Gemini 3.1 Flash-Lite pass S1–S5.
- OpenAI passes S1, S2, S4 and S5, but its cheapest model's image cost is undocumented.
- The test plan's word "expensive" is **refuted on price**: about $0.0006–0.003 per photo before
  thinking tokens, the same order as one Bread run. Its "unstable" half cannot be settled from
  documents.

## Spike: Does TypeSafe "Jev for Images" pass the class-D sieve as a parameter chooser? (2026-10-29, 16:10)

Added at the owner's request after the four sections above. The prompt was the YouTube video
"'Jev for Images' Just Changed Visual Automations Forever" (Jay E, RoboNuggets,
https://www.youtube.com/watch?v=0SFKD0xkdR8). The video was read as a transcript through exa,
not watched. Vendor facts below come from docs.typesafe.ai and typesafe.ai only. Third-party
figures are labelled as such.

**What the previous source said.** No prior claim about Jev or TypeSafe found in
`context/changes/**`, `context/archive/**` or `context/foundation/`.

**Documentary half.**

- **What it is: a decision model, not an image model.** Jev returns typed answers, not text or
  pixels. The video lists three kinds: "a yes or no question", "pick from a list", and "a score
  based on a scale".
  - "Every question type accepts images, and the Box question type returns where something is in
    an image" (https://docs.typesafe.ai/images, read 2026-10-29).
  - So it fits class D (choosing parameters), not classes A–C. A parameter would come back as a
    `choice` among presets or as a `score`. A free-form `{gamma, strength}` object is not a
    documented answer type.
- **S1 production API: fails for images.** Images need a header and are explicitly below
  TypeSafe's production bar.
  - "Images and Box questions are off by default. To use them, send the
    `TypeSafe-Danger-Zone-Images: true` header" (https://docs.typesafe.ai/images, read
    2026-10-29).
  - "Images and Box questions aren't yet up to our standards to call ready for production"; "The
    request format, the answers, and the limits on this page can change between releases" (same
    page).
  - The models table still lists "Input | Text | Text" for Jev 1.14 and 1.13, and says "Jev 1.14
    is the newest Jev release, available from October 14, 2026" (https://docs.typesafe.ai/models,
    read 2026-10-29).
  - The vendor warns: "all models (Jev included) perform worse on multimodality over pure text"
    (https://typesafe.ai/blog/jev-1-14, read 2026-10-29).
- **S2 structured output: passes by design.** Answers are typed by construction (`noul`,
  `choice`, `score`, `box`; https://docs.typesafe.ai/images).
- **S3 price: the rate is published, the image cost is not.**
  - Rate: "$42 / $0.042" per Btok / Mtok; "You pay per input token. Output tokens are free"
    (https://docs.typesafe.ai/models).
  - Image billing: "Each image counts as input tokens, billed at the same per-token input price as
    text" (https://docs.typesafe.ai/images). No tokens-per-image formula is published.
  - Third party, not the vendor: Wes Bos reported "One question about an image that is 850x850
    cost one hundredth of a cent - $0.000096936", and "1568 is 4x more expensive than 784x784"
    (post of 2026-10-14, read via a nitter mirror on 2026-10-29). If that holds, a 1568 px image
    costs ≈ $0.0003.
- **Input limits matter for this app.**
  - "Width and height: 280 to 1568 pixels each"; "Total pixels: 78,400 to 2,458,624". A
    4000 × 3000 phone photo has to be downscaled before the call.
  - "The API removes all metadata (EXIF, color profiles, comments) and does not apply the EXIF
    orientation" (https://docs.typesafe.ai/images). An orientation-6 photo such as S17-06 or
    S17-24 has to be rotated before it is sent, the same fault class `cloud-exif-orientation`
    fixed for Bread.
- **S4 data: only partly documented.**
  - "Jev is not fine-tuned or LoRA-adapted with customer data … the same weights serve every
    account" (https://docs.typesafe.ai/models). That covers per-account tuning, not retention or
    use of inputs for training the shared model.
  - A third-party review says TypeSafe states Jev "is not trained on customer requests or
    responses" and that zero data retention is available for enterprise customers
    (https://aitoolfinder.org/tools/jev/, checked by its authors 2026-09-30). The vendor page was
    not found.
- **S5 output rights: not checked.**
- **S6 latency: only vendor claims, reported by third parties.** "about 70–500ms" end-to-end,
  attributed to the launch post (https://guzli.com/blog/jev-typesafe-ai-use-cases/, read
  2026-10-29).

**Empirical half, pending owner consent and a TypeSafe API key.** Smallest experiment: one
`score` question and one `choice` question on S17-04, downscaled to 1568 px on the long side
(≈ $0.0003). It records `usage.input_tokens`, the answers with their probabilities, and wall time.
That settles the image cost only. Whether the chosen parameters are good is not a vendor fact.

**Not yet checked:**

- TypeSafe's own terms on retention and training;
- output rights;
- the tokens-per-image rule;
- rate limits for images;
- whether the "dreamer-ready" image status has a planned production date.

**What this settles:** Jev for Images belongs in class D and is cheap, but it **fails S1 today**.
TypeSafe itself says images are not production-ready and may change between releases. The 1568 px
cap and the missing EXIF orientation would also need handling in this app's pipeline.
