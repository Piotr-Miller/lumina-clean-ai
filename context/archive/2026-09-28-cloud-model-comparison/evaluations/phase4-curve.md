# Phase 4: deterministic exposure curve (exploratory)

**Exploratory, no gate, no paid inference** (owner decision 2026-11-02, plan Phase 4). It cannot
change the Phase 3 verdicts (`gpt-std` STOP, `nafnet` STOP) and authorises no Phase 5 run.

**Answer to 4.2 — what carried the gain: neither exposure nor NAFNet.** NAFNet loses clearly to
its own control with the identical curve on all three photos. The curve on Local's own denoising
is neutral: one slight win, one tie, one slight loss. Both curve arms stop here (plan Phase 4: "no
gain or a regression means stop that curve arm").

- **Curve:** `curve-v1` (`scripts/s19/configs/curve.json`, sha256 `678b968c…`), Local's Auto
  gamma with only λ0 = 0.5 of its lift in dark tones (p05 → median) and a fade of h = 0.5 above
  p95; `scripts/s19/curve.ts`. Against the gamma arms it moves mean brightness by 0.2–2.7 of 255
  (about 0.2 on S17-04, where γ = 1.10).
- **Arms:** `nafnet-curve` (Phase 3 NAFNet output from the gate ledger + curve), `control-curve`
  (the same NAFNet input + the same curve, no denoise), `blur-curve` (common input + Local's Auto
  blur + curve), and `nafnet-gamma` again for consistency. The reference is the real Local
  baseline (`local/<id>.jpg`).
- **Ratings:** the owner's verdicts, pasted into the Claude session on 2026-11-02, made on 12
  blind pairs in `test-photos/private/s19/phase4-blind/` (`oryginal`/`A`/`B`, PNG sRGB without
  metadata, each pair at the smaller arm's size, pair order shuffled and A/B drawn per pair with
  `secrets`). Decoded through the sealed key, sha256 `bd14b981…`, after the owner closed the
  rating.
- **Blinding limits:** `blur-curve` pairs are at full resolution and the NAFNet pairs at the
  NAFNet size, so size reveals the arm type (not the side). Pairs of one photo share the same Local
  file at the same size. The 12 pairs cover only three scenes.

## Ratings

| Pair | Photo  | Candidate      | Reference       | Blind | Preference       | Category      | Reason (owner)                  |
| ---- | ------ | -------------- | --------------- | ----- | ---------------- | ------------- | ------------------------------- |
| 01   | S17-03 | NAFNet + curve | Local           | B     | reference-clear  | moderate loss | Lepsze zachowanie gwiazd        |
| 11   | S17-03 | NAFNet + curve | control + curve | A     | reference-clear  | moderate loss | Znacznie mniej rozmytych gwiazd |
| 10   | S17-03 | NAFNet + γ     | Local           | B     | reference-clear  | moderate loss | Wyraźniejsze, punktowe gwiazdy  |
| 07   | S17-03 | blur + curve   | Local           | A     | candidate-slight | tie           | Lepszy kontrast ciemnego nieba  |
| 04   | S17-04 | NAFNet + curve | Local           | B     | reference-clear  | moderate loss | Neutralne nocne niebo           |
| 02   | S17-04 | NAFNet + curve | control + curve | A     | reference-clear  | moderate loss | Brak zielonego zafarbu          |
| 08   | S17-04 | NAFNet + γ     | Local           | B     | reference-clear  | moderate loss | Brak zielonego zafarbu          |
| 06   | S17-04 | blur + curve   | Local           | A     | tie              | tie           | Praktycznie brak przewagi       |
| 05   | S17-07 | NAFNet + curve | Local           | A     | reference-clear  | moderate loss | Mniej rozmycia twarzy i ubrań   |
| 09   | S17-07 | NAFNet + curve | control + curve | B     | reference-clear  | moderate loss | Więcej zachowanych szczegółów   |
| 12   | S17-07 | NAFNet + γ     | Local           | B     | reference-clear  | moderate loss | Lepsze faktury i kolorystyka    |
| 03   | S17-07 | blur + curve   | Local           | A     | reference-slight | tie           | Naturalniejsze kolory           |

Reasons are the owner's, written for the preferred side; for a `reference-*` row they describe
the reference. Categories follow the bar (`quality-bar.md`): a clear preference for the reference
is a moderate loss. No severe regression or content change was flagged.

## Findings

- **NAFNet hurts, with or without the curve.** Against its matched control (same input, Auto
  record and curve), NAFNet + curve loses clearly on all three photos: blurred stars (S17-03), a
  green cast (S17-04), lost detail (S17-07). That is 0 of 3, the same direction as Phase 3 (0 of 3
  over the gamma control).
- **NAFNet + γ is rated more harshly than in Phase 3** (clear rather than slight losses against
  Local on all three photos). The direction is the same.
- **The curve does not carry a gain.** On Local's own denoising it gives a slight win on S17-03,
  a tie on S17-04 and a slight loss on S17-07: no consistent exposure benefit. The owner's
  pre-unblinding impression of "a visible exposure gain on the dark street" is not supported after
  unblinding: on S17-07 the plain Local was slightly preferred.
- Every NAFNet loss names the same kinds of defect: colour cast, smoothing and loss of stars or
  fine detail. These are not exposure problems, so an exposure curve could not fix them.

## Consequence

Both curve arms stop. Phase 4 changes nothing in the Phase 3 verdicts: `gpt-std` STOP, `nafnet`
STOP, `gpt-large` inconclusive. The experiment now waits for the owner's decision: close it as
"stopped before validation", or explicitly authorise a new candidate configuration, its budget
and a prospective validation.
