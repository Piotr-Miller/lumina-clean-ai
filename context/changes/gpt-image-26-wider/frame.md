# Frame Brief: Is a wider GPT-Image-2.6 comparison the right next step?

> Framing step before /rune-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

The screen `gpt-image-26-screen` (#359) ended **PASS**: 4 of 6 pairs were at least a fidelity tie
with real Local (`context/archive/2026-11-05-gpt-image-26-screen/evaluations/verdict.md:3`).
All six GPT outputs were rated `minor` (`drobna`). The owner's own reasons for those same outputs
(`verdict.md:42-47`) describe:

- faces redrawn into different people ("to już inne osoby");
- an invented legible neon sign ("BARGAIN BOOKS");
- an invented flag;
- most faint stars erased;
- the aurora's green cast neutralised.

**Observed / inferred**: the ratings, the reasons and the PASS are observed (committed files). The
claim that "the PASS opens a wider comparison" is a rule pre-registered before the run
(`change.md` of the screen, § Owner decisions). Whether 2.6 at `complexity=low` is as faithful as
Local is inferred from those labels.

## Initial Framing (preserved)

- **User's stated cause or approach**: the screen passed its pre-registered gate, so per that gate
  the next step is a wider comparison on all eight tuning photos (`temp_steps.md` step 7, and the
  change name `gpt-image-26-wider`).
- **User's proposed direction**: open `gpt-image-26-wider` and run the wider comparison, presumably
  reusing `scripts/gpt26/` and the same gate.

## Dimension Map

The observation (a PASS alongside reasons that describe invented content) could originate at:

1. **Model behaviour.** 2.6 at `complexity=low` really is about as faithful as Local on these
   scenes, and the reasons describe defects too small to matter. ← initial framing
2. **Measurement instrument.** The fidelity scale and the gate cannot express what the reasons
   describe, so the labels and the verdict diverge from the evidence written next to them.

## Hypothesis Investigation

| Hypothesis                                                      | Falsifier (what would kill it)                                                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Verdict                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1. Model: 2.6 at `low` is about as faithful as Local            | 2.6's reasons describe the same content changes that made Local "clearly" more faithful in S-19                             | **Falsifier found.** S-19 phase 5 on the same three scenes recorded overdrawn flag, faces, letters, changed faint stars and a neutralised green cast, and rated Local clearly more faithful 8/8 (`context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-tuning.md:44-58`). The 2.6 reasons list the same classes (`verdict.md:42-47`). The instrument changed (S-19 used a relative preference; this screen used absolute levels per side), so the data cannot show an improvement.                                                                | NONE (as an explanation of the PASS) |
| 2. Instrument: the scale and gate cannot carry invented content | A written rubric that maps invented identity, text or objects to a level, or a gate that checks reasons or crops on `minor` | **Falsifier absent.** Levels are only an order, `none < minor < significant < severe` (`scripts/gpt26/configs/gpt26-low.json:117`). The viewer asks only "Co zostało utracone wobec oryginału?" (`references/compare-gpt26.html:1003`). Evidence is required only at `significant`/`severe` (`compare-gpt26.html:367`, `scripts/gpt26/gate.py:328`), so `minor` costs nothing. The gate reads labels only (`gate.py:26-28`). The four ties are all `minor` vs `minor`, with the Local side carrying no reason or crop (`ratings.json`, pairs p01, p02, p03, p05). | STRONG                               |

## Narrowing Signals

- The owner was asked what "drobna" meant for the six GPT outputs. **Answer: "Small area / at this
  size".** The rating judged the extent or visibility of a change, not its kind. The scale has one
  axis, so a changed identity in a small crop and mild smoothing get the same label. This rules
  dimension 2 in. It does not make the labels wrong under the rules as written.

## Cross-System Convention

- **The project's own precedent is relative judgement.** S-19 phase 5 compared fidelity pairwise
  ("Local clearly" more faithful) and separated aesthetics from fidelity (`phase5-tuning.md:44`).
  On the same scenes and the same classes of defect it reached the opposite conclusion.
- **Lesson `lessons.md:215` applies.** It records a structural constraint that was only as strong
  as the vocabulary actually selected: the prose describes the defect and the label contradicts it.
- **Lesson `lessons.md:258` applies.** A change's own cited evidence (here, the PASS) can be
  defective. Measure the premise before building on it, and check that the corpus varies what the
  claim is about.

## Discriminator Check

| Proposed experiment                                                                             | Separates                                                                                                 | Conflates                                                                                   | Cost (money / irreversible / wait)                                                                                                                                        | Already answered by                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wider paid comparison on all eight tuning photos, same gate and viewer                          | Whether the other five photos produce a GPT `significant`/`severe` label under the same unanchored scale  | Model behaviour **with** rater calibration of the unchanged instrument (dimension 1 with 2) | Money: ~$1.30 estimated (16 × ~$0.08 from the screen's $0.4843 / 6); exact 2.6 token use unknown. Irreversible: the spend. Wait: one run session plus one rating session. | Partly: the screen's six stored outputs and reasons already show that 2.6 at `low` invents faces, text and objects on these scenes (cost $0, already paid). They do not say whether that counts as `significant` under any rule. |
| Re-rate the six stored outputs under an anchored scale (suggested in-session before this frame) | Whether the PASS survives once invented content has a defined level (dimension 2 alone; model held fixed) | Nothing on the model side. The repeated-Local recognition risk from the screen remains.     | Money: $0. Irreversible: none. The sealed verdict stays as is; a re-rating is a new, separate record. Wait: one rating session.                                           | Nothing found.                                                                                                                                                                                                                   |

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the fidelity instrument has no level for invented content,
> so its labels and gate cannot show whether GPT-Image-2.6 is as faithful as Local, and a wider
> run on the same instrument would measure the instrument as much as the model.

The screen's PASS is valid under its pre-registered rules and stays sealed. What it does not
support is the premise of this change: that 2.6 at `low` has earned a wider fidelity comparison.
The rater judged by area, and the only things that came out as differences were the Local sides
rated `none`. Defining what invented identity, text, objects or erased stars count as (by kind, not
only by extent) is the question the plan has to answer before any spend. There is also a product
question no measurement settles: whether an output that changes who is in a photo is acceptable
for a denoising app at all.

## Confidence

**HIGH.** The evidence is strong. The independent search reached the same explanation from the bare
observation. The narrowing answer ("small area / at this size") was decisive.

## What Changes for /rune-plan

The plan should be about the fidelity instrument and the product decision first:

- how invented or altered content is classified;
- what evidence any non-`none` level needs;
- whether the tie rule survives coarse labels.

Only after that should it decide whether a paid run on eight photos is still worth it.

## References

- Source files:
  - `context/archive/2026-11-05-gpt-image-26-screen/evaluations/verdict.md:3,23-28,42-47`
  - `.../evaluations/ratings.json`
  - `.../references/compare-gpt26.html:366-367,984,1003`
  - `scripts/gpt26/gate.py:26-28,328`
  - `scripts/gpt26/configs/gpt26-low.json:54,117`
  - `context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-tuning.md:44-58`
- Lessons applied: 4 of 40 entries are tagged frame (`lessons.md:40`, `:166`, `:258`, `:272`). `:258` and `:272` shaped the map. `:40` and `:166` were not relevant. `:215` was
  cited for its content though it is not frame-tagged.
- Investigation: both hypotheses were checked directly, not delegated.
- Pressure test: an independent search agent was given only the verbatim observation and the repo
  root. It landed on the same explanation: labels only, no anchors, loss-only wording, and ties from
  reasonless Local `minor`. A prior-occurrence check found S-19 phase 5. The original framing was
  re-checked: it holds only as "the gate passed", not as "2.6 is as faithful as Local".
