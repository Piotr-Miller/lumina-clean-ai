# Kolejne kroki (stan na 2026-10-29)

## Następne: S-19 `cloud-model-comparison` (#271)

Cloud AI jest wstrzymany na produkcji od 2026-10-28T20:33:24Z (`CLOUD_DAILY_CAP=0`). Wraca dopiero wtedy,
gdy S-19 spełni próg: co najmniej 8/12 wyraźnych wygranych, najwyżej jedna umiarkowana przegrana,
zero ciężkich regresji. Samo zakończenie porównania nie wystarcza. Szczegóły:
`context/changes/cloud-model-comparison/change.md` § Production pause.

1. ~~**Ty:** zdecyduj, jak zastąpić ujawnione zdjęcia walidacyjne S17-05 i S17-06.~~ **Zrobione 2026-10-29:**
   dwa nowe zdjęcia CC z telefonu (S17-23 Pixel 6, S17-24 Galaxy S23 Ultra z orientacją 6), S17-05/06 → tuning.
   Benchmark `s17-v2` (`test-photos/s17-benchmark-v2.json`), uzasadnienie: `cloud-model-comparison/change.md`
   § Holdout replacement. Do zrobienia w planie S-19: skrypty `scripts/s17/*` nadal czytają v1.
2. **Ja:** `/rune-spike cloud-model-comparison` — rozpoznanie rynku + test wykonalności.
   **Część dokumentacyjna zrobiona 2026-10-29** → `cloud-model-comparison/research.md` (cztery sekcje A–D).
   Część empiryczna (≈ $1.1 łącznie, lista w każdej sekcji) czeka na zgodę właściciela.
   **Zakres poszerzony przez właściciela 2026-10-29: nie tylko Replicate.** Cztery klasy kandydatów:
   - A. modele restoracji/odszumiania (Bread i podobne) na dowolnym hostingu: Replicate, fal.ai, HF Endpoints,
     własne GPU (Modal/RunPod);
   - B. generatywna edycja obrazu (OpenAI GPT Image 2.5 Sunburst/Flare — potwierdzone u OpenAI 2026-10-29,
     wydane 2026-09-08, stawki za tokeny w cenniku; brak liczby tokenów zdjęcia wejściowego przy edycji, zob.
     `cloud-model-comparison/research.md`, sekcja B; edycja obrazów w Gemini; Flux Kontext) — ryzyko: przerysowanie
     treści (napisy, twarze);
   - C. komercyjne API do zdjęć (auto-ton/odszumianie od firm fotograficznych);
   - D. model wizyjny jako „Auto”: dobiera parametry dla deterministycznego potoku (odpowiedź na brak reguły Auto w S-17).
   - **Sito** przed płatnymi uruchomieniami: API produkcyjne, rozdzielczość wyjścia ≥ 1536 px, cena za zdjęcie,
     **przechowywanie/trenowanie na zdjęciach użytkowników**, komercyjna licencja na wynik, opóźnienie.
   - **Test wykonalności** tylko na 1–2 zdjęciach **tuningowych** na kandydata, każdy płatny test za zgodą właściciela.
   - Uwaga: mail „There's more to see with GPT-6” to reklama Intelligent UI w ChatGPT (widgety), nie modelu do obróbki.
3. ~~**Ja:** `/rune-frame cloud-model-comparison`.~~ **Zrobione 2026-10-29** → `cloud-model-comparison/frame.md`.
   Wniosek: nie wiadomo jeszcze, czy to model trzyma Cloud poniżej progu. Porażka na produkcji to głównie
   zakres gammy (dolna granica 1.0, a wszystkie akceptowalne ustawienia Bread w S-17 miały 0.5–0.9).
   Dodatkowo TypeSafe Jev for Images odpada (obrazy nie są gotowe na produkcję), zob. `research.md`.
   **Weryfikacja z frame.md — stan:**
   - ✅ Kontrole walidacyjne (S17-10/18/24) mogą być wygraną, próg zostaje 8/12 (decyzja właściciela).
   - ✅ Prawdziwy Local (produkcja, Auto ON) uruchomiony na 8 zdjęciach tuningowych, wyniki i licencje w
     `cloud-model-comparison/references/`, przeglądarka do ocen: `references/compare.html`.
   - ✅ Ocena Local vs oryginał (właściciel): 4 poprawy, 2 bez zmian, 2 szkody (S17-05, S17-21, oba za jasne).
     Tabela obok ocen Bread z S-17: `change.md` § Owner decisions after the frame.
   - ⏳ **NASTĘPNE, na Linuksie:** wyniki Bread z S-17 są w `test-photos/private/s17/` (m.in. `direct/phase3/`).
     **Ja:** dodaję kolumnę Bread do `compare.html`. **Ty:** oceniasz Bread vs Local obok siebie.
   - ⏳ **Ja:** porównanie profili kolorów (ICC) na wynikach Bread dla S17-03, S17-07, S17-21 skryptem
     `scripts/s19/icc-gap.py` (średnie V/S przy dekodowaniu naiwnym vs ICC→sRGB).
4. **Ty:** decyzje — zgoda na płatną część empiryczną spike'a (≈ $1.1); czy zdjęcia użytkowników mogą trafiać
   do OpenAI/Google; budżet tuningu (limit w $); zatwierdzenie nowej kategorii ciężkiej regresji
   „zmieniona/zmyślona treść” w progu jakości **przed** tuningiem.
5. **Ja:** `/rune-plan cloud-model-comparison` (+ przepięcie `scripts/s17/*` na v2), potem plan review.
6. **Ja:** tuning → finalista → holdout (12 zdjęć, finalista vs Local, ocena na ślepo).

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
- **Opcjonalnie:** `/10x-lesson` z regułą o wyborze zdjęć do akceptacji spoza holdoutu.

## Stan lokalny (do pamiętania)

- Lokalny stack Supabase jest zatrzymany. Zostały 3 wolumeny podmana (`supabase_db_*`, `supabase_storage_*`,
  `supabase_edge_runtime_*`). Przed następnym `npx supabase start` trzeba je usunąć
  (skill `run-local-stack`, landmine 2).
- `supabase/functions/` i `src/` mają etykietę SELinux `container_file_t`. Cofnięcie: `restorecon -R supabase/ src/`.
- `.dev.vars` i `supabase/functions/.env` są wygenerowane lokalnie dla E2E (gitignored).
- `wrangler` jest zalogowany na tej maszynie (2026-10-28).
- **Windows (2026-10-29):** `ai-toolkit@1.15.0` zainstalowany, skille `rune-*` dostępne. Uwagi o podmanie/SELinux
  wyżej dotyczą maszyny z Linuksem.
- **Branch S-19:** `docs/cloud-model-comparison-spike`, PR #327 (otwarty, niezmergowany). Na Linuksie:
  `git checkout docs/cloud-model-comparison-spike && git pull`.

## Zamknięte (2026-10-27 – 2026-10-28)

- `ai-review-weekly-report`: akceptacja 1.5/3.5/3.6/4.3/4.4, archiwizacja #318, `archive_commit` #319.
- Ekspozycja holdoutu S17-05/06 + porównanie etapów + decyzja o pauzie: #320.
- Kill-switch `CLOUD_DAILY_CAP=0` ustawiony i potwierdzony end-to-end: #321.
- `cloud-pause-message`: przy capie 0 API zwraca 503 `cloud_paused`, a UI pokazuje „Cloud AI is temporarily
  unavailable due to maintenance…”. Implementacja #322, akceptacja i archiwizacja #323, `archive_commit` #324.
