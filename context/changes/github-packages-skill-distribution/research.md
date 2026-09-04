---
date: 2026-09-02T22:59:08+02:00
researcher: Codex
git_commit: 35564f7b49a1073dbebb11f5aff98f539644ca98
branch: master
repository: Piotr-Miller/lumina-clean-ai
topic: "GitHub Packages + explicit CLI skill distribution and safe legacy cleanup"
tags: [research, codebase, github-packages, agent-skills, cli, migration]
status: complete
last_updated: 2026-09-04
last_updated_by: Claude Code
---

# Research: GitHub Packages + explicit CLI skill distribution and safe legacy cleanup

- **Date**: 2026-09-02T22:59:08+02:00
- **Researcher**: Codex
- **Git Commit**: 35564f7b49a1073dbebb11f5aff98f539644ca98
- **Branch**: master
- **Repository**: Piotr-Miller/lumina-clean-ai

## Research Question

`$10x-research github-packages-skill-distribution use external sources as well`

In context: validate the proposal to distribute LuminaClean AI's team-owned AI artifacts through an npm package in GitHub Packages with an explicit CLI sync, and determine how to retire the existing skill-distribution approach without losing private course content, Codex adaptations, local extensions, or safety checks.

## Summary

The recommended delivery model is a **private, scoped npm package in GitHub Packages with an explicit, version-pinned CLI**. The CLI should copy and reconcile files into both `.claude/` and `.agents/`; it must not depend on `postinstall`, symlinks, or package-manager uninstall hooks. LuminaClean AI should invoke it explicitly from a developer workstation and should **not** add the private package to this public repository's dependencies or CI.

That recommendation does **not** permit replacing the whole existing private mirror with one package. This repository contains two materially different classes of artifacts:

1. **Team-owned or otherwise redistributable artifacts** — eligible for the new package.
2. **10xDevs course artifacts** — denied publication by the repository's existing policy and issue #209; they must continue to come from the official `10x-cli`, with the private `10x-toolkit` mirror retained as a recovery path until ownership or redistribution permission changes.

Therefore the safe target is two exclusive ownership channels, not two systems that both write the same files:

```text
official 10x-cli ──► course base artifacts ──► .claude/ + .agents/
                         ▲
                         └── private course mirror (temporary recovery/rollback)

private GitHub Package ──► owned skills/rules + explicit overlays ──► .claude/ + .agents/
```

The old manual sync can be retired only after the new CLI reproduces its load-bearing behavior: separate Claude/Codex payloads or explicit per-file adaptations, manifest-tracked ownership, raw-byte hashes, conflict preservation, stale-file cleanup, sentinel/overlay checks, idempotence, dry-run, and safe uninstall. Public vendored skills and their tests should remain in the first migration release.

## Recommendation for LuminaClean AI

### Distribution choice

Create a **separate clean private repository**, proposed as `Piotr-Miller/ai-toolkit`, and publish a scoped package such as `@piotr-miller/ai-toolkit` to GitHub Packages. Keeping this separate from `Piotr-Miller/10x-toolkit` makes accidental packaging of course-owned material much harder and allows the existing mirror to remain a narrowly scoped recovery mechanism.

The preferred consumer command is explicit and exact-version pinned:

```bash
npm exec --yes --package=@piotr-miller/ai-toolkit@1.0.0 -- \
  ai-toolkit sync --tools claude,codex
```

Equivalent `npx --yes @piotr-miller/ai-toolkit@1.0.0 sync ...` syntax is shorter, but `npm exec --package ... -- <bin>` makes the package-versus-binary boundary unambiguous. The package should expose one `ai-toolkit` binary with at least:

```text
ai-toolkit sync --tools claude,codex --dry-run
ai-toolkit sync --tools claude,codex
ai-toolkit status
ai-toolkit uninstall
```

No `postinstall` should mutate the consumer repository. If present at all, `postinstall` may only print the explicit sync instruction. npm can be configured to ignore or selectively allow dependency scripts, so lifecycle mutation is not a dependable delivery contract ([npm configuration](https://docs.npmjs.com/using-npm/config/), [npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/)).

### Authentication and CI boundary

For local installation from GitHub Packages, the user needs an npm configuration for the package scope and a classic personal access token with `read:packages`; secrets must stay outside the repository. GitHub's npm registry documentation describes scoped-package configuration and token requirements ([GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)).

Publishing should happen from the private package repository using that repository's `GITHUB_TOKEN`, with minimal `contents: read` and `packages: write` permissions. GitHub documents both repository-level package access and workflow-token permissions ([package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages), [publishing and installing with Actions](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions)).

Do **not** grant this public LuminaClean AI repository Actions access to the private package and do not make the package a dependency of its build. GitHub warns that forks can gain workflow access to a private package when a public repository is granted Actions access. Skills are developer tooling, not an application runtime dependency, so there is no reason to put this credential boundary in public CI.

The current GitHub CLI token cannot list npm packages (`read:packages` is absent and the API returned HTTP 403), so package-name availability and existing package access must be verified before implementation.

#### Local registry authentication, as configured and verified

The consumer-side configuration was set up and verified on 2026-09-04 (Fedora, Node v24.19.0, npm 11.17.0). It is two lines in the **user-level** `~/.npmrc` — npm's `userconfig`, confirmed via `npm config get userconfig` — and deliberately not a project-level `.npmrc`, which would place private-registry configuration inside a repository that must stay free of this dependency:

```ini
@piotr-miller:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<classic PAT with read:packages>
```

The token must be a **classic** PAT (`ghp_` prefix); the GitHub CLI's own OAuth token (`gho_`) carries `gist, read:org, repo, workflow` and cannot read packages, which is the HTTP 403 recorded in the paragraph above. npm expands `${VAR}` in `.npmrc` at read time, so `_authToken=${GITHUB_PACKAGES_TOKEN}` keeps the secret out of the file entirely; whichever form is used, the file holds credentials and must be mode `600`.

**`repo` is not needed to read a private package, and should not be granted.** A `read:packages`-only token was verified to authenticate against the registry (`npm whoami --registry=https://npm.pkg.github.com` returned the owner account) while being unable to reach private repositories at all: `GET /repos/Piotr-Miller/10x-toolkit` returned 404 where the `repo`-scoped CLI token returned 200, and `GET /user/repos?visibility=private` returned an empty list. This matters because the token sits in plaintext at rest, so least privilege is the difference between a leaked package-read and a leaked write credential for every repository the owner has.

Two verification gotchas are worth recording, because both can be mistaken for a broken configuration:

- **`npm config get //npm.pkg.github.com/:_authToken` always fails** with "option is protected, and cannot be retrieved in this way". Auth values cannot be read back, so neither the token nor a `${VAR}` expansion can be confirmed locally — the only real check is an authenticated registry call such as `npm whoami --registry=...`. Scopes are read separately, from the `x-oauth-scopes` response header on `https://api.github.com/user`.
- **`GET /user/repos` returns 200 even with `read:packages` alone**, listing public repositories only. It is not evidence of residual `repo` access; the private-visibility probes above are the discriminating test.

The name is confirmed free under this scope: the registry returns 404 for the package manifest and `GET /user/packages?package_type=npm` returns an empty list. Until the first publication, therefore, `npm exec --package=@piotr-miller/ai-toolkit@1.0.0` returns 404, and with the configuration above verified that 404 is the absence of the package rather than a configuration or credential fault.

### Assessment of the additional model recommendation

The additional recommendation is consistent with the research and should be retained with one Lumina-specific correction:

| Recommendation                                                                                  | Decision for LuminaClean AI                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit CLI sync is an installer refinement within Model 1, not a different distribution model | **Accept.** The m5l4 package model and an explicit `10x get`/`10x sync`-style workflow are compatible.                                                                                                                                                                                                                                                          |
| Copy mode instead of symlinks                                                                   | **Accept.** The workspace is used on Linux and Windows, and copied files remain valid when npm removes an `npx` cache.                                                                                                                                                                                                                                          |
| One canonical source generates both Claude and Codex trees                                      | **Accept at package build time.** Generate reviewed, pre-adapted payloads and prove parity structurally; do not use an unrestricted runtime text replacement.                                                                                                                                                                                                   |
| Add the private package to the root `devDependencies` for lockfile pinning                      | **Reject for this public app repository.** Root `npm ci` would then need private GitHub Packages access even though the build does not use skills. Pin the exact package version in the sync command/config instead. If integrity lockfile semantics are required, use an isolated tooling package/lockfile that the root install and public CI never traverse. |
| Nothing happens during `npm ci` without explicit sync                                           | **Accept as a feature.** These are gitignored authoring artifacts, not application build inputs.                                                                                                                                                                                                                                                                |

This preserves reproducibility without introducing a private-registry dependency into Lumina's public build graph. An immutable exact version such as `@piotr-miller/ai-toolkit@1.0.0`, recorded in a committed toolkit configuration or command, is the minimum v1 contract; an isolated tooling lockfile is a later hardening option.

## Detailed Findings

### 1. The current system is a layered distribution mechanism

The live workspace has two consumer trees:

- Claude Code: `.claude/skills/<name>/SKILL.md`
- Codex: `.agents/skills/<name>/SKILL.md`

This is intentional, not redundant. The repository's canonical instructions require both trees and explain that Codex copies contain tool-specific path and filename adaptations ([AGENTS.md:109](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L109)). The active `10x-cli` profile only refreshes `.claude/`, after which `.agents/` is manually re-derived and verified ([AGENTS.md:111](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L111)).

Current inventory at research time:

| Surface                 | Observed state                                                  |
| ----------------------- | --------------------------------------------------------------- |
| `.claude/skills/`       | 39 skill directories, 104 files                                 |
| `.agents/skills/`       | 39 skill directories, 104 files                                 |
| CLI-managed set         | 30 skills represented by the local 10x manifest/checker data    |
| Starter set             | 2 skills represented by `skills-lock.json`                      |
| Tracked public set      | 8 deliberately allowlisted skills                               |
| Ignored/local set       | 31 skill directories per tree                                   |
| Local full verification | 208 tree files, 104 pairs, 74 manifest hashes, 3 sentinel files |

The public parity command is deliberately narrower than the local course-workflow checker ([AGENTS.md:43](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L43), [package.json:23](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/package.json#L23)). At research time both passed:

- public parity: 8 allowlisted skills, 36 file pairs;
- full local parity: 208 files, 104 pairs, 74 raw-byte baselines, 3 extension sentinels.

Passing these checks proves current workspace parity. It does not prove that the recovery mirror is current.

### 2. The private mirror currently has a false-green status check

`Piotr-Miller/10x-toolkit` currently snapshots/restores the ignored tool trees and local checker. Its `status` command compares aggregate entry and file counts, while `snapshot` replaces the mirror contents and `restore` copies additively without deleting stale consumer files.

At research time, mirror status reported matching shapes — 66 entries and 176 files on each side — even though the authoritative manifests differed:

```text
workspace manifest sha256: cc4138…  (m5l4, 2026-09-02)
mirror manifest sha256:    0a08f3…  (m5l5, 2026-09-01)
```

This is a concrete example of why counts are not a sufficient release or restore check. The new package CLI must compare owned paths and bytes, not directory totals. Until that exists, the mirror should be frozen/tagged for rollback and then re-snapshotted deliberately after resolving the discrepancy; it should not be silently treated as current.

### 3. Publication is deny-by-default and the boundary is semantic

The public repository ignores course skills and re-includes only an explicit set. The same public allowlist is duplicated in three places: `.gitignore`, `scripts/check-skills-sync.ts`, and the private mirror's `sync.mjs`. The rule exists because a filename prefix failed to identify three m5l4 course skills (`pack-init`, `setup-cicd`, and `tf-registry`) and left them one broad `git add` away from publication ([AGENTS.md:110](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L110)).

The new package must retain the same **deny-by-default, explicit-inclusion** model. Do not derive publishability from names such as `10x-*`. Before `npm publish`, use a package `files` allowlist and inspect the exact tarball with `npm pack --dry-run`; npm's inclusion rules make the packed artifact, not the source tree, the true publication boundary ([npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/), [package.json `files`](https://docs.npmjs.com/files/package.json/)).

Issue #209 also explicitly states that the implementation must not publish 10xDevs course materials. Consequently, the current private mirror cannot safely become the package source merely by adding `package.json`: it contains mixed-origin content.

### 4. The m5l4 starter templates need architectural adaptation

The fetched lesson supports the broad Model 1 choice — npm/GitHub Packages for an internal JS/TS team — but its templates are starting points, not a safe drop-in implementation for this repository.

The provided installer template:

- is designed around `.claude/` rather than both supported tool trees;
- is postinstall-oriented;
- removes/replaces target skill directories too broadly;
- does not encode Lumina's contextual Claude→Codex adaptations;
- does not preserve local edits with recorded previous hashes;
- does not carry the existing extension sentinel contract.

The design should therefore reuse the lesson's package/registry model while replacing its installer semantics with an explicit reconciler.

### 5. Required CLI ownership and reconciliation contract

The package needs a tool-neutral install manifest, separate from `.claude/.10x-cli-manifest.json`. The upstream manifest remains the baseline for 10x-owned files; the new manifest records only files owned by the new package. A suitable location is `.ai-toolkit/manifest.json`.

Each record should contain at least:

```json
{
  "package": "@piotr-miller/ai-toolkit",
  "version": "1.0.0",
  "tool": "codex",
  "source": "payload/codex/skills/example/SKILL.md",
  "target": ".agents/skills/example/SKILL.md",
  "sha256": "...",
  "owner": "team-ai-toolkit",
  "overlay_base_sha256": null,
  "sentinels": []
}
```

The sync algorithm should behave as follows:

| Existing target state                                                        | Sync behavior                                                     |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Target absent                                                                | Copy atomically and record hash                                   |
| Target equals incoming bytes                                                 | No-op; refresh metadata if needed                                 |
| Target equals last installed hash                                            | Safe managed update                                               |
| Target differs from last installed hash                                      | Conflict: preserve file and fail/report unless explicit `--force` |
| Previously owned file absent from new release and still equals recorded hash | Remove as stale                                                   |
| Previously owned stale file modified locally                                 | Preserve and report conflict                                      |

`uninstall` must delete only files that are still byte-identical to the package's recorded installation. Modified files are left in place and reported. npm package removal alone cannot safely reverse files copied outside `node_modules`, so cleanup must be an explicit toolkit command ([npm uninstall](https://docs.npmjs.com/cli/v11/commands/npm-uninstall/)).

Additional safety requirements:

- resolve and verify every target remains beneath the repository root;
- reject path traversal and writes through symlinks;
- write through a temporary sibling and atomic rename;
- copy files instead of symlinking into an npm/npx cache;
- preserve raw bytes so hash and sentinel checks remain stable;
- make repeated sync idempotent;
- support a machine-readable `status` result for automation;
- never infer ownership from target-directory membership;
- validate an overlay's expected upstream base hash before applying it.

The Agent Skills specification defines portable skill structure and progressive disclosure, but it does not define installation locations or conflict resolution; the CLI must own those concerns ([Agent Skills specification](https://agentskills.io/specification)).

### 6. Pre-adapted payloads are safer than global text replacement

The existing manual procedure has a keep-list and an adapt-list because most files should remain byte-identical, while a smaller set needs intentional Claude/Codex substitutions. Historical work found that broad replacement produced nonsensical references in roughly 15 locations.

The package should ship either:

1. explicit `payload/claude/` and `payload/codex/` trees, generated and reviewed at package build time; or
2. a declarative, per-file transform manifest with expected input/output hashes and golden tests.

The first is recommended for v1. It makes the published bytes reviewable, keeps runtime sync simple, and avoids performing semantic adaptation inside a user's repository.

Local extensions should be modeled as explicit overlays, not edits to a registry-owned base. An overlay applies only when the base hash matches a known value; otherwise sync reports that the upstream skill changed and requires a maintainer rebase.

### 7. Elements that cannot be removed at initial cutover

The following must remain until equivalent behavior is proven:

- both `.claude/` and `.agents/` consumer trees;
- `AGENTS.md` as the single source of repository rules and `CLAUDE.md` as its shim;
- `.claude/.10x-cli-manifest.json` for upstream course ownership;
- the deny-by-default `.gitignore` boundary;
- `npm run check:skills` and its eight-skill public allowlist;
- the full local checker, including manifest hashes, adaptation allowlists, and extension sentinels;
- `skills-lock.json` until its external `skills` CLI consumer is identified or migrated;
- the official `10x-cli` path for acquiring course content;
- the private course mirror until a clean reconstruction from official 10x artifacts plus owned overlays is demonstrated;
- vendored public skills whose contracts are exercised by repository tests.

In particular, `tests/gauntlet-loop-skill.test.ts` reads the real tracked skill from both trees ([tests/gauntlet-loop-skill.test.ts:30](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/tests/gauntlet-loop-skill.test.ts#L30)). Removing the vendored copies before moving that contract into the package would make fresh-clone CI fail. `10x-impl-review-ci` is also an intentional public exception used by the public review workflow.

### 8. What can be retired, and when

The old procedure can be reduced in stages:

| Legacy element                               | Retirement condition                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Manual copying from `.claude/` to `.agents/` | Package ships verified per-tool payloads and clean-clone parity tests pass                                  |
| Manual keep-list/adapt-list instructions     | Their behavior is encoded in package build tests and CLI status                                             |
| Manual owned-skill extension edits           | Extensions become base-hash-gated overlays                                                                  |
| Duplicate public allowlists                  | One generated policy source produces `.gitignore`, consumer check config, and package allowlist             |
| Local full checker                           | CLI `status` plus package tests cover every positive and negative case; keep one release window in parallel |
| Mirror `status` count comparison             | Replace immediately with manifest/path/hash comparison                                                      |
| Private mirror for owned artifacts           | New package installs the owned set and rollback has been tested                                             |
| Private mirror for course artifacts          | Only after official reconstruction plus overlays is proven, or redistribution rights permit another channel |

The private mirror may therefore become **course-only and cold**, but deleting it is not part of a safe first cutover.

## Migration Sequence

### Phase A — classify and freeze

1. Produce a per-file provenance inventory: `10x-course`, `third-party-registry`, `repo-owned`, or `local-overlay`.
2. Default every unclassified file to **not publishable**.
3. Resolve whether registry-sourced third-party skills allow repackaging or must remain vendored/fetched from their source.
4. Freeze/tag the current private mirror commit (`52dd807` at research time) as a rollback point.
5. Replace mirror status counts with path/hash comparison before trusting a new snapshot.

### Phase B — build the package in isolation

1. Create a separate private package repository.
2. Add only approved owned artifacts through an explicit `files` allowlist.
3. Ship pre-adapted Claude and Codex payloads.
4. Implement `sync`, `status`, `uninstall`, and `--dry-run` with manifest ownership and conflict semantics.
5. Publish immutable versions; never overwrite a released version.
6. Gate publishing on `npm pack --dry-run` inspection plus a tarball denylist scan for course markers and forbidden paths.

### Phase C — verify the published artifact

Test the exact registry artifact, not the source checkout, on Linux and Windows where practical:

- clean repository install;
- fresh Lumina clone;
- second sync is a no-op;
- upgrade and downgrade;
- locally edited managed file;
- stale unmodified and stale modified files;
- uninstall after modification;
- symlink/path traversal rejection;
- exact-byte Claude/Codex payload checks;
- extension/base hash mismatch;
- `npm pack` content allowlist;
- `git status` contains only expected managed changes.

### Phase D — consumer canary

1. Keep the currently vendored public skills and all checkers.
2. Run the pinned CLI manually and compare its output to the current trees.
3. Run `npm run check:skills`, the full local checker, and affected skill-contract tests.
4. Repeat through at least one package upgrade and a rollback.
5. Do not add GitHub Packages credentials or package installation to Lumina's public CI.

### Phase E — documentation and cleanup

1. Make the explicit CLI the documented path for team-owned artifacts.
2. Keep `10x get`/`10x sync` documented only for upstream course acquisition.
3. Keep the mirror documented only for course recovery until its retirement condition is met.
4. Remove manual copy/adapt steps only after package parity is green.
5. Retain the old checker for one release window, then remove it only after equivalent CLI/package negative tests exist.
6. Update the GitHub issue ledger and issue #209 as each boundary changes.

## Architecture Insights

### Exclusive ownership prevents split-brain state

The main architectural risk is not having two registries; it is having two installers that believe they own the same target file. Ownership must be path-level and exclusive. The upstream manifest and the toolkit manifest may coexist, but a preflight must fail if both claim one target.

### Acquisition, adaptation, and installation are separate stages

The current process mixes three concerns:

1. fetch upstream 10x artifacts;
2. apply Lumina-specific extensions and Claude/Codex adaptations;
3. install consumer files.

The target architecture should make them explicit. Course acquisition remains with the official CLI. Owned content and overlays are versioned in the package source. Package build generates reviewed per-tool payloads. Consumer sync only reconciles bytes and ownership.

### Skills are authoring-time dependencies

The application does not need private skills to build or run. Keeping the package out of `package.json` and public CI reduces credential exposure, avoids fork-access ambiguity, and prevents a tooling registry outage from blocking product deployment.

### Portability is a payload property, not an installer feature

Using the Agent Skills `SKILL.md` structure helps the same conceptual skill travel across tools, but actual roots, companion files, hooks, prompts, and repository policy remain tool-specific. The package should treat portability as tested payload variants rather than assume one filesystem tree works everywhere.

## Historical Context

The manual/mirror process is a response to observed failures, not accidental complexity:

- a `10x get` refresh can remove artifacts from another lesson and overwrites hand-edited managed files ([AGENTS.md:113](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L113));
- commit `755065a` overwrote custom archive behavior, which was only restored 34 days later by `843bf8e` / PR #101;
- another drift appeared five days later when two skills were absent from one side of the workflow;
- the prefix-based publication filter failed to classify m5l4's non-`10x-*` course skills, leading to the current explicit public allowlist;
- the fresh-clone recovery procedure was documented in `context/archive/2026-08-24-agent-env-setup-runbook/plan.md` and the live `context/foundation/agent-env-setup.md` because “re-sync the copies” was not reproducible guidance.

These incidents explain why hash baselines, sentinels, explicit adaptation sets, deny-by-default publication, and a rollback mirror are migration requirements.

## Code References

- [AGENTS.md:43](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L43) — public versus full local skill checks.
- [AGENTS.md:109](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L109) — two tool-specific skill trees.
- [AGENTS.md:110](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L110) — publication boundary, mirror workflow, and explicit allowlist rationale.
- [AGENTS.md:111](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L111) — active Claude profile and manual Codex re-sync.
- [AGENTS.md:113](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/AGENTS.md#L113) — destructive/overwrite behavior of lesson refreshes.
- [.gitignore:46](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/.gitignore#L46) — deny-by-default skill tracking policy.
- [scripts/check-skills-sync.ts:24](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/scripts/check-skills-sync.ts#L24) — public skill allowlist/check entry point.
- [tests/gauntlet-loop-skill.test.ts:30](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/tests/gauntlet-loop-skill.test.ts#L30) — CI contract tied to both vendored copies.
- [context/foundation/agent-env-setup.md:188](https://github.com/Piotr-Miller/lumina-clean-ai/blob/35564f7b49a1073dbebb11f5aff98f539644ca98/context/foundation/agent-env-setup.md#L188) — active profile and existing re-sync procedure.
- `.claude/.10x-cli-manifest.json` — ignored upstream inventory and raw-byte baseline.
- `scripts/local/check-skills-sync.ts` and `scripts/local/lib/skills-sync-config.ts` — ignored full verifier and adaptation/sentinel configuration.
- `/home/piotrmiller/Source/10x-toolkit/sync.mjs` — private mirror snapshot/restore/status implementation.
- `/home/piotrmiller/Downloads/shared-ai-registry-skille-komendy-i-reguly-dla-zespolu.md` — m5l4 source handout and three-model comparison.

## External Sources

- [Working with the npm registry in GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry) — package scope, registry configuration, PAT and workflow authentication.
- [About permissions for GitHub Packages](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages) — package visibility and repository access.
- [Publishing and installing a package with GitHub Actions](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions) — `GITHUB_TOKEN`, package access, and public-fork warning.
- [`npm exec`](https://docs.npmjs.com/cli/v11/commands/npm-exec/) — explicit package and binary execution syntax.
- [npm configuration](https://docs.npmjs.com/using-npm/config/) — lifecycle-script configuration including ignored/allowed scripts.
- [npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/) — lifecycle behavior and why it is not the ownership protocol for copied files.
- [`npm publish`](https://docs.npmjs.com/cli/v11/commands/npm-publish/) and [package.json `files`](https://docs.npmjs.com/files/package.json/) — tarball contents and publish allowlisting.
- [Agent Skills specification](https://agentskills.io/specification) — portable skill directory/file conventions; no distribution or conflict semantics.
- [Node.js filesystem API](https://nodejs.org/api/fs.html) — implementation primitives for copy, realpath checks, and atomic rename.

## Related Research

- `context/archive/2026-08-24-agent-env-setup-runbook/plan.md` — why the fresh-clone/mirror/re-sync procedure exists and what it must preserve.
- `context/archive/2026-07-17-skills-sync-check/` — original public/full parity-check change referenced by issue #102.
- `context/foundation/agent-env-setup.md` — current operational runbook; it will become a primary migration target.
- `context/changes/github-packages-skill-distribution/change.md` — change identity and GitHub issue #209.

## Open Questions

These questions must be answered before `/10x-plan` can produce an implementation-ready cross-repository plan:

1. Which exact files are owned by Piotr/Lumina and approved for repackaging? Registry-sourced does not automatically mean redistributable.
2. Should the first package contain only generic reusable skills, or also Lumina-specific rules and overlays? Recommendation: generic package plus an explicit Lumina profile/overlay, not hard-coded consumer assumptions.
3. ~~Will `Piotr-Miller/ai-toolkit` be created as a clean private repository?~~ **Resolved 2026-09-04.** Created as recommended: private, empty (no README, license, or `.gitignore`, and no branches), no collaborators beyond the owner, no forks, no deploy keys, and no webhooks. The mixed-origin course mirror is therefore not the publisher. Two baseline settings recorded for later phases: `default_workflow_permissions` is already `read`, so Phase 4 can grant exactly `contents: read` + `packages: write`; Actions is enabled with `allowed_actions: all`, the default, whose narrowing is deferred to Phase 4 when the publishing workflow actually carries `packages: write`.
4. What is the long-term course refresh path: official `10x sync --all` followed by deterministic overlay generation, or indefinite mirror restore? Recommendation: prove official reconstruction before retiring the mirror.
5. Which of the eight public vendored skills should eventually move to package ownership? Recommendation: none in v1; migrate them one at a time after moving their CI contracts.
6. What rollback window is acceptable? Recommendation: one successful upgrade cycle after initial canary, with a tagged mirror and pinned previous package version.
7. ~~Is the proposed package name available and can the maintainer token be granted `read:packages`?~~ **Resolved 2026-09-04.** Both preflight halves pass. The token half: a classic PAT scoped to `read:packages` alone authenticates against the registry (`npm whoami --registry=https://npm.pkg.github.com` returns the owner account). The name half: `GET https://npm.pkg.github.com/@piotr-miller%2fai-toolkit` returns 404 and `GET /user/packages?package_type=npm` returns an empty list, so the owner holds no npm package under this scope at all. This satisfies the Phase 1 §2 preflight. It is deliberately **not** recorded as proof that publication will succeed — the first `npm publish` remains the only definitive test of the name claim and of `packages: write`, and that is a risk carried into Phase 5, where the first publication is made under `rc` so a failure costs a discarded release candidate rather than the stable version. Phase 1 §2 is complete as of 2026-09-04: the private repository exists and `docs/bootstrap-auth.md` records the credential contract, the verified commands, the baseline repository state, and the deferred `allowed_actions` decision.

## Decision Gate

Research supports proceeding to planning **only after the publishable payload inventory is approved**. The implementation plan should be cross-repository and split into two independently reversible tracks:

1. build and publish the clean private package/CLI;
2. canary and then migrate Lumina's owned artifacts while retaining the course recovery channel.

“Delete the old approach” should be interpreted as removing manual distribution for files the new package demonstrably owns—not deleting the only recoverable source of non-publishable course artifacts.
