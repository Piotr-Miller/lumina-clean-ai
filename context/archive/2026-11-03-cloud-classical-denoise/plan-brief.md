# S-20 Step 1a (NLM) — Plan Brief

> Full plan: `context/changes/cloud-classical-denoise/plan.md` (revised 2026-11-05 after review)
> Change: `context/changes/cloud-classical-denoise/change.md` (§ Owner decisions 2026-11-03 and 2026-11-05)
> Review: `context/changes/cloud-classical-denoise/reviews/plan-review.md` (round 1 RETHINK F1–F10, re-review 2 REVISE F11–F14; all addressed in the plan, pending a confirming round)

## What & Why

S-19 found no Cloud model that beats the real Local engine without losing scene information.
S-20 asks whether the Cloud path can instead be a classical, deterministic, full-resolution
pipeline. Step 1a tests whether OpenCV's NLM, applied before Local's Auto gamma, looks better than
Auto gamma alone on the eight tuning photos. It must do so without losing detail, structure or
colour that the original confirms.

## Starting Point

The S-19 harness provides prepared inputs, Auto records, the holdout guard and an arm renderer
that uses the app's own gamma. What is missing:

- **A matched full-resolution control.** The old `control` arm is downscaled on 5 of 8 photos,
  and the common input is a JPEG with ICC that two decoders could read differently.
- **A blind viewer that asks about fidelity.** S-19's uses `Math.random()` and keeps identities
  in the browser.
- **A committed sealed-key builder.**
- **A gate able to score free arms on two axes.**

## Desired End State

The owner has made two blind ratings: a pilot that froze one global strength, and a 16-pair
gate. A PASS or FAIL verdict with a decoded per-photo table sits in `evaluations/step1-gate.md`. A
BLOCKED result has no decoded table: it lists anonymous ids until the evidence is resolved. A metadata-only audit bundle (keys, manifests, records, no images)
lets a checkout re-derive it. Every pointer to S-20's state links there.

## Key Decisions Made

| Decision           | Choice                                                                                                                                                                      | Why                                                                                                         | Source                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Gate               | ≥ 6/8 NLM wins over the control, ties are not wins; zero significant or severe fidelity loss                                                                                | Blocks a repeat of S-19's GPT outcome                                                                       | change.md 2026-11-03                |
| Control            | `control-full` and `nlm-gamma` start from **one shared sharp decode**; records bind decoded-pixel, Auto-file and LUT hashes, compared across arms                           | The denoiser is the only difference, and this is checked, not assumed                                       | Plan + review F9                    |
| Gate code          | A separate `scripts/s20/gate.py`; `tally.py` unchanged                                                                                                                      | Keeps S-19's paid-slot invariants intact                                                                    | Owner 2026-11-05                    |
| Verdicts           | PASS / FAIL / BLOCKED; BLOCKED first, leaking no identity on any output channel                                                                                             | Incomplete or uncertain evidence never reads as a result                                                    | Owner 2026-11-05 + review F7        |
| Fidelity per photo | Worst substantiated NLM loss across both pairs; any `uncertain` blocks                                                                                                      | A loss seen once is a loss; resolving only one side would un-blind                                          | Owner 2026-11-05                    |
| Order              | Seals and the freeze are write-once and clean; each strictly precedes every commit of what depends on it; the gate builder recomputes `k`; PRs with seals are rebase-merged | Catches mistakes and post-result substitution; "nobody looked early" stays a human control                  | Owner 2026-11-05 (review F1)        |
| Blinding           | Every rater-facing image re-encoded as metadata-free PNG from decoded pixels; set digest over a canonical payload; storage keyed by set digest                              | Removes file-type, size-by-copy and stale-state channels; recognising repeated content stays a stated limit | Review F2, F6, F7                   |
| Grid               | σ̂_L and σ̂_ab in OpenCV's own `COLOR_LBGR2Lab` space; h = k·σ̂_L, hColor = k·σ̂_ab; k ∈ {1.0, 1.5, 2.0}; windows 7/21; synthetic calibration before freezing                   | Strengths are noise-relative in the channels the filter actually smooths                                    | Owner 2026-11-05 (review F8) + Plan |
| Tuning             | A blind pilot picks one global `k` (most votes; a tie goes to the weaker; `none` is no vote; all `none` = STOP), frozen before the gate                                     | One constant, no picking the best after the gate                                                            | Owner 2026-11-05                    |
| Guards             | `require_access` + `check_paths` on every resolved path before any read                                                                                                     | Ids alone do not stop a path or symlink into the holdout                                                    | Review F3                           |

## Scope

**In scope:**

- the shared decode, the two arms, the NLM tool, grid and calibration;
- the blind builder, sealed keys and viewer;
- the evidence-order helper, the pilot and gate rules;
- one pilot run and one gate run;
- the audit bundle and pointers.

**Out of scope:**

- BM3D (1b), tone mapping, chooser, timing guardrail, hosting;
- the holdout, paid calls, publishing any image (including S17-01's JPEG);
- `tally.py` and `protocol.py` repairs, #359 features;
- any app or Local change.

## Phases at a Glance

| Phase                             | What it delivers                                                                             | Key risk                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0. Premise and environment        | OpenCV installed, sizes and baselines checked (7 archived + S17-01 private), one timed probe | The install needs the owner (`sudo`)                      |
| 1. Shared decode and matched arms | `decoded`, `control-full`, `nlm-gamma` with cross-arm bindings, identity-denoiser test       | tsx tests need a short `TMPDIR`                           |
| 2. NLM tool, grid and calibration | Renderer, Lab-space estimator, calibration record, committed grid                            | Calibration may force a grid revision (allowed only here) |
| 3. Blind sets and viewer          | Re-encoded presentation copies, canonical set digest, identity-free viewer and state         | The viewer is the largest piece of work                   |
| 4. Evidence state, pilot, gate    | `evidence.py`, `pilot.py`, `gate.py`, one test per definition and per review walkthrough row | A corner case coded differently from the decision         |
| 5. Pilot run and freeze           | 24 renders, sealed blind pilot, frozen `k` or STOP                                           | CPU render time on 15–25 MP                               |
| 6. Gate run and verdict           | Sealed 16-pair gate, verdict, audit bundle, pointer set                                      | BLOCKED rounds while resolving `uncertain`                |

**Prerequisites:** the owner installs `python3-opencv`. Inputs and Auto records are already in
`test-photos/private/s19/`.

**Estimated effort:** about 4–5 implementation sessions for Phases 0–4, plus two owner rating
sessions: 8 choices, then 16 pairs.

## Open Risks & Assumptions

- The grid is a bounded hypothesis. If no strength is preferred, the pilot returns STOP and the
  next step is the BM3D decision, not a retune.
- One global σ̂ per photo may under-denoise shadows. Adaptivity belongs to step 3.
- In the gate, the owner sees the frozen-`k` renders a second time (after the pilot), and the
  same NLM output appears in both of a photo's pairs. Blinding cannot hide repeated visible
  content. The holdout (step 4) is the real generalisation test.
- A PASS only lets the experiment continue. It is not a product claim.

## Success Criteria (Summary)

- A PASS, FAIL or BLOCKED verdict reproduced from committed evidence, with each rule sealed before
  the result it governs was seen.
- On PASS: the free/paid conversation, then step 2. On FAIL or STOP: the BM3D licence decision.

---

# S-20 Step 1b (wavelet BayesShrink) — Plan Brief

> Full plan: `context/changes/cloud-classical-denoise/plan.md` § Step 1b, Phases 7–12
> Decision record: `change.md` § Owner decisions (2026-11-09, step 1b candidate)

## What & Why

1a's NLM failed its gate (3 of 8 wins, five ties, a significant star/aurora-edge loss on
S17-03). Both BM3D routes are barred from profit-oriented use, so 1b replaces BM3D with **one**
permissively licensed candidate, shift-invariant wavelet BayesShrink (scikit-image 0.26.0 +
PyWavelets 1.8.0), under the identical gate. It is the last trial of step 1: a FAIL or a STOP
closes step 1 as FAIL.

## Starting Point

1a's harness works end to end, but it is single-trial: paths, arm names, record fields and the
calibration bind are constants, and 1a's committed evidence re-derives only while its literal
bytes (freeze text, report keys, reason strings) stay as they are.

## Desired End State

A sealed 1b pilot froze one strength (or stopped), a sealed 16-pair gate gave PASS, FAIL or
BLOCKED in `evaluations/step1b/gate.md`, a metadata-only bundle re-derives it, 1a still
re-derives FAIL, and every S-20 pointer states the step 1 outcome.

## Key Decisions Made

| Decision                   | Choice                                                                                                                                | Why                                                                 | Source                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| Candidate                  | BayesShrink, soft, `db1`, default levels, per Y/Cb/Cr plane, `cycle_spin(max_shifts=3, workers=1)`                                    | Multi-scale and per-subband adaptive, where NLM tied; licence-clean | Owner 2026-11-09            |
| Grid                       | σ_plane = k·σ̂_plane, k ∈ {1.0, 1.5, 2.0}, σ̂ by 1a's estimator on each normalised plane                                                | Same grid as 1a; the estimator lives in the filter's own space (F8) | Owner 2026-11-09            |
| Patents                    | The method's age is sufficient; no search                                                                                             | BayesShrink 2000, cycle spinning 1995                               | Owner 2026-11-09            |
| Diagnostic                 | Per plane × level × orientation: set-to-0 / nonzero-before, summed over 16 shifts; already-zero counted apart; never read by the gate | BayesShrink thresholds each orientation subband separately          | Owner 2026-11-09 (planning) |
| Counting                   | A separate observing pass; the render is the decided skimage call                                                                     | Instrumentation never changes the rated pixels                      | Owner 2026-11-09 (planning) |
| Harness                    | `trials.py` descriptor, `--trial` default 1a, 1a literals byte-identical, 1a audit re-run in every rule-file phase                    | One set of evidence rules for both trials                           | Owner 2026-11-09 (planning) |
| Evidence layout            | `evaluations/step1b/` (own seals, ratings, freeze, verdict, `audit/`)                                                                 | `gate.py` deletes its audit dir; 1a's must never be touched         | Plan                        |
| Reuse                      | 1a's `decoded` and `control-full` renders, verified, not re-rendered                                                                  | They are the same inputs; re-rendering adds nothing                 | Plan                        |
| Chooser                    | None; one strength frozen by the pilot                                                                                                | Per-photo choice is step 3 (`local-jev-gate`)                       | Owner 2026-11-09            |
| STOP evidence              | `pilot.py --trial 1b` writes `step1b/pilot-stop.md` and a pilot-only audit; pointers link it                                          | STOP closes step 1, so it must be as reproducible as a verdict      | Plan review F22             |
| Rule files not yet created | 1b's grid and calibration join the rule-file check only once they exist                                                               | Otherwise every 1a tool refuses until Phase 10                      | Plan review F17             |

## Scope

**In scope:** premise record; trial seam; `wavelet-gamma` arm; renderer, grid, calibration and
diagnostic; one pilot and one gate run; the 1b audit and pointers.

**Out of scope:** BM3D or any third denoiser; retuning; per-photo strength; Jev; edits to any 1a
evidence or to `nlm.py`; the viewer; border wrap-around correction; steps 2–4; holdout; paid calls.

## Phases at a Glance

| Phase          | What it delivers                                                                     | Key risk                                                  |
| -------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 7. Premise     | Packages at pinned versions, installed source matches the decision, one timed render | A Fedora patch or version drift                           |
| 8. Trial seam  | `trials.py`, `--trial` everywhere, 1a byte-identical                                 | A changed 1a literal breaks the 1a audit                  |
| 9. Wavelet arm | `wavelet-gamma` matched to `control-full`                                            | — (mirrors `nlm-gamma`)                                   |
| 10. Renderer   | `wavelet.py`, grid, calibration in YCbCr, observing pass                             | Calibration may force a grid revision (allowed only here) |
| 11. Pilot      | 48 renders, sealed pilot, freeze or STOP                                             | Render time at 24.5 MP with 16 shifts                     |
| 12. Gate       | Sealed 16-pair gate, verdict, audit, step 1 outcome                                  | BLOCKED rounds while resolving `uncertain`                |

**Prerequisites:** the owner installs `python3-scikit-image python3-pywt`.
**Estimated effort:** about 3–4 implementation sessions for Phases 7–10, plus two rating sessions.

## Open Risks & Assumptions

- Soft thresholding dims point sources; faint stars at noise level can be lost as on S17-03.
- BayesShrink's threshold rises faster than linearly in `k`; at k ≥ 1.5 noise-dominated subbands
  are zeroed whole. The diagnostic shows where; the gate decides whether it matters.
- `cycle_spin` wraps around at the borders: 3 px mix with the opposite edge.
- The owner has seen these photos in 1a's pilot and gate; blinding cannot hide repeated content.
- A 1b PASS only lets the experiment continue; the holdout (step 4) is the product test.

## Success Criteria (Summary)

- A PASS, FAIL or BLOCKED 1b verdict reproduced from committed evidence, each rule sealed before
  the result it governs.
- 1a re-derives FAIL unchanged after every 1b phase.
- On FAIL or STOP: step 1 closed as FAIL in every pointer; on PASS: the free/paid conversation.
