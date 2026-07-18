<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: skills-sync-check — Phase 2

- **Plan**: `context/changes/skills-sync-check/plan.md`
- **Scope**: Phase 2 of 3
- **Date**: 2026-07-18
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations
- **Remediation**: F1–F3 resolved on 2026-07-18; verification green, re-review pending

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Verification evidence

- `npm run check:skills` — PASS; 158 tree files, 79 pairs, 56 manifest hashes, 3 sentinel files.
- `npm run check:skills -- --report-only` — PASS.
- `npm run test:unit` — PASS; 24 files, 329 tests.
- `npm run typecheck` — PASS.
- Targeted Prettier check — PASS.
- Targeted ESLint — PASS; 0 errors, 3 expected `no-console` warnings in the CLI entrypoint.
- Mutation testing — skipped; Phase 2 touches no risk-critical module covered by the repository's selective mutation-testing policy.

## Findings

### F1 — Symmetric deletion of required non-manifest files passes as clean

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `scripts/lib/skills-sync-checker.ts:178`
- **Detail**: The symmetric tree diff cannot see a file deleted from both trees. Explicit manifest presence checks cover manifest-managed files only. `manualParityFiles` skips a missing file on the assumption that signal 1 already reported it, while `lockBootstrapSkills` is used only for classification. Consequently, symmetric deletion of `10x-impl-review/SKILL.user.md` or either lock-bootstrap skill can produce a clean result.
- **Fix**: Explicitly require configured manual-parity files and lock-bootstrap skill paths in both trees, and add symmetric-deletion tests.
- **Decision**: RESOLVED — explicit required-file checks cover both trees; symmetric-deletion regression tests added for manual-parity and lock-bootstrap files.

### F2 — Accepted local hashes can remain active after the manifest changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: `scripts/lib/skills-sync-checker.ts:239`, `scripts/lib/skills-sync-config.ts:221`
- **Detail**: `acceptedLocalHashes` accepts the pinned local hash independently of the current manifest hash. After a future `10x get`, an old pinned file can still pass if the manifest changes but that file is not refreshed correctly. This contradicts the comment that the pins become inert after the next fetch. The accepted-hash exception also materially changes the plan's strict hash contract without a plan addendum.
- **Fix**: Store `{ manifestHashAtPin, acceptedLocalHash }`, accept the pin only while the manifest still has the pinned baseline, add a changed-manifest regression test, and document the exception in the plan.
- **Decision**: RESOLVED — each pin now stores `manifestHashAtPin` plus `acceptedLocalHash` and becomes inert when the live manifest baseline changes; regression test added.

### F3 — Prompt-hash manifest validation fails open

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `scripts/lib/skills-sync-checker.ts:113`
- **Detail**: A missing `promptHashes` map becomes an empty map and non-string values are silently skipped. A structurally corrupted or changed manifest can therefore disable prompt verification while the checker still exits 0.
- **Fix**: Require a valid hash for every declared prompt, validate SHA-256 formatting, classify malformed manifest data as an environment error, and add malformed-shape tests.
- **Decision**: RESOLVED — prompt declarations and hashes are now required and all skill/prompt digests are validated as lowercase sha256; malformed-shape tests added.

### F4 — The Phase-2 commit bundles Phase-1 review leftovers

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit `26e3244`
- **Detail**: The commit also includes the `.prettierignore` rationale, the saved Phase-1 review, and two validation documents under `context/team/`. These are legitimate and disclosed Phase-1 review fixes, but they are outside Phase 2's Changes Required list.
- **Fix**: Do not rewrite history; retain the existing commit-message disclosure and keep future phase commits scoped to one phase.
- **Decision**: ACCEPTED — history remains unchanged; subsequent work is kept scoped.

### F5 — Prompt paths and symlinks are not contained to expected roots

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `scripts/lib/skills-sync-checker.ts:251`
- **Detail**: Prompt names from the manifest are joined directly to the prompts root, so `../` can escape the expected directory. Tree enumeration treats a symlink as a file and later reads through it. The manifest is currently trusted and the checker neither writes nor transmits content, limiting impact to scope and availability.
- **Fix**: Resolve paths and enforce root containment; reject symlinks that escape the managed roots.
- **Decision**: DEFERRED — the manifest is a trusted local 10x-cli artifact and the checker is read-only; path/symlink containment remains optional hardening outside the three warning fixes.
