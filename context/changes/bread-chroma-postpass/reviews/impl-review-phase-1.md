<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bread chroma-denoise post-pass + pinned version resolution

- **Plan**: `context/changes/bread-chroma-postpass/plan.md`
- **Scope**: Phase 1 of 5
- **Date**: 2026-06-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Verification

- `npm run test:unit` — PASS, 17 files and 180 tests after triage fixes
- `npm run typecheck` — PASS
- `npm run lint` — PASS with 0 errors and 51 `no-console` warnings across CLI/spike scripts
- `npx vitest run tests/bread.test.ts` — PASS, 4 tests
- Mutation testing — skipped; Phase 1 touches no risk-critical module from `context/foundation/test-plan.md` §4
- Manual Progress — 1.5–1.8 complete
- Live resolver — pinned `bf9f60e777852145e9e6c06fac109c6d55fec43bd535b6b13d3608c34711060b`; immediate second run returned a no-op
- Incompatible schema — rejected in a separate process; SHA-256 of both target files was unchanged
- Rollback — isolated commit + `git revert` restored the prior hash and produced a tree identical to the baseline

## Findings

### F1 — No-op bypasses match-cardinality validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `scripts/resolve-bread-version.ts:53`
- **Detail**: When the resolved hash already equals the current hash, the CLI returns before reading the test file or invoking either exact-match rewrite validator. A duplicate `BREAD_VERSION` declaration or missing/duplicate test assertion can therefore be reported as a successful no-op. The required already-current no-op test is also absent.
- **Fix**: Always read both files and validate exactly one target in each before deciding whether the operation is a no-op; add tests for a valid no-op and ambiguous no-op inputs.
  - **Strength**: Enforces the plan's fail-closed invariant on every execution path.
  - **Tradeoff**: Requires a small orchestration extraction or additional validation calls before the early return.
  - **Confidence**: HIGH — the ambiguous no-op behavior was reproduced locally.
  - **Blind spot**: The CLI currently has no injected filesystem seam, so the test shape still needs to be selected.
- **Decision**: FIXED — validation and rewrite preparation now run for both targets before the no-op decision; valid and ambiguous no-op cases are covered by unit tests.

### F2 — Schema validation checks field names but not compatibility

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `scripts/lib/bread-version-resolver.ts:62`
- **Detail**: `assertCompatibleInputSchema` only checks that `image`, `gamma`, and `strength` keys exist. It accepts incompatible definitions such as `image: boolean`, `gamma: string`, and `strength: object`, so a mechanically bumped version can pass despite rejecting the values sent by `buildBreadInput`. Tests also omit the missing-`gamma` case required by the plan.
- **Fix**: Validate each property against the input contract actually used by the application and add tests for incompatible types plus each individually missing field.
  - **Strength**: Makes the resolver genuinely protect the runtime request contract rather than only its field names.
  - **Tradeoff**: Replicate's generated schema variants must be modeled narrowly enough to avoid rejecting equivalent valid schemas.
  - **Confidence**: HIGH — an incompatible schema was accepted in a local reproduction.
  - **Blind spot**: The exact live Bread OpenAPI property definitions have not yet been captured by manual criterion 1.6.
- **Decision**: FIXED — schema validation now requires the live Bread field shapes and verifies that numeric constraints admit the configured gamma and strength; tests cover missing fields, incompatible types, and rejecting ranges.

### F3 — Test rewrite can modify an unrelated hash literal

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `scripts/lib/bread-version-resolver.ts:99`
- **Detail**: `rewriteTestHash` matches any quoted occurrence of the old hash rather than the planned pinned-hash assertion. A source containing only `const unrelated = "<old hash>"` is accepted and rewritten.
- **Fix**: Anchor the replacement to `expect(BREAD_VERSION).toBe("<hash>")` and add a negative test containing an unrelated hash literal.
- **Decision**: FIXED — the replacement is anchored to the `expect(BREAD_VERSION).toBe(...)` assertion and a negative test proves unrelated hash literals are rejected.

### F4 — Sequential writes can leave a partial bump

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `scripts/resolve-bread-version.ts:65`
- **Detail**: Both contents are prepared before writing, but the two writes are sequential. If writing `bread.ts` succeeds and writing `bread.test.ts` fails, the working tree is left with mismatched pin and assertion.
- **Fix**: Stage both contents through temporary files and restore the original first target if committing the second target fails.
  - **Strength**: Preserves the all-or-nothing behavior claimed by the resolver workflow.
  - **Tradeoff**: Cross-file atomicity requires explicit rollback and cleanup because filesystem rename is atomic only per file.
  - **Confidence**: HIGH — the current writes have no rollback path.
  - **Blind spot**: The practical likelihood of a second-write failure in a local developer checkout is low.
- **Decision**: FIXED — target files are replaced through temporary siblings, and a failed second replacement atomically restores the first file; an isolated filesystem test verifies rollback and temporary-file cleanup.

### F5 — Replicate requests have no explicit timeout

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `scripts/resolve-bread-version.ts:44`
- **Detail**: Both external requests rely on the runtime's default network timeout, so a stalled Replicate endpoint can block a manual bump for an uncontrolled period.
- **Fix**: Add a bounded `AbortSignal.timeout()` to both requests and surface a clear timeout error.
- **Decision**: FIXED — both Replicate requests now use a shared 15-second timeout helper with a bounded timeout error; tests cover successful JSON parsing and controlled timeout failure.

### F6 — Three manual Phase 1 criteria remain unverified

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/bread-chroma-postpass/plan.md:346`
- **Detail**: Progress items 1.6–1.8 remain unchecked: live latest-version resolution, fail-closed unchanged targets under an incompatible schema, and restoration through reverting the pin commit.
- **Fix**: Execute and record all three manual checks before declaring Phase 1 complete.
- **Decision**: FIXED — live resolution, fail-closed unchanged-target verification, and isolated commit-revert restoration were executed successfully; Progress 1.6–1.8 are complete.

## Triage Summary

- **Fixed**: F1, F2, F3, F4, F5, F6
- **Skipped**: none
- **Accepted**: none
- **Pending**: none
