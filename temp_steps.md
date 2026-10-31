# Kolejne kroki (stan na 2026-10-28, wieczór)

## Następne: S-19 `cloud-model-comparison` (#271)

Cloud AI jest wstrzymany na produkcji od 2026-10-28T20:33:24Z (`CLOUD_DAILY_CAP=0`). Wraca dopiero wtedy,
gdy S-19 spełni próg: co najmniej 8/12 wyraźnych wygranych, najwyżej jedna umiarkowana przegrana,
zero ciężkich regresji. Samo zakończenie porównania nie wystarcza. Szczegóły:
`context/changes/cloud-model-comparison/change.md` § Production pause.

1. **Ty:** zdecyduj, jak zastąpić ujawnione zdjęcia walidacyjne S17-05 i S17-06, żeby próg nadal
   był liczony na 12 zdjęciach. Opis ekspozycji: `cloud-model-comparison/change.md` § Holdout exposure.
2. **Ja:** `/rune-frame cloud-model-comparison` — kandydaci (modele) i protokół porównania.
   Bread przy niskiej gammie i słabym odszumianiu to tylko jeden kandydat.
3. **Ja:** `/rune-plan cloud-model-comparison`, potem plan review.
4. **Ty:** zatwierdź koszt płatnych uruchomień, zanim ruszą.
5. **Ja:** implementacja i uruchomienia; holdout otwierany dopiero przy ocenie końcowej.

Zasady:

- Zdjęcia do akceptacji na produkcji wybieramy z podziału `tuning` albo spoza benchmarku, nigdy z `validation`.
- Porównanie oryginał → wynik Bread → post-pass dla S17-05/06 jest diagnostyczne. Nie służy do strojenia
  kandydatów. Pliki: `test-photos/private/s19-holdout-exposure/` (gitignored).
- Wniosek z tego porównania: prześwietlenie i utrata nasycenia pochodzą z Bread; post-pass tylko
  obniża szum barwny nieba (~¼).

## Kolejka po S-19

- **`cloud-error-message-leak`** (status `new`): użytkownik widzi surowy tekst błędu (`Signal timed out.`,
  HTML strony 502 od Replicate). Analiza w `context/changes/cloud-error-message-leak/change.md`.
  Następny krok: `/rune-plan cloud-error-message-leak`; w planie: czy `start_failed` dostaje osobny komunikat.
- **Opcjonalnie:** `/rune-lesson` z regułą o wyborze zdjęć do akceptacji spoza holdoutu.

## Stan lokalny (do pamiętania)

- Lokalny stack Supabase jest zatrzymany. Zostały 3 wolumeny podmana (`supabase_db_*`, `supabase_storage_*`,
  `supabase_edge_runtime_*`). Przed następnym `npx supabase start` trzeba je usunąć
  (skill `run-local-stack`, landmine 2).
- `supabase/functions/` i `src/` mają etykietę SELinux `container_file_t`. Cofnięcie: `restorecon -R supabase/ src/`.
- `.dev.vars` i `supabase/functions/.env` są wygenerowane lokalnie dla E2E (gitignored).
- `wrangler` jest zalogowany na tej maszynie (2026-10-28).

## Zamknięte (2026-10-27 – 2026-10-28)

- `ai-review-weekly-report`: akceptacja 1.5/3.5/3.6/4.3/4.4, archiwizacja #318, `archive_commit` #319.
- Ekspozycja holdoutu S17-05/06 + porównanie etapów + decyzja o pauzie: #320.
- Kill-switch `CLOUD_DAILY_CAP=0` ustawiony i potwierdzony end-to-end: #321.
- `cloud-pause-message`: przy capie 0 API zwraca 503 `cloud_paused`, a UI pokazuje „Cloud AI is temporarily
  unavailable due to maintenance…”. Implementacja #322, akceptacja i archiwizacja #323, `archive_commit` #324.
