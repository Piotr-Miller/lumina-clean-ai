# Kolejne kroki (stan na 2026-11-18)

Produkcja: master `a0193b0`, CI zielone. Cloud AI nadal wstrzymany (`CLOUD_DAILY_CAP=0` od 2026-10-28).
Gałąź `gpt-image-26-screen` (#359) wypchnięta bez PR-a: fazy 1–2 zrobione, HEAD po zapisie tego pliku.
**Faza 3 idzie na Fedorze** (decyzja 2026-11-18) — gotowy prompt startowy w kroku 5 niżej.

## Teraz: decyzja o Cloud AI po S-20

S-20 `cloud-classical-denoise` ([#347](https://github.com/Piotr-Miller/lumina-clean-ai/issues/347), zamknięte)
zarchiwizowane 2026-11-15 → `context/archive/2026-11-03-cloud-classical-denoise/`: krok 1 **FAIL** po 1a (NLM) i 1b (falkowy BayesShrink). Werdykty:
[`step1-gate.md`](context/archive/2026-11-03-cloud-classical-denoise/evaluations/step1-gate.md) i
[`step1b/gate.md`](context/archive/2026-11-03-cloud-classical-denoise/evaluations/step1b/gate.md). Oba odszumiacze wygrywają na tych samych 3–4 zdjęciach,
remisują na 4 i gubią słabe gwiazdy na S17-03 — wąskim gardłem nie jest wybór odszumiacza.

Następne kroki, po kolei:

1. **Zrobione 2026-11-17 — faza 1** (`9d47635`, poprawki z przeglądu Codex `1a8ae56`): vendor-facts,
   config `scripts/gpt26/configs/gpt26-low.json` (sha256 `bda91bfb…`, bramka w środku), seria
   `scripts/gpt26/series/screen.json` (6 slotów × $0,20), checker. Akceptacje 1.4 i 1.5 potwierdzone
   (notatki w `change.md`; wiersze Progress wpisuje się po merge'u, przy SHA z mastera).
2. **Zrobione 2026-11-17 — faza 2** (`d69ec55` + `f6cef55`): `scripts/gpt26/run.py` (runner, własny ledger
   `test-photos/private/gpt26/`), `state.py` (rekoncyliacja), hooki w `scripts/s19/run-candidate.py`
   (zgodne wstecz), `regression.py` + `evaluations/regression-baseline.md`. 61 testów OK; S-19 85 testów OK
   przed hookami (`1a8ae56`) i po (`d69ec55`); dry run: 6 slotów, $1,20 ≤ $1,50, wejścia zweryfikowane.
3. **Ty:** akceptacja 2.4 — czy dry run (`python3 scripts/gpt26/run.py --dry-run --cap 1.50`) pokazuje
   właściwe 6 slotów, rozmiary i limity z serii.
4. **Ty:** zdecyduj, czy fazę 2 przegląda Codex (`$rune-impl-review @context/changes/gpt-image-26-screen/plan.md phase 2 base 1a8ae56`),
   czy od razu faza 3.
5. **Faza 3 — na Fedorze** (sesja na Windows 2026-11-18 niczego w fazie 3 nie zmieniła; tam nie ma
   Pillow/NumPy/OpenCV ani `fork`/`fcntl`). Nowa sesja Claude Code na Fedorze, wklej to jako pierwszą
   wiadomość:

   ```text
   /rune-implement gpt-image-26-screen phase 3

   Przed jakąkolwiek edycją:
   1. git fetch && git switch gpt-image-26-screen && git pull --ff-only. Potwierdź, że HEAD zawiera
      6fba5d9 (fazy 1–2) i ten commit z temp_steps.md, a working tree jest czyste.
   2. Porównaj wersje zależności z context/changes/gpt-image-26-screen/evaluations/regression-baseline.md
      (Python 3.15.2, Pillow 12.3.0, NumPy 2.5.4, OpenCV 4.13.0, scikit-image 0.26.0, PyWavelets 1.8.0,
      package-lock.json sha256 120849f1…). Każdą różnicę zgłoś przed startem.

   Decyzje właściciela z 2026-11-18 — wpisz je do plan.md (Phase 2 item 5 / tekst kryterium 3.2,
   oznaczone "(owner decision 2026-11-18)") i datowaną notkę do change.md Notes, oba w commicie fazy 3:

   A. Host: faza 3 jest implementowana i bramkowana na Fedorze. Wiersze 3.1 i 3.2 zaznaczasz dopiero po
      rzeczywistym przejściu kontroli.
   B. Overlay S-20 dla 3.2: regression.py robi JEDEN jednorazowy overlay commit w odłączonym, tymczasowym
      worktree, z rodzicem = testowana rewizja. Przywraca dokładnie pięć plików metadanych na stare
      ścieżki context/changes/cloud-classical-denoise/: dotychczasowe cztery (change.md,
      evaluations/pilot-result.json, evaluations/step1-gate.json, evaluations/step1-calibration.md) plus
      evaluations/step1-premise.md. Bajty z blobów archiwum tej samej testowanej rewizji, hashe
      zweryfikowane. Commit zmienia wyłącznie te pięć ścieżek — żadnego kodu, configu ani testów.
      Identyczna procedura dla baseline (1a8ae56…) i kandydata; 3.2 wymaga przejścia PEŁNEJ suite S-20
      dla obu. Raport zapisuje: SHA testowanej rewizji, SHA overlay commita (rodzic = testowana rewizja),
      ścieżki i hashe fixture'ów, wersje zależności, komendę, liczbę testów i rzeczywisty wynik. Nie
      merge'uj ani nie pushuj overlay commita; nie zmieniaj roboczej gałęzi ani archiwum. Jeśli suite
      nadal nie przechodzi, zgłoś przyczynę — nie zastępuj kryterium porównaniem zestawów błędów ani
      pomijaniem testów.
   C. Porządek: przywróć tytuł w Progress "- [ ] 5.1 (paid) Verdict computed from committed, sealed
      ratings" — błędnie zmieniony 2026-11-17; plan.md Phase 5 §1 mówi, że tytuł zachowuje "(paid)".

   Otwarte wiersze manualne do zapytania mnie: 1.4 i 1.5 (potwierdzenia są w change.md; wiersze
   Progress wpisuje się po merge'u, przy SHA z mastera) oraz 2.4 (potwierdzenie dry runu).
   ```

   Potem: builder, kopia viewera, bramka, testy (3.1), regresja S-20 (3.2), format (3.3), a na koniec
   Twoja akceptacja 3.4 (viewer na syntetycznym zestawie).

6. **Faza 4 (płatna, ≤ $1,50):** najpierw Twoja linia `- GPT26-SPEND cap_usd=1.50 decision=approved date=…`
   w `change.md` § GPT26 approvals, zacommitowana; `OPENAI_API_KEY` w środowisku.
7. **Ty:** po #359 — decyzja produktowa o Cloud: zostaje wyłączony z przełącznikiem, przełącznik
   znika, albo Local jest jedynym silnikiem, a `local-engine-ceiling` (#188) głównym kierunkiem jakości.

Holdout `s17-v2` (12 zdjęć walidacyjnych) nadal nieotwarty. 21 płatnych wyników GPT/NAFNet z S-19 leży
w `test-photos/private/s19/`. Narzędzia `scripts/s20/` mają na sztywno starą ścieżkę `context/changes/…`
(jak `scripts/s19/` po S-19) — przed ponownym `gate.py --audit` trzeba ją poprawić.

## Czekało na wynik kroku 1 S-20

- **`local-jev-gate`** ([#348](https://github.com/Piotr-Miller/lumina-clean-ai/issues/348)), Parked: Jev
  jako bramka „już dobre, nie ruszaj” i chooser dla Local. Nadal blokada dostawcy: TypeSafe nie ma obrazów
  w produkcji (sito S1). S-20 nie dało siły odszumiania do wyboru.
- **`local-engine-ceiling`** (#188) i druga połowa S-18 (rozdzielczość wyniku Cloud): zależą teraz od
  decyzji produktowej o Cloud (krok 2 wyżej).

## CI — co obserwować

- **#343** (flaka north-star): **zamknięte 2026-11-05**. Przyczyna: esm.sh zwracał inne bajty `tslib` niż
  w `deno.lock`, edge runtime padał, `/callback` czekał do timeoutu. Poprawka #356 (supabase-js przez `npm:`);
  potem 6/6 pełnych runów `e2e` zielonych. Przy nawrocie: reopen + artefakt `playwright-report` → `edge-logs/`.
  Kandydat na później: sonda gotowości nadal przyjmuje 502.
- **#352** (brak miejsca na dysku przy ładowaniu obrazów Supabase): pomiar z #353 to 79G wolnego ze 145G,
  więc hipoteza „obrazy trzymane podwójnie” jest prawdopodobnie błędna. Przy następnej awarii odczytać z
  logu linię `disk before load: … free of …` i dopisać do #352. Jeśli dysk mały → usunąć preinstalowane
  narzędzia runnera (`/usr/share/dotnet`, `/usr/local/lib/android`, `/opt/ghc`).
- **Docs-only skip działa** (#344): PR zmieniający tylko `context/` → `integration`/`e2e` ~1 min z
  `Docs-only scope: true`. Od #357 także sam `temp_steps.md` (dopasowanie dokładne, nie prefiks).
  Push na master zawsze biegnie w pełni. `AGENTS.md` i inne pliki poza listą celowo NIE są pomijane.
- Padnięty `e2e` na master → deploy pominięty, alarm się odpala. Procedura: `gh run rerun <id> --failed`.

## Kolejka

- **`gpt-image-26-screen`** ([#359](https://github.com/Piotr-Miller/lumina-clean-ai/issues/359)): w toku,
  fazy 1–2 z 5 zrobione, faza 3 na Fedorze — szczegóły i prompt w sekcji „Teraz” wyżej.

- **`cloud-error-message-leak`** (status `new`): użytkownik widzi surowy tekst błędu (`Signal timed out.`,
  HTML strony 502 od Replicate). Analiza w `context/changes/cloud-error-message-leak/change.md`.
  Następny krok: `/rune-plan cloud-error-message-leak`; w planie: czy `start_failed` dostaje osobny komunikat.
- **Opcjonalnie:** `/rune-lesson` z regułą o wyborze zdjęć do akceptacji spoza holdoutu.

## Zrobione 2026-11-03 – 2026-11-04

| PR / issue | Co                                                                      |
| ---------- | ----------------------------------------------------------------------- |
| #342       | foldery zmian `cloud-classical-denoise` i `local-jev-gate`              |
| #344       | `integration`/`e2e` pomijają ciężkie kroki na PR-ach tylko z `context/` |
| #345       | `AGENTS.md`: poprawny opis wykluczeń `ai-review`                        |
| #346       | logi edge runtime i Kong w artefakcie przy porażce `e2e`                |
| #347, #348 | issue'y S-20 i Jev (treść #347 zaktualizowana o decyzje)                |
| #349       | wiersz S-20 w roadmapie, Jev w Parked, mapowanie issue'ów               |
| #350, #351 | decyzje właściciela dla kroku 1 i definicja istotnej straty wierności   |
| #352, #353 | issue o braku miejsca + usuwanie archiwów po `docker load` i linie `df` |
| #343, #352 | komentarze z dowodami (trzecie wystąpienie flaki; pomiar 79G/145G)      |
| #354       | `temp_steps.md` w stanie na 2026-11-04                                  |
| #356       | supabase-js przez `npm:` — przyczyna #343 (integrity check na esm.sh)   |
| #357       | `temp_steps.md` pomijany przez ciężkie kroki CI                         |
| #343       | komentarz z przyczyną i poprawką; issue zamknięte 2026-11-05            |
| gałęzie    | 28 zmergowanych gałęzi usuniętych lokalnie i na GitHubie                |

S-19 (`cloud-model-comparison`, #271): zarchiwizowane 2026-11-03 jako „stopped before validation”,
issue zamknięte. Wynik: `context/archive/2026-09-28-cloud-model-comparison/evaluations/outcome.md`.

## Stan lokalny (do pamiętania)

- Lokalny stack Supabase jest zatrzymany. Zostały 3 wolumeny podmana (`supabase_db_*`, `supabase_storage_*`,
  `supabase_edge_runtime_*`). Przed następnym `npx supabase start` trzeba je usunąć
  (skill `run-local-stack`, landmine 2).
- `supabase/functions/` i `src/` mają etykietę SELinux `container_file_t`. Cofnięcie: `restorecon -R supabase/ src/`.
- `.dev.vars` i `supabase/functions/.env` są wygenerowane lokalnie dla E2E (gitignored).
- `wrangler` jest zalogowany na tej maszynie (2026-10-28).
- Zmergowane gałęzie usunięte 2026-11-04 (lokalnie i na GitHubie). Zostały celowo, bo nie mają PR-a albo PR
  był zamknięty bez merge'u: `feat/cloud-model-comparison` (historia porzuconego `s19-v1`), `feat/finder-glm-5-3`,
  `feat/finder-glm-5-3-high`, `feat/finder-model-swap`, `feat/finder-serialization-outage`, `feat/finder-sonnet`,
  `feat/finder-sonnet-effort` (tylko na GitHubie), `feat/finder-verification`. Rebase-merge zmienia SHA, więc
  `git branch -d` odmawia na zmergowanych gałęziach; potrzebne `git branch -D`.
  **Stan na 2026-11-18:** na GitHubie z tej listy zostały tylko `feat/finder-glm-5-3` i
  `feat/finder-glm-5-3-high` (ich archiwa są tylko na tych gałęziach). Pozostałe mogą istnieć lokalnie
  na Fedorze — sprawdzić `git branch` tam, zanim cokolwiek zostanie usunięte.
- **Windows:** uwagi o podmanie/SELinux wyżej dotyczą tylko maszyny z Linuksem.
- S-20: w `test-photos/private/s20/` leżą stare syntetyczne zestawy `synthetic-*-20261105t221729` (sprzed ekranu
  pieczęci) — do usunięcia ręcznie. Zestawy z `publish` też są tylko syntetyczne.
