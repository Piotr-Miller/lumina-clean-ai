# Kolejne kroki (stan na 2026-11-17)

Produkcja: master `a0193b0`, CI zielone. Cloud AI nadal wstrzymany (`CLOUD_DAILY_CAP=0` od 2026-10-28).
Lokalnie: gałąź `gpt-image-26-screen` (faza 1 #359 zacommitowana jako `9d47635`), wypchnięta bez PR-a.
Lokalny `master` cofnięty do `a0193b0` (= `origin/master`); commit fazy 1 trafił najpierw na `master` przez pomyłkę.

## Teraz: decyzja o Cloud AI po S-20

S-20 `cloud-classical-denoise` ([#347](https://github.com/Piotr-Miller/lumina-clean-ai/issues/347), zamknięte)
zarchiwizowane 2026-11-15 → `context/archive/2026-11-03-cloud-classical-denoise/`: krok 1 **FAIL** po 1a (NLM) i 1b (falkowy BayesShrink). Werdykty:
[`step1-gate.md`](context/archive/2026-11-03-cloud-classical-denoise/evaluations/step1-gate.md) i
[`step1b/gate.md`](context/archive/2026-11-03-cloud-classical-denoise/evaluations/step1b/gate.md). Oba odszumiacze wygrywają na tych samych 3–4 zdjęciach,
remisują na 4 i gubią słabe gwiazdy na S17-03 — wąskim gardłem nie jest wybór odszumiacza.

Następne kroki, po kolei:

1. **Zrobione 2026-11-17:** decyzja — robimy `gpt-image-26-screen` ([#359](https://github.com/Piotr-Miller/lumina-clean-ai/issues/359)).
   Plan przejrzany (`context/changes/gpt-image-26-screen/plan.md`, 5 faz), `change.md` → `implementing`.
   **Faza 1 zrobiona** (`9d47635`): `evaluations/vendor-facts.md` (odczyt 2026-11-17 — `complexity=low` i
   `moderation=auto` przyjmowane przez `v1/images/edits`), config `scripts/gpt26/configs/gpt26-low.json`
   (sha256 `bda91bfb…`, bramka i protokół ślepej oceny w środku), seria `scripts/gpt26/series/screen.json`
   (6 slotów, $0,20 każdy, $1,20 łącznie), checker `scripts/gpt26/check_series.py`.
   Ryzyko z vendor-facts: referencja API nie wymienia 2.6 z nazwy wśród modeli z dowolnym `WIDTHxHEIGHT`
   (przewodnik obejmuje całą rodzinę Sunburst) — odrzucony rozmiar = slot niedostarczony = FAIL „not delivered”.
2. **Ty:** akceptacja ręczna fazy 1 — 1.4 (przeczytać `vendor-facts.md`) i 1.5 (przeczytać blok `gate` w configu).
3. **Następny krok:** `/rune-impl-review @context/changes/gpt-image-26-screen/plan.md phase 1` w świeżej sesji,
   potem `/rune-implement gpt-image-26-screen phase 2` (runner, `state.py`, testy, harness regresji).
   Kryteria 2.2 (regresja S-19) i 2.3 (dry run) wymagają hosta z Linuksem (wejścia, Local i ledger S-19
   są tylko tam). Faza 4 jest płatna: najpierw Twoja linia `GPT26-SPEND` w `change.md`, zacommitowana.
4. **Ty:** po #359 — decyzja produktowa o Cloud: zostaje wyłączony z przełącznikiem, przełącznik
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
  faza 1 z 5 zrobiona — szczegóły i następne kroki w sekcji „Teraz” wyżej.

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
- **Windows:** uwagi o podmanie/SELinux wyżej dotyczą tylko maszyny z Linuksem.
- S-20: w `test-photos/private/s20/` leżą stare syntetyczne zestawy `synthetic-*-20261105t221729` (sprzed ekranu
  pieczęci) — do usunięcia ręcznie. Zestawy z `publish` też są tylko syntetyczne.
