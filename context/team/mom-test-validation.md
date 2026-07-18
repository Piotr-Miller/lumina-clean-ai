# Mom Test Validation Plan

## Input Idea

`skills-sync-check` — read-only weryfikator spójności drzew skilli (`.claude/skills` ↔ `.agents/skills` + `skills-lock.json` + markery lokalnych rozszerzeń), uruchamiany po każdym `10x get`. Kandydat z `context/team/opportunity-map.md` (2026-07-17), obejmuje sygnały 1+4 mapy.

## Hypotheses

- **User/role**: solo deweloper (właściciel repo) prowadzący dwa narzędzia AI — Claude Code (profil zarządzany przez `10x get`) i Codex CLI (adaptowane kopie w `.agents/skills`). Pośredni „użytkownicy": agenci czytający skille.
- **Friction**: po `10x get` (a) `.agents/skills` rozjeżdża się z `.claude/skills`, (b) lokalne rozszerzenia zarządzanych skilli mogą zostać nadpisane; wykrycie i naprawa są ręczne.
- **Current workaround**: procedura re-synca zapisana w `AGENTS.md` + pamięci agenta (agent może ją wykonać na prośbę); trwały fallback treści rozszerzeń w `AGENTS.md`; `git diff` po `10x get`.
- **Risky assumptions**:
  1. `10x get` będzie uruchamiany jeszcze wystarczająco często (kurs może się kończyć — ROI zależy od liczby pozostałych lekcji).
  2. Codex jest realnie używany w tym repo — jeśli nie, drift `.agents` jest kosmetyczny (nikt nie czyta nieaktualnego drzewa).
  3. Wąskim gardłem jest **wykrycie** rozjazdu, a nie sama praca re-synca (adaptacja kopii) — checker nie skraca tej drugiej.
  4. Frazy-sentinele wykryją utratę rozszerzeń niezawodnie (upstream może przeredagować skill i unieważnić marker).
  5. Nowy ręczny krok („uruchom checker po `10x get`") będzie faktycznie wykonywany — dziś pominięto przecież sam re-sync.
- **Evidence already present** (z historii repo, nie z deklaracji):
  - **Incydent #1 (2026-07-12, PR #101)**: commit „restore 10x-archive tracker-sync step; resync .agents tree from .claude" — udokumentowana podwójna szkoda: utracone rozszerzenie + drift drzewa, naprawa wymagała osobnego PR.
  - **Incydent #2 (2026-07-17, żywy)**: 5 dni po tamtym re-syncu `.agents` znów drifted — brakuje `10x-opportunity-map` i `10x-mom-test` (po `10x get` bieżącej lekcji). Rozszerzenia w `.claude` tym razem przetrwały (grep: tracker-sync 6 trafień, stryker/mutation 4).
  - `AGENTS.md` sam przewiduje problem („`10x get` can overwrite the managed skill… re-add the step from this note") — koszt jest znany i powtarzalny.
  - Setup dwudrzewowy istnieje od 2026-06-18 (~1 miesiąc) → **≥2 incydenty / miesiąc**, częstotliwość ≈ co `10x get`.

## Critique

Uczciwa krytyka przed pytaniami — co może obalić pomysł:

1. **Detekcja może nie być wąskim gardłem.** Procedura w `AGENTS.md` każe robić re-sync po **każdym** `10x get` bezwarunkowo — checker nie mówi więc niczego, czego użytkownik by nie wiedział, o ile procedurę wykonuje. Realna wartość checkera to wychwycenie _pominiętego lub niepełnego_ re-synca (dokładnie dzisiejszy stan) — czyli zabezpieczenie przed ludzkim błędem, nie oszczędność na samej pracy.
2. **Założenie o przyszłości, nie przeszłości.** „Powtarza się przy każdym `10x get`" jest prawdą historyczną, ale ROI zależy od **przyszłej** liczby pobrań. Jeśli kurs kończy się za 1–2 lekcje, budowa nie zdąży się zwrócić.
3. **Drift bez ofiary nie boli.** Jeśli Codex nie był używany w repo od tygodni, brakujące skille w `.agents` nie zepsuły niczyjej pracy — to rozjazd kosmetyczny. Kluczowe pytanie: czy Codex kiedykolwiek zawiódł _z powodu_ driftu?
4. **Istniejąca alternatywa może wystarczyć.** „Poproś agenta o wykonanie procedury re-synca z AGENTS.md" + `git diff` po `10x get` to workflow, który już raz zadziałał (PR #101). Skrypt konkuruje z tym nawykiem, nie z próżnią.
5. **Silny dowód na „proceed"**: potwierdzona przyszła kadencja `10x get` (≥3), regularne użycie Codexa, oraz łączny koszt incydentów mierzalny w czasie (≥~30 min/mies), nie w irytacji.

(Krok „Rewrite Bad Questions" pominięty — brak dostarczonych pytań roboczych.)

## Interview Guide

Dwie publiczności: **(A) self-audit** — wywiad z samym sobą, z odpowiedziami kotwiczonymi w `git log`, PR-ach i pamięci; **(B) opcjonalnie inni uczestnicy 10xDevs** używający 10x-cli z ≥2 narzędziami (waliduje kierunek „feature request upstream"). 20–30 min.

**Rozgrzewka (kontekst):**

1. Jak wygląda Twój tygodniowy podział pracy między Claude Code a Codex w tym repo? Kiedy ostatnio Codex faktycznie czytał skill z `.agents/skills`?
2. Ile razy od początku kursu uruchomiłeś `10x get`? Ile lekcji (a więc pobrań) realnie przed Tobą?

**Świeża historia (ostatni incydent):**

3. Incydent z 12 lipca (PR #101): jak odkryłeś, że krok tracker-sync zniknął — przypadkiem, podczas review, czy dopiero gdy coś nie zadziałało? Ile czasu minęło od `10x get` do wykrycia?
   - _Follow-up:_ czy w międzyczasie jakaś archiwizacja przeszła bez kroku tracker-sync (i zostawiła niespójne statusy)?
4. Przejdź krok po kroku przez naprawę z PR #101 — co dokładnie robiłeś i ile to łącznie trwało (wykrycie + odtworzenie + resync + PR)?
5. Dzisiejszy drift (2 brakujące skille): gdyby nie mapa okazji, kiedy i jak byś go zauważył?

**Obecny workaround:**

6. Co robisz dziś bezpośrednio po `10x get` — konkretnie, przy ostatnim pobraniu? (git diff? procedura z AGENTS.md? nic?)
7. Czy prosiłeś kiedyś agenta o wykonanie procedury re-synca z AGENTS.md? Jak poszło — co agent pominął, co wymagało poprawki?

**Koszt bólu:**

8. Czy drift kiedykolwiek zepsuł _realną pracę_ — Codex użył nieaktualnego/brakującego skilla, review pominęło krok Strykera, archiwizacja pominęła sync statusów? Opowiedz konkretny przypadek.
9. Zsumuj koszt lipcowego incydentu w minutach. Czy była też szkoda inna niż czas (błędny stan roadmapy, niedomknięte issue)?

**Sygnał decyzyjny:**

10. Co musiałoby się wydarzyć, żebyś uznał ręczną procedurę + pamięć agenta za niewystarczające?
11. Po zakończeniu kursu — czy `10x get` będzie jeszcze w ogóle uruchamiany w tym repo?

**Zamknięcie (dla publiczności B):**

12. Czy mogę zajrzeć do historii commitów Twojego repo pod kątem commitów typu „resync/restore skills"? (anonimizowane artefakty > deklaracje)

## Survey

Krótka ankieta dla społeczności 10xDevs (Discord) — waliduje skalę problemu i kierunek upstream. Max 8 pytań.

- **S1 (screener):** Czy używasz skilli z 10x-cli w więcej niż jednym narzędziu AI (np. Claude Code + Codex/Cursor/Copilot)? [tak / nie → koniec ankiety]
- **S2:** Jak często uruchamiasz `10x get`? [>1×/tydzień | ~1×/tydzień | 1–2×/miesiąc | rzadziej]
- **S3:** Co robisz bezpośrednio po `10x get`? [nic | przeglądam `git diff` | ręcznie porównuję drzewa narzędzi | agent wykonuje re-sync | inne — jakie?]
- **S4:** Kiedy ostatnio zauważyłeś, że drzewa skilli Twoich narzędzi różnią się zawartością? [w tym tygodniu | w tym miesiącu | dawniej | nigdy nie sprawdzałem]
- **S5 (otwarte):** Opisz ostatni konkretny przypadek, gdy rozjazd skilli albo nadpisanie lokalnej modyfikacji przez `10x get` coś zepsuło lub kosztowało czas.
- **S6:** Ile zajęła ostatnia taka naprawa? [<5 min | 5–15 min | 15–60 min | >1 h | nie naprawiałem]
- **S7:** Czy utrzymujesz lokalne modyfikacje w zarządzanych skillach? [tak, kilka | 1–2 | nie]
- **S8 (otwarte):** Jak dziś pilnujesz, żeby te modyfikacje przetrwały kolejne `10x get`?

Ankieta celowo **nie pyta** „czy checker byłby przydatny" ani „czy użyłbyś takiego narzędzia".

## Self-Audit Answers (2026-07-17, z dowodów repo/GitHub/CLI — nie z deklaracji)

1. **Użycie Codexa: codziennie** (korekta użytkownika, 2026-07-17). Wstępna inferencja z gita brzmiała „sporadycznie" (ślady commitowe: branch `codex/s11-bread-chroma-postpass` merge #58 06-19, poprawki p2/p3 06-21, review cloud-job-cancel PR #93 07-09) — ale sesje Codexa i odczyty skilli nie zostawiają śladów w historii, więc git systematycznie zaniża użycie. **Wniosek: drift `.agents/skills` ma codzienną ofiarę** — Codex na bieżąco czyta drzewo, w którym dziś brakuje 2 skilli.
2. **Pozostałe `10x get`: ≥3 (dokładnie 3–4).** `10x list`: kurs 10xdevs3 ma moduły 0–5 (wszystkie wydane); bieżąca lekcja = **m5l1** (opportunity map / internal builders); zostały m5l2, m5l3, m5l4 + opcjonalna m5l5. Istotne: **m5l4 „Shared AI Registry" uczy wprost sentinel markers i manifest-tracked distribution** — techniki pełnej wersji checkera; m5l1 jawnie kieruje kandydatów do ścieżek m5l2 (team agent) / m5l3 (CI gate) / m5l4 (registry).
3. **Koszt PR #101:** commit roboczy 19:41:54, PR otwarty 20:07:51, merge 20:14:23 (+0200) → **≥33 min widocznego wall-clocku** (commit→merge); czas wykrycia i naprawy _przed_ commitem jest w gicie niewidoczny (diff 73+/36−, 10 plików — sesja ograniczona, realnie ~30–60 min łącznie; do potwierdzenia przez użytkownika). **Szkody poza czasem nie znaleziono**: archiwum landing-content (PR #90, 07-08) miało zaktualizowany ledger roadmapy; brak śladów pominiętego tracker-synca w oknie incydentu (zastrzeżenie: moment utraty kroku jest nieznany, więc „nie znaleziono" ≠ „nie było").

**Kryteria vs odpowiedzi:** ≥3 przyszłe gety ✓ (3–4) · Codex ≥1×/tydz ✓ (**codziennie** — korekta użytkownika) · koszt ≥30 min/mies ✓ (na granicy) → wszystkie trzy spełnione: **PROCEED**. Wskazówka implementacyjna do /10x-shape: rdzeń (porównanie obecności skilli + lock-hashe) budować od razu — zwraca się przy najbliższym `10x get`; sekcję markerów-sentineli można wzmocnić wzorcami z m5l4 („Shared AI Registry"), gdy lekcja zostanie pobrana.

## Decision Criteria

- **Proceed** (buduj `skills-sync-check` jako lokalny skrypt): przewidywane **≥3 kolejne `10x get`** w tym repo **oraz** Codex używany ≥1×/tydzień **oraz** udokumentowany koszt incydentów ≥30 min/miesiąc (self-audit, pyt. 2, 1, 9). Niezależnie: **≥40% ankietowanych** multi-tool userów raportuje rozjazd co najmniej raz w miesiącu → to sygnał na feature request upstream do 10x-cli, nawet jeśli lokalny skrypt nie powstanie.
- **Narrow scope**: incydenty realne, ale Codex używany sporadycznie → zamiast skryptu z markerami: sam check obecności skilli (porównanie listy katalogów, 10 linii) **albo** utrwalony nawyk „po każdym `10x get` agent wykonuje procedurę z AGENTS.md" + `git diff` — bez nowego kodu.
- **Do not build yet**: zostały ≤2 pobrania `10x get` **lub** Codex nieużywany w repo od >2 tygodni — drift bez ofiary; wróć do tematu, jeśli po kursie `10x get` nadal będzie w użyciu.
- **Try existing tool/process first**: przez najbliższe **2 pobrania** `10x get` stosuj wyłącznie istniejący workflow (agent + procedura AGENTS.md + `git diff`); jeśli oba przejdą bez incydentu i w <10 min każde, skrypt jest zbędny — problemem była dyscyplina wykonania, nie brak narzędzia.
