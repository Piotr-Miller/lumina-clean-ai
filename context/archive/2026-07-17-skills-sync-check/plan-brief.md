# skills-sync-check — Plan Brief

> Full plan: `context/changes/skills-sync-check/plan.md`
> Research: `context/changes/skills-sync-check/research.md`
> Walidacja pomysłu: `context/team/opportunity-map.md` + `context/team/mom-test-validation.md` (PROCEED 2026-07-17)

## What & Why

Read-only weryfikator spójności drzew skilli (`.claude/skills` ↔ `.agents/skills`), uruchamiany ręcznie po każdym `10x get` jako `npm run check:skills`. Powód: `10x get` odświeża tylko `.claude/`, a Codex codziennie czyta `.agents/` — drift zdarzył się ≥2× w miesiąc (PR #101: wymazane rozszerzenie + rozjazd drzewa; 2026-07-17: 2 brakujące skille), a wykrycie i naprawa były dotąd wyłącznie ręczne.

## Starting Point

Drzewa mają dziś identyczne zbiory plików (82/82), ale 21/32 skilli różni się wyłącznie szumem formattera (winowajca zidentyfikowany podczas planowania: brak `.prettierignore` + lint-staged `prettier --write` na md), a 7 skilli nosi ~20 linii celowych adaptacji per-tool. Prawdziwym inwentarzem `10x get` okazał się `.claude/.10x-cli-manifest.json` (25 skilli, sha256 per plik) — nie `skills-lock.json`, którego opis w AGENTS.md jest mylący. Dwa skille (`10x-archive`, `10x-impl-review`) niosą lokalne rozszerzenia, które `10x get` już raz wymazał (commit `755065a`).

## Desired End State

Po każdym `10x get` jedna komenda w kilka sekund odpowiada: czy któremuś drzewu brakuje plików, czy ktoś lokalnie zedytował zarządzany plik, czy `10x get` wymazał lokalne rozszerzenia (najcenniejszy sygnał — odwrócona semantyka hasha: zgodność z manifestem = ALARM), i czy pary plików rozjechały się treściowo poza allowlistą adaptacji. Exit 1 przy drifcie (gotowe pod przyszły Review/CI gate), `--report-only` do trybu informacyjnego.

## Key Decisions Made

| Decision                             | Choice                                                                                  | Why (1 sentence)                                                                                          | Source   |
| ------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| Źródło prawdy hashy                  | `.claude/.10x-cli-manifest.json`, nie `skills-lock.json`                                | Manifest realnie inwentaryzuje 25 skilli z sha256; lock to artefakt bootstrapu (2 skille, CRLF-sensitive) | Research |
| Semantyka hashy skilli rozszerzonych | Odwrócona (MATCH = wipe = alarm)                                                        | Wykrywa dokładnie incydent `755065a` — najcenniejszy pojedynczy sygnał                                    | Research |
| Strategia porównania par             | Jednorazowy cleanup `.agents` → byte-equal + allowlista linii adaptowanych              | Algorytm trywialny i deterministyczny zamiast kruchego normalizatora formatowania                         | Plan     |
| Ochrona przed regresją szumu         | Nowy `.prettierignore` (`.claude/`, `.agents/`)                                         | lint-staged formatuje każde stage'owane md — bez ignore'a cleanup ginie przy pierwszym commicie           | Plan     |
| Exit-code                            | Fail-on-drift (1) + flaga `--report-only` + exit 2 na błąd środowiska                   | Gotowe pod docelowy Review/CI gate bez późniejszej zmiany kontraktu                                       | Plan     |
| Konfiguracja sentineli/allowlist     | Typowany moduł TS (`scripts/lib/skills-sync-config.ts`)                                 | Typy i testowalność za darmo, łatwa podmiana pod wzorce m5l4                                              | Plan     |
| Zakres dodatkowy                     | + hash-check 7 promptów, + korekta opisu locka w AGENTS.md; BEZ weryfikacji hashy locka | Prompty niemal darmowe; lock-hash dawałby false-positive na checkoucie LF przy znikomej wartości          | Plan     |
| Podpięcie                            | Tylko alias `npm run check:skills` (bez pre-push/CI)                                    | Najpierw lokalna walidacja użyteczności — gate to osobna, późniejsza decyzja                              | Plan     |

## Scope

**In scope:** `.prettierignore`; jednorazowy re-sync `.agents` (kopia bajtowa + re-aplikacja ~20 linii adaptacji); checker (4 sygnały + prompty) jako `scripts/check-skills-sync.ts` + `scripts/lib/*` + testy fixture; alias `check:skills`; korekty AGENTS.md (opis locka, procedura re-synca, Commands); notka chore w `github-issues.md`.

**Out of scope:** auto-sync/auto-fix; weryfikacja hashy `skills-lock.json`; pre-push hook / job CI; owijanie `10x get` i zmiany upstream; `.agents/prompts`; repo-wide normalizacja Prettier/CRLF; niespójności S-03/S-04/S-05 w github-issues.md (sygnał 2 mapy okazji).

## Architecture / Approach

Najpierw doprowadzić drzewa do stanu kontraktowego (Faza 1), potem napisać checker egzekwujący kontrakt (Faza 2): czysta logika w `scripts/lib/skills-sync-checker.ts` (root wstrzykiwany — testowalna na fixture'ach temp-dir), dane kontraktu w typowanym `scripts/lib/skills-sync-config.ts`, cienki entrypoint CLI wzorem `resolve-bread-version.ts`. Cztery sygnały w kolejności wartości: dir-diff obecności → hash-check vs manifest (+ prompty; odwrócona semantyka dla rozszerzonych) → sentinele rozszerzeń → parytet par (byte-equal + substytucje 1:1 z allowlisty). Raport grupowany per klasa plików (manifest / lock-bootstrap / osobiste + ręczne).

## Phases at a Glance

| Phase                                            | What it delivers                                                                           | Key risk                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1. Ochrona przed formatterem + re-sync `.agents` | `.prettierignore` + drzewo w stanie kontraktowym (25 byte-equal, 7 z czystymi adaptacjami) | Nadpisanie adaptacji przed ich zrzutem; commit bez ignore'a niszczy cleanup |
| 2. Checker + testy                               | `npm run check:skills` z 4 sygnałami, exit-semantyką i testami fixture                     | Sentinel obejmujący linię celowego swapu (:115) → wieczny false-positive    |
| 3. Dokumentacja + bookkeeping                    | Poprawiony AGENTS.md (lock, procedura, Commands) + notka chore                             | Znikome; issue GH tylko za zgodą                                            |

**Prerequisites:** branch `chore/m5l1-skills-sync-check` (jest); brak — poza uważnością na kolejność operacji w Fazie 1.
**Estimated effort:** ~2 sesje (Faza 1 = ostrożna praca ręczna, Faza 2 = główny kod, Faza 3 = szybka).

## Open Risks & Assumptions

- Numery linii adaptacji z research §A odnoszą się do obecnych kopii — po kopii bajtowej przestają obowiązywać; dlatego allowlista jest po treści linii, a zrzut adaptacji MUSI poprzedzić kopię.
- Przyszły `10x get` może przeredagować skill i unieważnić frazę-sentinela (risky assumption #4 z Mom Testu) — konfiguracja w osobnym module ma to tanio absorbować; wzmocnienie wzorcami m5l4 po pobraniu lekcji.
- Checker to krok ręczny — dyscyplina uruchamiania po `10x get` pozostaje na użytkowniku (risky assumption #5); wpis w procedurze AGENTS.md ma to podpierać do czasu decyzji o gate.

## Success Criteria (Summary)

- Na czystym repo `npm run check:skills` → exit 0; trzy celowe zepsucia (brak skilla / edycja zarządzanego pliku / usunięty sentinel) → exit 1 z trafnym findingiem, po revercie znowu exit 0.
- Scenariusz `755065a` (wipe rozszerzenia) wykrywany testem jednostkowym przez odwróconą semantykę hasha.
- Po commicie re-syncu drzewa pozostają byte-czyste (pre-commit niczego nie reformatuje).
