# Opportunity Map

## Context

- **Project / context**: LuminaClean AI (workspace kursu 10xDevs) — frykcje wokół pętli `10x get` / synchronizacji statusów / gotowości wydania
- **Data constraint**: mock / local / read-only / non-sensitive — pierwsza wersja bez kontroli dostępu i audytu
- **Date**: 2026-07-17

## Map

| Signal                                                                                                                                                                   | Existing / default response                                                                                                                            | Thin complement                                                         | First useful version                                     | Data risk              | Direction if valuable                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| 1. Po `10x get` drzewa `.claude/skills` i `.agents/skills` rozjeżdżają się (dziś: w `.agents` brakuje `10x-opportunity-map` i `10x-mom-test` — zweryfikowane 2026-07-17) | ręczna procedura re-synca w `AGENTS.md`; `10x doctor` waliduje tylko `.claude/`                                                                        | read-only diff obu drzew + `skills-lock.json`                           | skrypt `npm run check:skills` drukujący raport rozjazdu  | lokalne, niewrażliwe   | internal tool → Review / CI gate; upstream feature request do `10x-cli`                    |
| 2. Status pracy ręcznie synchronizowany między `change.md`, roadmapą i `github-issues.md`                                                                                | krok 6 `/10x-archive` nakazuje sync, ale nic go nie weryfikuje                                                                                         | read-only checker spójności 3 plików md (+ opcjonalnie `gh issue list`) | skrypt-digest niespójności statusów                      | lokalne / read-only    | internal tool → CI gate na PR-ach archiwizacyjnych lub krok weryfikacyjny w `/10x-archive` |
| 3. Gotowość wydania rozproszona (CI, integracja, E2E, ręczny cloud smoke, konfiguracja prod)                                                                             | bramki PR `needs: [ci, integration, e2e]` + auto-deploy na master; smoke ręczny **celowo** (żywy koszt Replicate — złożoność istotna, nie przypadkowa) | read-only digest readiness (`gh run list` + parsowanie docs foundation) | skrypt generujący jednostronicowy raport md              | read-only (GitHub API) | **Wait / no build** — w większości pokryte istniejącymi bramkami                           |
| 4. `10x get` nadpisuje lokalne rozszerzenia skilli (mutation testing w `10x-impl-review`, krok 6 w `10x-archive`)                                                        | trwały fallback treści w `AGENTS.md`; odtwarzanie ręczne                                                                                               | markery-sentinele rozszerzeń w tym samym checkerze co №1                | wspólny skrypt z sygnałem 1 (jedna komenda, dwa raporty) | lokalne, niewrażliwe   | jak №1 — Review / CI gate; upstream: overlay/patch w `10x-cli`                             |

## Recommended First Candidate

```text
Kandydat:
skills-sync-check — read-only weryfikator spójności drzew skilli
(obejmuje sygnały 1 + 4 — dwie twarze tej samej pętli `10x get`)

Czyta:
.claude/skills/**/SKILL.md, .agents/skills/**/SKILL.md, skills-lock.json,
mały manifest markerów rozszerzeń (frazy-sentinele dla kroku 6 10x-archive
i kroku mutation-testing w 10x-impl-review, wyprowadzone z AGENTS.md)

Zwraca:
krótki raport: (a) skille obecne w jednym drzewie, nieobecne w drugim,
(b) skille niezgodne z lock-hashami, (c) brakujące markery lokalnych
rozszerzeń. Uwaga projektowa: kopie w .agents są ADAPTOWANE (zamiana
ścieżek), więc raport pokazuje różnice — nie wymusza bajtowej identyczności.

Czego celowo NIE robi:
auto-sync / auto-fix, żadnych zapisów, żadnego owijania `10x get`,
żadnych zmian upstream w 10x-cli.

Ryzyko danych:
lokalne, niewrażliwe — czyste pliki repo, zero dostępów zewnętrznych.

Kierunek, jeśli się sprawdzi:
narzędzie wewnętrzne → Review / CI gate (pre-push lub job w CI);
równolegle feature request do 10x-cli (profile wielonarzędziowe / overlays).
```

## Why This Candidate

Powtarza się przy każdym `10x get` (najwyższa częstotliwość ze wszystkich czterech sygnałów), łączy ≥2 źródła informacji (dwa drzewa skilli + lock + AGENTS.md), ból jest weryfikowalnie obecny dziś (2026-07-17: potwierdzone 2 brakujące skille w `.agents/skills`), testuje się w 100% lokalnie i read-only, i nie podmienia odpowiedzialności `10x-cli` — tylko ją uzupełnia. Sygnał 2 jest drugi w kolejce (ma częściowe pokrycie procedurą archiwizacji); sygnał 3 w większości rozwiązują istniejące bramki GitHub — tam uczciwa odpowiedź to „wait".

## Next Direction If Valuable

Internal tool → **Review / CI gate**: najpierw lokalna komenda uruchamiana ręcznie po każdym `10x get`; jeśli raport okaże się regularnie użyteczny — pre-push hook lub job w CI, który blokuje merge przy rozjeździe. Równolegle wynik może zasilić feature request do `10x-cli` (natywne wsparcie wielu profili narzędzi / overlays na zarządzane skille).

**Zdecydowany następny krok (2026-07-17):** walidacja przez `/10x-mom-test` (pytania o przeszłe zachowania: ile razy drift realnie coś zepsuł, ile kosztowało odtworzenie rozszerzeń), a jeśli problem przetrwa — `/10x-shape` → `/10x-prd` → `/10x-roadmap`.
