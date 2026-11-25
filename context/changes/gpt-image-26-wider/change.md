---
change_id: gpt-image-26-wider
title: "Wider blind comparison of GPT-Image-2.6 Sunburst (complexity=low) on all eight tuning photos"
status: implementing
created: 2026-11-21
updated: 2026-11-25
archived_at: null
---

## Notes

This is a follow-up of `gpt-image-26-screen` (#359, archived
`context/archive/2026-11-05-gpt-image-26-screen/`). The screen ended PASS, but its fidelity labels
contradict its own reasons (`frame.md`). This change fixes the instrument first, then runs a blind,
paid comparison on S17-01…07 and S17-21, with 2 slots each.

### Owner decisions (2026-11-21, /rune-plan)

- **Fidelity level:** graded by size/visibility, the same rule for invented or altered content
  (identity, legible text, objects) and for removed detail or a changed colour character.
  **significant** = visible with the whole frame fitted to the viewer, without zoom.
  **minor** = found only when zoomed in.
- **Majority:** a pairwise fidelity preference per pair, as in S-19. PASS needs ≥ 8 of 16 pairs to
  be a tie or GPT-favoured, no GPT side `significant`/`severe`, all 16 delivered, and spend within
  the cap.
- **Sequence:** write the anchor, then the paid 8-photo run, with no $0 re-rate of the screen's
  outputs.
- **Slots and cap:** 8 × 2 = 16 slots, with a cap of **$3.50**. Σ worst-case bounds are
  ≈ $3.20–3.36, and the expected spend is ≈ $1.30.
- **Wall time:** diagnostic only (p95 vs 30 s).

### Owner decisions (2026-11-24, /rune-implement phase 1)

- 2026-11-24: owner decision — NumPy 2.5.5 on the Fedora host instead of the 2.5.4 recorded in
  the screen's regression baseline
  (`context/archive/2026-11-05-gpt-image-26-screen/evaluations/regression-baseline.md`) is
  acceptable. Every other pinned dependency and the `package-lock.json` sha256 match; recorded in
  `evaluations/regression-baseline.md` of this change. No plan text changes.

### Owner decisions (2026-11-25, /rune-implement phase 5)

- 2026-11-25: owner decision — GPT-Image-2.6 Sunburst goes to production despite the gate's FAIL;
  the verdict stays FAIL. Recorded in `## Outcome`; delivery is a separate change. No plan text
  changes.
- 2026-11-25: owner decision — no GitHub issue for this study (Progress 5.6); the production
  delivery change may get its own. No plan text changes.
- 2026-11-25: owner decision — 5.6 gets an explicit surface (`context/foundation/github-issues.md`)
  so its acceptance can be recorded; plan.md Phase 5 Manual Verification.

## Outcome

2026-11-25: the wider blind comparison came out **FAIL**
([`evaluations/verdict.md`](evaluations/verdict.md), gate `gpt26-wider-v1`, set `gpt26-wider`).

- **Fidelity majority:** 7 of 16 pairs at least a tie (8 required). Real Local was preferred as
  more faithful (`local-slight`) on the other 9, and no pair favoured GPT on fidelity.
- **Disqualifications:** none. No GPT side was rated significant or severe; 10 GPT sides `minor`,
  6 `none`.
- **Delivery and budget:** 16 of 16 slots delivered (one moderation block recovered by its
  retry), $1.48 conservative ($1.2831 billed) of the $3.50 cap, no bound breach.
- **Diagnostics:** quality preference favoured GPT on 15 of 16 pairs; every Local side `none`;
  p95 wall time 36.7 s vs the 30 s guardrail.
- **Evidence:** seal `b70963f`, ratings `847587c`, tag `gpt26-wider-evidence` on origin.

**Owner decision (2026-11-25): GPT-Image-2.6 Sunburst goes to production despite this FAIL.**
The gate's verdict stays FAIL and is not re-decided: the decision is the owner's product call,
made after the verdict, weighing the diagnostics above: the fidelity losses were all `minor` and
every lost preference only `local-slight`, while quality favoured GPT on 15 of 16 pairs. It does
not turn this study into evidence that GPT is as faithful as Local.

Delivery is out of scope here (plan § What We're NOT Doing). It needs its own change, opened with
`/rune-new`, which settles the production parameters (this study tested `quality=high`,
`complexity=low`, `moderation=auto`), cost, the daily cap and the risk of altered content on users'
photos. Cloud stays paused until that change ships.

The earlier screen's PASS (2026-11-21, archived) stays a sealed historical result.

## GPT26 approvals

<!--
Owner-only record. Only the owner writes an approval line here, and commits it before any paid call.
scripts/gpt26/run.py strictly parses exactly one line of this grammar and refuses when it is absent,
malformed, duplicated, uncommitted, or when cap_usd differs from the runner's --cap:

- GPT26-SPEND cap_usd=3.50 decision=approved date=YYYY-MM-DD

The blind-set seal is NOT stored in this mutable lifecycle file. It goes, once, into the write-once
evaluations/gate-sealed.md (plan.md Phase 5).
-->

- GPT26-SPEND cap_usd=3.50 decision=approved date=2026-11-25
