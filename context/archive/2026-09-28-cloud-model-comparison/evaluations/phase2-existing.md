# Phase 2: existing spike outputs vs historical Local

**Historical diagnostic evidence, not a gate.** The spike's paid outputs (2026-10-30) were rated
blind against the historical Local downloads (2026-10-29). Both came from unprepared source files:
no sRGB conversion, so S17-04's Display P3 and S17-07's Adobe RGB reached the models as stored.
No row here counts towards a core, tuning or validation gate (plan Phase 2).

- **Ratings (2.2, attribution as recorded):** `phase2-existing.json`'s `rating_method` attributes
  these verdicts to the owner, pasted on 2026-11-01. It says they were made on blind file copies in
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

### Authorship review (2.2, Codex, 2026-11-01)

The recorded evaluator is the repository owner. The export and this summary do not provide a
separate original rating submission or identify an AI evaluator. Codex reviewed the recorded
ratings and their interpretation in this session; it did not perform the original blind visual
assessment and does not adopt these ratings as its own. The owner's actual authorship is
therefore not independently established by these artifacts. Item 2.2 remains pending owner
confirmation or a correction naming the actual evaluator; this review is not manual acceptance.

**Owner confirmation (2026-11-01):** asked in the Claude session to confirm 2.2 as their own
ratings and to review the 2.3 stop rule, the owner answered "potwierdzam". Both rows are recorded
in Progress at the master revision after this PR's rebase-merge.

## Ratings

Arm names are given from the candidate's side; "Blind" is where the candidate sat.

| Photo  | Candidate          | Reference                 | Blind | Preference       | Flags                                           | Bar category | Reason (recorded as owner)                                                                                                                   |
| ------ | ------------------ | ------------------------- | ----- | ---------------- | ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S17-04 | GPT (spike)        | Local (historical)        | A     | candidate-clear  | none                                            | clear win    | A odzyskuje chmury, trawnik i czerwone krzewy, zachowując architekturę — to niezależna poprawa, nie rekonstrukcja napisów.                   |
| S17-04 | NAFNet (spike) + γ | Local (historical)        | B     | reference-slight | none                                            | tie          | A zachowuje bardziej neutralne ciemne niebo; B wprowadza zielonkawy zafarb. Detale budynku są porównywalne.                                  |
| S17-04 | NAFNet (spike) + γ | Control (spike input + γ) | B     | reference-slight | none                                            | tie          | Praktycznie ten sam rezultat co w parze 2; A jest minimalnie bardziej naturalne kolorystycznie.                                              |
| S17-07 | GPT (spike)        | Local (historical)        | B     | candidate-clear  | unverified lettering reconstruction (candidate) | clear win    | B dużo skuteczniej odzyskuje wygląd twarzy, ubrań, cegieł i witryny — przewaga jest niezależna od poprawionej czytelności neonowych napisów. |

- **Severe regressions:** none. **Content changes:** none confirmed, so no crop notes.
- **S17-04 GPT:** the record says the owner checked a strongly brightened original: the cloud
  outlines exist in the source, but the sky's blue colour is a colour interpretation the source
  cannot fully confirm. No flag was recorded for it.
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
matches the recorded "zielonkawy zafarb" on both NAFNet pairs.

## Stop rule (2.3, reviewed by Codex on 2026-11-01)

The plan's rule requires GPT to be a **moderate loss or worse against Local on both S17-04 and
S17-07**. Under `tally.py`, a clear preference for Local (`reference-clear`) is a moderate loss;
a confirmed content change or a severe-candidate flag is a severe regression. If both photos meet
that condition, the owner decides whether Phase 3 still runs for GPT; the rule does not itself
automatically reject GPT.

**On the recorded ratings, the condition is false:** GPT is a clear win on each photo, with no
confirmed content change or severe-candidate flag. The unverified lettering reconstruction on
S17-07 is retained, and the recorded win rests on independent gains. This conclusion is
conditional on the ratings whose authorship is discussed in 2.2 above; it is not a fresh visual
assessment or owner acceptance of item 2.3.

NAFNet + gamma has `reference-slight` against both Local and its own control on S17-04. Both map
to **tie** under the bar, not moderate loss, and the Phase 2 GPT stop rule does not apply to
NAFNet. Its denoise did not beat the no-denoise control in these historical ratings. That is a
diagnostic signal only; Phase 3 tests NAFNet on the prepared inputs.

Phase 2 supplies no core, tuning or validation gate pass.
