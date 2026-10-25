# Frame Brief: Cloud AI returns EXIF-rotated phone photos sideways

> Framing step before /rune-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

A phone photo stored with EXIF orientation 6 — S17-06, `test-photos/licensed/06-phone-rain-galaxys24ultra.jpg`,
stored 5712 × 4284, displays as a portrait 4284 × 5712 — came back from a direct Bread run
(`ebme649xrsrgc0d0wjv857kkrw`, gamma 1 / strength 0.05) as a 1536 × 1152 landscape PNG with its
content lying on its side, matching the stored bytes, not the displayed photo.

**Observed / inferred**: The sideways model output is **observed**. It was seen in S-17's thumbnail
comparison, and this frame looked at it again (source shown upright, output rotated 90°, no EXIF in
the PNG). That **the app** shows a sideways result for such a photo is **inferred**: no in-app job
has run on an orientation-6/8 photo (`change.md`: "not yet observed in the app").

## Initial Framing (preserved)

- **User's stated cause or approach**: "Cloud AI ignores EXIF orientation: Bread returns phone photos
  stored with orientation 6/8 rotated 90°." The Cloud upload PUTs the original bytes
  (`cloud-upload.client.ts:87-91`), "so production is very likely affected".
- **User's proposed direction**: Fix it as its own change and get the fix into production. The
  original gate was S-17 Phase 5. No fix location is named.

## Dimension Map

The sideways result could originate at any link of the Cloud path. The links are steps in one chain,
not competing explanations:

1. **Model input**: the bytes Bread receives keep stored-orientation pixels plus an orientation tag.
   This would break if nothing between file pick and Replicate applies the tag.
2. **Model**: Bread does not apply the tag when it decodes. ← initial framing
3. **App result path**: nothing after the model rotates the result back. Meanwhile the BEFORE pane
   is decoded by the browser, which _does_ apply the tag. The result would then disagree with the
   BEFORE and come out sideways in Download.

## Hypothesis Investigation

| Hypothesis                                            | Falsifier (what would kill it)                                                                                                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Verdict                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1. Model input keeps stored orientation               | Any re-encode, canvas pass or orientation normalisation between file pick and `PUT`, or a Storage transform on the signed read URL. **Not found.** | `useCloudSubmit.ts:53` passes the picked `File` straight to `submitCloudJob`, and `cloud-upload.client.ts:87-91` PUTs it as `body: file`. The Edge Function signs the raw object (`supabase/functions/enhance/index.ts:315-332` → `photo-job.service.ts:620`, plain `createSignedUrl`, no transform option). A repo-wide search finds no `exif`/`orientation` handling in `src/` or `supabase/functions/`. The S-17 plan already said so (`context/archive/2026-08-31-cloud-quality-below-local/plan.md:35-38`).                                                                                                                                                                                                                                     | STRONG                                   |
| 2. Bread ignores the tag (initial framing)            | An output in portrait shape or with upright content. **Not found.**                                                                                | `ebme649x-g1-s0.05.png` is 1536 × 1152 and carries no EXIF; its thumbnail shows the scene rotated 90° like the stored bytes. The source with the tag applied is upright portrait. The run's input sha256 `660535e3…` is the licensed file. Its transport was Replicate upload, not a signed Storage URL, but the bytes are identical (dimension 1). Calibration log § EXIF probe (R2), `context/archive/2026-08-31-cloud-quality-below-local/calibration.md:244-260`.                                                                                                                                                                                                                                                                                | STRONG                                   |
| 3. Nothing downstream corrects it, and BEFORE ≠ AFTER | Any rotation of the result after the model: CSS transform, canvas rotate, re-attached tag. **Not found.**                                          | `loadCloudResult` decodes the result with `new Image()` and takes `naturalWidth/Height` (`cloud-result.client.ts:29-35`). The post-pass decodes the result PNG with `createImageBitmap` (`cloud-result-postprocess.client.ts:48`), and a PNG with no tag stays sideways. The slider box takes the **result's** dimensions (`EnhanceWorkspace.tsx:366-372`). Both panes are `object-cover` (`BeforeAfterSlider.tsx:101,109`). The BEFORE is the object URL of the original file, which the browser shows with the tag applied (the repo's own note at `scripts/s17/decode-inputs.py:17` relies on this). Predicted in-app picture for S17-06: a landscape box, an upright BEFORE cropped to a centre band, a sideways AFTER, and a sideways Download. | STRONG (code-traced; not run in the app) |

## Narrowing Signals

Step 4 asked nothing, under exit **(b)**: no question you could answer from memory would change the
ranking. All three links are read from code and from the stored probe output, and nothing you
remember could add or remove a link.

- The Local path reads the same file through `new Image()` → `drawImage` (`useLocalEnhance.ts:27`,
  `local-engine.ts:46`), so the browser applies the tag there. The defect is **Cloud-only**.
- Auto parameters are sampled from the browser-decoded image (`auto-params.client.ts:40`). They are
  luma statistics, which do not depend on orientation.

## Cross-System Convention

The usual handling for this class of defect is to normalise orientation **once, at a boundary we
own**, so every consumer sees display-orientation pixels. Image pipelines generally do not rely on a
downstream model or service to honour EXIF, because many decoders (PIL without `exif_transpose`,
for example) do not. This frame does not pick where that boundary sits; that is a plan decision.

Two project facts make the defect model-independent:

- S-19 (`cloud-model-comparison`, #271) may swap Bread for another model. It lists this change as a
  precondition for in-app runs of phone photos (`context/changes/cloud-model-comparison/change.md:30`,
  `context/foundation/roadmap.md:339`).
- Whether a future model honours the tag is unknown, so it cannot be assumed.

**Prior occurrences.** None, apart from S-17's own pre-registration and probe. A search of
`context/`, the git log and the issues found nothing earlier.

**Stale pointer.** `change.md` says "S-17 Phase 5 waits until the fix is live". S-17 has since
closed: it was archived with decision B on 2026-09-28. The live dependants are now S-19 and any
in-app phone-photo run.

## Discriminator Check

No proposed experiment.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the Cloud path hands the model stored-orientation pixels
> and shows the result next to a display-orientation BEFORE. Nothing in our pipeline reconciles the
> two, so any orientation-5–8 photo comes back sideways (or mirrored) in the slider and in Download.

The initial framing was correct about the cause: Bread does ignore EXIF, and the evidence holds when
you look at it. The sharpening concerns where the defect lives. It belongs to our Cloud-path
orientation contract, not to Bread alone: the same defect would survive a model swap (S-19) unless
the model happens to honour the tag. A fix has to make the model input, the AFTER pane, the BEFORE
pane and the Download agree on one orientation.

## Confidence

**HIGH** — every link is STRONG, with no falsifier found:

- the model link was observed directly;
- the input and result links are traced in code;
- the convention agrees.

The only inferred part is how the defect looks in the app. That is a check the plan's own
verification should cover on S17-06, not a blocker before planning.

## What Changes for /rune-plan

Plan around the Cloud path's orientation contract, not around Bread:

- choose the one boundary where orientation is normalised;
- make the model input, the BEFORE, the AFTER and the Download agree;
- cover orientations 2–8, the mirrored ones included, without affecting orientation-1 inputs or the
  Local path;
- verify on S17-06 in the app.

Point the downstream gate at S-19 and in-app phone-photo runs, not the closed S-17 Phase 5.

## References

- Source files: `src/lib/services/cloud-upload.client.ts:87-91`,
  `src/components/hooks/useCloudSubmit.ts:53`, `supabase/functions/enhance/index.ts:315-332`,
  `src/lib/services/photo-job.service.ts:615-623`, `src/lib/services/cloud-result.client.ts:29-35`,
  `src/lib/services/cloud-result-postprocess.client.ts:48`,
  `src/components/enhance/EnhanceWorkspace.tsx:366-372`,
  `src/components/enhance/BeforeAfterSlider.tsx:76-109`, `src/components/hooks/useLocalEnhance.ts:27`,
  `src/lib/engines/local-engine.ts:46`.
- Evidence: `context/archive/2026-08-31-cloud-quality-below-local/calibration.md:67-85` (R2
  pre-registration), `:244-260` (result); output
  `test-photos/private/s17/direct/phase2/ebme649x-g1-s0.05.png` (gitignored) and its `.json` run
  record.
- Related: `context/archive/2026-08-31-cloud-quality-below-local/plan.md:35-38,74,101`;
  `context/changes/cloud-model-comparison/change.md:30`; `context/foundation/roadmap.md:339`.
- Lessons applied: 2 of 4 frame-applicable entries in `context/foundation/lessons.md` (39 in all).
  - _A change's own cited evidence can be defective_: this frame looked at the probe output again
    instead of taking it on trust.
  - _A fixture that fails to reproduce…_: S17-06 is the reproducing artifact to start from.
  - The other two (Astro dev routing; reviewer-value corpora) do not bear on this.
- Investigation: all three dimensions were investigated in this session. Each is narrow: one call
  chain or one stored output confirms or kills it.
- Pressure test:
  - **Ran**: prior occurrences (none earlier than S-17); the inverse check (the Local path and Auto
    sampling apply the tag, so the defect is Cloud-only, as predicted); a sanity check against the
    initial framing (it holds).
  - **Skipped**: the independent search, because the investigation confirmed the initial framing
    rather than redirecting it.
