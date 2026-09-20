---
change_id: cloud-quality-below-local
title: Cloud AI output is worse than the local engine
status: preparing
created: 2026-08-31
updated: 2026-09-20
archived_at: null
---

## Notes

Reported by the user 2026-08-31 after hands-on trials on production: the Bread
(Cloud AI) results came out **markedly worse than the local Canvas engine**. This
inverts the product's central promise. `idea-notes.md` § Success Criteria states
it as a shipped criterion:

> ✅ Toggle switches between engines seamlessly — **cloud result is noticeably
> better than local**

That criterion is currently false in production.

### Evidence

Three before/after screenshots taken on prod, saved under `references/`:

| File                                    | Scene                   | Observed AFTER                                                               |
| --------------------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `01-wolf-night-overbright-magenta.png`  | wolf on a road at night | blown out to near-white, violet cast; the wolf turns yellow-green            |
| `02-aurora-water-green-to-magenta.png`  | green aurora over water | lower half shifts to **magenta**; visible noise ADDED relative to the source |
| `03-waterfall-aurora-grass-magenta.png` | waterfall under aurora  | green grass turns **magenta**, sky turns cyan                                |

Parameters in each run (Auto ON): gamma `1.50` / strength `0.12`; gamma `1.16` /
`0.08`; gamma `1.24` / `0.09`.

### What the evidence shows

The shared signature is a **hue shift to the complement — green → magenta** —
present in all three, across three different gamma values and three different
strengths. So this is **not** a parameter-tuning problem; parameters vary while
the artifact stays.

Two secondary observations worth keeping:

- In `01`, Auto recommended gamma `1.50`, which is the slider **maximum**. An
  Auto recommendation pinned to the top of the range is suspicious on its own,
  independent of the colour fault.
- In `02`, the AFTER image is **noisier** than the BEFORE. A denoise pass that
  increases noise is failing at its stated job, not merely tuning it badly.

### Candidate causes — RESOLVED 2026-09-20

> **Superseded. Kept verbatim below as the original framing** (what was assumed,
> vs what was found) — see `frame.md` for the investigation.
>
> **The cause is Bread's own output.** The stored raw `result.png` for jobs
> `190832de…` and `3d19146a…` — the pre-post-pass bytes Replicate returned,
> opened straight from Supabase Storage outside the app — is **already magenta**
> and **already blown out**, matching screenshots `02` and `01`. Hypothesis 2
> stands; 1, 3 and 4 are eliminated by measurement. `gamma` > 1 brightens on
> Bread too (its public model page), so we are not driving it backwards.

Recorded as hypotheses to test, deliberately not as findings. This repository has
a documented history of writing unverified causes into records
(`context/archive/2026-06-10-cap-doc-drift/`, and see `lessons.md` on stale
pointers), so the cause belongs to this change's research/framing phase, not to
this note.

1. **The client-side chroma post-pass** (`src/lib/engines/chroma-denoise.ts`,
   `src/lib/services/cloud-result-postprocess.client.ts`, flag
   `CHROMA_POSTPASS_ENABLED`, shipped S-11, flipped ON 2026-06-27). It operates
   in YCbCr, and green↔magenta is what a sign, offset or Cb/Cr-swap error looks
   like. **However**: a first read of the conversion math (BT.601 coefficients,
   `CHROMA_BIAS = 128`, byte planes) showed nothing obviously wrong, and a blur
   does not by itself invert hue. Suspect, not culprit.
2. **Bread itself** — the model output may genuinely be this bad on these inputs.
   Not yet checked against the raw Replicate output.
3. **The Auto parameter recommendation** — a bad gamma cannot explain the hue
   flip, but it can explain `01`'s blow-out.
4. **The encode / colour-management path** — the result is written as
   `result.png`; an ICC or colour-space mismatch between the model output, the
   post-pass canvas and the stored file could shift colour without any maths
   error in the pass itself.

~~**The cheapest discriminator is a flag flip**: `CHROMA_POSTPASS_ENABLED=false`
on one real job.~~ **Not used, and it was neither cheapest nor a discriminator.**
The flag gates the chroma maths _and_ the canvas/JPEG round-trip together, so a
negative result would not have separated them. And it was not needed: result
objects are never reaped (the reaper matches `'%/source.%'` only), so the raw
`result.png` for all three failing jobs was still in storage — free to open, no
prediction, no cap slot. The hoped-for consequence is also gone: **no flag of
ours rolls this back**, because the fault is in the model output.

### Scope note

~~the evidence points at a colour transform somewhere in our own pipeline~~ —
**disproven 2026-09-20.** Entering through the framing step was right, and it
paid: the presumed cause was eliminated by measurement. But the conclusion
inverted. Resisting "make Bread better" was correct **until the cause was
known**, and the cause is the model, so a swap is now a candidate on evidence
rather than an assumption — **S-13 is un-parked as an option, not as a
decision**. What the scope note got right and still holds: this is not a
parameter-tuning change. Two separable tracks now: the model decision, and an
independent delivery gap (~1.5 MP lossy JPEG vs Local's full resolution) that is
entirely ours. Next: `/rune-research`.
