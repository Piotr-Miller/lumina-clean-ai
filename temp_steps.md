# Kolejne kroki (stan na 2026-11-09)

Produkcja: najnowszy master `4e04923`, deploy zielony (w tym funkcja `enhance` z supabase-js przez npm, #356). Cloud AI nadal wstrzymany (`CLOUD_DAILY_CAP=0`
od 2026-10-28). Lokalnie: gałąź `feat/cloud-classical-denoise-1b` (od mastera; 1a zmergowane w #364 i #365).

## Teraz: S-20 `cloud-classical-denoise` ([#347](https://github.com/Piotr-Miller/lumina-clean-ai/issues/347)) — krok 1a (NLM): **FAIL**, krok 1b w planowaniu

Hipoteza: ścieżka Cloud to klasyczne, deterministyczne odszumianie w pełnej rozdzielczości po stronie
serwera, a nie model generujący piksele. Dowodzone offline na harnessie S-19, krok po kroku.
Opis: `context/changes/cloud-classical-denoise/change.md`; plan: `plan.md` (sekcja `## Progress` na końcu);
roadmapa: `context/foundation/roadmap.md` § S-20.

Werdykt bramki 16 par na ślepo (2026-11-09), z tabelą dla każdego zdjęcia, wycinkami i uzasadnieniami:
[`evaluations/step1-gate.md`](context/changes/cloud-classical-denoise/evaluations/step1-gate.md).
Paczka audytu (`evaluations/step1-audit/`) odtwarza werdykt z samych metadanych (`gate.py --audit`).
Wszystkie wiersze ręczne 1a są zapisane przy SHA z mastera (`c85c5bb`).

**Krok 1b (decyzja z 2026-11-09):** zamiast BM3D jeden kandydat — falkowy BayesShrink niezmienniczy
względem przesunięć (scikit-image 0.26.0 + PyWavelets 1.8.0), siatka k ∈ {1.0, 1.5, 2.0}, ta sama
bramka. Jeśli nie przejdzie, krok 1 zamyka się jako FAIL. Szczegóły: `change.md` § Owner decisions
(2026-11-09, step 1b candidate).

Następne kroki, po kolei:

1. **Ja:** plan faz 1b (`/rune-plan`), potem przegląd planu (`/rune-plan-review`).
2. **Ty:** commit `change.md`, `plan.md`, `roadmap.md` i tego pliku.
3. **Ty:** `sudo dnf install python3-scikit-image python3-pywt`, gdy plan dojdzie do fazy założeń.
4. **Ja:** implementacja faza po fazie; żadnego renderu przed zacommitowaniem plików z regułami.
5. **Ty:** commit pieczęci przed otwarciem zestawu, potem obie oceny na ślepo.

Holdout `s17-v2` (12 zdjęć walidacyjnych) nadal nieotwarty. 21 płatnych wyników GPT/NAFNet z S-19 leży
w `test-photos/private/s19/` (do późniejszej „opcji 2”: GPT jako przewodnik tonalny, $0).

## Czeka na wynik kroku 1 S-20

- **`local-jev-gate`** ([#348](https://github.com/Piotr-Miller/lumina-clean-ai/issues/348)), Parked: Jev
  jako bramka „już dobre, nie ruszaj” i chooser dla Local. Blokada: TypeSafe nie ma obrazów w produkcji
  (sito S1). Opis: `context/changes/local-jev-gate/change.md`.
- **`local-engine-ceiling`** (#188) i druga połowa S-18 (rozdzielczość wyniku Cloud): przesunięte z S-19
  na S-20.

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

- **`gpt-image-26-screen`** ([#359](https://github.com/Piotr-Miller/lumina-clean-ai/issues/359), Parked, założone
  2026-11-05): przesiewowy test `gpt-image-2.6-sunburst` (`complexity=low`) jako wyniku Cloud na S17-03/04/07,
  po 2 wyniki, limit $1.50, bramka zapisana przed renderem. Niezależny od wyniku NLM; praktycznie po zbudowaniu
  przeglądarki z kroku 1 S-20. Potem `/rune-plan gpt-image-26-screen`.

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
