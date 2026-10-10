---
change_id: finder-verifier-frozen
title: "Measure the existing verifier on frozen findings, with D2 as the control"
status: archived
outcome: completed
created: 2026-10-09
updated: 2026-10-10
archived_at: 2026-10-10T21:19:58Z
---

## Notes

Measure the existing finder-verification verifier on frozen, already-classified findings: does it tell a true finding from a convincing false one? D2 is the control it must not remove. D2 detection (finder recall) is studied separately. Opened 2026-10-09 as the successor named in finder-failure-scenario's Phase 0 owner decision; research done 2026-10-09 (`research.md`); no plan or paid call yet.

### Owner decisions (2026-10-09, after `research.md`)

1. **Run route: option A.** A worktree at the pushed tag `finder-verification/seal` (`9c85aa2`) plus a harness
   script in this change folder. No port, no merge of a predecessor branch.
2. **F-b: a finding is verified whole**, as the sealed system does. No hand-splitting: it would improve the input
   and measure a different variant. Compound findings are flagged separately in the report; splitting is a later
   experiment.
3. **Success is scored per class, never as one number:**
   - **True** (G-D2 and the other owner-real rows): the finding must survive **publication** — a model
     `confirmed` without a passing quote is not enough.
   - **False, refutable from code** (G-D13, G-D14, G-D20, H-R4): must get `refuted`. `unsupported` removes the
     finding but does not show the ability to refute a falsehood.
   - **Rejected on policy:** reported separately. Confirming a true claim is not a verifier error, but expecting
     `confirmed` requires the evidence to be delivered; a missing test cannot be proven by a code excerpt.
   - **Ambiguous** (G-D12, and rows needing knowledge outside the excerpts): excluded from the hard criterion.
     Set E stays descriptive until the owner classifies it.
   - Results are shown per repeat and per finding. G-D2's 8 findings describe one defect: 8 input variants, not
     8 independent cases.
4. **Arm O from the start, mainly for D2:** same findings and model, plus frozen evidence lines as extra blocks.
   Base `unsupported` + O correctly published → an evidence-delivery limit. Both fail → investigate model
   judgement, claim complexity and quote validation. An O result never counts as a success of the production
   policy.
5. **Models: luna first** (`openai/gpt-6-luna` @ `openai`). Order: the free #247 backcheck and a stubbed dry run,
   then 3 repeats of the original batches plus O. Sonnet only as a second stage, if luna fails even with full
   evidence; if the limit is in the excerpts, a different model does not fix evidence delivery.
6. **The sealed "zero owner-rejected" gate is not changed.** It stays as the earlier criterion. This experiment
   measures claim truth and the survival of true findings; it can show the verifier is useful, but it does not by
   itself justify re-enabling the whole AI review.

### Owner decisions (2026-10-09, after the free follow-up)

7. **Arm O evidence, frozen.**
   - **G rows:** the archived EVID of `backcheck-269.py`. The owner compared all 20 of 20 rows, with no
     mismatch.
   - **H rows:** the agent's proposal, corrected by the owner against `dec09f8`:

     | Row  | Evidence lines                                |
     | ---- | --------------------------------------------- |
     | H-R1 | `prod-fetch-results.py` 2–25, 38              |
     | H-R2 | as proposed                                   |
     | H-R3 | as proposed                                   |
     | H-R4 | `prod-result-dimensions.py` 79–98, 116–128    |
     | H-R5 | `prod-result-dimensions.py` 102, 109, 138–139 |

     H-R1's 2–25 is the whole docstring. H-R4's ranges add the second unpack, `return None` and the
     result-handling path. H-R5's add the `CONFIRMED` condition.

   - **"Full EVID" means every listed line, not the complete evidence.** It excludes Pillow's source, ROI data,
     experiments and the PR file list. O stays a diagnostic arm.
8. **Classes, final:**

   | Class          | Rows                                             |
   | -------------- | ------------------------------------------------ |
   | True           | G-D2, H-R1, H-R3, H-R5                           |
   | Code-refutable | G-D13, G-D14, G-D20                              |
   | Policy         | G-D4–D10, G-D16, G-D18, G-D19, H-R2              |
   | Ambiguous      | G-D1, G-D3, G-D11, G-D12, G-D15, G-D17, **H-R4** |
   - **Ambiguous** means "not decidable by the verifier from the material delivered". The owner rejected all of
     these rows earlier. Each one's reason:
     - D1, D15: Pillow behaviour;
     - D3: the id format and the collision risk; the code itself shows an overwrite is possible;
     - D11: the real ROIs and input sizes;
     - D12: a documented design decision; the truth of an observation and whether it is worth reporting are
       different judgements;
     - D17: the decode-geometry guarantee, partly Pillow.
   - **H-R4 moves to ambiguous.** Verified whole, it joins a false JPEG claim to a true short-PNG exception
     (`:82`), so `refuted` alone must not be required.
   - **Policy class:** no mandatory `confirmed`, especially for missing-tests claims. It is reported only.

### Owner decisions (2026-10-09, during `/rune-plan`)

9. **Threshold: 3/3 base repeats per finding** for the hard classes. A 2/3 majority view is reported as
   information. The owner noted that 2/3 "is not bad either", since the review is advisory.
10. **Refuted (code-refutable class)** counts only when all three hold:
    - the verdict is `refuted`;
    - its quote passes the sealed check;
    - its argument, together with the quote, actually refutes the frozen claim.

    The argument is judged in a hand-read that applies the rationales written down before the run (the archived
    D13, D14 and D20 rejection reasons). An off-target argument and a missing or invalid quote are reported
    separately. The automatic result and the hand-read result are both kept. The hand-read is blinded to arm and
    repeat where feasible.

11. **Failures:**
    - **Failed attempt** (model-attributable): a format error after the repair, or a timeout or 5xx after the
      sealed retry. It fails every finding of that batch in that repeat, and gets no extra draw. It lowers the
      hard result, but its cause is reported separately, not as a judgement error.
    - **Condition violation:** a wrong provider, a reasoning leak, 401/402, a harness crash or a hash mismatch.
      It stops the series. Every attempt and cost is kept, and nothing is deleted. The series may resume only
      with identical frozen code, inputs and config; any change means a new series.
    - Reliability of the whole path and judgement quality on completed calls are reported apart.
12. **Budget:** $1.00 hard; stop and ask at $0.80.

2026-10-10: owner decision — on resume, a slot whose attempt was a condition violation gets one fresh attempt; the violated attempt is kept, counted in T, never scored; plan.md § Definitions, Condition violation.
2026-10-10: Phase 1 impl-review `reviews/impl-review-phase-1-edc0a83.md` (REJECTED: 1 critical, 3 warnings) — all four fixed in `fix(finder-verifier-frozen): address phase 1 review (p1)`; self-test 63/63; the reviewer's mutants now fail.
2026-10-10: owner approved the pre-registration in `gate.md`, including §8's ten compound findings (the owner added G-D7 #5.4 and G-D4 #1.5; the agent added G-D5 #7.4); sealed at sha256 c26476825dd06a6daf0c5904591ba48ec493810ca02a197a3bb92f1938a8adaa. The seal does not start Phase 3.
2026-10-10: owner decision — before the paid series, record each response's generation id and service_tier (Amendment 1 in `gate.md`; pre-flight found the `openai/flex` and `openai/fast` variants); no change to requests or scoring. The paid series is not yet authorized.
2026-10-10: paid series authorized by the owner and complete — 114/114 attempts ok, T $0.045438 of the $0.80 cap; automatic outcome in `gate.md` § Results (true class 5/11 pass 3/3; G-D13 and G-D14 confirmed 3/3 in both arms; G-D20 refuted 3/3, hand-read pending).
2026-10-10: owner graded the blind sheet (R01–R06 pass); final result in `gate.md` § Results › Hand-read and final result — true class FAIL (5/11), code-refutable FAIL (1/3: G-D20 pass; G-D13 and G-D14 confirmed 3/3 in both arms). Stage-2 decision (plan 4.7) pending.
2026-10-10: full review `reviews/impl-review-e0d2d19.md` APPROVED (no findings). Its three caveats are recorded in `gate.md` § Results › Corrections and caveats. In particular, G-D13's counterevidence was delivered in base as well as O; the earlier wording, also given to the owner in session, implied O only.
2026-10-10: owner decision (plan 4.7) — stage 2 goes ahead: sonnet as a NEW, separately pre-registered change. It is not part of this change, whose result stands as recorded in `gate.md` § Results (luna: true class 5/11, code-refutable 1/3). The trigger of decision 5 held: luna confirmed G-D13 and G-D14 although their counterevidence was delivered.
