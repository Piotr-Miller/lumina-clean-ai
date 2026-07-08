<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Landing 2.0 - Content, Guides, Tooltips, Brand Lockup

- **Plan**: `context/changes/landing-content/plan.md`
- **Mode**: Deep
- **Date**: 2026-07-06
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 6/6 Phase 1 paths verified, 4/4 supporting symbols verified, `plan-brief.md` to `plan.md` mismatch confirmed on FAQ default state, and the `## Progress` section satisfies the parser contract.

## Findings

### F1 - FAQ default state contradicts across the planning docs

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 - Sections markup; `plan.md`, `plan-brief.md`, `change.md`
- **Detail**: `plan.md` says the FAQ should render with the first item open, while both `plan-brief.md` and `change.md` say the FAQ should be closed by default. The implementer gets two different answers for the same behavior and has to guess.
- **Fix**: Pick one FAQ default state and update all three planning artifacts to match before implementation reaches Phase 3.
- **Decision**: RESOLVED 2026-07-06 — user chose ALL CLOSED by default (progressive-disclosure discipline; the board's open item was a visual demo). `plan.md` Phase 3 updated; brief and change.md already said closed.

### F2 - Phase 1 contradicts itself on whether beam appears only in the mark

- **Severity**: WARNING
- **Impact**: LOW - quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 - Nav strip + lockup; Key Discoveries
- **Detail**: The Phase 1 nav intent says the wordmark should render `"AI"` beam-clipped, but the same phase contract and the earlier kit-discipline note say the mark is the only beam element in the strip. Those rules cannot both be true, so the implementer has no authoritative answer for the final lockup treatment.
- **Fix**: Resolve the nav beam rule in the plan before implementation. Recommended: keep beam on the monogram only and make the wordmark plain ink so the strip follows its own scarcity rule.
- **Decision**: RESOLVED 2026-07-06 — user chose fidelity to the APPROVED CARD (mark tile + beam-clipped "AI"), overriding the reviewer's stricter option; the rule is re-worded everywhere as "the lockup, one unit, is the only beam surface in the strip". plan.md (Key Discoveries + Phase 1 contract) and change.md updated.

### F3 - The lockup spec is referenced as local, but the repo does not contain it

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Current State Analysis; Phase 1 overview; References
- **Detail**: The plan says `foundations/brand-lockup.html` has local copies under `context/changes/landing-content/design/`, but that folder currently contains only the two landing proposal files. Phase 1 therefore still depends on an external Claude Design artifact for the lockup size ladder and nav treatment, while the plan presents that dependency as already grounded locally.
- **Fix**: Export the lockup card or a concise repo-local spec into the change folder before implementation starts.
  - Strength: Keeps the implementation and review trail self-contained in the repo, which matches the repository workflow.
  - Tradeoff: Small upfront documentation step before code work.
  - Confidence: HIGH - the referenced local file is not present in `context/changes/landing-content/design/`.
  - Blind spot: The external Claude Design record may already contain all needed details, but that still does not make the repo-local claim true.
- **Decision**: RESOLVED 2026-07-06 — repo-local spec written: `design/brand-lockup-spec.md` (composition, beam rule per F2, size ladder, nav drop-in, grounds, implementation notes); plan.md references corrected to point at the spec + name the card as visual source only.

### F4 - Global nav copy is being routed through a screen-scoped strings module

- **Severity**: WARNING
- **Impact**: MEDIUM - real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Implementation Approach; Phase 1 - Tagline string
- **Detail**: The plan routes `nav.tagline` into `src/lib/enhance-strings.ts`, but that file is explicitly documented as the single source of user-facing copy for the Enhance surface at `/`. `Nav.astro` is global chrome rendered by `Layout.astro` on every page, so this change would quietly broaden a screen-scoped module into an app-wide copy bucket without the plan acknowledging the boundary shift.
- **Fix A - Recommended**: Keep the Phase 1 tagline local to `Nav.astro`.
  - Strength: Smallest change and preserves the existing contract of `enhance-strings.ts` as a route-scoped module.
  - Tradeoff: The tagline is not centralized with the other landing copy.
  - Confidence: HIGH - this phase adds only one global string, so the local literal keeps the design intent without widening module scope.
  - Blind spot: If additional global chrome copy is about to land soon, this may be only a short-term stopgap.
- **Fix B**: Introduce a new app-level strings module for global chrome copy and move the tagline there.
  - Strength: Keeps shared copy centralized under an explicit app-wide boundary.
  - Tradeoff: More moving pieces now for a single string in an otherwise visual/content phase.
  - Confidence: MEDIUM - architecturally clean, but potentially more structure than this phase needs.
  - Blind spot: The repo does not yet have an established convention for app-wide copy modules outside `enhance-strings.ts`.
- **Decision**: RESOLVED 2026-07-06 — Fix A chosen: the tagline stays a literal in `Nav.astro`; `enhance-strings.ts` keeps its screen-scoped contract. i18n hand-off noted in change.md (the DE/PL slice localizes global chrome at its component). plan.md Phase 1 change #2 rewritten.
