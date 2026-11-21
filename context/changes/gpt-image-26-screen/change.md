---
change_id: gpt-image-26-screen
title: "Screening test of GPT-Image-2.6 Sunburst (complexity=low) as a Cloud AI output"
status: impl_reviewed
created: 2026-11-05
updated: 2026-11-21
archived_at: null
issue: 359
---

## Notes

a small, separate screening test of gpt-image-2.6-sunburst (quality=high, complexity=low, moderation=auto) as a Cloud AI output on the three Phase-5 scenes S17-03/04/07, 2 outputs each, fixed prompt from scripts/s19/configs/phase5-gpt.json, blind two-axis rating (quality, fidelity) against original and real Local; gate fixed before rendering; budget cap $1.50.

### Owner decisions (2026-11-05)

- **A separate change, not an annex to S-20.** S-20 (`cloud-classical-denoise`, #347) tests the
  hypothesis "no pixel-generating model"; its result stays clean. This screen does not change
  S-20's scope, sequence or gate, and does not depend on S-20's NLM outcome.
- **Parameters accepted as proposed:** `gpt-image-2.6-sunburst`, `quality=high`,
  `complexity=low`, `moderation=auto` (as production would run; a block is a result, not an
  error), scenes S17-03 / S17-04 / S17-07 (tuning photos — the `s17-v2` holdout stays closed),
  2 outputs per scene, the prompt from `scripts/s19/configs/phase5-gpt.json` unchanged, budget
  cap **$1.50**.
- **Gate, to be written into the config before any render:** zero "significant loss" or
  "severe regression" on all 6 outputs (S-20 fidelity scale, crop and reason mandatory), and
  fidelity at least a tie with real Local in the majority of pairs. A pass opens a wider
  comparison on all eight tuning photos — never a deployment.

### Why this exists

- S-19 Phase 5 (`context/archive/2026-09-28-cloud-model-comparison/evaluations/phase5-tuning.md:40-66`)
  rated GPT Image 2.5 better-looking but less faithful than Local in 8 of 8 pairs — eight outputs
  from **three scenes**, one configuration. That is grounds for scepticism, not a verdict on 2.6.
- None of S-19's GPT configs (`scripts/s19/configs/gpt-std.json`, `gpt-large.json`,
  `phase5-gpt.json`) set `complexity`. The image-generation guide
  (https://developers.openai.com/api/docs/guides/image-generation, read 2026-11-05) says the
  default is `high` and that higher complexity "can increase latency and introduce unwanted
  changes". Whether `complexity` existed for 2.5 is not confirmed.
- The two variables change together (model 2.5 → 2.6, complexity default → `low`), so a result
  cannot be attributed to either alone; the question is only "is 2.6 at `low` usable".

### Facts carried in (2026-11-05)

- Model ids `gpt-image-2.6-sunburst` / `gpt-image-2.6-flare`; `v1/images/edits` supported,
  `v1/responses` not (model pages). No seed, no input-fidelity parameter found for 2.6.
- Per-token rates identical to 2.5: image input $8, output $30, cached $2, text $5 per 1M
  (https://developers.openai.com/api/docs/pricing, read 2026-11-05). Not listed in the batch table.
- S-19 ledger (`test-photos/private/s19/attempts.jsonl`): 18 successful 2.5 calls, median
  **$0.0785** (range $0.077–$0.145), median wall **36.8 s** at ~2336×1552. Six 2.6 calls are
  therefore estimated at ~$0.50 — an estimate, since 2.6's token use may differ. Measure wall time
  against the ≤ 30 s p95 guardrail (`context/foundation/roadmap.md:383`).
- Size limits and `moderation` values come from a summary of the guide, not a verbatim read —
  confirm on the live page before the run.

### Sequencing note

Practical, not a dependency: run after S-20 step 1 has built its two-question blind viewer, so
2.6 is rated with the same tool and scale. Reuse the S-19 harness (`scripts/s19/run-candidate.py`,
budget ledger, sealed-key protocol); outputs go to the gitignored `test-photos/private/`.

### Progress log

- 2026-11-17: owner confirmation recorded, Progress row pending the merge (owner rule: Manual rows are written after the merge, at the master SHA) — **1.4** the owner confirmed in session that `evaluations/vendor-facts.md` (sha256 51f6c37b…) matches the 2026-11-05 parameter decision, at 9d476358401f7a8b13662a3fb05f33c639a2a302.
- 2026-11-17: owner decision — the regression harness links the live `node_modules` into its disposable worktree only when the revision's `package-lock.json` is byte-identical; the insufficient S-20 four-file overlay is recorded and decided in Phase 3; plan.md § Phase 2 item 5
- 2026-11-17: owner confirmation recorded, Progress row pending the merge — **1.5** the owner confirmed in session that the `gate` block of `scripts/gpt26/configs/gpt26-low.json` (sha256 bda91bfb…) states their rules, at 9d476358401f7a8b13662a3fb05f33c639a2a302.
- 2026-11-20: owner confirmation recorded, Progress row pending the merge — **2.4** the owner confirmed in session that `python3 scripts/gpt26/run.py --dry-run --cap 1.50` on the Linux (Fedora) host lists the six series slots with the series' request sizes (S17-03 2336×1552, S17-04 2192×1648, S17-07 2320×1552), $0.20 bounds, $1.20 total within the $1.50 cap, verified inputs, and refuses a paid run without the approval line and key, at 83851c7c911858617afd21c12fed3949e150571b.
- 2026-11-18: owner decision — Phase 3 is implemented and gated on the Linux (Fedora) host; the S-20 regression uses one disposable overlay commit restoring five metadata files (premise included) for both revisions, and the full suite must pass; Progress 5.1 keeps its `(paid)` title; plan.md § Phase 2 item 5, § Progress
- 2026-11-20: owner decision — with two sealed passes the private first-pass checkpoint is required by the gate, and a live ledger/sidecar differing from the frozen copy after the seal is BLOCKED; plan.md § Phase 3 items 1 and 3
- 2026-11-21: owner confirmation recorded, Progress row pending the merge — **3.4** the owner opened `references/compare-gpt26.html` (sha256 7bab909b…) over local HTTP on the synthetic set `demo-synthetic` (six pairs, two passes, built by `scripts/gpt26/blind.py` in a throwaway repository) and confirmed that the seal is accepted, the two-pass and recognition-risk note shows before the seal and in the rating view, only pass 1 is shown until it is complete and locked, the lock downloads the checkpoint and survives a reload, the export carries `passes` and `locked_pass1`, and the questions and fidelity scale match the archived S-20 viewer, at 611c9989ce92ad3165b36cb58a3b4b86d5cfbe50. The first walk-through found the note only under the seal button; fixed in 611c998 before this confirmation.
- 2026-11-21: owner confirmation recorded, Progress row pending the merge — **3.4** re-confirmed after the Phase-3 review fixes (the 611c998 confirmation is superseded because the viewer changed): the owner opened `references/compare-gpt26.html` (sha256 d0094ad5…) over local HTTP on a rebuilt synthetic set `demo-synthetic` (fresh origin, no cached state) and confirmed that the seal is asked for and accepted, the note and "Przebieg 1 z 2" show, the pass-1 lock downloads the checkpoint and reveals p04–p06, the state survives a reload, the complete export succeeds, and opening the same set in a second tab switches the first tab off with "Ten zestaw otwarto w innej karcie…", at 1a272717ff5d9393481900ef8c61d3c9f463116f.
- 2026-11-21: owner confirmation recorded, Progress row pending the merge — **4.2** the owner confirmed in session that `evaluations/run.md` (sha256 e286889a…) matches the paid runner output and that spend ($0.4843 known billed, $0.48 committed) is ≤ $1.50, at 94bb99835b91e85e4460d7a10cf023a7a880f2bf. The Phase-4 review (`reviews/impl-review-phase-4-94bb998.md`) is APPROVED with no findings.
- 2026-11-21: owner decision — the blind ratings are kept as rated: every GPT side `minor`, although the crop reasons describe generated detail (redrawn faces, invented lettering, removed faint stars) that the S-20 scale's examples place higher; the owner chose to keep PASS rather than record FAIL. Pass 1 was locked, and any re-rating after the verdict would not be blind. The owner preferred the GPT results visually and judged the generated detail minor; quality stays a diagnostic and does not decide the verdict; plan.md § Phase 5 item 1 (verdict from committed ratings)
- 2026-11-21: owner confirmation recorded, Progress row pending the merge — **5.3** the owner rated all six delivered pairs in `references/compare-gpt26.html` in the sealed two-pass order (pass 1 locked, private checkpoint kept); ratings committed in db86de4 after the seal c1fc712, at ac1cabc3b0b32b2eb922ae25f9734f8f7fc1cb13
- 2026-11-21: owner confirmation recorded, Progress row pending the merge — **5.4** the owner confirmed in session that `evaluations/verdict.md` states the reasons and the block summary correctly (PASS, 4 of 6, no blocks), at ac1cabc3b0b32b2eb922ae25f9734f8f7fc1cb13
- 2026-11-21: owner confirmation recorded, Progress row pending the merge — **5.5** the owner approved the drafted comment on issue #359; posted as https://github.com/Piotr-Miller/lumina-clean-ai/issues/359#issuecomment-7067536694 (issue left open), at ac1cabc3b0b32b2eb922ae25f9734f8f7fc1cb13
- 2026-11-21: owner decision — integration evidence: the sealed run record pins registration commit 9d47635 by SHA, so the gate is BLOCKED on any rebased history; the annotated tag `gpt26-screen-evidence` (on 1d218f0, pushed) keeps the verifiable history, and after the rebase-merge re-verification is the gate at that tag plus byte-identical `evaluations/` and `scripts/gpt26/` files on master; plan.md § Phase 5 item 1 Contract

## Outcome

Screen result **PASS** (2026-11-21): 4 of 6 pairs at least a tie on fidelity against real Local (4 required), no GPT side rated significant or severe, all six slots delivered on the first attempt, $0.48 committed of the $1.50 cap, p95 wall time 30.95 s against the 30 s guardrail (diagnostic). Canonical verdict: [`evaluations/verdict.md`](evaluations/verdict.md) (seal `c1fc712`, ratings `db86de4`). A screening pass only opens a wider comparison on all eight tuning photos; it is not proof of production quality, and Cloud stays paused. The ratings were kept as rated by owner decision 2026-11-21 (Notes).

## GPT26 approvals

<!--
Owner-only record. Only the owner writes an approval line here, and commits it before any paid call.
scripts/gpt26/run.py strictly parses exactly one line of this grammar and refuses when it is absent,
malformed, duplicated, uncommitted, or when cap_usd differs from the runner's --cap:

- GPT26-SPEND cap_usd=1.50 decision=approved date=YYYY-MM-DD

The blind-set seal is NOT stored in this mutable lifecycle file. It goes, once, into the write-once
evaluations/gate-sealed.md as an unbulleted GPT26-SEAL line (plan.md Phase 3 and Phase 5).
-->

- GPT26-SPEND cap_usd=1.50 decision=approved date=2026-11-21
