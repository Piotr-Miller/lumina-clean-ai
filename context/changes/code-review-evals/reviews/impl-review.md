<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Promptfoo Finder-Model Eval (First Configuration)

- **Plan**: context/changes/code-review-evals/plan.md
- **Scope**: Full plan (Phases 1–3)
- **Date**: 2026-08-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

**Context**: All 11 planned line-items MATCH (fixture hunk math verified programmatically by the drift agent). All six "What We're NOT Doing" guardrails respected: no CI wiring of evals, no committed run outputs under `packages/`, no model-swap decision, no judge-pass evals, no determinism knobs, provider left un-hardened (single attempt). The committed 467KB snapshot (`results/2026-08-10-first-matrix.json`) was scanned clean of secrets/PII/local-path leakage. `promptfoo` pinned exactly at 0.122.0. Three EXTRAs (DEFAULT_FINDER_TIMEOUT_MS export = phase-1 review fix bundled per user decision; review reports; extra self-check cases) all user-approved mid-flow — Scope Discipline stays PASS. Automated success criteria for all phases re-verified green during this review (lint, typecheck, recall self-check 4/4, `node --check`, `promptfoo validate`, snapshot present). Matrix outcome recorded: glm-4.6 + claude-sonnet-5 6/6 clean; qwen3-coder-flash + gpt-5.4-mini 0/6 on deterministic structured-output incompatibilities.

## Findings

### F1 — Unguarded RegExp compile can error a paid eval row

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/assertions.mjs:60
- **Detail**: `scoreIssueRecall` builds `new RegExp(pattern, "iu")` from YAML config inside the matcher. A malformed pattern (the `u` flag rejects things legacy mode allows — `c++`, stray `{`) throws AFTER the paid finder + rubric calls are spent, erroring the row. Patterns are repo-authored, so robustness gap, not injection.
- **Fix**: Wrap pattern compilation in try/catch and return pass:false with reason `invalid pattern for <label>` instead of throwing; add a malformed-pattern case to recall-selfcheck.mjs pinning that behavior.
- **Decision**: FIXED - wrapped pattern compilation and added a malformed-pattern self-check

### F2 — Pass/fail authority (.mjs) sits outside every quality gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/assertions.mjs (gates: eslint.config.js:7, tsconfig.json:10, package.json test script)
- **Detail**: `assertions.mjs` decides pass/fail for every paid run, but lint/typecheck globs are TS-only and vitest excludes `evals/` — the package's CI job never exercises it; `recall-selfcheck.mjs` runs only when typed by hand. Tension: the plan's Testing Strategy deliberately chose "no unit tests, evals/ outside the vitest include" — but that rationale predates recall-selfcheck.mjs existing as a free hermetic gate.
- **Fix A ⭐ Recommended**: Port the self-check cases into a hermetic vitest spec (`evals/assertions.test.ts`) inside the package suite.
  - Strength: CI pins the recall gate + reviewMustFail at zero API cost; the .mjs stays for manual use.
  - Tradeoff: Softens the plan's recorded "no unit tests for evals/" decision; needs a small vitest include widening.
  - Confidence: HIGH — the package suite is hermetic by design; importing an .mjs from vitest is routine.
  - Blind spot: CI runtime budget impact — almost certainly negligible.
- **Fix B**: Keep as-is per the plan's recorded decision.
  - Strength: Honors the plan verbatim; self-check remains a documented manual pre-run step.
  - Tradeoff: A regression in assertions.mjs surfaces only mid-paid-run.
  - Confidence: MED — depends on how often assertions.mjs changes (rarely).
  - Blind spot: Future editors may not know the manual self-check convention exists.
- **Decision**: FIXED via Fix A - added a hermetic Vitest spec and included eval tests in CI

### F3 — Phase-3 adaptations not recorded in the plan body

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/code-review-evals/plan.md
- **Detail**: The two smoke-caught harness fixes (schema draft-07 pin; `PROMPTFOO_DISABLE_TEMPLATING` env block) live in the c12b7da commit message and README Gotchas, but the plan was never amended — a future reader diffing plan vs code meets two unexplained deltas.
- **Fix**: Append a short "## Addenda" section to plan.md noting both adaptations and why (one commit, docs-only).
- **Decision**: FIXED - added the Phase 3 smoke adaptations to the plan

### F4 — schema_validity metric is near-tautological

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/finder-provider.ts:66
- **Detail**: The provider returns `JSON.stringify` of an already zod-validated result, so `is-json` can only fail on serialization drift — real schema reliability shows up as provider error rows (as qwen/gpt-5.4-mini did). "schema_validity 100%" must not be read as "model never flakes".
- **Fix**: One sentence in README's matrix section stating schema reliability is measured by error-row counts, not the schema_validity metric.
- **Decision**: FIXED - clarified the schema reliability signal in the eval README

### F5 — startLine/endLine looser than the zod contract

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/review-result.schema.json:16
- **Detail**: Schema says `"type": "number"` while src/schemas.ts refines to integer ≥ 1. The Anthropic structured-output limitation that forced zod's refine doesn't apply to this Ajv-side mirror, so it could be tighter.
- **Fix**: Change both fields to `"type": "integer", "minimum": 1`.
- **Decision**: FIXED - aligned startLine and endLine with the Zod contract
