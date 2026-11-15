# S-20 step 1b — gate verdict

**Verdict: FAIL.** Wins against `control-full`: 4 of 8 (6 required). Frozen `k` = 1.5.

- 4 of 8 wins against control-full, 6 required
- significant or severe wavelet fidelity loss on S17-03

Written by `scripts/s20/gate.py`; re-derive it with `gate.py --trial 1b --audit context/changes/cloud-classical-denoise/evaluations/step1b/audit`. Quality is wavelet's side: `wavelet-*` means wavelet preferred; the Local pair is
diagnostic. Fidelity is judged against the original; the worst wavelet side across both pairs counts.

| Photo  | vs control     | vs Local         | wavelet fidelity (control / Local) | Worst       | Reference fidelity (control / Local) |
| ------ | -------------- | ---------------- | ---------------------------------- | ----------- | ------------------------------------ |
| S17-01 | wavelet-clear  | wavelet-clear    | minor / minor                      | minor       | none / none                          |
| S17-02 | wavelet-slight | wavelet-slight   | minor / minor                      | minor       | none / none                          |
| S17-03 | wavelet-slight | wavelet-slight   | significant / significant          | significant | none / none                          |
| S17-04 | tie            | tie              | none / none                        | none        | none / none                          |
| S17-05 | tie            | reference-slight | none / none                        | none        | none / none                          |
| S17-06 | tie            | tie              | none / none                        | none        | none / none                          |
| S17-07 | tie            | reference-clear  | none / none                        | none        | none / minor                         |
| S17-21 | wavelet-clear  | wavelet-slight   | minor / minor                      | minor       | none / minor                         |

## Crops and reasons

Source pixels, half-open `[x, x+w) × [y, y+h)`.

- S17-03, wavelet side vs control-full: x 2608, y 1024, 304×274 — Najsłabsze gwiazdy znikają lub rozmywają się w smugi, ziarnista faktura nieba i gruntu wygładzona do plastycznych plam (efekt akwareli).
- S17-03, wavelet side vs local: x 2608, y 1024, 304×274 — Najsłabsze gwiazdy znikają lub rozmywają się w smugi, ziarnista faktura nieba i gruntu wygładzona do plastycznych plam (efekt akwareli).
