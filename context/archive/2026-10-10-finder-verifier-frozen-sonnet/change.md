---
change_id: finder-verifier-frozen-sonnet
title: "Stage 2: the sealed verifier on frozen findings with sonnet-5 as the model"
status: archived
outcome: completed
created: 2026-10-10
updated: 2026-10-11
archived_at: 2026-10-11T13:31:58Z
archive_commit: 1f39bdb
sync: none
---

## Notes

Stage 2 of the frozen-findings verifier measurement: the same sealed verifier, corpus, arms and criteria as finder-verifier-frozen, with anthropic/claude-sonnet-5 as the verifier model, as a new, separately pre-registered change (owner decision 4.7, 2026-10-10).

Predecessor: finder-verifier-frozen

2026-10-10: owner confirmed the predecessor's manual check 1.8 (`context/archive/2026-10-09-finder-verifier-frozen/plan.md`): the harness's failure output says what happened, which attempt, and what to do next. That plan's row stays `[ ]` because the archive is immutable; this note is the record. The successor's harness inherits the same messages.

## Owner decisions

2026-10-11: Codex completed the owner's requested steps 1–3: read the stub demo checklist and independently reviewed Phase 1 at `3f96b05` (two fresh-context, read-only passes; all nine automated gates rerun successfully). Manual 1.10 remains unconfirmed: the probe can report PROCEED after an account condition violation, an unsuccessful generation read, or final spend above its cap. Report: `reviews/impl-review-phase-1-3f96b05.md` (NEEDS ATTENTION; 3 warnings, 1 observation). Push is deferred until the checklist is corrected and re-reviewed, before the paid Phase 2 probe. No paid call or push was made. The change remains implementing.

2026-10-11: owner decision — manual 1.10 needs correction: the probe must never PROCEED past an account error, an unread generation record, or a final spend above its cap; F1–F4 of `reviews/impl-review-phase-1-3f96b05.md` fixed, push held until a re-review passes; plan.md Phase 2 § Probe record (checklist items 7–8, outcome rules and precedence).

2026-10-11: owner decision — the $1.68 projection (stage 1's measured tokens at sonnet prices) goes into gate §10 only, as the expected spend; the harness `report` mode stays unchanged. Plan Definitions E amended; Phase 3 §10 already carried it. Reason: Phase 1 fixes every other mode of the instrument and Phase 2's probe runs on that harness, so a report change after the probe would reopen Phase 1; the projection is a pre-series assumption, not a series measurement.

2026-10-11: owner decision — after reading the stubbed checklists (re-review 2, F5 fixed): item 1 reads `incomplete (generation record not read, item 8)` when a record is unread, `not read` / `no successful response` / `no id` / `error` replace the empty-list word `none` and the placeholder `absent` where nothing was read, and two outcome messages the demo had not shown (`STOP AND ASK (rule 1)`, `UNDETERMINED: no successful response`) get self-test cases. PROCEED after a plain format failure or `budget-stopped` stays as ruled (information only). The stubbed run is kept as `demo-checklists.txt` in the change folder as the record for manual 1.10.

2026-10-11: probe (Phase 2) PROCEED at $0.005754, outcome confirmed by the owner (manual 2.5). Owner approved the pre-registration in `gate.md` after two corrections (continuation after any budget stop needs the owner; stage-1 amounts explained under §6); sealed at sha256 3641d01bb31b69f3cca2638391a0f29d998475e86146a7a052d895b78dea68e4. The seal does not authorize Phase 4.

2026-10-11: paid series authorized by the owner after the pre-flight and complete — 114/114 attempts ok, T $2.655654 of the $3.90 cap (counter re-read equal); automatic outcome in `gate.md` § Results: true class 9/11 pass 3/3 (D2 #3.2 and #4.2 refuted in base, O 3/3); code-refutable 0/3 before the hand-read (G-D13 and G-D14 published 3/3 in base, G-D20 2/3). Hand-read and results are Phase 5.

2026-10-11: owner graded the blind sheet (R01, R03, R04 pass; R02, R05 off-target); final result in `gate.md` § Results › Hand-read and final result — true class FAIL (9/11; D2 #3.2 and #4.2 refuted in base), code-refutable FAIL (0/3: G-D13 and G-D14 confirmed in every base repeat, G-D20 2/3 with both graded pass). Side-by-side with stage 1 in § Results (information only). The owner's next decision is pending.

2026-10-11: owner decision (plan 5.7) — close stage 2 and archive this change. On this frozen set a model change alone did not meet the criteria of either class. AI review stays disabled (decision 6). The refuted / unsupported distinction — why missing evidence led to refuting a true claim (D2 #4.2, #3.2) — is kept as a separate candidate for a future study (`follow-ups/refuted-without-evidence.md`); no further stage and no further model swap are started now.

From `research.md` § Open Questions (owner, 2026-10-10):

1. **Budget: variant (a).** The sealed admission reserve P stays as in the predecessor (`harness.mjs:457-465`; about $1.07–1.16 per attempt at $2 / $10 per M). The cap is raised instead: about $3.9 stop-and-ask and $4.5 hard, so that a series of about $2.2–2.7 can finish. The exact values are fixed in the pre-registration after the pre-flight re-reads the credit (last recorded about $5.39).
2. **A paid probe request goes before the series.** It checks, on the wire: no reasoning on any channel (including `reasoning_details` / `reasoning.encrypted`), the served provider (`Anthropic`, and whether the response carries a top-level `provider`), `service_tier`, and the A2 headroom (`prompt_tokens` against `b + 32·m + 32`). The plan decides its input and its place relative to the seal: a probe on a corpus batch would show verdicts before the seal.
3. **Plan assumptions confirmed (owner, 2026-10-10)**, with two clarifications:
   - the probe runs before the seal, outside the corpus;
   - its $0.60 limit covers retry and repair as well. The gate admits each request on the cost so far plus that request's bound, so a cheap first call can leave room for a retry. Budget protection stays conditional on A1–A3;
   - the credit threshold is $5.10 ($0.60 + $4.50) before the probe. Before the series the balance is re-checked against the series maximum of $4.50 only; the probe's spend, already gone from the balance, is not added again.
