---
date: 2026-07-17T23:55:29+0200
researcher: Claude Code (Fable 5)
git_commit: 5b38f297eb5c7435cb55ff8da6c32e6c0ad0f888
branch: chore/m5l1-skills-sync-check
repository: LuminaClean_AI
topic: "skills-sync-check — grunt pod read-only weryfikator spójności drzew skilli (.claude/skills ↔ .agents/skills)"
tags: [research, codebase, skills, 10x-cli, agents-sync, manifest, sentinels]
status: complete
last_updated: 2026-07-17
last_updated_by: Claude Code (Fable 5)
---

# Research: skills-sync-check — grunt pod weryfikator spójności drzew skilli

**Date**: 2026-07-17T23:55:29+0200
**Researcher**: Claude Code (Fable 5)
**Git Commit**: `5b38f29` (`chore/m5l1-skills-sync-check`)
**Repository**: LuminaClean_AI

## Research Question

Co dokładnie musi porównywać read-only checker spójności `.claude/skills` ↔ `.agents/skills` (obecność, zawartość, hashe, markery lokalnych rozszerzeń), na jakich źródłach prawdy może się oprzeć (skills-lock.json? manifest 10x-cli?), i w jakich konwencjach repo powinien być osadzony (język, lokalizacja, lint/typecheck/test)?

## Summary

Cztery ustalenia zmieniają założenia z change.md:

1. **`skills-lock.json` NIE jest inwentarzem** — śledzi tylko 2 skille (`10x-cli-guide`, `10x-cli-setup`) i jest artefaktem bootstrapu ze startera (CLI vercel-labs `skills`), nie produktem `10x get`. Prawdziwym inwentarzem jest **`.claude/.10x-cli-manifest.json`**: 25 skilli / 49 plików + 7 promptów, każdy z hashem **sha256 surowych bajtów** (zweryfikowane empirycznie). 7 pozostałych skilli (2 z locka + 5 osobistych) manifest pomija — pełną parzystość drzew łapie tylko surowy dir-diff.
2. **Hash z manifestu ma odwróconą semantykę dla skilli rozszerzonych**: dla `10x-archive` i `10x-impl-review` (lokalne rozszerzenia) **niezgodność** hasha to stan OCZEKIWANY (rozszerzenie żyje), a **zgodność** = alarm (rozszerzenie wymazane przez `10x get`). Dla pozostałych 23 — klasycznie: niezgodność = nieautoryzowana lokalna edycja.
3. **Byte-equality drzew jest dziś niemożliwa**: całe `.agents` przeszło przez markdown-formatter (Prettier-styl) — 14 skilli różni się WYŁĄCZNIE formatowaniem, 7 nosi celowe adaptacje per-tool + szum formattera, 11 jest bajtowo identycznych. Semantycznego driftu: **zero** (zweryfikowane pełną normalizacją). Checker musi więc albo porównywać po normalizacji, albo zmiana powinna objąć jednorazowe czyszczenie `.agents` do „1:1 + minimalne adaptacje".
4. **Konwencje repo są gotowe na taki skrypt bez zmian w configach**: `scripts/<nazwa>.ts` (entrypoint) + `scripts/lib/<nazwa>.ts` (logika testowalna) + `tests/<nazwa>.test.ts` (vitest widzi tylko `tests/**`), uruchamiane `npx tsx`, alias npm obok `resolve:bread-version`. `scripts/` jest automatycznie w gramacie eslint (typed) i tsc.

## Detailed Findings

### A. Stan drzew — taksonomia różnic (pełny audyt 32×2)

Zbiory plików są **identyczne**: 82 pliki w każdym drzewie, zero braków/nadwyżek (w tym `references/`, `rules/`, `tile.json`, `SKILL.user.md`). Frontmatter YAML: bajtowo identyczny we wszystkich 32 parach. Werdykty per skill:

| Werdykt                           | Ile | Skille                                                                                                                                                         |
| --------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| identical (byte-for-byte)         | 11  | 10x-archive, 10x-init, 10x-lesson, 10x-mom-test, 10x-opportunity-map, 10x-research, code-review, documentation, learning, skill-optimizer, typescript-magician |
| adapted (celowe swapy + reformat) | 7   | 10x-agents-md, 10x-e2e, 10x-impl-review, 10x-infra-research, 10x-roadmap, 10x-rule-review, 10x-stack-assess                                                    |
| reformatted-only (zero swapów)    | 14  | bootstrapper, cli-guide, cli-setup, frame, health-check, implement, new, plan, plan-review, prd, shape, tdd, tech-stack-selector, test-plan                    |

Zestaw 7 adaptowanych **dokładnie pokrywa się** z adapt-listą z pamięci projektu i z ground-truth PR #101. Sygnatura formattera: `*em*`→`_em_`, re-padding tabel, wstawki pustych linii, `multiSelect` 2→4 spacje, 4-backtick→3-backtick. Dwa kosmetyczne artefakty: zawinięta linia w `10x-shape/references/prd-schema.md:27`, dodatkowa pusta linia blockquote w `10x-test-plan/SKILL.md:~456`.

**Celowe adaptacje (pełna lista lokalizacji)**: `10x-agents-md/SKILL.md:47,54,64,77,124,145,156` (CLAUDE.md→AGENTS.md ×5, Claude Code→Codex ×2); `10x-e2e/SKILL.md:126` + `references/e2e-quality-rules.md:4`; `10x-impl-review/SKILL.md:115` + `SKILL.user.md:115`; `10x-infra-research/SKILL.md:198` (Claude→Codex); `10x-roadmap/SKILL.md:60,75`; `10x-rule-review/SKILL.md:27,32` (w tym `~/.claude/CLAUDE.md`→`~/.codex/AGENTS.md`); `10x-stack-assess/SKILL.md:186,192,198,335`.

### B. `.claude/.10x-cli-manifest.json` — prawdziwy inwentarz CLI (735 linii)

Klucze top-level: `package` (`@przeprogramowani/10x-cli` 1.10.0), `manifestVersion: 3`, `lastApplied: 2026-07-17T19:23…`, `lessonId: m5l1`, `course: 10xdevs3`, `tool: claude-code`, `files`, `lessons`.

- `files.skills` (linie 9–229): **25 skilli, 49 plików**, kształt wpisu: `{"files": ["SKILL.md", …], "contentHashes": {"SKILL.md": "<sha256>"}}` — multi-plikowe skille (np. `10x-e2e`: 5 references + SKILL.md) mają hash per plik.
- `files.prompts` + `promptHashes`: 7 plików w `.claude/prompts/`. `files.configs: []`.
- `lessons` (230–734): historia migawek m2l4→m5l1, **tylko listy plików, bez hashy**; `lessons.m5l1` = wyłącznie `10x-opportunity-map` + `10x-mom-test` (zastosowane addytywnie).
- **Zasięg: wyłącznie `.claude/`** — zero wiedzy o `.agents/`, `.codex/`, `AGENTS.md`.

**Algorytm hashy — zweryfikowany empirycznie**: `contentHashes`/`promptHashes` = czysty `sha256` surowych bajtów pliku. Dowody: `10x-frame`, `10x-plan`, `10x-mom-test`, `10x-shape/references/prd-schema.md` → MATCH; `10x-archive/SKILL.md` i `10x-impl-review/SKILL.md` (rozszerzone lokalnie) → MISMATCH (poprawna detekcja lokalnej edycji). Pliki zarządzane są na dysku LF, więc surowe bajty == LF.

**Macierz zdolności checkera (manifest+lock)**: (a) brak skilla w `.agents` — częściowo (klucze manifestu dają oczekiwany zbiór 25; 5 osobistych skilli łapie tylko dir-diff); (b) lokalna modyfikacja `.claude` vs ostatni `10x get` — **TAK** (rehash vs contentHashes); (c) lista plików do skasowania przy następnym fetchu — zbiór „at-risk" tak (wszystko w `files.*`), konkretna lista nie (wymaga treści następnej lekcji). Nie do wyprowadzenia: jakiekolwiek hashe `.agents` (nie istnieją nigdzie), stan `AGENTS.md`/`CLAUDE.md`.

### C. `skills-lock.json` — czym naprawdę jest

Format CLI vercel-labs `skills`: `computedHash` = **folder-hash** `sha256(relativePath + bajty pliku)` po plikach posortowanych ścieżką — dla 1-plikowego skilla `sha256("SKILL.md" + treść)`. **Zapisane bajty są CRLF** (lock generowany na checkoucie Windows; working tree `w/crlf`): MATCH tylko dla konstrukcji `"SKILL.md"+CRLF`. Oba wpisy bajtowo równe bootstrapowi `dcccc93` — lock to artefakt `10x-astro-starter`, **nie** produkt `10x get`; opis w `AGENTS.md:114` („pins the skills fetched from the course CLI") jest w tym punkcie mylący. Caveat: hash wrażliwy na końcówki linii — świeży checkout LF dałby false-positive.

### D. Lokalne rozszerzenia + kandydaci na sentinele

**`10x-archive/SKILL.md` — step 6 „Sync downstream trackers", linie 187–199** (+ zależne: 210, 226–227, 239, 247). Obecny w OBU drzewach na tych samych liniach, bajtowo identyczny (skill w kategorii „identical"). Sentinele: `**Sync downstream trackers**` (:187), `` `## Backlog Handoff` `` (:190), `context/foundation/github-issues.md` + `## Status updates` (:191), `gh issue close <n> --comment "Archived` (:197).

**`10x-impl-review/SKILL.md` — „Mutation check", linie 113–123.** Sentinele: `### Mutation check (conditional — risk-critical modules only)` (:113), `npx stryker run --mutate` (:120), `test-plan.md §4` (:115). Parytet w `.agents` na tych samych liniach, z celowym swapem `CLAUDE.md`→`AGENTS.md` w :115 — sentinel NIE może zawierać tego fragmentu albo musi tolerować oba warianty.

**`SKILL.user.md`** istnieje tylko dla `10x-impl-review` (oba drzewa, 467 linii, niemal-duplikat SKILL.md z tym samym krokiem mutation w :113–123) — ręczny backup-override; **manifest go NIE śledzi** (nie jest fetchowany). Kategoria dla checkera: „ręczny plik w zarządzanym katalogu — wymagany parytet między drzewami".

**Trwałe specyfikacje fallback w `AGENTS.md`**: mutation `:17–24`, archive extensions `:102–107` — to kontrakty, które sentinele kodują.

### E. Konwencje repo dla nowego skryptu

- `package.json`: `"type": "module"` (:3); devDeps: `tsx ^4.22.3`, `typescript ^5.9.3`, `vitest ^3.2.4`; precedens aliasu: `"resolve:bread-version": "tsx scripts/resolve-bread-version.ts"` (:21).
- **Wzorzec**: cienki entrypoint `scripts/<nazwa>.ts` (JSDoc z linią użycia, importy `node:`), logika w `scripts/lib/`, test w `tests/<nazwa>.test.ts` importujący z `../scripts/lib/…` — precedens: `scripts/resolve-bread-version.ts` → `scripts/lib/bread-version-resolver.ts` → `tests/bread-version-resolver.test.ts:7-17`.
- **Vitest widzi tylko `tests/**/\*.test.ts`** (`vitest.config.ts:9`) — test położony w `scripts/` byłby niewidzialny.
- `scripts/` NIE jest ignorowany przez eslint (`eslint.config.js:95-111` — ignores: .gitignore, `supabase/functions/**`, `**/*.iife.js`, `context/{changes,archive}/**`) ani wykluczony z tsc (`tsconfig.json:3-4`) → nowy plik dostaje typed-lint + typecheck bez zmian w configach; pre-commit `lint-staged` przepuści go przez `eslint --fix`, pre-push przez `tsc --noEmit` + `test:unit`.
- Priory z `lessons.md`: (1) Windows/CRLF — lint tylko plików dotkniętych fazą, targeted `npx prettier --write` na nowych plikach (lessons.md:33-38); (2) nigdy `<cmd> | tail` do odczytu pass/fail — exit code ostatniej komendy pipeline'u (lessons.md:149).

### F. Ground truth adaptacji i historia incydentów

**PR #101 (`843bf8e`, 2026-07-12)** ujawnia regułę adaptacji **dwukierunkową**: (i) forward-adapt tam, gdzie tekst znaczy „plik reguł, który TEN agent czyta" (`CLAUDE.md`→`AGENTS.md`, np. `10x-e2e/references/e2e-quality-rules.md`); (ii) naprawa over-replace — przywrócenie `CLAUDE.md` w generycznych enumeracjach narzędzi („CLAUDE.md / AGENTS.md" — naiwny find-replace produkował nonsens „AGENTS.md / AGENTS.md" w bootstrapper/health-check/rule-review/stack-assess/test-plan). Wniosek dla checkera: **mapa tokenów NIE jest mechanicznie odwracalna** — porównanie znormalizowane musi być per-linia tolerancyjne, nie globalnym sed-em.

**Mechanizm wipe'u potwierdzony**: `755065a` („Initial m3l1", 2026-06-08) usunął cały step 6 z `.claude/skills/10x-archive/SKILL.md` (index `09b0d3f..a0f8c4f`, 28 linii) — renumeracja kroków, usunięte linie potwierdzeń i failure-mode. Rozszerzenie (oryginalnie `f6a1b80`) wróciło dopiero w #101 po 34 dniach.

**Frontmatter**: kopie `.agents` mają frontmatter **identyczny** z `.claude` — `b2dabd3` (06-20) dodał go najpierw w `.agents` (code-review, learning), `0cea4c9` (#95, 07-10) uzupełnił bliźniaki `.claude` („without it Claude Code fell back to the raw prompt body"). Nie jest to wymóg Codex-specific — checker nie musi tolerować różnic frontmatter (dziś: zero różnic).

### G. Konwencja github-issues dla tej zmiany

`context/foundation/github-issues.md`: wiersze tabeli mapowania (`| Roadmap ID | Issue | Change ID | Status | Labels |`, statusy ready/proposed/done) dostają **tylko pozycje roadmapy**; chore'y spoza roadmapy (precedensy: #13, #14, #19) dostają issue z labelem `chore` + datowaną notkę-blockquote pod tabelą, bez wiersza. `skills-sync-check` = chore. Sekcja `## Status updates` (`| Date | Roadmap ID | Issue | Action |`) to dokładnie struktura, w którą pisze step 6a archiwizacji.

## Code References

- `.claude/.10x-cli-manifest.json:1-8` — nagłówek (lessonId m5l1, tool claude-code); `:9-229` — `files` z contentHashes; `:721-733` — migawka m5l1
- `skills-lock.json:1-17` — 2 wpisy, folder-hash CRLF (algorytm: vercel-labs `skills`, `src/local-lock.ts:117-132` upstream)
- `.claude/skills/10x-archive/SKILL.md:187-199` — step 6 (rozszerzenie); `:210,226-227,239,247` — linie zależne
- `.claude/skills/10x-impl-review/SKILL.md:113-123` — krok Mutation check; `SKILL.user.md:113-123` — duplikat ręczny
- `.agents/skills/10x-impl-review/SKILL.md:115` — celowy swap `AGENTS.md` (jedyna różnica rozszerzenia między drzewami)
- `AGENTS.md:17-24` — spec fallback mutation; `:102-107` — spec fallback archive
- `package.json:3,21,79-86` — ESM, alias tsx, lint-staged; `eslint.config.js:95-111` — ignores; `tsconfig.json:3-4` — include/exclude; `vitest.config.ts:9` — include `tests/**`
- `.husky/pre-commit`, `.husky/pre-push` — bramki (lint-staged; blokada master + typecheck + test:unit)
- `scripts/resolve-bread-version.ts` + `scripts/lib/bread-version-resolver.ts` + `tests/bread-version-resolver.test.ts:7-17` — wzorzec entrypoint/lib/test
- commity: `f6a1b80` (dodanie step 6), `755065a` (wipe m3l1), `843bf8e` (#101 restore+resync), `b2dabd3`/`0cea4c9` (#95 frontmatter), `dcccc93` (bootstrap locka)

## Architecture Insights

1. **Trzy klasy plików, trzy różne kontrakty spójności**: (a) 25 skilli zarządzanych manifestem — hash-baseline istnieje; (b) 2 skille locka — folder-hash CRLF-sensitive; (c) 5 skilli osobistych + `SKILL.user.md` — żadnego baseline'u, tylko dir-diff między drzewami. Checker powinien raportować per-klasę, nie jednym algorytmem.
2. **Odwrócona semantyka hashy dla skilli rozszerzonych** — allowlista `{10x-archive/SKILL.md, 10x-impl-review/SKILL.md}`: MISMATCH=OK (rozszerzenie żyje) + sentinele muszą być obecne; MATCH=ALARM (wipe po `10x get`). To najcenniejszy pojedynczy sygnał checkera — wykrywa dokładnie incydent z 755065a.
3. **Porównanie treści drzew**: dziś działa tylko po normalizacji (strip formatowania + tolerancja par tokenów per-linia — udowodnione: rezidual zero na 32 skillach). Alternatywa strategiczna: jednorazowa re-normalizacja `.agents` (1:1 + 20 linii celowych adaptacji w 7 skillach) upraszcza checker do byte-equal + krótkiej allowlisty linii adaptowanych. Decyzja do planu.
4. **Kolejność sygnałów wg wartości**: (1) dir-diff obecności/zbiorów plików (łapie dzisiejszy incydent), (2) hash-check `.claude` vs manifest z odwróconą semantyką (łapie incydent 755065a), (3) sentinele rozszerzeń w 5 plikach (redundantne zabezpieczenie 2), (4) klasyfikacja treści par (łapie przyszły content-drift). Prompty (7 plików) — tanio dorzucić do (2); `.agents/prompts` nie istnieje i nie jest wymagany.

## Historical Context (from prior changes)

- `context/team/opportunity-map.md` (2026-07-17) — kandydat, sygnały 1+4, kierunek Review/CI gate
- `context/team/mom-test-validation.md` (2026-07-17) — werdykt PROCEED; incydenty: #101 (2026-07-12) i żywy drift 2026-07-17; wskazówka: rdzeń teraz, sentinele wzmocnić wzorcami m5l4
- Brak wcześniejszych prac o sync skilli w `context/changes/**` / `context/archive/**`
- Bonus z badania: realna niespójność w `github-issues.md` (S-03/S-04/S-05: Status `done`, labels `status:proposed`) — poza zakresem tej zmiany, ale to sygnał 2 z opportunity-map

## Related Research

- brak wcześniejszych `research.md` o tym obszarze (pierwsze badanie)

## Open Questions

1. **Czy zmiana obejmuje jednorazowe czyszczenie `.agents` z szumu formattera** (re-sync 1:1 + 20 linii adaptacji)? Upraszcza algorytm checkera z „normalizowane porównanie" do „byte-equal + allowlista linii". Rekomendacja z badania: tak, jako osobna faza przed napisaniem checkera.
2. **Semantyka exit-code**: report-only (exit 0 zawsze) vs fail-on-drift (exit 1) — wpływa na przyszłe użycie w pre-push/CI. Kierunek docelowy (Review/CI gate) sugeruje fail-on-drift z flagą `--report-only`.
3. **Format konfiguracji sentineli**: hardcode w `scripts/lib/` vs mały plik JSON (łatwiejszy do wzmocnienia wzorcami m5l4 „sentinel markers, manifest-tracked uninstall"). m5l4 jeszcze nie pobrane — konfiguracja powinna być łatwa do podmiany.
4. **CRLF**: nowe pliki skryptu muszą przejść targeted `prettier --write`; weryfikacja locka musi hashować bajty surowe (CRLF), nie znormalizowane.
