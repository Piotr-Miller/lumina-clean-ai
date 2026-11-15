# S-20 step 1a — gate verdict

**Verdict: FAIL.** Wins against `control-full`: 3 of 8 (6 required). Frozen `k` = 1.0.

- 3 of 8 wins against control-full, 6 required
- significant or severe NLM fidelity loss on S17-03

Written by `scripts/s20/gate.py`; re-derive it with `gate.py --audit context/changes/cloud-classical-denoise/evaluations/step1-audit`. Quality is NLM's side: `nlm-*` means NLM preferred; the Local pair is
diagnostic. Fidelity is judged against the original; the worst NLM side across both pairs counts.

| Photo  | vs control | vs Local         | NLM fidelity (control / Local) | Worst       | Reference fidelity (control / Local) |
| ------ | ---------- | ---------------- | ------------------------------ | ----------- | ------------------------------------ |
| S17-01 | nlm-slight | nlm-slight       | minor / minor                  | minor       | none / none                          |
| S17-02 | nlm-slight | nlm-slight       | minor / minor                  | minor       | none / none                          |
| S17-03 | tie        | tie              | significant / significant      | significant | none / none                          |
| S17-04 | tie        | tie              | none / none                    | none        | none / none                          |
| S17-05 | tie        | tie              | none / none                    | none        | none / none                          |
| S17-06 | tie        | tie              | none / none                    | none        | none / none                          |
| S17-07 | tie        | reference-slight | none / none                    | none        | none / none                          |
| S17-21 | nlm-slight | tie              | none / none                    | none        | none / none                          |

## Crops and reasons

Source pixels, half-open `[x, x+w) × [y, y+h)`.

- S17-03, nlm side vs control-full: x 93, y 52, 1857×1307 — Słabsze gwiazdy w ciemnym niebie po lewej są mniej widoczne, a drobne przejścia przy krawędzi pasma zorzy zlewają się po wygładzeniu.
- S17-03, nlm side vs local: x 93, y 52, 1857×1307 — Słabsze gwiazdy w ciemnym niebie po lewej są mniej widoczne, a drobne przejścia przy krawędzi pasma zorzy zlewają się po wygładzeniu.
