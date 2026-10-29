---
change_id: cloud-model-comparison
title: Compare Cloud AI model candidates on the s17-v1 benchmark
status: preparing
created: 2026-09-28
updated: 2026-10-29
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

  Local's own Auto values on that run (outputs are reproducible from the licensed input and these
  two numbers):

  | Photo  |   Auto gamma |    Auto blur |
  | ------ | -----------: | -----------: |
  | S17-01 |         1.56 |          0.2 |
  | S17-02 |         1.05 |          0.2 |
  | S17-03 |         1.19 |          0.2 |
  | S17-04 |         1.10 |          0.1 |
  | S17-05 |         1.67 |          0.3 |
  | S17-06 |         1.00 |          0.1 |
  | S17-07 |         1.80 |          0.7 |
  | S17-21 | not recorded | not recorded |
