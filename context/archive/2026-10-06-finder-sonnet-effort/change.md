---
change_id: finder-sonnet-effort
title: "Measure sonnet-5 as finder at reasoning effort low and medium"
status: archived
outcome: completed
created: 2026-10-06
updated: 2026-10-09
archived_at: 2026-10-09T17:38:40Z
archive_commit: d85b486
sync: none
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

Werdykt (owner, 2026-10-07; etykieta poprawiona 2026-10-09):
**`NOT ADMITTED (low: hand-read #247, hand-read #269; medium: hand-read #247, hand-read #269)`** — `gate.md` §
Verdict. Niezawodność i koszt przechodzą w obu ramionach (low $6.63/mies., medium $9.37/mies.); żaden run #269 nie
opublikował D2. Hand-read #247 nie przechodzi z reguły „unresolved = rejected": właściciel nie przyjął klasyfikacji
agenta (te są informacją). Krok 4.4 nie da się już wykonać na ślepo. Produkcja bez zmian, `ai-review` wyłączony,
Phase 5 nie rusza.
