# Kolejne kroki (stan na 2026-10-28, wieczór)

## Następne: S-19 `cloud-model-comparison` (#271)

**Gdzie kontynuować (stan 2026-10-28, noc):** gałąź `feat/cloud-model-comparison` (wypchnięta na `origin`,
bez PR). Na nowej maszynie: `git fetch && git switch feat/cloud-model-comparison`.

Cloud AI jest wstrzymany na produkcji od 2026-10-28T20:33:24Z (`CLOUD_DAILY_CAP=0`, użytkownik widzi
komunikat o konserwacji). Wraca dopiero wtedy, gdy S-19 spełni próg: co najmniej 8/12 wyraźnych wygranych,
najwyżej jedna umiarkowana przegrana, zero ciężkich regresji.

Zrobione na gałęzi:

- Decyzja o zastąpieniu holdoutu: `context/changes/cloud-model-comparison/holdout-replacement-decision.md`.
- Zestaw `s19-v1` zamrożony: `test-photos/s19-benchmark.json` + `test-photos/s19-benchmark.sha256`
  (6 tuning, 12 walidacja, 3 dodatkowe „wymaga obróbki” S19-E01–E03 poza progiem, 2 diagnostyczne S17-05/06).
  - S19-V01 (zastępca S17-05, wymaga obróbki): `test-photos/licensed/25-phone-makersoul-yuchau-galaxys9plus.jpg`.
  - S19-V02 (zastępca S17-06, dobry stan, test braku pogorszenia): `test-photos/licensed/24-phone-banyan-lamp-xiaomi.jpg`.
  - Log wyboru: `context/changes/cloud-model-comparison/s19-collection-log.md`.
- Weryfikacja na nowej maszynie: `sha256sum -c test-photos/s19-benchmark.sha256` (24× OK).

Kroki:

1. **Ja:** `/rune-frame cloud-model-comparison` — kandydaci (modele) i protokół porównania.
   Bread przy niskiej gammie i słabym odszumianiu to tylko jeden kandydat.
2. **Ja:** `/rune-plan cloud-model-comparison`, potem plan review.
3. **Ty:** zatwierdź koszt płatnych uruchomień, zanim ruszą.
4. **Ja:** implementacja i uruchomienia; walidacja otwierana dopiero przy ocenie końcowej.

Zasady:

- Na żadnym zdjęciu `s19-v1` nie uruchomiono jeszcze żadnego silnika — tak ma zostać do zablokowania
  konfiguracji kandydatów na zdjęciach tuningowych.
- Zdjęcia do akceptacji na produkcji wybieramy spoza walidacji (tuning albo spoza benchmarku).
- Porównanie etapów S17-05/06 (oryginał → Bread → post-pass) jest diagnostyczne, nie do strojenia.
  Wniosek: prześwietlenie i utrata nasycenia pochodzą z Bread; post-pass tylko obniża szum barwny.
  Pliki są tylko na komputerze domowym: `test-photos/private/s19-holdout-exposure/` (gitignored);
  hashe i liczby są w `cloud-model-comparison/change.md` § Holdout exposure.

## Kolejka po S-19

- **`cloud-error-message-leak`** (status `new`): użytkownik widzi surowy tekst błędu (`Signal timed out.`,
  HTML strony 502 od Replicate). Analiza w `context/changes/cloud-error-message-leak/change.md`.
  Następny krok: `/rune-plan cloud-error-message-leak`; w planie: czy `start_failed` dostaje osobny komunikat.
- **Opcjonalnie:** `/10x-lesson` z regułą o wyborze zdjęć do akceptacji spoza holdoutu.

## Stan lokalny (do pamiętania)

- Lokalny stack Supabase jest zatrzymany. Zostały 3 wolumeny podmana (`supabase_db_*`, `supabase_storage_*`,
  `supabase_edge_runtime_*`). Przed następnym `npx supabase start` trzeba je usunąć
  (skill `run-local-stack`, landmine 2).
- `supabase/functions/` i `src/` mają etykietę SELinux `container_file_t`. Cofnięcie: `restorecon -R supabase/ src/`.
- `.dev.vars` i `supabase/functions/.env` są wygenerowane lokalnie dla E2E (gitignored).
- `wrangler` jest zalogowany na komputerze domowym (2026-10-28); na laptopie służbowym trzeba `npx wrangler login`, jeśli będzie potrzebny.

## Zamknięte (2026-10-27 – 2026-10-28)

- `ai-review-weekly-report`: akceptacja 1.5/3.5/3.6/4.3/4.4, archiwizacja #318, `archive_commit` #319.
- Ekspozycja holdoutu S17-05/06 + porównanie etapów + decyzja o pauzie: #320.
- Kill-switch `CLOUD_DAILY_CAP=0` ustawiony i potwierdzony end-to-end: #321.
- `cloud-pause-message`: przy capie 0 API zwraca 503 `cloud_paused`, a UI pokazuje „Cloud AI is temporarily
  unavailable due to maintenance…”. Implementacja #322, akceptacja i archiwizacja #323, `archive_commit` #324.
