# Kolejne kroki (stan na 2026-11-04)

Produkcja: najnowszy master `685d12c`, deploy zielony. Cloud AI nadal wstrzymany (`CLOUD_DAILY_CAP=0`
od 2026-10-28). Lokalnie: gałąź `master`, czyste drzewo poza tym plikiem.

## Teraz: S-20 `cloud-classical-denoise` ([#347](https://github.com/Piotr-Miller/lumina-clean-ai/issues/347)) — zarejestrowane, NIE rozpoczęte

Hipoteza: ścieżka Cloud to klasyczne, deterministyczne odszumianie w pełnej rozdzielczości po stronie
serwera, a nie model generujący piksele. Dowodzone offline na harnessie S-19, krok po kroku.
Opis: `context/changes/cloud-classical-denoise/change.md`; roadmapa: `context/foundation/roadmap.md` § S-20.

Zasady kroku 1 ustalone przez właściciela 2026-11-03 (`change.md` § Owner decisions):

- Bramka: ≥ 6 z 8 wygranych jakościowych nad kontrolą bez odszumiania (remis to nie wygrana) **oraz**
  zero istotnych strat wierności i zero ciężkich regresji na każdym z 8 zdjęć.
- O wierności rozstrzyga oryginał. Skala: brak straty / niewielka / **istotna** / **ciężka regresja** /
  niepewne. Istotna i ciężka zatrzymują próbę; każda wymaga wycinka i uzasadnienia.
- Przeglądarka do ocen: preferencja estetyczna i skala straty jako dwa osobne pytania.
- Najpierw NLM (`fastNlMeansDenoisingColored`). BM3D tylko jako ograniczona druga próba, jeśli NLM nie
  przejdzie (z dowolnego powodu). Zakres strojenia ustalony z góry, te same kryteria.
- Rozmowa o free/paid zaraz po udanym kroku 1, przed wyborem hostingu.

Następne kroki:

1. **Ty:** daj znać, kiedy startujemy.
2. **Ja:** `/rune-plan cloud-classical-denoise`. Plan musi objąć: ramię `nlm-gamma` w
   `scripts/s19/local-arms.ts` (wspólne wejście sRGB → NLM → gamma z Auto Local), przeglądarkę z dwoma
   pytaniami (wycinek i uzasadnienie obowiązkowe przy stracie istotnej/ciężkiej), uogólnienie `tally.py`
   z 3 na 8 zdjęć, z góry zapisaną siatkę parametrów NLM.
3. **Ty:** oceny na ślepo 8 par; potem bramka.
4. Dalej wg `change.md` § Sequence: tone mapping osobno → chooser (heurystyka vs VLM) → freeze →
   pomiar czasu 12 MP i cold startu → jednorazowy holdout (osobna zgoda właściciela).

**Otwarte, tylko jeśli NLM nie przejdzie:** licencja BM3D. Pakiet autorów (`pip install bm3d`) jest
wyłącznie do niekomercyjnej edukacji i badań; `xphoto::bm3dDenoising` w OpenCV jest za patentem
(`OPENCV_ENABLE_NONFREE`, nie ma go w paczkach z PyPI). Trzeba rozstrzygnąć, czy nawet próba offline
mieści się w licencji, albo wybrać inną drugą metodę.

Holdout `s17-v2` (12 zdjęć walidacyjnych) nadal nieotwarty. 21 płatnych wyników GPT/NAFNet z S-19 leży
w `test-photos/private/s19/` (do późniejszej „opcji 2”: GPT jako przewodnik tonalny, $0).

## Czeka na wynik kroku 1 S-20

- **`local-jev-gate`** ([#348](https://github.com/Piotr-Miller/lumina-clean-ai/issues/348)), Parked: Jev
  jako bramka „już dobre, nie ruszaj” i chooser dla Local. Blokada: TypeSafe nie ma obrazów w produkcji
  (sito S1). Opis: `context/changes/local-jev-gate/change.md`.
- **`local-engine-ceiling`** (#188) i druga połowa S-18 (rozdzielczość wyniku Cloud): przesunięte z S-19
  na S-20.

## CI — co obserwować

- **#343** (flaka north-star: test wisi na `/callback`): przy następnej awarii `e2e` pobrać artefakt
  `playwright-report` → katalog `edge-logs/` (`functions-serve.log`, logi edge runtime i Kong, od #346)
  i dopisać do #343, co pokazują.
- **#352** (brak miejsca na dysku przy ładowaniu obrazów Supabase): pomiar z #353 to 79G wolnego ze 145G,
  więc hipoteza „obrazy trzymane podwójnie” jest prawdopodobnie błędna. Przy następnej awarii odczytać z
  logu linię `disk before load: … free of …` i dopisać do #352. Jeśli dysk mały → usunąć preinstalowane
  narzędzia runnera (`/usr/share/dotnet`, `/usr/local/lib/android`, `/opt/ghc`).
- **Docs-only skip działa** (#344): PR zmieniający tylko `context/` → `integration`/`e2e` ~1 min z
  `Docs-only scope: true`. Push na master zawsze biegnie w pełni. `AGENTS.md` i inne pliki poza
  `context/` celowo NIE są pomijane.
- Padnięty `e2e` na master → deploy pominięty, alarm się odpala. Procedura: `gh run rerun <id> --failed`.

## Kolejka (bez zmian)

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

S-19 (`cloud-model-comparison`, #271): zarchiwizowane 2026-11-03 jako „stopped before validation”,
issue zamknięte. Wynik: `context/archive/2026-09-28-cloud-model-comparison/evaluations/outcome.md`.

## Stan lokalny (do pamiętania)

- Lokalny stack Supabase jest zatrzymany. Zostały 3 wolumeny podmana (`supabase_db_*`, `supabase_storage_*`,
  `supabase_edge_runtime_*`). Przed następnym `npx supabase start` trzeba je usunąć
  (skill `run-local-stack`, landmine 2).
- `supabase/functions/` i `src/` mają etykietę SELinux `container_file_t`. Cofnięcie: `restorecon -R supabase/ src/`.
- `.dev.vars` i `supabase/functions/.env` są wygenerowane lokalnie dla E2E (gitignored).
- `wrangler` jest zalogowany na tej maszynie (2026-10-28).
- Lokalne, zmergowane gałęzie z tych dwóch dni (`docs/register-*`, `ci/docs-only-skip`, `ci/e2e-edge-logs`,
  `ci/supabase-image-load-disk`, `docs/s20-*`, `docs/agents-ai-review-exclusions`) można usunąć — ich PR-y
  są zmergowane, ale rebase-merge zmienił SHA, więc `git branch -d` odmówi; potrzebne `git branch -D`.
- **Windows:** uwagi o podmanie/SELinux wyżej dotyczą tylko maszyny z Linuksem.
