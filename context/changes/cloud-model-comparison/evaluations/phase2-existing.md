# Phase 2: existing spike outputs vs historical Local

**Historical diagnostic evidence, not a gate.** The spike's paid outputs (2026-10-30) were rated
blind against the historical Local downloads (2026-10-29). Both came from unprepared source files:
no sRGB conversion, so S17-04's Display P3 and S17-07's Adobe RGB reached the models as stored.
No row here counts towards a core, tuning or validation gate (plan Phase 2).

- **Ratings:** the owner's verdicts, pasted on 2026-11-01. They were made on blind file copies in
  `test-photos/private/s19/phase2-blind/`, not in `compare-arms.html`. Each pair holds
  `oryginal`/`A`/`B` as PNG in sRGB, with no metadata, at the smaller arm's pixel size. A/B was
  drawn per pair with `secrets.randbelow` and translated through the sealed key, whose sha256 is
  in the export's `rating_method`.
- **Blinding note:** pairs 2 and 3 share the NAFNet + gamma arm, so their B file was
  byte-identical. The rater noticed this but not which arm it was.
- **Evidence:** `phase2-existing.json` (export, built from the viewer manifest `phase2.js` and the
  key), `phase2-series.json`, `phase2-attempts.jsonl` and `phase2-configs/`, all written by
  `scripts/s19/historical.py` from the spike `meta.json` files. Unknown historical fields are
  `null`.
- **Tally:** `phase2-report.json`, from `tally.py --diagnostic`: exit 0, both configs `DIAGNOSTIC`.

## Ratings

Arm names are given from the candidate's side; "Blind" is where the candidate sat.

| Photo  | Candidate          | Reference                 | Blind | Preference       | Flags                                           | Bar category | Reason (owner)                                                                                                                               |
| ------ | ------------------ | ------------------------- | ----- | ---------------- | ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S17-04 | GPT (spike)        | Local (historical)        | A     | candidate-clear  | none                                            | clear win    | A odzyskuje chmury, trawnik i czerwone krzewy, zachowując architekturę — to niezależna poprawa, nie rekonstrukcja napisów.                   |
| S17-04 | NAFNet (spike) + γ | Local (historical)        | B     | reference-slight | none                                            | tie          | A zachowuje bardziej neutralne ciemne niebo; B wprowadza zielonkawy zafarb. Detale budynku są porównywalne.                                  |
| S17-04 | NAFNet (spike) + γ | Control (spike input + γ) | B     | reference-slight | none                                            | tie          | Praktycznie ten sam rezultat co w parze 2; A jest minimalnie bardziej naturalne kolorystycznie.                                              |
| S17-07 | GPT (spike)        | Local (historical)        | B     | candidate-clear  | unverified lettering reconstruction (candidate) | clear win    | B dużo skuteczniej odzyskuje wygląd twarzy, ubrań, cegieł i witryny — przewaga jest niezależna od poprawionej czytelności neonowych napisów. |

- **Severe regressions:** none. **Content changes:** none confirmed, so no crop notes.
- **S17-04 GPT:** the owner checked a strongly brightened original. The cloud outlines exist in the
  source, but the sky's blue colour is a colour interpretation the source cannot fully confirm.
  The owner did not flag it.
- **S17-07 GPT:** the win rests on faces, clothes, brick and the shop window. The neon lettering is
  flagged as unverified reconstruction, so it is not counted as the basis of the win.

## NAFNet's green cast is the model's, not the colour handling

Before the ratings, the S17-04 colour path looked like a possible confound: the spike's NAFNet
input kept its Display P3 profile, and the NAFNet PNG came back with no profile. A measurement of
the sky (top 18% of the frame, mean `g − (r+b)/2`, 0–255) rules it out:

| File                                 | g − (r+b)/2 |
| ------------------------------------ | ----------- |
| NAFNet input, P3 numbers as stored   | +0.42       |
| NAFNet input converted to sRGB       | +0.38       |
| NAFNet raw output                    | +2.61       |
| NAFNet + Local gamma (rated)         | +3.01       |
| Control (input + Local gamma, rated) | +0.45       |

The P3→sRGB conversion barely moves the sky. The green shift appears in NAFNet's own output, which
matches the owner's "zielonkawy zafarb" on both NAFNet pairs.

## Stop rule (2.3, the owner's to review)

The rule: if GPT is a moderate loss or worse against Local on both photos, the owner decides
whether Phase 3 still runs for GPT. **GPT is a clear win on both photos, so the rule is not
triggered.** NAFNet + gamma is slightly worse than both Local and its own control on S17-04, and
its denoise did not beat the no-denoise control. That is a diagnostic signal only; Phase 3 tests
NAFNet on the prepared inputs.
