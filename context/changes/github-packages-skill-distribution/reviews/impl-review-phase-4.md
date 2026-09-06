<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dystrybucja skilli przez GitHub Packages i jawny CLI sync

- **Plan**: context/changes/github-packages-skill-distribution/plan.md
- **Scope**: Phase 4 of 8
- **Date**: 2026-09-05
- **Verdict**: REJECTED
- **Findings**: 3 critical, 4 warnings, 0 observations

## Evidence

- Exact commit: `Piotr-Miller/ai-toolkit@7622d5e55404e2b264171c21a54ebe9180386b81`.
- Local fresh-checkout `npm run check:all`: pass, 131 tests; packed suite: 13/13 pass.
- GitHub Actions run [33986438708](https://github.com/Piotr-Miller/ai-toolkit/actions/runs/33986438708): Windows pass; Ubuntu fails only at consumer isolation against Lumina `master`.
- The same isolation check passes against Lumina PR head `e6ce2d1`; that commit has not reached `master`.
- `gh api 'user/packages?package_type=npm'` currently returns 403 without `read:packages`, confirming the workflow token scope is material.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | FAIL    |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | FAIL    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Findings

### F1 — Activation does not select one publication operation

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/publish.yml:8-13,27-29,109-137`
- **Detail**: `inputs.action` is declared but never used. Removing the two hard-disable lines as the comments instruct would run `publish-rc` and `promote-latest` for every dispatch. The promotion job also lacks the `refs/heads/main` guard and does not run `check:access` before changing `latest`.
- **Fix**: Make both job conditions mutually exclusive and require `inputs.action` plus `github.ref == 'refs/heads/main'`; run the access gate in the promotion path as well.
- **Decision**: PENDING

### F2 — Owner-only package access is not proven

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `security/access-policy.json:11-21`, `scripts/lib/access.mjs:91-125`
- **Detail**: The gate checks repository collaborators and connected repositories, but not direct people/teams granted access to a user-scoped package. GitHub permits package-level roles independent of repository collaborators. The current local GitHub credential also receives `403` for the package listing endpoint without `read:packages`, so the workflow-token path is not yet demonstrated.
- **Fix**: Define an authoritative, supported observation for package-level access (or explicitly narrow the contract to a manually recorded owner-only evidence step) and add a post-publish proof using the exact credential model used by the watchdog.
- **Decision**: PENDING

### F3 — Package-state and connected-repository evidence is incomplete

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence
- **Location**: `scripts/check-access.mjs:53-64`, `scripts/lib/access.mjs:110-125`
- **Detail**: Absence is inferred from a user package listing whose visibility is permission-scoped; the connected-repository endpoint is not in the documented GitHub Packages REST surface, and the comparison only rejects extras, not a missing expected producer repository. This has no live post-publication proof yet.
- **Fix**: Validate the exact supported API contract and compare the complete expected set; preserve an explicit pre-publication `absent` state and require a post-publication owner-only check before any promotion.
- **Decision**: PENDING

### F4 — Watchdog lacks the permission needed to read packages

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `.github/workflows/access-watchdog.yml:9-12`
- **Detail**: The watchdog requests `contents: read` and `issues: write`, but not `packages: read`. With explicit permissions, omitted scopes are `none`; the access check therefore cannot establish package state after the first publication and will remain fail-closed rather than useful.
- **Fix**: Add job-level `packages: read`, then prove the package listing/get path with the actual `GITHUB_TOKEN`.
- **Decision**: PENDING

### F5 — Isolation gate is still red on the current public state

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: Lumina `.github/workflows/ci.yml:1`
- **Detail**: Run `33986438708` clones Lumina `master`, where the missing explicit permissions block causes the check to report inherited `packages: read`. The fix `e6ce2d1` is on PR #210 only. Until it is merged and the gate reruns against `master`, 4.5 is not green.
- **Fix**: Merge the isolated micro-PR, then rerun the failed Ubuntu job (or a new exact run) and record the green result.
- **Decision**: PENDING

### F6 — Static isolation scan accepts `permissions: read-all`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `scripts/check-lumina-isolation.mjs:55-70`
- **Detail**: The checker rejects explicit `packages: read|write` keys but accepts GitHub's `permissions: read-all`, which grants package read access without a block-level `packages:` key.
- **Fix**: Parse GitHub permissions forms and reject `read-all`, `write-all`, and equivalent inline grants in public consumer workflows.
- **Decision**: PENDING

### F7 — No repository/environment protection backs the active path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: `.github/workflows/publish.yml:22-24`
- **Detail**: The main-ref guard is present for `publish-rc`, but the private personal repository cannot expose normal branch protection on the current GitHub plan, and no protected environment is declared. The human Phase 5 gate remains the only approval boundary after activation.
- **Fix**: Keep the separate activation and Phase 5 gates; if the repository moves to a plan/owner model supporting protection, require a protected environment or equivalent reviewer gate before enabling the jobs.
- **Decision**: PENDING

## Resolved from previous review

- Windows npm spawning and the full Ubuntu/Windows packed matrix: fixed and evidenced.
- Exact pack-once publication and separate registry-byte/dist-tag promotion: implemented.
- Shell input interpolation: fixed by passing dispatch input through `env`.
- Atomic-write EBUSY test: now injects failures into the production function.
- Watchdog label creation, fallback alarm, exact title match, and concurrency: implemented.
- License/recovery counts are now computed from inventory/provenance rather than policy prose.
