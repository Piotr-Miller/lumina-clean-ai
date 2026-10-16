<!-- PLAN-REVIEW-REPORT -->

# Plan Review: finder-glm-5-3 Implementation Plan

- **Plan**: `context/changes/finder-glm-5-3/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-11
- **Plan sha256**: 411c8d9ae32bc4ebf6a918e10f13d653d1a80210eb18fe7f1a745dc7dd356e59
- **Plan sha256 after triage**: 077eaf8100a1826fa9a796dc05741d2221debeee4345d65057efba43a6dc4b62
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | WARNING |
| End-State Alignment    | WARNING |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

## Grounding

608 testów przechodzi; typecheck i lint przechodzą. Prettier zgłasza dokładnie 9 przewidzianych plików screeningowych. Wszystkie ponownie wykonane kontrole odpowiadają zapisanym wynikom. Uwzględniono 28/38 wpisów lessons; liczby kryteriów i wierszy Progress zgadzają się w siedmiu fazach.

Architektura dwóch etapów, wspólna konfiguracja findera, izolacja reasoning w finalizacji i brak retry dla `FinderOutputError` mają potwierdzenie w kodzie `b3a4a38`. Zweryfikowano istniejące i tworzone przez port ścieżki oraz callerów; skróty ścieżek wymagają korekty opisanej w F4.

Niezależny walkthrough: duplikaty tej samej tożsamości i remisy severity są rozstrzygane przez istniejące `mergeFindings` (`packages/code-reviewer/src/findings.ts:86–101`); plan jawnie wybiera opublikowane findings po tym merge jako N. Pusty #247 przechodzi hand-read, pusty #269 nie ma D2 i odpada; pojedyncze finding wymaga klasyfikacji i, na #269, D2. Przy N=19 limit odrzuceń to 1, przy N=21 to 2; pusty verdict liczy się jako rejected. Brak raportowanego modelu/provider w legacy telemetry unieważnia run zgodnie z Definitions. Dwa warianty awarii judge wymagają rozstrzygnięcia F1. Walkthrough kosztu przed/po G5 wykazał F2.

Routing `order` + `only` potwierdzono w [dokumentacji OpenRouter](https://openrouter.ai/docs/guides/routing/provider-selection), a filtr providerów G3 w [dokumentacji Promptfoo](https://www.promptfoo.dev/docs/usage/command-line/).

## Findings

### F1 — „Judge failure” wymaga jednoznacznego sygnału

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Location**: Definitions „valid run”, Phase 3 runner
- **Detail**: Decyzja właściciela w `change.md` mówi „judge fails (red review)”. Kod rozróżnia jednak dwa przypadki: wyprodukowany `verdict: "failed"` zapisuje artefakty i kończy CLI kodem 0; błąd techniczny judge kończy CLI kodem 1 bez artefaktów (`packages/code-reviewer/src/cli.ts:381–399 @b3a4a38`). Plan zdaje się przyjmować drugi przypadek. Przy pierwszym poprawne wykrycie defektów #269 mogłoby unieważnić przebieg wymagający hand-read D2.
- **Fix**: Przed seal wskazać, czy invalid oznacza błąd techniczny judge, czy także wyprodukowany verdict `failed`, i zapisać oba przypadki jako testy klasyfikacji.
  - Strength: Eliminuje niejednoznaczność G1.
  - Tradeoff: Wymaga doprecyzowania decyzji właściciela.
  - Confidence: HIGH — oba zachowania są widoczne w CLI.
  - Blind spot: Intencji określenia „red review” nie rozstrzyga kod.
- **Decision**: FIXED — Fix in plan (owner 2026-10-11): only a technical judge failure invalidates a run; a completed verdict `failed` does not itself invalidate it; edited: Definitions, Phase 3 — Runner, Testing Strategy; reopened: none. Synchronized plan-brief.md and recorded the clarification in change.md. Acceptance-state check succeeded; all Manual rows remain pending.

### F2 — Koszt może odrzucić kandydata przed pomiarem G5

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phases 5–6 outcome, Phase 7 G5
- **Detail**: A6 dopuszcza późniejszy spadek I, lecz Phase 6 może zakończyć zmianę jako `NOT ADMITTED (cost)` przed G5. Przykład: m247=$0.118, m269=$0.155 daje początkowo $10.08906/miesiąc. Gdy G5 zmierzy impl-review za $0.04, uzgodnione uśrednienie obniży projekcję do $9.05153. Wczesne zamknięcie PR uniemożliwia ten wynik.
- **Fix**: Przed G5 oznaczać koszt jako provisional; odrzucać wcześniej tylko na podstawie dolnej granicy, która pozostanie ponad $10 również po dozwolonej aktualizacji I.
  - Strength: Zachowuje uzgodniony wzór bez fałszywego odrzucenia.
  - Tradeoff: Niektóre kandydatury z początkową projekcją ponad $10 wymagają G5.
  - Confidence: HIGH — wynika bezpośrednio z arytmetyki planu.
  - Blind spot: Rzeczywisty koszt G5 pozostaje niezmierzony.
- **Decision**: FIXED — Fix in plan (owner 2026-10-11): the pre-G5 projection is provisional; once both means are final, early cost rejection uses only 53 × m247 + 8 × m269 + 13 × ($0.199620 / 2) > $10.00; equality does not reject; the earlier A6 stop is unchanged; edited: Definitions, Implementation Approach — A6, Phase 3 — Cost projection, Phase 4 — Pre-registration, Phase 5 — Series outcome, Phase 6 — Hand-read outcome, Testing Strategy; reopened: none. Synchronized plan-brief.md and recorded the decision in change.md. Acceptance-state check succeeded; all Manual rows remain pending.

### F3 — Lista manifestu pomija wejścia G3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details, Phase 4
- **Detail**: Wyliczenie plików do seal pomija `packages/code-reviewer/evals/review-result.schema.json`, które G3 czyta przez `is-json` (`promptfooconfig.yaml:82–84`). G3 korzysta też z `.github/ai-review-rules.md`; trzeba wskazać jego konkretny zamrożony hash. Bez tego zmiana wejścia oceniającego może przejść kontrolę manifestu.
- **Fix**: Dopisać schema oraz faktyczny plik reguł G3 do manifestu/wejść i testować, że ich zmiana blokuje preflight.
- **Decision**: FIXED — Fix in plan (owner 2026-10-11): G3's schema and actual project rules are explicit manifest inputs; each hash is checked before every paid step, with independent-change tests blocking preflight and spending; edited: Critical Implementation Details — Ordering and sealing, Phase 3 — Runner preflight, Phase 4 — Pre-registration, Testing Strategy; reopened: none. Synchronized plan-brief.md and recorded the decision in change.md. Acceptance-state check succeeded; all Manual rows remain pending.

### F4 — Skrócone ścieżki uniemożliwią zapis manual acceptance

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Deklaracje File i Manual Verification
- **Detail**: Parser acceptance interpretuje ścieżki względem korzenia repo. Obecny plan zawiera m.in. brace notation, glob `gate/results/*.review.json`, skróty `src/reviewer.ts`, `gate.md`, a nawet backtickowane SHA i etykiety na liniach File. Uruchomiony skrypt `acceptance-state.sh` pokazuje brak powierzchni dla 1.8 i 5.5–5.7 oraz błędne powierzchnie innych wierszy. Późniejsze potwierdzenia będą `unverifiable`.
- **Fix**: Użyć pełnych ścieżek repo-relative i dopisać konkretne `— surface:` do manual criteria; dla zbiorów artefaktów wskazywać katalog.
- **Decision**: FIXED — Fix in plan (owner 2026-10-11): all 21 File declarations use enumerated repo-relative paths; all 14 Manual criteria have explicit surfaces; result collections use a directory; edited: Phases 1–7 — File declarations and Manual Verification; reopened: none. Synchronized plan-brief.md and recorded the decision in change.md. Acceptance-state resolves all 14 surfaces; all Manual rows remain pending. Progress bytes, including IDs, titles and marks, are unchanged; absent declared files are supplied by the planned port or creation phases.

### F5 — Brakuje testu jednoczesnego truncation i inline reasoning

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 guards, Testing Strategy
- **Detail**: Plan testuje oba warunki osobno. Istniejący logger drukuje odrzucony tekst (`packages/code-reviewer/src/cli.ts:167–183 @b3a4a38`); plan przewiduje redakcję dla `inline-reasoning`. Odpowiedź zawierająca `<think` i zakończona `length` musi zachować redakcję niezależnie od kolejności guardów.
- **Fix**: Dodać mieszany przypadek dla step/finalization/repair, sprawdzający brak tekstu w stderr i step summary.
- **Decision**: FIXED — Fix in plan (owner 2026-10-11): step, finalization and repair each require a mixed inline-reasoning/length test; failure is unretried and the sentinel is absent from stderr and step summary regardless of guard ordering; edited: Phase 2 — Inline reasoning guard, Testing Strategy; reopened: none. Synchronized plan-brief.md and recorded the decision in change.md. Acceptance-state check succeeded; all 14 Manual rows remain pending with explicit surfaces.

## Triage complete (2026-10-11)

- **Fixed**: F1, F2, F3, F4, F5 (5)
- **Skipped**: none
- **Accepted**: none
- **Dismissed**: none
- **Verdict after fixes**: SOUND (REVISE → SOUND)
- **Validation**: the modified documents pass Prettier; acceptance-state resolves all 14 Manual criteria to explicit surfaces, with all still pending. Progress IDs, titles and marks are unchanged. The F2 arithmetic was checked independently. Test requirements were added to the plan; implementation and those tests belong to the later implementation phases.
