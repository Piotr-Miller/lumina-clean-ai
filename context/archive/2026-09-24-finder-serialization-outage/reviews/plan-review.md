<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Finder output without `response_format`

- **Plan**: context/changes/finder-serialization-outage/plan.md
- **Mode**: Deep
- **Date**: 2026-09-29
- **Verdict**: REVISE → SOUND after triage (all 5 findings fixed)
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension              | Verdict |
| ---------------------- | ------- |
| Requirement Definition | WARNING |
| End-State Alignment    | PASS    |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | WARNING |

Requirement Definition is WARNING rather than FAIL: six of the seven definitions are decided by the user and have a verifying test; only the repair path of "No findings" is open (F1).

## Grounding

21/21 paths ✓ (`scripts/finder-gate.mjs` absent, as expected for a new file), 6/7 symbols ✓ (the provider's `reasoning` setting type ✗, F2), 2 stale line refs (F5), brief↔plan ✓, Progress↔Phase ✓ (2.1 covers both wire bullets), definitions 7/7 from the user (1 path open, F1). Lessons: 27 of 37 apply.

## Findings

### F1 — A model repair can turn a failure into "no findings"

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Requirement Definition
- **Location**: Definitions ("No findings", "Format repair"); Phase 2 §3
- **Detail**: The "No findings" row says prose like "No issues found." must end as `FinderOutputError` and never as `findings: []`. But it goes to the repair first, and nothing stops the repair model from answering `{"summary":"…","findings":[]}`. That passes strict validation, so the user sees "no findings", which is what owner condition 3 forbids. A truncated `finish=length` answer has the same problem: the repair must complete or cut down a partial list, which fills in data the model never gave. The plan also never says what the repair request carries: only the rejected text, or the diff and transcript too. That choice decides both how faithful the repair is and its cost (G4). The Phase 2 tests check only the parser and "invalid → valid repair → result", so they cannot catch this.
- **Fix A ⭐ Recommended**: The repair is only a format conversion. It carries the rejected text and the validation error, but not the diff, and its prompt forbids adding or removing findings. No repair runs when the text has no `{` at all or `finish=length`; those go straight to `FinderOutputError`.
  - Strength: Matches "at most one format repair". The Phase 0 A2 failure (a bad escape) is exactly this class. Cheap, because the diff is not re-sent.
  - Tradeoff: A truncated answer is lost with no rescue.
  - Confidence: HIGH — the Phase 0 failure was malformed JSON, not prose.
  - Blind spot: How glm-4.6 handles a repair without context is unmeasured.
- **Fix B**: The repair continues the conversation (the full finalization history).
  - Strength: It can also rescue "prose instead of JSON".
  - Tradeoff: A second full-price request, and the model may review again instead of converting. That is filling in data, just by the model.
  - Confidence: MED.
  - Blind spot: The impact on G4 cost is unknown.
- **Decision**: FIXED — Fix A (format-only repair; no repair on no `{` or `finish=length`)

### F2 — `reasoning: {enabled:false}` does not type-check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §3 (Amendment A3)
- **Detail**: The plan says to set reasoning off through the provider's `reasoning` setting on the model. That setting's type requires `max_tokens` or `effort` (`@openrouter/ai-sdk-provider/dist/index.d.ts:388-395`), so `{enabled:false}` fails `typecheck`. The implementer would then choose a cast, or `effort:'none'`. The second is a different request from the one A2 measured. The A2 probe used raw fetch, so the SDK path is not verified.
- **Fix**: Send it via `extraBody: { reasoning: { enabled: false } }` on the model settings. `extraBody` is spread last into the body (`index.js` ~3640), and the wire test (2.1) pins the exact body.
- **Decision**: FIXED — `extraBody` in A3

### F3 — The Phase 4 eval command produces 18 rows, not 12

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 Success Criteria; `gate.md` G3/G4
- **Detail**: `evals/promptfooconfig.yaml` has 6 test cases now. #143 (`95da1e5`) added two "hardening" cases after the archive, and the archived matrix covers only 4 (checked). `--repeat 3 --filter-providers baseline-glm-4.6` therefore gives 18 rows. G3 and G4 are defined on "the same 12", and the G4 median changes with the set.
- **Fix**: Add `--filter-pattern` matching the four archived descriptions to the command, check that each endpoint gets exactly 12 rows, and record the hardening cases only as diagnostics, if at all.
- **Decision**: FIXED — `--filter-pattern` + exactly 12 rows

### F4 — G4 can fail on endpoint price alone

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: `gate.md` G4; Phase 4 contract
- **Detail**: The G4 baseline ($0.00100551) is the 2026-08 rows, served by the `json_schema` route at Venice fp4 prices. The candidates are other endpoints (Novita bf16, DeepInfra, Z.AI) with their own per-token prices, and every attempt now makes at least 2 requests. A G4 failure therefore does not separate "the design costs more" from "this endpoint is more expensive". Under the Phase 4 contract, any G4-only failure means STOP and a fallback to a model swap, which the last cycle priced at 57.6×.
- **Fix**: Before the first Phase 4 call, write into `gate.md` (as a dated amendment, without changing the 3× threshold): (a) each endpoint's per-token prices from `/endpoints`; (b) that a G4-only failure goes to the owner together with the fallback's known cost ratio, and does not trigger a model swap automatically.
  - Strength: Keeps the pre-registration intact; the owner decides with full data.
  - Tradeoff: One more piece of owner paperwork before measuring.
  - Confidence: HIGH — the prices are on the endpoint Phase 0 already used.
  - Blind spot: Novita's actual per-token price has not been checked yet.
- **Decision**: FIXED — gate.md Amendment G-A1 (prices read 2026-09-29) + Phase 4 contract

### F5 — Stale line references, and one pointer outside the grep list

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis; Key Discoveries; Phase 5 §3
- **Detail**: `src/output-repair.ts:279-291` and `:341` do not exist: the file has 253 lines, and the real locations are `:48-81` (repair) and `:134` (`extractJsonObject`). The judge's `repairParsedJudgeOutput` doc says "the same discipline as the finder's", which goes stale once the finder repair is removed, and Phase 5 §3 does not list it.
- **Fix**: Correct the references and add that comment to the Phase 5 §3 list.
- **Decision**: FIXED — refs corrected, judge doc added to Phase 5 §3
