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
