# GPT-Image-2.6 screen — verdict

**Verdict: PASS.** Pairs at least a tie: 4 of 6 (4 required). Gate `gpt26-screen-v1`, set `gpt26-screen`.

## Not delivered

- none

## Fidelity

- none

## Budget and protocol

- none

## Pairs

Fidelity is judged against the original at the GPT output's size; the tie rule is GPT level ≤ Local level. Quality is diagnostic only.

| Slot     | Pair | GPT fidelity | Local fidelity | At least a tie | Quality (diagnostic) |
| -------- | ---- | ------------ | -------------- | -------------- | -------------------- |
| S17-03/1 | p02  | minor        | minor          | yes            | gpt-slight           |
| S17-03/2 | p06  | minor        | none           | no             | gpt-slight           |
| S17-04/1 | p01  | minor        | minor          | yes            | gpt-slight           |
| S17-04/2 | p04  | minor        | none           | no             | gpt-slight           |
| S17-07/1 | p05  | minor        | minor          | yes            | gpt-clear            |
| S17-07/2 | p03  | minor        | minor          | yes            | gpt-clear            |

## Run

- Spend: $0.48 conservative (known cost, else the full reservation), $0.4843 known billed, 0 attempt(s) without a known cost; approved cap $1.50. Within the cap and no bound breach.
- Blocks (moderation_blocked): 0 first-attempt, 0 recovered by the retry, 0 final undelivered.
- Wall time per call (s): 29.98, 30.95, 27.91, 30.55, 29.28, 27.94; p95 30.95 s vs the 30 s guardrail (diagnostic).
- Passes: [3, 3].
- Residual risk: Each scene's two pairs share the same Local file, so its two resized copies are pixel-identical. Independent per-pair order and A/B draws do not hide that repetition; a rater may recognise the repeated Local side. The two-pass procedure reduces immediate comparison but cannot eliminate recognition or prove compliance. Recorded before spend; restated in the verdict.

## Crops and reasons

Pixels of the GPT-size comparison, half-open `[x, x+w) × [y, y+h)`.

- S17-03/1, GPT side: x 1447, y 1144, 861×391 — Brzeg na pierwszym planie przebarwiony: w oryginale ma zieloną poświatę zorzy, w B jest beżowo-szary, a faktura kamieni wygładzona. Poza kadrem: znikła część słabych gwiazd, zorza wyraźnie ciemniejsza, pod skałą dorysowane odbicie w wodzie.
- S17-03/2, GPT side: x 912, y 208, 554×395 — Większość słabych gwiazd na tle zorzy wymazana (w oryginale gęste pole gwiazd, tu pojedyncze punkty). Do tego zmieniona kolorystyka: zielonkawa poświata zorzy na śniegu zastąpiona neutralną bielą, faktura śniegu wygładzona.
- S17-04/1, GPT side: x 1724, y 1062, 216×195 — Okno po prawej przemalowane: w oryginale neutralne, z czerwonawymi przedmiotami na parapecie; w B żółto podświetlone, przedmioty zniknęły, a odbicia w sąsiednim oknie są uproszczone. Dodatkowo dorysowane odblaski na prętach bramy.
- S17-04/2, GPT side: x 890, y 473, 128×155 — Flaga dorysowana: w oryginale nieczytelna plama, tu wyraźne pasy i gwiazdy, których nie było. Podobnie odblaski na prętach zamienione na syntetyczne kropki, zniknęła jasna plamka na niebie, a niebo ścięte do czerni.
- S17-07/1, GPT side: x 702, y 356, 191×225; x 1144, y 116, 165×310 — A1: twarz mężczyzny narysowana od nowa, ostre rysy, których w rozmytym oryginale nie ma (to samo twarz kobiety i plakat po lewej). A2: nieczytelny w oryginale neon zamieniony na wymyślony czytelny napis (BARGAIN BOOKS / 2ND VERSED).
- S17-07/2, GPT side: x 686, y 345, 263×274; x 1290, y 394, 183×217 — Twarze wygenerowane od nowa: mężczyzna z brodą (B1) i kobieta po prawej (B2) mają inne rysy, fryzurę i mimikę niż w oryginale, czyli to już inne osoby. Przerysowane także ubrania (faktura swetra, kurtka) i włosy mężczyzny stojącego tyłem.

Written by `scripts/gpt26/gate.py` from the sealed set, the frozen run record and the committed ratings.
