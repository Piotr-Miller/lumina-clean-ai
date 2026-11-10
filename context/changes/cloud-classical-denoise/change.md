---
change_id: cloud-classical-denoise
title: "Cloud AI as a classical full-resolution denoise pipeline, proven offline against real Local"
status: implementing
created: 2026-11-03
updated: 2026-11-10
archived_at: null
issue: 347
---

## Notes

- 2026-11-05: reopened 0.3 — was accepted at 595c87ab2ae5658389ba4ca64e17660b4b70b016; changed: context/changes/cloud-classical-denoise/evaluations/step1-premise.md (F1 guard erratum and corrected replay; the acceptance script includes this record in 0.3's fallback surface).
- 2026-11-05: reopened 0.4 — was accepted at 595c87ab2ae5658389ba4ca64e17660b4b70b016; changed: context/changes/cloud-classical-denoise/evaluations/step1-premise.md (F1 guard erratum and corrected replay).
- 2026-11-05: owner decision — calibration gates σ̂_L, σ̂_a and σ̂_b each, on Lab fixtures converted to BGR (direct-Lab σ̂ recorded, ungated); a real render is bound to the calibration's PASS, nlm.py sha256, grid sha256 and OpenCV version; plan.md § Phase 2, item 3
- 2026-11-05: calibration limits disclosed (impl review phase 2, F2; no retune). (1) The pre-registered texture fixture is too smooth for the 3×3 kernel: on the noiseless texture σ̂ = 0.227, so the measured texture bias was +0.2 to +2.3 % and the ≤ +35 % over-read gate could not have failed. The record does not bound how much real fine texture inflates σ̂. (2) The ungated rows under-read σ̂ in the night-photo regime: near 0 by 47–67 %, near 255 by 31–45 %, the dark ramp by up to 24 % (σ̂_a at σ 15). A low σ̂ gives a weaker `h` at every `k`. Evidence: `evaluations/step1-calibration.md` § Estimates; `reviews/impl-review-phase-2-422ed56.md` F2.
- 2026-11-05: reopened 2.4 — was accepted at 422ed562fec31ebf2c1f140b63132ba10e793884; changed: context/changes/cloud-classical-denoise/evaluations/step1-calibration.md (impl review phase 2, F3: `nlm.py` no longer prints the machine-dependent OpenCV thread count, so the record was re-calibrated; the bind's `implementation_sha256` is now ab27728f…, every σ̂ is unchanged).
- 2026-11-05: 2.4 accepted at 422ed562fec31ebf2c1f140b63132ba10e793884 (grid and calibration record). Owner's notes, non-blocking: (1) Local's Auto gamma runs after the filter, so it can make visible the noise near black that a weak h left behind (the estimate reads 40–67 % low there); the pilot should look at the shadows in particular. (2) The texture gate is weak: a sine with a 16/24 px period is smooth for the 3×3 Laplacian kernel, hence only +2 %, so its PASS says little about the fine texture of real photos; the record admits this under "Known limit".
- 2026-11-05: owner decision — Phase 3 builds gate-mode set construction only (k read from nlm-frozen.json, shape-checked); Phase 4 wires the step-8 precondition into blind.py gate mode and owns the gate-build refusal tests; manual check 3.4 (round trip) moved to Phase 4 as 4.3; plan.md § Phase 3 items 1 and 3, § Phase 4 items 5–6, Progress
- 2026-11-06: owner decision — seal files: blind.py prints the whole file (one `S20-SEAL` line + a procedural human-control statement), the owner commits it, tools require exactly one valid line, and the viewer checks the pasted line against the set it opens; Local baselines: a committed `scripts/s20/configs/local-baselines.json` (8 ids, exact-byte sha256 from the archive and the premise record, never from the checked downloads), gate.py reads only it; plan.md § Phase 4 item 6
- 2026-11-07: owner decision — `blind_fixture.py publish` builds eight photos (16 gate pairs) and `--keep` keeps the whole synthetic world and prints the exact gate.py round-trip commands for manual check 4.3; the Phase 4 review fixes are committed before any real render (they are rule files); plan.md § Phase 4 item 8
- 2026-11-07: owner confirmation recorded, Progress row pending the merge (owner rule: Manual rows are written after the merge, at the master SHA) — **2.4** grid and calibration record accepted by the owner on 2026-11-06 at b83a7c4ede49054a9cb3c8659210036c70958b69 (after the impl review phase 2 re-calibration); its surface is unchanged since.
- 2026-11-07: owner confirmation recorded, Progress row pending the merge — **4.2** the owner read the whole of `pilot.py` and `gate.py` after the impl review phase 4 triage (committed in d26fa8a2469c81d7a7359a187b86f3aa0184f9c3) and confirmed they match the 2026-11-03/05 decisions: the pilot picks the most chosen k, a tie goes to the weaker, `none` casts no vote and all-`none` is STOP; the gate needs 16 complete comparisons and counts ≥ 6/8 wins over control-full only, a tie is not a win; the worst NLM fidelity loss across both pairs counts, significant/severe is FAIL, uncertainty or incomplete evidence is BLOCKED; the triage fixes protect image binding, evidence order and file reads.
- 2026-11-08: owner confirmation recorded, Progress row pending the merge — **3.3** viewer checked by the owner on the synthetic pilot and gate sets of `blind_fixture.py publish --keep` (served over http://localhost): seal check, 1:1 zoom held across 1–5/Space and rating clicks, synced side panes, the brightened original, crops, required evidence at significant, export. Three defects found and fixed in c5a277de1040af2299c71c04e54a3cd1cc03a975 (label width shifted the zoomed image ~50 px; side-to-flip kept the corner, now the centre; J did not show the original in flip mode, now it does and a second J returns), then re-checked by the owner.
- 2026-11-08: owner confirmation recorded, Progress row pending the merge — **4.3** round trip on `synthetic-gate-20261108t194318` at c5a277de1040af2299c71c04e54a3cd1cc03a975: state restored after reload; one `uncertain` side on p02 → `gate.py` BLOCKED, exit 3, naming only p02; p02 resolved and re-exported (by the agent in the viewer, at the owner's request) → the only difference from the first export is p02 fidelity A `uncertain` → `none`, order and header unchanged, `gate.py` FAIL, exit 1 (synthetic ratings); the same pairs under `synthetic-gate-b-20261108t194318` opened empty.
- 2026-11-08: owner confirmation recorded, Progress row pending the merge — **5.6** the owner opened `pilot-1` only after its seal was committed (59fea67b419b62f45cb7934715a1bd9e7fb4d812), through `compare-s20.html` over http://localhost, rated the 8 photos and exported; the export was committed separately (a5d1a3e463a22098ac00cc73b1f9022b4ae67001). The seal and the ratings were committed by the agent at the owner's request; the rating was the owner's.
- 2026-11-08: owner confirmation recorded, Progress row pending the merge — **5.7** the owner accepts the pilot result at b586de453bc389f13e082540c5e6bf810962efe6: SELECTED k 1.0 (k1.0 3, k1.5 2, k2.0 0, none 3), frozen in `scripts/s20/configs/nlm-frozen.json`. Impl review phase 5: APPROVED, no findings (`reviews/impl-review-phase-5-b586de4.md`).
- 2026-11-09: full impl review (`reviews/impl-review-6d73343.md`, F1): `gate.py --audit` reproduces the step-1a verdict only on a pre-archive tree. Its paths are hard-coded under `context/changes/`, and the write-once check would most likely count the archive's `git mv` as a second touch. After archiving, run it in `git worktree add <dir> "$(git rev-parse <archive-commit>^)"`. The generated `step1-audit/README.md` and `step1-gate.md` are left as `gate.py` wrote them. No rule file changed.
- 2026-11-09: owner confirmation — **6.5** the owner committed the gate seal before opening `gate-1`, and rated the 16 pairs themselves; **6.6** the owner accepts the FAIL verdict and its decoded table in `evaluations/step1-gate.md`. Confirmed in the review session on 2026-11-09.
- 2026-11-09: **6.7** owner decision — comment on #347 linking the verdict, no label change (`status:proposed` kept, S-20 itself undecided); posted at https://github.com/Piotr-Miller/lumina-clean-ai/issues/347#issuecomment-6750604694. BM3D (1b) licence decision deferred by the owner.
- 2026-11-09: Progress written after the rebase-merge of PR #364: Manual rows 2.4, 3.3, 4.2, 4.3, 5.6, 5.7, 6.5, 6.6, 6.7 accepted at master c85c5bba8f80575979ed872d9d0a804af1fbd130 (owner confirmations above, each with its own check date); the Automated SHA suffixes and 0.3/0.4's acceptance revision were remapped to their master commits by subject (f6b2800 → f8cdf6e), since the rebase-merge rewrote every branch SHA.
- 2026-11-09: owner decision — step 1b replaces BM3D with one candidate, shift-invariant wavelet BayesShrink (scikit-image 0.26.0 + PyWavelets 1.8.0), k ∈ {1.0, 1.5, 2.0} unchanged; the renderer records the fraction of zeroed detail coefficients per plane and level as a diagnostic, never a gate criterion; the method's age is sufficient on patents, no manual search. Supersedes the 6.7 note's "BM3D (1b) licence decision deferred". § Owner decisions (2026-11-09, step 1b candidate).
- 2026-11-10: owner confirmation recorded, Progress row pending the merge — **7.4** the owner installed `python3-scikit-image` 0.26.0 and `python3-pywt` 1.8.0 with `sudo dnf install` (reported "installed" in session, 2026-11-10; verified by 7.1 at 30dd1f7).
- 2026-11-10: reopened 4.2 — was accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130; changed: scripts/s20/gate.py, scripts/s20/pilot.py (Phase 8 trial seam, 69b9c73). The reopening rides with the next commit; it should have been in 69b9c73's commit set (commit-ritual step 2 was run but not acted on).
- 2026-11-10: reopened 4.3 — was accepted at c85c5bba8f80575979ed872d9d0a804af1fbd130; changed: scripts/s20/gate.py (Phase 8 trial seam, 69b9c73), same note.

**Registered 2026-11-03; implementation began 2026-11-05.** Owner decision: this change goes first,
`local-jev-gate` is registered as a stub and waits for this change's step 1. Step 1a (NLM) has
run to a verdict: [`evaluations/step1-gate.md`](evaluations/step1-gate.md).

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
   denoise — **not** the existing `control` arm, which starts from the downscaled NAFNet input on
   5 of 8 photos; corrected 2026-11-05, see § Owner decisions (2026-11-05)) and the **real Local** download. Same exposure on both
   sides, so denoise-vs-blur is the only variable. Candidates, in order: **1a** OpenCV
   `fastNlMeansDenoisingColored`; **1b** a bounded second trial, only if 1a fails the gate: BM3D
   until 2026-11-09, then replaced by one permissively licensed denoiser (§ Owner decisions
   (2026-11-09, step 1b candidate)). **Gate**, identical for 1a and 1b: ≥ 6 of 8 wins over the
   control on the quality axis, no significant fidelity loss on any photo, zero severe
   regressions, rated on **two axes** (visual quality and fidelity to the original, as in Phase 5)
   from the first round. Exact rules in § Owner decisions.
   **Status (2026-11-09):** 1a ran its blind gate: **FAIL**, verdict and table in
   [`evaluations/step1-gate.md`](evaluations/step1-gate.md). 1b replaces BM3D with one permissively
   licensed denoiser, shift-invariant wavelet BayesShrink, under the identical gate (§ Owner
   decisions (2026-11-09, step 1b candidate)); it is being planned. Steps 2–4 do not start.
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
   Containers) and the `enhance` pipeline integration are decided **after** the quality result
   and after the free/paid conversation (§ Owner decisions, 3), never before. Validation on the still-closed `s17-v2` holdout stays one-shot and needs its own
   owner-written approval record, as in S-19.

### What is reused, unchanged

- Benchmark `s17-v2` (`test-photos/s17-benchmark-v2.json`); the holdout is unopened and stays so
  until step 4.
- The S-19 harness: `scripts/s19/inputs.py` (common sRGB inputs — the ICC conversion that any
  candidate needs), `baseline.ts` (Auto records), `local-arms.ts` (arms `control`, `local-equiv`),
  `tally.py` (unchanged — superseded 2026-11-05 by a separate S-20 gate, see § Owner decisions (2026-11-05)), the blind viewer and the
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

**Caution added 2026-11-05: a tonal guide is not safe by construction.** A low-frequency gain map
stops overdrawn detail, but it carries exactly the low-frequency changes S-19 flagged: a black
sky turned navy, the green cast of snow neutralised, wide tonal steps in the S17-04 sky
(`context/archive/2026-09-28-cloud-model-comparison/evaluations/outcome.md:23`, `phase5-tuning.md`).
Pixels coming from the original do not guarantee the scene's look is kept; Option 2 is rated on
the same fidelity scale as step 1. It is no prerequisite for testing GPT Image 2.6 as an output —
that is the separate change `gpt-image-26-screen`.

### Not in scope

- No change to the Local engine, its Auto or the free path (PRD §116: Local stays naive).
- No production integration, hosting, secret, cap change or `CLOUD_DAILY_CAP` > 0 before the
  holdout result meets the bar (S-19 `change.md:250`, return condition).
- No new vendor account, no paid pixel-model call, no class-C service.
- No holdout access before step 4 and an owner-written approval record.
- No edit to anything under `context/archive/`.

### Owner decisions (2026-11-03, before step 1)

These settle the three questions that were open here. They are recorded before any step-1 output
exists, so the rules are fixed before anyone sees a result, as in S-19.

1. **Step-1 gate: ≥ 6 of 8 over the control, with a separate fidelity condition.**
   - Counted over the eight distinct `s17-v2` tuning photos, one rated pair per photo.
   - **Quality axis:** a photo is a win when the arm is preferred over its matched control,
     slightly or clearly — a noticeable improvement. A tie is not a win. At least 6 of 8 wins.
   - **Fidelity axis, separately:** no significant fidelity loss and no severe regression on any
     of the eight photos. One such photo stops the trial. Definition below (owner, 2026-11-03);
     it replaces the agent's earlier reading ("a clear fidelity preference for the control or for
     Local"), which the owner judged too discretionary.
   - **Significant fidelity loss** means the result unambiguously removes, distorts or changes
     scene information that the **original** confirms: detail, structure, shapes, colour
     relationships or the character of the lighting. The change is visible in the whole photo or
     in a corresponding 1:1 crop, never enlarged beyond the source resolution. The rater can point
     to a specific area and say what information was lost.

     | Rating            | Example                                                                                            | Effect                      |
     | ----------------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
     | No loss           | Less noise; texture and scene structure kept                                                       | Allowed                     |
     | Minor loss        | Slight softening of fine texture, no characteristic detail lost                                    | Allowed, recorded           |
     | Significant loss  | Smeared aurora bands, merged fabric texture, clearly changed skin tone                             | Stops the trial             |
     | Severe regression | Confirmed change of lettering or object geometry, or removal of an unambiguously recognisable star | Stops the trial             |
     | Uncertain         | A vanishing point may be a star or noise                                                           | Resolved before the verdict |

   - Three rules for applying it:
     - **The original decides fidelity.** The control and the real Local download help to spot a
       loss; their own artefacts need not be preserved. For dark detail, a brightened preview of
       the original may be checked too.
     - **A small area can be significant** when it holds a characteristic detail: a letter, an eye,
       a recognisable star.
     - **Every significant loss names its crop and a short reason.** "Local looks more natural"
       is not a reason.
   - Severe regressions follow the S-19 fidelity definition (S-19 `change.md` § Fidelity
     definition and candidates); the table's severe row is consistent with it.
   - **Rating viewer:** the loss scale above is its own question, asked separately from the
     aesthetic preference, so "smoother and nicer" cannot hide lost information. The crop and the
     reason are required fields whenever "significant loss" or "severe regression" is chosen.
   - Why: it blocks a repeat of S-19's GPT result — a better-looking image paid for with scene
     detail.
   - Passing lets the experiment continue. It does not show Cloud beats Local as a product; only
     the final holdout decides that.
2. **NLM first; BM3D as a second, bounded trial only if NLM fails.**
   - If 1a passes, step 2 follows. No algorithm tournament.
   - If 1a fails for **any** reason — no gain, or a loss of stars or texture — 1b is allowed.
     A 1a failure is not taken as predicting 1b.
   - Both trials have a tuning range fixed in advance (the parameter grid is written into the
     arm's config before rendering), the same eight photos and the identical gate.
   - **BM3D licence, verified 2026-11-03.** Both readily available implementations are
     restricted:
     - The authors' packages, including `pip install bm3d`, are "available exclusively for
       non-profit education and scientific research. Any unauthorized use of the software for
       industrial or profit-oriented activities is expressly prohibited"
       (https://webpages.tuni.fi/foi/GCF-BM3D/). The linked TAU limited licence text could not
       be read.
     - OpenCV contrib's `xphoto::bm3dDenoising` refuses to run unless built with
       `OPENCV_ENABLE_NONFREE`: "This algorithm is patented and is excluded in this
       configuration" (`modules/xphoto/src/bm3d_image_denoising.cpp:306`, branch 4.x). The PyPI
       `opencv-python` packages do not include non-free algorithms (their README, Q "Why the
       packages do not include non-free algorithms?").
   - **Consequence.** Neither implementation is assumed usable in the product. Because S-20
     exists to inform a product decision, **whether even the offline 1b trial is within the
     authors' licence is itself an open owner decision, to settle before 1b runs.** Options:
     obtain and read the TAU licence terms, find an independently licensed implementation, or
     run the same bounded trial with a different second denoiser.
3. **Free/paid: revisit right after a passing step 1, before choosing hosting.**
   - That is the first result that would justify reopening the "Local is deliberately naive"
     premise (PRD §116, `local-engine-ceiling` #188). The conversation settles what a user would
     pay for: quality, speed, convenience or higher limits.
   - A classical denoiser passing step 1 does not show that the full pipeline runs acceptably in
     a browser. Any change to the free/paid split waits for the holdout result and the
     step-4 performance measurements.
   - Shipping a better Local would be its own change. This change still does not touch Local.

### Owner decisions (2026-11-05, planning step 1a)

Recorded while planning, before any harness code or render exists. Plan:
`context/changes/cloud-classical-denoise/plan.md`.

1. **Premise corrections (measured at planning).** The existing `control` arm renders from the
   NAFNet input, downscaled on S17-04/05/06/07/21, so it is not matched to a full-resolution arm.
   Step 1 uses a new `control-full` arm (common input → Auto gamma, no denoise). The real Local
   download has exactly the common input's dimensions on all eight tuning photos.
   `tally.py` cannot score this gate without relaxing its paid-slot and NAFNet-only invariants
   (`tally.py:113-147`, `:246-247`), and reads no fidelity field.
2. **Separate gate; `tally.py` unchanged.** The gate requires all 16 expected comparisons
   (8 photos × NLM vs `control-full`, NLM vs real Local) exactly once, verifies file hashes and
   source bindings, and rejects missing, duplicate or invalid ratings. Quality wins count only
   against `control-full`: ≥ 6 of 8, ties excluded. Its report distinguishes **PASS**, **FAIL**
   and **BLOCKED**.
3. **Fidelity: the worst substantiated loss across both pairs counts.** Significant or severe
   loss needs a crop and a reason verified against the original; the control and Local only help
   reveal it, and a lower rating in the other pair does not cancel confirmed evidence. Unresolved
   doubt about a loss or its severity blocks the verdict; it is resolved against the original
   without revealing arm identities or changing the frozen configuration.
4. **Viewer.** Reuse `compare-arms.html`'s interaction code (zoom, flip, brightened original) in
   an experiment-specific page; replace its manifest and `Math.random()` sides with anonymous
   pair ids and a sealed key; separate quality and fidelity ratings, with a source-pixel crop
   rectangle and reason required for significant/severe loss. Exports are validated again in the
   gate. No generic framework and no features for #359.
5. **Tuning: blind pilot, then a frozen gate.** The noise estimator, the three `k` values and the
   h/hColor mapping are frozen before rendering. A blind pilot picks one global `k` by a fixed
   vote rule (ties prefer weaker denoising); an explicit "none improves on control" choice counts
   for no strength, and if no strength receives a vote the bounded NLM trial stops. The selected
   configuration is frozen before the separate 16-pair gate; no retuning after its results.

6. **Plan review (2026-11-05).** Codex's review (`reviews/plan-review.md`) returned RETHINK with
   five critical and five warning findings on the evidence protocol; the gate and vote rules were
   confirmed as matching items 2–5. All ten fixes accepted. Two choices: pre-registration order is
   enforced by committed-and-clean seals with ancestor order, and the gate builder recomputes `k`
   from the sealed pilot (F1); the noise estimate lives in OpenCV's own Lab space, with
   h = k·σ̂_L and hColor = k·σ̂_ab, calibrated on synthetic data before the freeze (F8).

### Owner decisions (2026-11-09, step 1b candidate)

Recorded after 1a's FAIL and before any 1b code, config or render. The candidate research is in the
session of 2026-11-09 (Stage A); this section is its decision record.

1. **BM3D is replaced, not retried.** Both readily available BM3D routes are barred from
   profit-oriented use (§ Owner decisions (2026-11-03) item 2), so a BM3D win could not ship.
   Exactly **one** candidate replaces it. This is a substitution, not a tournament: if it fails,
   step 1 closes as FAIL and there is no third trial.
2. **Candidate: shift-invariant wavelet BayesShrink.**
   - Packages: scikit-image 0.26.0 (BSD-3-Clause, `LICENSE.txt` at tag v0.26.0, read 2026-11-09)
     and PyWavelets 1.8.0 (MIT, `LICENSE` at tag v1.8.0, read 2026-11-09), from Fedora
     `python3-scikit-image` / `python3-pywt`, installed by the owner.
   - Space: `skimage.color.rgb2ycbcr` on the shared decoded PNG as float; each of Y, Cb, Cr
     min–max normalised as skimage's own YCbCr loop does (`src/skimage/restoration/_denoise.py`,
     v0.26.0, lines 993-1021).
   - Filter, per plane: `denoise_wavelet(method="BayesShrink", mode="soft", wavelet="db1",
wavelet_levels=None, rescale_sigma=False)` wrapped in `cycle_spin(max_shifts=3)` (16 shifts).
     skimage's `convert2ycbcr=True` path is not used: it treats a given σ as RGB noise
     (`_rescale_sigma_rgb2ycbcr`, lines 830-849), which does not match an estimate made in the
     filter's own space.
   - Strength: σ_plane = k·σ̂_plane, with σ̂ from 1a's Immerkær estimator measured on that
     normalised plane. **k ∈ {1.0, 1.5, 2.0}**, the same grid as 1a, unchanged (owner, 2026-11-09).
     One `k` for all three planes, as 1a used one `k` for `h` and `hColor`.
   - Output: `ycbcr2rgb`, clip, round to 8-bit RGB PNG with no metadata.
   - Calibration: re-run 1a's synthetic fixtures and tolerances through the RGB → YCbCr path
     before the grid is committed; a failed tolerance revises the grid or the estimator there,
     never after a real render.
3. **Diagnostic, not a gate criterion (owner, 2026-11-09).** The renderer also records the
   fraction of detail coefficients that thresholding set to zero, per plane (Y, Cb, Cr), per
   wavelet level and per orientation subband, because BayesShrink thresholds each orientation
   subband separately. Ratio = coefficients set to 0 by thresholding / coefficients nonzero before
   thresholding, each summed over the 16 shifts; coefficients already exactly 0 before
   thresholding are counted in their own field and never in the numerator (planning, 2026-11-09).
   The counts come from a separate observing pass, so the render itself is the decided skimage
   call. They are written into the render record only. `pilot.py` and `gate.py` never read them,
   and they are never shown to the rater.
4. **Patent status: the method's age is sufficient for this candidate (owner, 2026-11-09).**
   BayesShrink was published in 2000 and cycle spinning in 1995; a patent on either as published
   would have expired by about 2021. No patent database was searched, and none will be for this
   candidate. This rests on the age argument, not on a search.
5. **Pre-registration stands.** A 1a failure does not predict 1b. 1b uses the identical gate
   (≥ 6 of 8 quality wins over `control-full`, ties are not wins, the worst substantiated fidelity
   loss across both pairs counts, no significant or severe loss on any photo), the same eight
   `s17-v2` tuning photos, a grid written into the arm's config before any render, a sealed pilot,
   then a sealed 16-pair gate.
6. **No per-photo chooser in 1b.** Not TypeSafe Jev and not an extended `auto-params.ts`
   heuristic: one strength is frozen by the pilot, as in 1a. Choosing per photo is step 3, the
   chooser role of `local-jev-gate` (#348). For that later step, the strength is exposed as an
   optional `denoise: {method, k, chosen_by}` field of an Auto record; the eight existing
   `local/<id>.auto.json` files are never rewritten, because 1a's arm records and audit bind their
   exact bytes. In 1b, `k` comes from the frozen config only.
7. **Harness.** The 1a tools are generalised per trial (separate 1b seals, ratings, freeze,
   verdict and audit bundle). The generalisation is a rule-file change, committed before any 1b
   render or seal, and `gate.py --audit` on the 1a bundle must still re-derive FAIL afterwards.

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

**Confirmed by the owner on 2026-11-03.** Roadmap row S-20 written (`context/foundation/roadmap.md`);
issue [#347](https://github.com/Piotr-Miller/lumina-clean-ai/issues/347) opened with `enhancement`,
`roadmap`, `slice`, `status:proposed` and `phase:post-mvp` (not plan-ready by the owner's decision).
`local-jev-gate` is [#348](https://github.com/Piotr-Miller/lumina-clean-ai/issues/348), Parked.

### Related

- `context/archive/2026-09-28-cloud-model-comparison/` — predecessor; immutable.
- `context/changes/local-jev-gate/` — the chooser candidate for Local; stub, sequenced after
  this change's step 1.
- `context/changes/local-engine-ceiling/` (#188) and the Cloud delivery-resolution half of S-18
  (`roadmap.md` § Parked) — both parked "pending S-19's model choice"; this change is the
  candidate that would unpark them.
- `context/changes/premium-retinexformer-enhancement/` (S-13) — the self-hosted learned-model
  route; stays parked as a Premium proposal, not a basic-path candidate.
