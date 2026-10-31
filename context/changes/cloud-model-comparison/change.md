---
change_id: cloud-model-comparison
title: Compare Cloud AI model candidates on the s17-v2 benchmark
status: implementing
created: 2026-09-28
updated: 2026-10-31
archived_at: null
---

## Notes

Decision B from S-17 (maintainer, 2026-09-28): compare models for the **basic Cloud path** on the
`s17-v1` benchmark. Bread at low gamma and weak denoise is **one candidate**. The lower-denoise
Cloud setting is a hypothesis to compare here, not scope to ship. It does not resume Cloud Auto
calibration.

Fixed inputs:

- Benchmark `s17-v2` (`test-photos/s17-benchmark-v2.json`, hashes in
  `test-photos/s17-benchmark-v2.sha256`): eight tuning photos and twelve validation photos. It
  supersedes `s17-v1`, which stays frozen as history (see § Holdout replacement).
- **Holdout:** the twelve validation photos are meant to stay unopened for every model. Tuning
  results only prepare the candidates; judging whether a candidate generalises needs that holdout.
  S17-05 and S17-06 were opened for Bread (see § Holdout exposure), so `s17-v2` moves them to
  tuning and puts two unexposed phone photos, S17-23 and S17-24, in their validation places.
- Quality bar: `context/archive/2026-08-31-cloud-quality-below-local/quality-bar.md`.
- Evidence for Bread so far: `context/archive/2026-08-31-cloud-quality-below-local/calibration.md`.
  Across the three probes Bread gains on 4 of 6 tuning photos, 2 of them small. There is no basis
  for a reliable Auto rule. S17-02 is harmed even at strength 0.

Decided in this change, not before: the candidate models and the comparison protocol.

Out of scope: S-13 (a separate Premium proposal) and `cloud-exif-orientation` (a separate
change, live in production since 2026-10-25; see
`context/archive/2026-09-27-cloud-exif-orientation/live-acceptance.md`).

This is a decision about the direction of the work. It does not claim that another model has
already proven better.

## Holdout exposure

Both photos are `"split": "validation"` in `test-photos/s17-benchmark.json`. Every exposure below
is Bread only; no other candidate has seen either photo.

| Date       | Photo                                     | Purpose                                        | Run / job                                  | Parameters                       | Who viewed what                                                                                                           | Quality judged?                               |
| ---------- | ----------------------------------------- | ---------------------------------------------- | ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 2026-09-27 | S17-06 `06-phone-rain-galaxys24ultra.jpg` | S-17 EXIF probe (orientation)                  | Replicate run `ebme649xrsrgc0d0wjv857kkrw` | gamma 1, strength 0.05 (harness) | Agent checked output dimensions and a thumbnail                                                                           | No: orientation only, not rated, not measured |
| 2026-10-25 | S17-06                                    | `cloud-exif-orientation` production acceptance | job `e3df6cc5-d22a-41d9-ad13-d4752a51a8c4` | gamma 1, strength 0.05           | Owner viewed BEFORE/AFTER in the app; agent measured the downloaded post-pass JPEG                                        | Yes: owner judged it unusable                 |
| 2026-10-25 | S17-05 `05-phone-walgreens-pixel7.jpg`    | same acceptance, orientation-1 control         | job `85ea0fef-a1f5-4055-be09-9a98a5647283` | gamma 1.5, strength 0.133 (Auto) | Owner viewed BEFORE/AFTER in the app; agent measured the downloaded post-pass JPEG (first exposure of this photo)         | Yes: owner judged it unusable                 |
| 2026-10-28 | S17-05, S17-06                            | Separate Bread from the chroma post-pass       | the two jobs above                         | as above                         | Agent fetched both raw `result.png` read-only from production Storage, measured all three stages, viewed a crop of S17-05 | Diagnostic only; not used for tuning          |

The orientation probe and the quality judgement are separate events: the probe looked only at
orientation, and the first quality judgement of either photo is the 2026-10-25 acceptance.
Production acceptance photos must come from the `tuning` split or from outside the benchmark.

### Stage comparison (2026-10-28)

Files live in the gitignored `test-photos/private/s19-holdout-exposure/`. All three stages are
compared at the Bread output size, 1152 × 1536, with the original EXIF-rotated and resized. The
raw `result.png` is Bread's output exactly as stored: the Edge Function stores Replicate's bytes
unchanged (`supabase/functions/enhance/index.ts`), and the chroma post-pass runs in the browser
(`src/lib/services/cloud-result-postprocess.client.ts`).

| File                                                    | sha256                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `test-photos/licensed/05-phone-walgreens-pixel7.jpg`    | `9debe50cec8657b3f147bd134f3c45ad583f5e19ada9993995871a3739c016f7` |
| S17-05 Bread `result.png` (job `85ea0fef…`)             | `d976e32088aee6c6d42deff36280968c91d7d1cae277f57410312929d34be253` |
| S17-05 post-pass download                               | `b0700900ddde8f392430db0a694d3e55b6ae0b4dcf259ae0c3e741ea3c7463e7` |
| `test-photos/licensed/06-phone-rain-galaxys24ultra.jpg` | `660535e3ec11613277db8e3dee72b5f8e324ff1367250fcb332d6aa9556de910` |
| S17-06 Bread `result.png` (job `e3df6cc5…`)             | `1a06dfd5223782fa4cf5e2ffaa6d02aa89e9a46bc7f5d8f721645f5c6fa63506` |
| S17-06 post-pass download                               | `43c2f8074a3b835fcf2a136e12e94e3e03a9240ae31f9abc14f274ac1431b857` |

Definitions: V = max(R, G, B) / 255; clipped = all three channels ≥ 250; S = HSV saturation; the
sky region is the top 25 % of the frame; chroma noise = mean |Cb − 5×5 mean| + |Cr − 5×5 mean|.
These definitions differ from the 2026-10-25 measurements, so the two sets of figures are not
comparable with each other.

| Photo  | Stage     | mean V | V ≥ 0.90 | clipped | mean S | sky mean V | sky chroma noise |
| ------ | --------- | -----: | -------: | ------: | -----: | ---------: | ---------------: |
| S17-05 | original  |  0.454 |   13.5 % |   0.4 % |  0.756 |      0.179 |             1.45 |
| S17-05 | Bread     |  0.874 |   74.3 % |   1.0 % |  0.242 |      0.772 |             1.09 |
| S17-05 | post-pass |  0.872 |   74.2 % |   0.9 % |  0.240 |      0.771 |             0.83 |
| S17-06 | original  |  0.397 |    1.5 % |   0.1 % |  0.215 |      0.270 |             0.74 |
| S17-06 | Bread     |  0.636 |    1.7 % |   0.0 % |  0.167 |      0.658 |             0.76 |
| S17-06 | post-pass |  0.636 |    1.7 % |   0.0 % |  0.167 |      0.657 |             0.58 |

**Reading.** The over-brightening and the loss of saturation are already in Bread's output. The
post-pass leaves V and S unchanged within 0.003 and lowers sky chroma noise by about a quarter
(S17-05 1.09 → 0.83, S17-06 0.76 → 0.58). The S17-05 sky goes from dark (0.179) to near white
with a pink patch under Bread. So the degradation comes from Bread at these parameters, not from
the post-pass. This is a diagnostic of exposed samples only, and it must not be used to tune S-19
candidates.

**Superseded 2026-10-30.** `s17-v2` (§ Holdout replacement) moved S17-05 and S17-06 to tuning, so
this comparison and its files may now inform tuning like any other tuning output. They still say
nothing about validation.

## Holdout replacement (owner decision, 2026-10-29)

The owner chose to replace S17-05 and S17-06 with two new freely licensed photos of the same kind,
so the bar is still evaluated on twelve validation photos. The result is benchmark `s17-v2`
(`test-photos/s17-benchmark-v2.json`). `s17-v1` is not edited in place: its freeze protocol
forbids changing membership or hashes after experiments begin, and the S-17 archive pins its
hashes.

| Change              | Photo                                                                                                                                | Why                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| validation → tuning | S17-05, S17-06                                                                                                                       | Bread outputs were opened (above). No other candidate has seen them, so they are still valid tuning material.                             |
| new validation      | S17-23 `23-phone-sodium-street-pixel6.jpg`: Pixel 6, shop corner under sodium light, signage and mural · CC BY-SA 2.0 Tadeusz Hare   | Takes S17-05's role: a full-size phone JPEG with lettering and intense local light. Dark, with visible luminance noise at native scale.   |
| new validation      | S17-24 `24-phone-fountain-galaxys23ultra.jpg`: Galaxy S23 Ultra, lit fountain, wet paving, point lights · CC BY-SA 4.0 ja:User:Sanjo | Takes S17-06's role, including **EXIF orientation 6**: a full-size Samsung JPEG of an already bright, processed scene, so a no-harm case. |

Selection was input-only, as for `s17-v1`: a Wikimedia Commons search of phone-camera categories
for night photos, then thumbnails, the file pages and native-pixel crops. No Cloud or Local output
of either photo exists. Both files are single-revision Commons uploads whose SHA-1 matches the
download, with the author on the file page matching the uploader (S17-23 via Flickypedia from the
author's Flickr). Rejected on the way: Takamatsu Station (Pixel 8), because its listed author
differs from its uploader, the same unresolved gap S17-01 carries; Battery Road (Pixel 7a),
because 4445 × 3337 is a crop, not a camera original; and two more photos by S17-23's
photographer, so that one author contributes one photo.

**Parallel `s19-v1`, abandoned (owner decision, 2026-10-30).** On 2026-10-28 a separate branch,
`feat/cloud-model-comparison` (pushed, never merged, no PR), froze a different replacement set,
`s19-v1`: S17-05/06 kept out as diagnostics, `25-phone-makersoul-yuchau-galaxys9plus.jpg` and
`24-phone-banyan-lamp-xiaomi.jpg` as replacements, and three supplementary needs-enhancement
photos. The two branches did not know of each other. The owner chose `s17-v2`. No engine ran on any
`s19-v1` replacement, so neither holdout was contaminated by the other. `s19-v1` stays on that branch
as history and is not used by S-19.

Limits:

- The S-17 scripts (`scripts/s17/*`, `scripts/measure-hue-shares.py`) still read
  `s17-benchmark.json` (v1). S-19's plan has to point them at v2 or take the manifest as an
  argument; until then they see S17-05/06 as validation and do not know S17-23/24.
- `test-photos/s17-gallery.html` shows v1 only.
- Phone coverage stays thin: five phone sources in all, three in tuning and two in validation,
  and still no low-light phone portrait (`photo-candidates.md`, limit 2).

## Production pause (owner decision, 2026-10-27)

Decision: pause new Cloud AI jobs with `CLOUD_DAILY_CAP=0` until S-19 confirms the quality of the
production path. Set 2026-10-28T20:33:24Z (`wrangler secret put`, Worker deployment
"Secret Change" at 20:33:23Z); the secret was still listed after the 20:34:58Z master deploy of
`777f66f`. Confirmed end-to-end by the owner on 2026-10-28, signed in on
luminacleanai.com: a Cloud submit shows "The daily Cloud AI limit has been reached. Try the Local
engine, or come back tomorrow." That copy is fixed by `cloud-pause-message`. Local stays available. Reasons: S-17 found no reliable Auto rule, S17-02 is
harmed even at strength 0, and both exposed validation photos came back unusable. Bread does
improve some photos, which justifies the comparison but not leaving the current path to users.
S17-06 was checked at gamma 1 / strength 0.05; the UI minimum strength is 0, so "even at the
lowest settings" would overstate it.

**Return condition:** an S-19 result that meets the agreed bar: at least 8 of 12 clear wins, at
most one moderate loss, and zero severe regressions. Finishing the comparison alone is not enough.

**Follow-up:** the over-cap message still says to try again tomorrow. For a longer pause it should
say that Cloud AI is temporarily unavailable during a quality review and point to Local.

## Owner decisions after the frame (2026-10-29)

- **Validation controls count as possible wins.** S17-10, S17-18 and S17-24 may each be a clear
  Cloud win, for example by visibly lower noise without harm. The threshold stays **8 of 12**.
  This was decided before any tuning, as `frame.md` requires.
- **Local baseline run.** The real Local engine (production app, Auto ON) ran on seven of the
  eight `s17-v2` tuning photos on 2026-10-29. Downloads, their licences and the Auto values are in
  `references/` (README per file). S17-21 was run by the owner by hand (its
  17 MB file exceeds the browser tool's 10 MB upload limit). Owner's rating, 2026-10-29: **Local
  with Auto ON is too bright** on S17-21. Its download and the Auto values are not recorded. On the
  same photo, S-17 rated Bread at production Auto (1.5 / 0.151) "harm: washed out, lost detail".
  The only acceptable Bread setting was gamma 0.5 / strength 0.0, which the production range
  cannot reach (archive `calibration.md:160`, `:710`).

- **Local rated against the original (owner, 2026-10-29).** The owner rated each Local output
  against its original in `references/compare.html`, using S-17's scale. The Bread columns are
  S-17's ratings of the same photos, copied for reference and not re-rated. Bread at the
  production floor (gamma ≥ 1.0) is archive `calibration.md:224-231` and `:454-461`; for S17-05
  and S17-06 it is § Holdout exposure above. Bread at gamma 0.5 is `calibration.md:592-599`, and
  S17-21 at strength 0.0 is `:710`. Gamma 0.5 cannot be reached in production.

  | Photo  | Local Auto gamma / blur | Local vs original (owner)             | Bread at production settings  | Bread, best S-17 setting                 |
  | ------ | ----------------------- | ------------------------------------- | ----------------------------- | ---------------------------------------- |
  | S17-01 | 1.56 / 0.2              | improvement (small)                   | harm: washed out              | improvement (γ 0.5)                      |
  | S17-02 | 1.05 / 0.2              | kept                                  | harm: washed out              | harm at every tested setting             |
  | S17-03 | 1.19 / 0.2              | improvement (small)                   | harm: washed out              | improvement, small (γ 0.5)               |
  | S17-04 | 1.10 / 0.1              | kept                                  | harm: washed out              | no harm (γ 0.5)                          |
  | S17-05 | 1.67 / 0.3              | harm: sky too bright, looks unnatural | unusable (owner, production)  | not tested below γ 1.5                   |
  | S17-06 | 1.00 / 0.1              | improvement (small)                   | unusable (owner, production)  | not tested below γ 1.0                   |
  | S17-07 | 1.80 / 0.7              | improvement                           | harm: washed out, lost detail | improvement (γ 0.5, 0.7, 0.9)            |
  | S17-21 | not recorded            | harm: too bright (rated in the app)   | harm: washed out, lost detail | improvement, small (γ 0.5, strength 0.0) |

  **Tally.** Local: 4 improvements, 2 kept, 2 harm. Bread at production settings: 8 harm or
  unusable. Bread at its best S-17 setting: 4 improvements, 1 no harm, 1 harm, 2 untested.
  Local's two harms (S17-05, S17-21) are both too bright, the same failure as Bread's Auto.
  These are tuning photos: they show what the comparator looks like, not the validation result.
  When this was written, no Bread output had been compared with a Local output side by side; the
  blind comparison below (2026-10-30) did that.

- **Bread rated against Local, blind (owner, 2026-10-30).** Viewer:
  `references/compare-bread.html`, the original alongside A and B in an order drawn once per
  photo, engines revealed after rating, all three shown at Bread's pixel size. Bread is one fixed
  output per photo: S-17's best-rated setting, which production cannot reach (gamma floor 1.0),
  or for S17-05/06 the production job's raw `result.png`. Local is the 2026-10-29 download above.
  Bar category from Bread's side: a clear preference for Bread is a clear win, a clear preference
  for Local a moderate loss, a severe flag on Bread a severe regression, a slight preference a tie.

  | Photo  | Bread gamma / strength        | Preferred      | Severe regression flagged | Bar category      |
  | ------ | ----------------------------- | -------------- | ------------------------- | ----------------- |
  | S17-01 | 0.5 / 0.05                    | Bread slightly | —                         | tie               |
  | S17-02 | 0.5 / 0.0                     | Local slightly | —                         | tie               |
  | S17-03 | 0.5 / 0.05                    | Bread slightly | —                         | tie               |
  | S17-04 | 0.5 / 0.05                    | Bread slightly | —                         | tie               |
  | S17-05 | 1.5 / 0.133 (production Auto) | Local clearly  | Bread and Local           | severe regression |
  | S17-06 | 1.0 / 0.05 (production)       | Local clearly  | —                         | moderate loss     |
  | S17-07 | 0.7 / 0.05                    | Bread slightly | —                         | tie               |
  | S17-21 | 0.5 / 0.0                     | — (no Local)   | — (withdrawn, see below)  | —                 |

  Owner's note on S17-05: "Przepalone niebo, w B jakaś masakra, A wyraźnie mniej zepsuło
  oryginał, które ma słabą jakość sam w sobie" (blown-out sky; Bread a disaster; Local spoiled the
  already poor original clearly less).

  **Tally (7 photos with both engines):** 0 clear wins, 5 ties, 1 moderate loss, 1 severe
  regression. Bread is slightly preferred on four photos, all at settings production cannot
  reach; at production settings (S17-05, S17-06) Local is clearly preferred.

  Limits:
  - **S17-21 has no Local file** (see above), so the export's "Bread clearly" compared Bread with
    nothing and is not a preference. The export also carried a severe-regression flag on Bread;
    the owner withdrew it the same day ("not a severe regression, certainly") and, looking again
    against the original, judged the sky somewhat over-brightened and washed out. That agrees
    with S-17's rating of the same output, "improvement, small", which already noted "a lifted,
    slightly hazy tone … on the far ridges and the sky" (archive `calibration.md:710`).
  - Tuning photos, one rater, Bread at hand-picked settings: this shows what Bread can reach
    against Local, not a validation result.

- **ICC measurement (agent, 2026-10-30).** `scripts/s19/icc-gap.py` on the originals and Bread
  outputs, mean HSV saturation:

  | Photo  | Profile   | Input, profile ignored → applied | Bread gamma 1.0 / 0.05 | Bread gamma 0.5         |
  | ------ | --------- | -------------------------------- | ---------------------- | ----------------------- |
  | S17-03 | ProPhoto  | 0.406 → 0.547                    | 0.288                  | 0.341 (0.05)            |
  | S17-07 | Adobe RGB | 0.600 → 0.736                    | 0.339                  | 0.504 (0.05)            |
  | S17-21 | Adobe RGB | 0.569 → 0.694                    | 0.286                  | 0.396 (0.05), 0.386 (0) |

  Bread's outputs carry no ICC profile and are less saturated than either decode of the input, so
  most of the saturation loss comes from Bread's brightening. Means cannot show whether Bread
  ignores the input profile. That needs a paid run: Bread on the original and on an sRGB-converted
  copy at the same settings.

- **Class C is out (owner decision, 2026-10-30).** "We want to be competition to class C, not use
  their services." LuminaClean is itself a photo-enhancement service, so a commercial
  photo-enhancement API (Deep-Image, Claid, Cloudinary, Picsart, Adobe, VanceAI, Topaz) is not a
  candidate for the Cloud path. No class-C account is opened and no class-C call is run. Their
  section in `research.md` stays as market context.

- **Class B content change is not a severe regression (owner decision, 2026-10-30;
  superseded 2026-10-31 by § Fidelity definition below — kept as history).** Asked
  whether "changed or invented content" should become a severe-regression category before tuning,
  the owner answered: "Absolutnie nie jest ciężka regresja" (absolutely not a severe regression).
  The quality bar stays as it is: no new category. The owner's look at the two GPT Image 2.5
  Sunburst feasibility outputs (`research.md` § Empirical half: results; files in
  `test-photos/private/s19-spike/`), rated against the original:
  - **S17-04:** "the best version of this photo that has been made", although the model replaced
    the dark overcast sky with a blue sky and defined clouds;
  - **S17-07:** "looks very good, but a touch too bright".

  These are two tuning photos, one call each, with a fixed prompt, and not rated against Local.
  GPT Image 2.5 has no fidelity or exposure parameter (`research.md`, class B), so brightness can
  only be steered through the prompt.

- **OpenAI Zero Data Retention is deferred to deployment (owner decision, 2026-10-30).** The S-19
  comparison sends only CC-licensed benchmark photos, so it runs on the API's default terms: no
  training, up to 30 days' abuse-monitoring retention for `/v1/images/edits`. ZDR is "subject to
  prior approval by OpenAI and acceptance of additional requirements", requested through OpenAI's
  sales team, and does not cover images flagged as potential CSAM
  (https://developers.openai.com/api/docs/guides/your-data#zero-data-retention, read
  2026-10-30). **Deployment condition:** if GPT Image 2.5 passes validation, the owner decides
  between ZDR and the 30-day default before any user photo is sent to OpenAI, and the privacy
  policy states whichever applies.

## Fidelity definition and candidates (owner decisions, 2026-10-31)

Supersedes the 2026-10-30 entry "Class B content change is not a severe regression" above. That
entry stays as history; from 2026-10-31 a confirmed content change **is** a severe regression.

- **Content change (severe regression).** A change of shape, geometry or layout of a recognisable
  element, an added or removed object, or changed lettering. Brightening, denoising, sharpening,
  a more legible face or more visible texture are **not** content changes by themselves. A
  suspected change is recorded as a concrete crop with "original → result"; new sharpness or
  clearer texture alone is not evidence of one. New detail is not automatically counted as
  recovered information either.
- **Stars.** Adding, moving or removing an unambiguously recognisable star is a content change.
  The loss of the faintest points that cannot be told apart from noise is not automatically a
  severe regression. Brightening a star already present in the original is not adding it: before a
  point is called new, the original is checked with a brightened preview at a comparable scale.
  Only concrete, confirmed changes count, not differences of single bright pixels.
- **Lettering.** A severe regression when the result changes recognisable letters, digits or the
  essential stroke layout against the original. Sharper edges and better legibility are not a
  content change. When the original cannot verify the reconstructed letters, the text is marked
  **"unverified reconstruction"**: not automatically a severe regression, but its legibility is
  not grounds for a clear win. Crops are checked, including with a brightened original, and text
  is never confirmed because it looks plausible or forms a sensible word.
- **The existing GPT Image 2.5 outputs** (S17-04, S17-07) did not change shapes in this sense, in
  the owner's judgement. The spread-out flag on S17-04 is **Nano Banana's** output, not GPT's; a
  second-opinion review (GPT-6.1, 2026-10-31, not blind: file names carried model names) and the
  agent's prompt to Codex attributed flag changes to GPT, which is wrong.
- **Candidates.** (1) GPT Image 2.5 as a direct edit. (2) NAFNet denoising followed by a
  deterministic exposure step. Bread is out, with no further tuning. Class C stays excluded. SCI,
  control-light and Nano Banana are not candidates. A tone-only transfer from GPT onto the original
  is a fallback, used only if fidelity problems are documented.
- **NAFNet arms, in order.** (a) NAFNet + Local's gamma, with the Auto value computed from the
  original exactly as for Local and no Gaussian blur. (b) Only if exposure needs improving: one
  deterministic curve that protects highlights and limits lifting a dark sky. (c) The same new
  curve without NAFNet, with Local's existing denoising, to separate the contribution of exposure,
  NAFNet and both. Control arms get identical input preparation and resolution. The current Local
  stays the unchanged reference. Curve parameters are chosen on tuning photos only, and one
  automatic process is frozen before validation.
- **GPT sampling in validation.** For each validation photo, the first technically valid result is
  rated: the file decodes and meets the frozen format and size requirements. Poor quality, a
  content change or unfavourable exposure do not allow regenerating; such a result is rated and
  may be a loss or a severe regression. Retries are allowed only for technical errors, up to a
  limit fixed in advance. Every attempt is logged; a persistent error is reported, not dropped.
  Before validation, three independent calls each on S17-03, S17-04 and S17-07 are rated, all of
  them, without picking the best. Repeated fidelity violations or a wide spread in quality block
  that configuration from validation.

Plan: `plan.md` and `plan-brief.md` in this folder.

## Implementation decisions (2026-10-31)

- 2026-10-31: owner decision — Auto records are "recomputed" from stats sampled in the owner's own Chrome, never claimed as observed applied values; plan.md Phase 1 item 6.
- 2026-10-31: owner decision — GPT size caps (standard ≤ 3,686,400 px, large ≤ 8,294,400 px), documented conservative cost bounds, `max_retries = 1`; plan.md Phase 1 item 3.
- 2026-10-31: owner decision — strict one-line `S19-SPEND` / `S19-VALIDATION` approval records under `## S-19 approvals`, written by the owner only; plan.md Phase 1 item 7.
- 2026-10-31: finding — under those bounds the Phase 3 series (9 standard + 2 large probes + 3 NAFNet) is bounded at $3.40, above the plan's $3 cap, before any retry (`run-candidate.py --dry-run`). Phase 3 needs an owner decision before its spending approval.
- 2026-10-31: cap decision delegated explicitly by the owner — raise the Phase 3 planning cap from $3 to **$4.00**, keeping all 14 frozen slots (9 standard GPT, 2 large probes, 3 NAFNet). Initial bounds: $1.80 + $0.82 + $0.78 = $3.40; the $0.60 remainder is shared technical-retry headroom. At most one technical retry per slot, only when it fits; unresolved costs stay reserved, and the runner stops at the cap without a top-up. The revised standard-branch total is **$12 = $4 + $3 + $5**, above the $0.56 spike spend. This resolves the cap-versus-slots decision; the separate owner-authored spending approval remains pending. No `S19-SPEND` record or paid call was made by this decision.
- 2026-10-31: owner decision — the eight new Local baselines and their Auto records are also committed in `references/s19-local/`, admitted per file under the evidence-image rule; the originals are already in `test-photos/licensed/` and the common inputs reproduce byte-for-byte, so neither is re-committed; references/README.md.

## Plan-review triage (2026-10-31)

The owner requested all recommended fixes from the independent plan review (F1–F10).
The plan and brief now cover positive-consent Phase 7 access across the harness; complete
manifest/attempt/rating evidence; a full selected-config GPT core before extension; cumulative
phase budgets with numeric amendments; a new NAFNet S17-04; common sRGB app baselines and exact
browser Auto records; independent-gain reasons for unverified lettering; valid STOP outcomes and
closure on every terminal branch; and meaningful hash/fixture/scope assertions.

This records acceptance of the documentation corrections only. No paid phase, increased cap or
validation-photo access has been approved by this triage. No experiment steps or Manual Progress
rows are marked complete. Review findings were returned in the conversation, not saved as a
review file. The new gate baselines will use prepared common sRGB files; the historical source-file
Local downloads and spike results remain diagnostic evidence, with their existing records intact.
