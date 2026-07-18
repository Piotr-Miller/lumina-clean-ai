# skills-sync-check — Implementation Plan

## Overview

Read-only weryfikator spójności drzew skilli (`.claude/skills` ↔ `.agents/skills`), uruchamiany ręcznie po każdym `10x get` jako `npm run check:skills`. Cztery sygnały w kolejności wartości: (1) dir-diff obecności plików, (2) hash-check `.claude` vs `.claude/.10x-cli-manifest.json` z **odwróconą semantyką** dla skilli rozszerzonych lokalnie, (3) sentinele lokalnych rozszerzeń, (4) porównanie par plików byte-equal z allowlistą linii adaptowanych. Fail-on-drift (exit 1) z flagą `--report-only`. Poprzedzone jednorazowym czyszczeniem `.agents` z szumu formattera i zabezpieczeniem obu drzew przed Prettierem.

Walidacja pomysłu: `context/team/opportunity-map.md` (sygnały 1+4) + `context/team/mom-test-validation.md` (werdykt PROCEED 2026-07-17: ≥3 przyszłe `10x get`, Codex używany codziennie, koszt incydentów ≥30 min/mies).

## Current State Analysis

Z `context/changes/skills-sync-check/research.md` (kompletne badanie, zweryfikowane empirycznie):

- **Prawdziwy inwentarz to `.claude/.10x-cli-manifest.json`** (25 skilli / 49 plików + 7 promptów, sha256 surowych bajtów per plik), NIE `skills-lock.json` (artefakt bootstrapu startera, format vercel-labs `skills`, 2 skille, folder-hash wrażliwy na CRLF). Opis locka w `AGENTS.md` jest mylący.
- **Trzy klasy plików = trzy kontrakty**: (a) 25 skilli z manifestu — baseline hashy istnieje; (b) 2 skille locka (`10x-cli-guide`, `10x-cli-setup`) — bez użytecznego baseline'u; (c) 5 skilli osobistych (code-review, documentation, learning, skill-optimizer, typescript-magician) + ręczny `10x-impl-review/SKILL.user.md` — tylko parytet między drzewami.
- **Odwrócona semantyka hashy** dla `10x-archive/SKILL.md` i `10x-impl-review/SKILL.md` (lokalne rozszerzenia): MISMATCH z manifestem = OK (rozszerzenie żyje), MATCH = ALARM (wipe po `10x get` — dokładnie incydent `755065a`).
- **Zbiory plików drzew są dziś identyczne** (79 plików każde); podział 32 skilli: 11 identycznych, 14 różniących się WYŁĄCZNIE formatowaniem (przelot Prettier-stylowego formattera przez `.agents`), 7 z ~20 liniami celowych adaptacji per-tool; semantycznego driftu zero.
- **Mechanizm powstania szumu zidentyfikowany w trakcie planowania**: brak `.prettierignore` + lint-staged `prettier --write` na każdym stage'owanym `*.md` — commit re-syncowanego drzewa formatuje je od nowa. To samo zagraża `.claude` (sformatowanie = false-positive hash-check na 25 skillach).
- **Konwencje repo gotowe bez zmian w configach**: `scripts/<nazwa>.ts` (entrypoint) + `scripts/lib/` (logika) + `tests/*.test.ts` (vitest widzi tylko `tests/**`), `npx tsx`, alias npm wzorem `resolve:bread-version`; `scripts/` objęte typed-eslint i tsc.

## Desired End State

Po `10x get` jedna komenda — `npm run check:skills` — w kilka sekund raportuje: brakujące/nadmiarowe skille w którymkolwiek drzewie, nieautoryzowane lokalne edycje zarządzanych plików, wymazane lokalne rozszerzenia (wipe), brakujące sentinele oraz content-drift par plików poza allowlistą adaptacji. Exit 1 przy jakimkolwiek drifcie (gotowe pod przyszły Review/CI gate), `--report-only` dla trybu informacyjnego. Drzewo `.agents` jest czyste: 25 skilli byte-identycznych z `.claude`, 7 z wyłącznie celowymi adaptacjami, a Prettier trwale nie dotyka żadnego z drzew.

Weryfikacja końcowa: `npm run check:skills` → exit 0 na czystym repo; celowe zepsucie (np. usunięcie skilla z `.agents`) → exit 1 z trafnym raportem.

### Key Discoveries:

- `.claude/.10x-cli-manifest.json:9-229` — `files.skills` z `contentHashes` (sha256 surowych bajtów, zweryfikowane empirycznie); `promptHashes` dla 7 promptów; zasięg wyłącznie `.claude/`
- `.claude/skills/10x-archive/SKILL.md:187-199` — rozszerzenie step 6; `.claude/skills/10x-impl-review/SKILL.md:113-123` — krok Mutation check (+ `SKILL.user.md:113-123`, nieśledzony przez manifest)
- `.agents/skills/10x-impl-review/SKILL.md:115` — celowy swap `CLAUDE.md`→`AGENTS.md`; sentinel NIE może obejmować tego fragmentu
- Pełna mapa celowych adaptacji (7 skilli / 9 plików, ~20 linii): research.md §A — `10x-agents-md/SKILL.md:47,54,64,77,124,145,156`; `10x-e2e/SKILL.md:126` + `references/e2e-quality-rules.md:4`; `10x-impl-review/SKILL.md:115` + `SKILL.user.md:115`; `10x-infra-research/SKILL.md:192`; `10x-roadmap/SKILL.md:60,75`; `10x-rule-review/SKILL.md:27,32`; `10x-stack-assess/SKILL.md:186,192,198,335`
- PR #101 (`843bf8e`): mapa tokenów adaptacji NIE jest mechanicznie odwracalna (naiwny find-replace produkował „AGENTS.md / AGENTS.md") — re-aplikacja adaptacji musi być per-linia, kontekstowa
- `package.json` lint-staged: `"*.{json,css,md}": ["prettier --write"]`; **brak `.prettierignore` w repo** — potwierdzone 2026-07-18
- Wzorzec skryptu: `scripts/resolve-bread-version.ts` → `scripts/lib/bread-version-resolver.ts` → `tests/bread-version-resolver.test.ts`
- Priory z lessons.md: targeted `prettier --write` tylko na plikach dotkniętych fazą (baseline CRLF); nigdy `<cmd> | tail` do odczytu pass/fail

## What We're NOT Doing

- **Żadnego auto-sync / auto-fix** — checker jest read-only; naprawa driftu pozostaje ręczna (procedura w AGENTS.md).
- **Bez weryfikacji hashy `skills-lock.json`** (decyzja z planowania): folder-hash CRLF-sensitive dawałby false-positive na świeżym checkoucie, wartość znikoma (2 nieaktualizowane skille bootstrapu). Obecność tych 2 skilli w obu drzewach łapie i tak dir-diff (sygnał 1).
- **Bez pre-push hooka i joba CI** — najpierw walidacja użyteczności lokalnie (kierunek z opportunity-map); gate to osobna, późniejsza zmiana.
- **Bez owijania `10x get`** i bez zmian upstream w 10x-cli (feature request to osobny wątek).
- **Bez tworzenia `.agents/prompts`** — nie istnieje i nie jest wymagane; hash-check promptów dotyczy tylko `.claude/prompts` vs manifest.
- **Bez repo-wide normalizacji CRLF/Prettier** — poza dodaniem `.prettierignore`; sprzątanie reszty repo to osobna zmiana (lessons.md).
- **Bez naprawy niespójności S-03/S-04/S-05 w `github-issues.md`** — zauważona w badaniu, ale to sygnał 2 mapy okazji, poza zakresem.

## Implementation Approach

Kolejność: najpierw doprowadzić drzewa do stanu, w którym kontrakt „byte-equal + krótka allowlista adaptacji" jest prawdziwy (Faza 1), potem napisać checker egzekwujący ten kontrakt (Faza 2), na końcu dokumentacja i bookkeeping (Faza 3). Dzięki temu algorytm porównania par jest trywialny i deterministyczny — zero heurystyk normalizacyjnych.

Logika checkera żyje w `scripts/lib/` jako czyste funkcje przyjmujące ścieżkę roota (testowalne na fixture'ach w temp-dir), konfiguracja (sentinele, allowlisty, rozszerzone skille) w osobnym typowanym module TS — łatwa do podmiany, gdy m5l4 („Shared AI Registry": sentinel markers, manifest-tracked distribution) dostarczy mocniejsze wzorce.

## Critical Implementation Details

- **Kolejność w Fazie 1: najpierw zrzut adaptacji, potem kopia.** Obecne pliki `.agents` są jedynym żywym źródłem ~20 linii celowych adaptacji — kopia bajtowa je nadpisze. Przed kopiowaniem wygenerować i zapisać do pliku roboczego diff par (np. `git diff --no-index`), wyciąć z niego pary linii adaptowanych (mapa lokalizacji: research.md §A jako krzyżowa weryfikacja), dopiero potem kopiować i re-aplikować. Re-aplikacja per-linia, kontekstowa — nigdy globalny find-replace (lekcja PR #101).
- **`.prettierignore` musi wylądować w tym samym commicie co re-sync (lub wcześniejszym).** Commit drzewa bez niego = lint-staged formatuje stage'owane `*.md` i cicho niszczy byte-equality w chwili narodzin. Z tego samego powodu nie uruchamiać `npm run format` przed dodaniem ignore'a.
- **Hashowanie: sha256 surowych bajtów pliku, zero normalizacji końcówek linii.** Zarządzane pliki `.claude` są na dysku LF; jakakolwiek konwersja CRLF/LF przed hashem psuje porównanie z manifestem.
- **Sentinele `10x-impl-review` nie mogą obejmować linii 115** (celowy swap `CLAUDE.md`↔`AGENTS.md` — jedyna różnica rozszerzenia między drzewami); frazy typu `npx stryker run --mutate` i nagłówek `### Mutation check…` są bezpieczne.
- **Allowlista adaptacji po treści, nie po numerach linii.** Numery przesuwają się z każdą edycją upstream; kontrakt to pary dokładnych treści linii. Po Fazie 1 adaptacje są wyłącznie substytucjami 1:1 w obrębie linii (ta sama liczba linii w parze) — insercja/delecja linii w parze = drift.

## Phase 1: Ochrona przed formatterem + jednorazowy re-sync `.agents`

### Overview

Zatrzymać mechanizm, który generuje szum (Prettier na zarządzanych drzewach), i doprowadzić `.agents/skills` do stanu kontraktowego: 25 skilli byte-identycznych z `.claude/skills`, 7 skilli różniących się wyłącznie ~20 liniami celowych adaptacji.

### Changes Required:

#### 1. Zabezpieczenie drzew przed Prettierem

**File**: `.prettierignore` (nowy)

**Intent**: Wyłączyć oba zarządzane drzewa spod `prettier --write` (lint-staged w pre-commit oraz `npm run format`), żeby byte-fidelity wobec manifestu (`.claude`) i wobec kontraktu par (`.agents`) przetrwała commity.

**Contract**: Plik zawiera wpisy `.claude/` i `.agents/`. Nic więcej — reszta repo formatuje się jak dotąd.

#### 2. Zrzut obecnych adaptacji (artefakt roboczy)

**File**: plik roboczy poza repo lub w scratchpadzie (nie commitowany)

**Intent**: Utrwalić pary linii adaptowanych z obecnych kopii `.agents` ZANIM kopia bajtowa je nadpisze; skrzyżować z mapą lokalizacji z research.md §A (7 plików + `SKILL.user.md`, ~20 linii). Ten zrzut staje się źródłem allowlisty `ADAPTED_LINES` w Fazie 2.

**Contract**: Dla każdego z 9 adaptowanych plików (7 skilli; `10x-e2e` wnosi dwa pliki — `SKILL.md` + `references/e2e-quality-rules.md` — a `10x-impl-review` obok `SKILL.md` dokłada `SKILL.user.md`) — lista par `(linia .claude, linia .agents)` dokładnych treści.

#### 3. Re-sync drzewa

**File**: `.agents/skills/**` (wszystkie pliki 32 skilli)

**Intent**: Najpierw mikro-krok EOL: znormalizować do LF `10x-cli-guide/SKILL.md` i `10x-cli-setup/SKILL.md` w `.claude/skills/` — oba są dziś CRLF na dysku przy LF w indeksie (`.gitattributes`: `* text=auto eol=lf`; git i tak narzuci LF przy następnym dotknięciu), a bez normalizacji późniejszy jednostronny rewrite gita (per-plikowy checkout/revert w testach Fazy 2, stash pop, zmiana brancha) przestawiłby tylko jednego bliźniaka na LF i wygenerował false-drift sygnału 4; normalizacja celowa — wyłącznie te 2 pliki (lessons.md: targeted, nigdy repo-wide). Następnie kopia bajtowa wszystkich plików 32 skilli z `.claude/skills/` do `.agents/skills/` (per skill, bez kasowania czegokolwiek spoza kopiowanych ścieżek), a następnie re-aplikacja adaptacji z artefaktu z kroku 2 — per-linia, z kontrolą kontekstu (żadnego „AGENTS.md / AGENTS.md").

**Contract**: Po operacji `git diff --no-index .claude/skills .agents/skills` pokazuje różnice WYŁĄCZNIE w 9 adaptowanych plikach i wyłącznie w liniach z artefaktu adaptacji; zbiory plików pozostają identyczne (ten sam zbiór ścieżek w obu drzewach — bez twardego totalu, liczba przesuwa się z każdym `10x get`); oba pliki lock-bootstrap są LF w obu drzewach.

### Success Criteria:

#### Automated Verification:

- Diff drzew ograniczony do adaptacji: `git diff --no-index .claude/skills .agents/skills` wymienia tylko 9 adaptowanych plików, a każda różnica to substytucja 1:1 linii z artefaktu adaptacji
- Prettier ignoruje drzewa: `npx prettier --check ".agents/skills/**/*.md" ".claude/skills/**/*.md"` kończy się exit 0 (pliki poza zasięgiem)
- Nic się nie zepsuło: `npm run test:unit` zielone (sanity — faza nie dotyka kodu)

#### Manual Verification:

- Spot-check 3 adaptowanych plików (`10x-agents-md/SKILL.md`, `10x-rule-review/SKILL.md`, `10x-impl-review/SKILL.md`): linie adaptowane czytają się poprawnie w kontekście, swap jest sensowny per-tool
- Próba commitu (na branchu) ze stage'owanym plikiem md z `.agents`: pre-commit NIE reformatuje pliku (diff po commicie pusty)

**Implementation Note**: Po ukończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed przejściem do Fazy 2.

---

## Phase 2: Checker — konfiguracja + logika + entrypoint + testy

### Overview

Właściwy weryfikator: typowana konfiguracja, czysta logika czterech sygnałów z raportem per klasa plików, cienki entrypoint z semantyką exit-code, testy jednostkowe na fixture'ach.

### Changes Required:

#### 1. Typowana konfiguracja

**File**: `scripts/lib/skills-sync-config.ts` (nowy)

**Intent**: Jedno miejsce z danymi kontraktu, łatwe do podmiany pod wzorce m5l4: ścieżki (oba drzewa, manifest, `.claude/prompts`), definicje skilli rozszerzonych z sentinelami, pliki ręczne wymagające parytetu, allowlista linii adaptowanych.

**Contract**: Eksportowane stałe (kształty orientacyjne — implementer doprecyzuje):

- `EXTENDED_SKILLS`: pliki z odwróconą semantyką hasha + listy fraz-sentineli — `10x-archive/SKILL.md` (frazy: `**Sync downstream trackers**`, `` `## Backlog Handoff` ``, `context/foundation/github-issues.md`, `## Status updates`, `gh issue close <n> --comment "Archived`) i `10x-impl-review/SKILL.md` (frazy: `### Mutation check (conditional — risk-critical modules only)`, `npx stryker run --mutate`, `test-plan.md §4`)
- `MANUAL_PARITY_FILES`: `10x-impl-review/SKILL.user.md` (nieśledzony przez manifest; wymagany parytet + sentinele mutation)
- `ADAPTED_LINES`: `Record<ścieżka-względna, Array<{ claude: string; agents: string }>>` — dokładne treści linii z artefaktu Fazy 1

#### 2. Logika checkera

**File**: `scripts/lib/skills-sync-checker.ts` (nowy)

**Intent**: Czyste, testowalne funkcje (root wstrzykiwany parametrem) realizujące cztery sygnały i składające raport z findingami.

**Contract**:

- **Sygnał 1 (dir-diff)**: porównanie pełnych zbiorów plików obu drzew (rekurencyjnie, wszystkie pliki — SKILL.md, references/, rules/, tile.json, SKILL.user.md); dodatkowo kontrola, że wszystkie 25 skilli z kluczy manifestu istnieje w obu drzewach. Finding: plik obecny w jednym drzewie, nieobecny w drugim.
- **Sygnał 2 (hash-check)**: sha256 surowych bajtów każdego pliku z `files.skills[*].contentHashes` i `promptHashes` manifestu vs wartość z manifestu. Semantyka: plik zwykły — MISMATCH = finding „nieautoryzowana lokalna edycja"; plik z `EXTENDED_SKILLS` — MATCH = finding „rozszerzenie wymazane (wipe)", MISMATCH = OK.
- **Sygnał 3 (sentinele)**: każda fraza z `EXTENDED_SKILLS` obecna w pliku w OBU drzewach; frazy mutation dodatkowo w `SKILL.user.md`. Finding per brakująca fraza per plik.
- **Sygnał 4 (parytet par)**: dla każdej pary plików — byte-equal, chyba że plik ma wpis w `ADAPTED_LINES`: wtedy porównanie linia-po-linii, różnice dozwolone tylko jako substytucje 1:1 zgodne z allowlistą; różna liczba linii lub niedopasowana substytucja = finding „content-drift".
- **Raport**: findingi pogrupowane per klasa plików (manifest-managed / lock-bootstrap / personal + manual), czytelny tekst + linia podsumowania; struktura zwrotna rozróżnia findingi (drift) od błędów środowiska (nieczytelny manifest / brak drzewa).

#### 3. Entrypoint

**File**: `scripts/check-skills-sync.ts` (nowy)

**Intent**: Cienki wrapper CLI wzorem `resolve-bread-version.ts`: JSDoc z linią użycia, importy `node:`, parsowanie `--report-only`, wywołanie logiki na repo-root, wydruk raportu, ustawienie exit-code.

**Contract**: exit 0 — brak driftu (lub `--report-only`); exit 1 — wykryty drift; exit 2 — błąd środowiska (nieczytelny manifest, brak któregoś drzewa). `--report-only` nie zmienia treści raportu, tylko wymusza exit 0 przy drifcie (przy błędzie środowiska nadal exit 2).

#### 4. Testy jednostkowe

**File**: `tests/skills-sync-checker.test.ts` (nowy)

**Intent**: Fixture-based testy logiki (mini-drzewa + mini-manifest budowane w temp-dir per test) pokrywające każdy sygnał i obie semantyki hashy.

**Contract**: Minimum przypadków: stan czysty → zero findingów; brakujący skill w jednym drzewie → sygnał 1; edycja zwykłego pliku zarządzanego → sygnał 2 (mismatch); plik rozszerzony o treści zgodnej z hashem manifestu → sygnał 2 odwrócony (wipe — scenariusz `755065a`); brakująca fraza-sentinel → sygnał 3; różnica pary poza allowlistą oraz różnica zgodna z `ADAPTED_LINES` → sygnał 4 (finding / brak findingu); nieczytelny manifest → błąd środowiska, nie drift.

#### 5. Alias npm

**File**: `package.json`

**Intent**: Komenda uruchomieniowa wzorem `resolve:bread-version`.

**Contract**: `"check:skills": "tsx scripts/check-skills-sync.ts"` w `scripts`.

### Success Criteria:

#### Automated Verification:

- `npm run check:skills` → exit 0 na czystym repo (raport bez findingów)
- `npm run check:skills -- --report-only` → exit 0 + pełny raport
- `npm run test:unit` zielone (w tym nowe testy fixture)
- `npm run typecheck` zielone
- Nowe pliki czyste lintowo: targeted `npx prettier --write` na 4 nowych plikach TS, potem `npx eslint scripts/check-skills-sync.ts scripts/lib/skills-sync-config.ts scripts/lib/skills-sync-checker.ts tests/skills-sync-checker.test.ts` bez błędów

#### Manual Verification:

- Celowe zepsucie #1: zmiana nazwy katalogu `.agents/skills/10x-mom-test` → `npm run check:skills` exit 1 z findingiem sygnału 1; przywrócenie → exit 0
- Celowe zepsucie #2: edycja linii w `.claude/skills/10x-frame/SKILL.md` → exit 1 z findingiem „nieautoryzowana edycja"; revert (`git checkout`) → exit 0
- Celowe zepsucie #3: usunięcie linii sentinela ze `.agents/skills/10x-archive/SKILL.md` → exit 1 z findingami sygnału 3 i 4; revert → exit 0
- Czytelność raportu: format zrozumiały bez zaglądania w kod (nazwy klas plików, ścieżki, sugestia „co dalej")

**Implementation Note**: Po ukończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie (w tym trzy celowe zepsucia) przed przejściem do Fazy 3.

---

## Phase 3: Dokumentacja + bookkeeping

### Overview

Dokumentacja przestaje wprowadzać w błąd, checker jest wpięty w procedurę re-synca, zmiana odnotowana w konwencji chore.

### Changes Required:

#### 1. Korekta opisu `skills-lock.json` + wpięcie checkera

**File**: `AGENTS.md`

**Intent**: (a) Poprawić mylący opis w sekcji „Repository status" — `skills-lock.json` to artefakt bootstrapu z `10x-astro-starter` (format CLI vercel-labs `skills`, 2 skille), a faktycznym inwentarzem `10x get` jest `.claude/.10x-cli-manifest.json`. (b) W sekcji „10x-cli profile & workflow" przy procedurze re-synca dopisać krok weryfikacji `npm run check:skills` po każdym `10x get` / re-syncu. (c) Dopisać `npm run check:skills` do listy komend w sekcji „Commands".

**Contract**: Trzy punktowe edycje istniejących sekcji; bez zmian strukturalnych pliku. Uwaga: edycja `AGENTS.md` w `.claude/` się nie odbija — `CLAUDE.md` to tylko shim importujący.

#### 2. Notka chore w rejestrze issues

**File**: `context/foundation/github-issues.md`

**Intent**: Zgodnie z konwencją repo (research §G) chore spoza roadmapy dostaje datowaną notkę-blockquote pod tabelą mapowania, bez wiersza tabeli.

**Contract**: Blockquote z datą, change-id `skills-sync-check`, jednozdaniowym opisem i (jeśli powstanie) numerem issue z labelem `chore`. Utworzenie samego issue na GitHubie to akcja outward-facing — wykonać tylko po potwierdzeniu użytkownika (precedensy: #13, #14, #19).

#### 3. Status zmiany

**File**: `context/changes/skills-sync-check/change.md`

**Intent**: Po wdrożeniu flip `status` na `implemented` + `updated` (robi to `/10x-implement`; tu tylko odnotowane dla kompletności).

**Contract**: Frontmatter `change.md`.

### Success Criteria:

#### Automated Verification:

- `npm run check:skills` nadal exit 0 (edycje docs nie ruszyły drzew)
- Grep potwierdza: `AGENTS.md` zawiera `check:skills` (Commands + procedura re-synca) i nie zawiera już frazy „pins the skills fetched from the course CLI"

#### Manual Verification:

- Przegląd zredagowanych fragmentów AGENTS.md: opis locka merytorycznie zgodny z research §C, krok checkera osadzony w naturalnym miejscu procedury
- Decyzja o utworzeniu issue `chore` na GitHubie (opcjonalna, za zgodą)

---

## Testing Strategy

### Unit Tests:

- Cała logika sygnałów w `tests/skills-sync-checker.test.ts` na fixture'ach temp-dir (mini-drzewa + mini-manifest) — bez dotykania prawdziwych drzew repo
- Kluczowe edge-case'y: odwrócona semantyka (wipe `755065a`), substytucja zgodna vs niezgodna z `ADAPTED_LINES`, różna liczba linii w parze, nieczytelny manifest jako błąd środowiska (exit 2), plik obecny w manifeście a nieobecny na dysku

### Integration Tests:

- Brak dedykowanych — realną integracją jest uruchomienie `npm run check:skills` na żywym repo (kryterium sukcesu Fazy 2); narzędzie jest read-only i czysto plikowe

### Manual Testing Steps:

1. `npm run check:skills` na czystym repo → exit 0, raport pusty
2. Trzy celowe zepsucia z Fazy 2 (rename katalogu / edycja pliku zarządzanego / usunięcie sentinela) → każde exit 1 z trafnym findingiem, revert → exit 0
3. `npm run check:skills -- --report-only` przy zepsutym stanie → exit 0, findingi widoczne w raporcie

## Performance Considerations

Pomijalne: ~170 plików do zhashowania/porównania (sha256 + odczyt), czas działania rzędu pojedynczych sekund. Bez cache'owania, bez równoległości.

## Migration Notes

- Rollback checkera: usunięcie 4 nowych plików + aliasu npm; zero wpływu na aplikację.
- Rollback re-synca Fazy 1: `git revert` commita — adaptacje nie giną (są i w historii, i w `ADAPTED_LINES`).
- `.prettierignore` zostaje na stałe — to korekta konfiguracji, nie część eksperymentu.
- Po przyszłym `10x get` nowej lekcji: manifest się zmienia (nowe skille/hashe), checker czyta go na żywo, więc nowe skille w `.claude` zgłosi jako brakujące w `.agents` — to pożądane zachowanie (dokładnie dzisiejszy incydent). Po re-syncu nowych skilli raport wraca do zera. Jeśli `10x get` wymaże rozszerzenie — sygnał 2 (MATCH) + sygnał 3 to wykryją.

## References

- Badanie: `context/changes/skills-sync-check/research.md` (pełna taksonomia różnic §A, manifest §B, lock §C, rozszerzenia i sentinele §D, konwencje §E, ground-truth adaptacji §F, konwencja issues §G)
- Walidacja: `context/team/opportunity-map.md`, `context/team/mom-test-validation.md`
- Wzorzec skryptu: `scripts/resolve-bread-version.ts` → `scripts/lib/bread-version-resolver.ts` → `tests/bread-version-resolver.test.ts:7-17`
- Incydenty: commit `755065a` (wipe rozszerzenia, m3l1), PR #101 / `843bf8e` (restore + resync, lekcja o nieodwracalności adaptacji)
- Specyfikacje fallback rozszerzeń: `AGENTS.md:17-24` (mutation), `AGENTS.md:102-107` (archive)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Ochrona przed formatterem + jednorazowy re-sync `.agents`

#### Automated

- [x] 1.1 Diff drzew ograniczony do 9 adaptowanych plików (substytucje 1:1 z artefaktu adaptacji) — a8782f4 (mikro-krok EOL: working-tree-only — bloby `.claude` były już LF, więc commit nie zawiera zmian `.claude`)
- [x] 1.2 `npx prettier --check` na obu drzewach → exit 0 (ignorowane) — a8782f4
- [x] 1.3 `npm run test:unit` zielone (sanity) — a8782f4

#### Manual

- [x] 1.4 Spot-check 3 adaptowanych plików — adaptacje poprawne w kontekście — a8782f4
- [x] 1.5 Próbny commit pliku md z `.agents` — pre-commit nie reformatuje — a8782f4

### Phase 2: Checker — konfiguracja + logika + entrypoint + testy

#### Automated

- [x] 2.1 `npm run check:skills` → exit 0 na czystym repo
- [x] 2.2 `npm run check:skills -- --report-only` → exit 0 + pełny raport
- [x] 2.3 `npm run test:unit` zielone (z nowymi testami fixture)
- [x] 2.4 `npm run typecheck` zielone
- [x] 2.5 Targeted prettier + eslint na 4 nowych plikach bez błędów

#### Manual

- [x] 2.6 Celowe zepsucie #1 (rename katalogu skilla) → exit 1, trafny finding, revert → exit 0
- [x] 2.7 Celowe zepsucie #2 (edycja pliku zarządzanego) → exit 1, trafny finding, revert → exit 0
- [x] 2.8 Celowe zepsucie #3 (usunięty sentinel) → exit 1, findingi sygnałów 3+4, revert → exit 0
- [x] 2.9 Raport czytelny bez zaglądania w kod

### Phase 3: Dokumentacja + bookkeeping

#### Automated

- [ ] 3.1 `npm run check:skills` nadal exit 0 po edycjach docs
- [ ] 3.2 Grep AGENTS.md: `check:skills` obecne, mylący opis locka usunięty

#### Manual

- [ ] 3.3 Przegląd fragmentów AGENTS.md (opis locka zgodny z research §C, krok checkera w procedurze)
- [ ] 3.4 Decyzja o issue `chore` na GitHubie (opcjonalna, za zgodą)
