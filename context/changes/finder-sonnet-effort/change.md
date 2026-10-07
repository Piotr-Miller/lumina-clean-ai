---
change_id: finder-sonnet-effort
title: "Measure sonnet-5 as finder at reasoning effort low and medium"
status: impl_reviewed
created: 2026-10-06
updated: 2026-10-07
archived_at: null
---

## Notes

Predecessor: finder-sonnet

Owner, 2026-10-06: w tej zmianie sprawdzić `reasoning.effort` **low** i **medium** dla
`anthropic/claude-sonnet-5` jako findera.

Punkt wyjścia: `context/archive/2026-10-05-finder-sonnet/` (werdykt `NOT ADMITTED (reliability)`), przy domyślnym
effort `high`:

- `269-r1` przekroczył limit 16 384 tokenów wyjścia na krok (`finish=length` → `NoOutputGeneratedError`, bez
  retry);
- prognoza kosztu $13.90/mies. > $10; m247 $0.162874 przy progu ~$0.139716;
- hand-read #247: 2/5 odrzucone.

Nowe effort wymaga nowej oceny jakości (hand-read). Kod Phase 1 z finder-sonnet (pin `anthropic`, logowanie
providera, runner) jest tylko na `feat/finder-sonnet` (`33fdb79`, `624a936`).
