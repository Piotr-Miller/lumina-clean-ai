# Frame Brief: Is the model what keeps Cloud below the bar?

> Framing step before /rune-plan. This document captures what is _actually_ at issue, separated
> from what was initially assumed.

## Reported Observation

Bread on the production Cloud path does not give a result noticeably better than Local:

- S-17 found no reliable Auto rule;
- S17-02 is harmed even at strength 0;
- both exposed validation photos (S17-05, S17-06) were judged unusable by the owner.

Cloud is paused until a comparison reaches ≥ 8/12 clear wins over Local, ≤ 1 moderate loss and 0
severe regressions.

**Observed / inferred**:

- **Observed:**
  - the owner's ratings of Bread outputs against the **original** on the six S-17 tuning photos;
  - the two unusable production results;
  - and, by the owner's report in this session, Local looking better than Bread on at least one
    benchmark photo. That last observation is not recorded anywhere in the repository; which
    photo and which settings are unknown.
- **Inferred:** that Bread is "not noticeably better than **Local**" across the benchmark. No
  Bread-vs-Local rating exists for any s17 photo. Every S-17 rating is against the original
  (`calibration.md` has no mention of Local). Local was only emulated in Python on three web
  photos outside the benchmark (`defaults-experiment.md:423-447`).

## Initial Framing (preserved)

- **User's stated cause or approach**: Decision B (2026-09-28): the model is the limit, so compare
  model candidates on the frozen benchmark. Bread at low gamma and weak denoise stays one
  candidate (`context/archive/2026-08-31-cloud-quality-below-local/change.md:248-263`).
- **User's proposed direction**: survey four candidate classes (A restoration, B generative
  editing, C commercial photo APIs, D a vision model as Auto), run feasibility tests on tuning
  photos, pick one finalist on tuning, and send only it to the 12-photo holdout against the real
  Local (`temp_steps.md`, steps 2–6).
  - Added in this session: use TypeSafe Jev as a gate ("is the picture already good, or should it
    still be corrected"), or as the Auto parameter chooser.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Model capacity / objective** — Bread's output is the ceiling. At its best tried setting it
   still harms or barely helps, so another model is needed. ← initial framing
2. **Reachable parameter range and per-photo choice** — Bread helps at photo-specific settings
   that production cannot reach, and Auto picks harmful ones.
3. **Bar reachability on this benchmark** — the validation set contains designed no-harm controls
   where a tie is expected. That leaves ≥ 8 clear wins to come from the remaining photos, for any
   candidate.
4. **The comparator is unmeasured** — the bar is a win over the real Local, and Local has never
   been run on the benchmark.
5. **Input colour handling (surfaced by the pressure test)** — wide-gamut inputs are sent to
   Cloud as raw bytes. If a candidate ignores the embedded ICC profile, it starts from a
   desaturated or tone-shifted image while Local's canvas colour-manages.

## Hypothesis Investigation

| Hypothesis                                               | Falsifier (what would kill it)                                                                                                                                                                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                             | Verdict                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Model capacity: Bread's best tried output still loses | Photos where a tried Bread setting gave a clear, owner-accepted gain. **Found**: S17-01 at 0.5/0.05 and S17-07 at 0.5–0.9 are improvements (`calibration.md:595, 599, 612`)                                                                           | S17-02 is harm at its best setting, 0.5/0.0, smoothing that stays at the strength floor (`calibration.md:709, 727-728`). Gains on S17-03 and S17-21 are small. S17-04 needed nothing (`calibration.md:622-623`). Pressure test: Bread is a Retinex low-light→normal-light model with no black-point anchor, so it lifts correctly dark skies (`research.md:72-131`, archive). 3 of 6 tuning photos have no acceptable value at strength 0.05         | **WEAK** — real on 1–3 photos, falsified on 2                                                                                                          |
| 2. Reachable range and per-photo choice                  | Best settings equal to what Auto gives, or no acceptable setting anywhere. Second arm absent: Auto was harm on 6/6 (`calibration.md:233`). First arm present on S17-02 (and S17-04 by A2's rule)                                                      | Production floors gamma at 1.0 (`src/lib/engines/auto-params.ts:25`, `src/lib/services/photo-job.schema.ts:31`). Every acceptable setting found is gamma 0.5–0.9, or strength 0.0 for S17-21. At gamma ≥ 1.0 every tuning photo is harm (`calibration.md:462-465`). The exposed S17-05 and S17-06 ran at 1.5 and 1.0 (`change.md` § Holdout exposure)                                                                                                | **STRONG** for why the production path fails. It does not show Bread can pass the bar: ideal choice gives 4/6 gains, 2 small (archive `change.md:261`) |
| 3. Bar reachability                                      | Bar or plan text that counts controls as winnable, or a composition without controls. **Not found**: `photo-candidates.md:55` says controls "may legitimately produce ties"; `plan.md:66` example: "8 clear wins + 1 moderate loss + 3 ties → passes" | Validation controls: S17-10, S17-18 ("no-harm case" in the manifest) and S17-24 (replaces S17-06's no-harm role). S17-17 warns against shadow lift, and S17-12/19/20/22 are already edited. With 3 ties, ≥ 8 wins must come from 9 photos. The owner is not sure how controls were weighed when 8/12 was set (Step 4)                                                                                                                                | **STRONG** as a structural fact about any candidate                                                                                                    |
| 4. Comparator unmeasured                                 | Any Local-vs-Cloud rating on an s17 photo in the repository. **Not found**                                                                                                                                                                            | `calibration.md`: 0 mentions of Local. Local emulated in Python only, on 3 non-benchmark photos (`defaults-experiment.md:423`). The owner reports having seen Local look better than Bread on a benchmark photo; this is unrecorded (Step 4)                                                                                                                                                                                                         | **STRONG**                                                                                                                                             |
| 5. Input colour handling                                 | Candidates that colour-manage inputs, or no wide-gamut inputs in the set. **Not established**: Bread's predictor source was not read, and the stored S-17 outputs are on the Linux machine (`test-photos/private/` is absent here)                    | Embedded profiles: S17-02 and S17-04 Display P3, S17-03 ProPhoto, S17-07/08/21 Adobe RGB. Ignoring the profile lowers mean saturation from 0.547 to 0.406 on S17-03 (and mean V from 0.303 to 0.248), 0.736→0.600 on S17-07, 0.855→0.636 on S17-08 and 0.694→0.569 on S17-21; S17-02 only 0.232→0.208 (measured this session, quarter-scale decode). The upload path redraws only EXIF-rotated photos (`src/lib/services/cloud-upload.client.ts:82`) | **WEAK**: the size of the confound is measured, whether it happens is not. It does not explain S17-02                                                  |

## Narrowing Signals

- **Local looked better than Bread on a benchmark photo** (owner, Step 4). This confirms the
  comparator is a real competitor, and that the evidence for it exists only in memory.
- **How the controls count toward 8/12: not sure** (owner, Step 4). Whether a control can be a
  clear win is undecided, which keeps dimension 3 open as a bar question, not a model question.
- The owner added Jev in two roles: a gate that answers "already good, or still to be corrected",
  and an Auto chooser. Both sit on dimension 2 (choosing per photo, including "leave untouched").
  The `research.md` Jev section records that its image mode fails S1 today ("aren't yet up to our
  standards to call ready for production").

## Cross-System Convention

A model swap is normally judged against the incumbent and the user-facing alternative on a fixed
set, with the bar's feasibility known before candidates are tuned. Here the incumbent (Bread) was
rated only against the original, and the alternative (Local) not at all. The usual first step,
measuring the baseline the bar is defined against, is missing.

The leading reading fits the convention only partly. The model question is real, and dimension 1
is not dead, but it sits on two unmeasured terms.

## Discriminator Check

| Proposed experiment                                                                                          | Separates                                                                                           | Conflates                                                                                                                                                                             | Cost (money / irreversible / wait)                                                                                        | Already answered by                                                                                               |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Feasibility calls per candidate (`research.md`, ≈ $1.1 total)                                                | Vendor facts per candidate: output size, token use, latency. No dimension of the map                | Nothing on the map: it moves no quality dimension                                                                                                                                     | ≈ $1.1 / reversible / minutes, plus sign-ups (Deep-Image, TypeSafe key)                                                   | Partly: `research.md` documents everything except those three facts                                               |
| Tuning → one finalist → holdout vs real Local (`temp_steps.md` step 6)                                       | Pass or fail of the bar for that finalist                                                           | **1 with 3** (a fail cannot say "model too weak" from "bar unreachable on controls") and **1 with 5** (a candidate that ignores ICC loses on wide-gamut inputs for a pipeline reason) | Unknown per candidate / **irreversible: the holdout can be opened once** / owner rating time                              | Nothing found                                                                                                     |
| Bread at low gamma / weak denoise as a candidate (`change.md` Notes)                                         | 1 vs 2 for Bread: a pass at sub-1.0 settings puts the limit on range, not model                     | **2 with 5** on the wide-gamut tuning photos                                                                                                                                          | ≈ $0.0006 per run / reversible / minutes; needs the harness path, since production rejects gamma < 1.0                    | Partly: `calibration.md` holds owner ratings for 0.5–1.5 on all six tuning photos, against the original only      |
| ICC check (pressure test): compare stored Bread outputs with each input decoded with and without its profile | 5 present / absent for Bread                                                                        | Nothing                                                                                                                                                                               | $0 if the S-17 outputs on the Linux machine are used; otherwise one Bread run on S17-03, ≈ $0.0006 / reversible / minutes | Partly: the size of the shift is measured above; whether Bread applies the profile is not                         |
| Jev as gate or Auto chooser (owner, this session)                                                            | Whether its "needs correction" answers and choices match the owner's per-photo labels (dimension 2) | **Jev's image-mode quality with the chooser idea**: a poor answer cannot say "choosing per photo does not help" from "Jev's preview image mode is not good enough"                    | ≈ $0.0003 per photo (third-party figure) / reversible / minutes; needs a TypeSafe key                                     | Partly: `calibration.md` has the owner's per-photo labels (e.g. S17-04 "needed no correction") to compare against |

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: S-19 has to show a clear win over the real Local engine
> on ≥ 8 of 12 photos, three of which are controls where a tie is expected. Neither Local's result
> on these photos nor a colour-fair input to every candidate has been established, so a candidate
> comparison alone cannot tell "the model is too weak" apart from "the bar cannot be met here".

The initial framing holds in part. Bread's objective, lifting dark regions with no black-point
anchor, is a real limit on some photos, and model choice remains a live question. But the
production failure itself is explained mostly by the reachable range: gamma is floored at 1.0,
where every tuning photo is harmed. The comparison's success also depends on two terms that are
measured nowhere: Local on the benchmark, and how controls count. Addressing them first changes
what a holdout result would mean. Without them, a fail is ambiguous, and the holdout can be
spent only once.

## Confidence

- **MEDIUM** — dimensions 2–4 rest on repository evidence and an owner report. Dimension 1 is
  partly falsified, and dimension 5 is measured in size but not in occurrence.

Verification steps before /rune-plan:

- Run the real Local engine (its own Auto, in the app) on the eight `s17-v2` tuning photos and
  store the downloads — Actor: either.
- Rate Local against the original and against the stored best Bread outputs on those photos —
  Actor: user.
- Decide how the three validation controls count toward 8/12 (winnable, or tie-only with the
  threshold restated), recorded before any tuning — Actor: user.
- Copy the stored S-17 Bread outputs from the Linux machine's `test-photos/private/` to this
  machine — Actor: user.
- Run the ICC comparison on those outputs for S17-03, S17-07 and S17-21 — Actor: agent.

## What Changes for /rune-plan

The plan has to start from the baseline: measure Local and fix the controls rule before any
candidate is tuned. It also has to give every candidate a colour-managed (sRGB) input, so the
comparison is fair. The candidate shortlist then follows from `research.md`, and Jev is one
class-D option with an S1 caveat. The finalist-to-holdout step stays one-shot.

## References

- Source files:
  - `src/lib/engines/auto-params.ts:25`;
  - `src/lib/services/photo-job.schema.ts:31`;
  - `src/lib/services/cloud-upload.client.ts:82`;
  - `context/archive/2026-08-31-cloud-quality-below-local/{calibration.md, change.md, quality-bar.md, photo-candidates.md:55, plan.md:66, defaults-experiment.md:423-447, research.md:72-131}`;
  - `test-photos/s17-benchmark-v2.json`.
- Related research: `context/changes/cloud-model-comparison/research.md` (vendor spike, classes
  A–D and Jev).
- Investigation:
  - Dimensions 1 and 2 were delegated; each spans the rating tables of `calibration.md`.
  - Dimensions 3 and 4 were narrow, each answered by one document (`quality-bar.md` with
    `photo-candidates.md`; `calibration.md` with `defaults-experiment.md`), and were checked in
    this session.
  - Dimension 5 came from the pressure test and was measured in this session with a scratch
    Pillow script.
- Pressure test:
  - The independent search ran, with this prompt as sent: "Observation: Bread on the production
    Cloud path does not give a result noticeably better than Local: S-17 found no reliable Auto
    rule, S17-02 is harmed even at strength 0, and both exposed validation photos (S17-05, S17-06)
    were judged unusable by the owner. Cloud is paused until a comparison reaches ≥ 8/12 clear
    wins over Local, ≤ 1 moderate loss, 0 severe regressions. / Surface: the repository root,
    C:\Source\Trainings\AI\10xDevs\LuminaClean_AI / What in this system or design space is most
    likely responsible? Look without preconception. / Shell: do not pipe a search into head, tail
    or grep -v; print the command's exit status before you use its output, and capture the output
    to a file first when you are allowed to write files."
  - It led with the model's objective, which strengthens dimension 1. It confirmed the range
    (dimension 2) and the bar (dimension 3), and surfaced dimension 5.
  - The prior-occurrence search found that input ICC handling was never examined in S-17; the
    archived frame's colour dimension covered only the delivery post-pass.
- Lessons applied: 4 of 39 entries apply to `frame`. Two shaped this brief: "A change's own cited
  evidence can be defective" (check that the corpus varies what the claim is about) and "Count what
  an author would fix" (measure where the value can exist).
