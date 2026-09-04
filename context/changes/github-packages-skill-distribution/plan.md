# GitHub Packages Skill Distribution Implementation Plan

## Overview

Replace LuminaClean AI's mixed manual/mirror skill-distribution workflow with a private,
versioned `@piotr-miller/ai-toolkit` package delivered through GitHub Packages and invoked
explicitly from a developer workstation. The package has two deliberately different channels:

- **managed** — the five registry-sourced skills Lumina did not author (`code-review`,
  `documentation`, `learning`, `skill-optimizer`, `typescript-magician`); the package owns their
  installed paths and applies strict hash-based
  update, conflict, stale-file, and uninstall semantics. The two repo-authored skills
  (`gauntlet-loop`, `run-local-stack`) and their helpers stay git-tracked in Lumina as
  `consumer-owned` — they are authored, tested, and reviewed here and arrive with the clone;
- **recovery** — the complete reproducible 10x course environment and its approved local tooling;
  it exists to restore a fresh machine, expects local drift, and never becomes the primary
  day-to-day update mechanism.

The work spans three repositories: public `Piotr-Miller/lumina-clean-ai`, a new owner-only private
`Piotr-Miller/ai-toolkit`, and the existing private `Piotr-Miller/10x-toolkit` rollback mirror.
Every phase names its repository boundary. Course bytes, package publication, access settings,
and mirror retirement must never be treated as implicit side effects of a Lumina-only commit.

## Current State Analysis

Lumina currently carries two consumer trees, `.claude/skills/` and `.agents/skills/`. Eight skill
directories are git-tracked and checked by `npm run check:skills`; the remaining course artifacts,
prompts, config templates, the 10x CLI manifest, and `scripts/local/` are gitignored and restored
from the private `10x-toolkit` mirror. After a `10x sync`, local extensions and contextual
Claude-to-Codex adaptations are reapplied manually, then copied back into the mirror.

That mirror is not a trustworthy rollback anchor yet. Its `status` command compares aggregate
counts, while a byte audit found the same 66 entries / 176 files on both sides but a mismatched
`.claude/.10x-cli-manifest.json`: the workspace reports last-applied `m5l4`, the mirror `m5l5`.
The other 175 mirrored files match. `restore` also overwrites matching targets without a
last-installed hash, and `snapshot` replaces the mirror tree without an atomic staging boundary.

The research supports a private GitHub Package, but the user has deliberately widened v1 beyond
the research's conservative payload recommendation:

- the five registry-sourced skills enter the managed channel; `10x-impl-review-ci`,
  `gauntlet-loop`, and `run-local-stack` stay tracked in Lumina as `consumer-owned`, so a skill edit
  never round-trips through a private release;
- all remaining course artifacts and approved reproducible tooling enter the recovery channel;
- the package remains owner-only while recovery content is aboard;
- access must be narrowed/stripped before any collaborator or repository is granted package access;
- the existing mirror goes cold only after a real `1.0.0-rc.1 -> 1.0.0 -> 1.0.0-rc.1 -> 1.0.0`
  transition succeeds.

### Key Discoveries

- The public allowlist is duplicated in `.gitignore` and `scripts/check-skills-sync.ts`; adding a
  skill there publishes it, so the final cutover must remove the vendored-source role rather than
  leave two owners (`.gitignore:46-84`, `scripts/check-skills-sync.ts:26-36`).
- `tests/gauntlet-loop-skill.test.ts` reads the real vendored skill trees, and the gauntlet skill
  depends on `scripts/gauntlet-stage.ts` plus `scripts/lib/gauntlet-staging.ts`; these contracts must
  move to the toolkit package before the public copies can leave Lumina
  (`tests/gauntlet-loop-skill.test.ts:29-32`, `.claude/skills/gauntlet-loop/SKILL.md:199-210`).
- Course ownership is recorded in `.claude/.10x-cli-manifest.json`; package ownership needs a
  separate manifest, and setup must fail before writing if both manifests claim one target
  (`research.md:163-206`, `research.md:310-324`).
- The current manual extension set includes changes to course-owned base files and one standalone
  `SKILL.user.md`; those must become base-hash-gated overlays rather than packaged mixed-origin
  whole-file sources (`context/foundation/agent-env-setup.md:218-293`).
- The package cannot bootstrap its own registry authentication: the documented command downloads
  the package before `ai-toolkit setup` can run. Fresh-machine prerequisites are therefore Node 24,
  a cloned Lumina repository, and working user-level npm authentication for
  `npm.pkg.github.com` (`research.md:55-74`).
- Personal or machine-specific state exists inside the apparent tooling boundary, including
  `.claude/settings.local.json`; recovery must be driven by an explicit expected-contents manifest,
  never by recursively copying a directory.
- A fresh-clone canary is insufficient for cutover. The live workspace has all targets but no
  toolkit manifest, so first adoption must classify byte-identical files as adoptable and preserve
  every drifted target for human review.

## Desired End State

On a fresh machine, after installing Node 24, cloning Lumina, and configuring owner-level npm auth,
the maintainer can run one exact-version command:

```bash
npm exec --yes --package=@piotr-miller/ai-toolkit@1.0.0 -- ai-toolkit setup
```

The command installs the managed channel and restores the recovery channel into both Claude and
Codex surfaces, writes a versioned local ownership record, and is safe to repeat. The two
repo-authored skills (`gauntlet-loop`, `run-local-stack`) are not delivered by the package — they
arrive with the Lumina clone, which is already a prerequisite. `status` explains
clean, drifted, conflicted, stale, unauthenticated, and version-outdated states in both human and
machine-readable form. Managed sync, recovery restore, dry-run, conservative uninstall, upgrade,
and rollback preserve locally modified files and reject path escape or symlink traversal.

`Piotr-Miller/ai-toolkit` is the only active distribution and recovery source. Lumina's application
dependencies and public CI remain credential-free. `Piotr-Miller/10x-toolkit` is retained read-only
as a cold rollback artifact, not deleted. Package access is continuously checked against an
owner-only policy while recovery bytes are present.

## What We're NOT Doing

- Not adding `@piotr-miller/ai-toolkit` to Lumina's root `package.json`, lockfile, build, deploy, or
  public CI.
- Not using `postinstall`, npm uninstall hooks, symlinks into an npm cache, blind recursive copies,
  or runtime global Claude-to-Codex text replacement.
- Not bootstrapping GitHub Packages authentication from inside the downloaded CLI; auth is a
  documented prerequisite and tokens never enter this public repository.
- Not granting package access to collaborators or consumer repositories while recovery content is
  aboard.
- Not treating current public vendoring as proof of upstream authorship. V1 records unresolved
  provenance non-blockingly; a separate public-repository license audit owns any removal decision.
- Not publishing credentials, personal permission state, absolute-path machine configuration,
  caches, logs, telemetry/session state, `.env*`, or `.dev.vars` through either channel.
- Not excluding the reproducible `.claude/.10x-cli-manifest.json`; it is required for upstream
  ownership preflight and is explicitly allowed despite being generated.
- Not supporting a workspace-snapshot/capture escape hatch. Official `10x sync --all` bytes plus
  committed overlays are the only recovery refresh path.
- Not deleting the mirror after cutover. It goes cold/read-only; deletion requires a separate later
  decision.
- Not gating on macOS in v1. Ubuntu and Windows are the standing release platforms.
- Not removing the full local checker at cutover. It remains for one subsequent release window and
  gets a separately tracked removal only after equivalent CLI negative tests have stayed green.

## Implementation Approach

The package repository separates acquisition, derivation, packaging, and installation:

```text
interactive workstation                     private ai-toolkit repository
-----------------------                     -----------------------------
official 10x sync --all ---> official base + reviewed hash-gated overlays
repo-owned sources ------------------------> managed/recovery source inventory
                                              |
                                              v
                                  deterministic per-tool payload build
                                              |
                                              v
                                  exact tarball + registry release gate
                                              |
                                              v
Lumina clone/workspace <--- explicit setup/sync/restore/status/uninstall
```

The published `payload-manifest.json` describes immutable incoming bytes and channel ownership.
The consumer `.ai-toolkit/manifest.json` records the installed package, manifest schema version,
channel, target, and last-installed hash. Reconciliation is state-based: absent targets are written
atomically; byte-identical pre-existing targets are adopted; targets matching the recorded prior
hash may update; locally modified targets are preserved and reported; stale unchanged targets may
be removed; stale modified targets remain. Recovery drift is informational until an explicit
restore/update operation is requested, but it is never overwritten silently.

## Critical Implementation Details

### Repository and release boundaries

Course and recovery bytes may exist only in the owner-only private toolkit/mirror repositories and
installed ignored workspace paths. The first real artifact publish, `latest` promotion, live-workspace
adoption, and mirror retirement are explicit human gates. No implementation phase may infer approval
for those external mutations from a passing local test.

### Access-widening tripwire

Every publish checks that the package is private and owner-only before recovery bytes are uploaded.
A six-hour scheduled watchdog checks package/repository access and alarms with a remediation runbook
if visibility, collaborators, or connected-repository access drift. GitHub exposes no pre-event hook
for a manual settings change, so the accepted residual exposure is one watchdog interval. The
structural alternative is splitting recovery into a separate package; it is recorded, not selected
for v1.

### Older code reading newer state

The seed pair keeps one supported manifest schema while proving that `1.0.0-rc.1` can safely read and
roll back state written by `1.0.0`. Unknown future schema versions are a separate negative case:
older code must perform no writes and must preserve-and-report. Synthetic higher-schema fixtures
exercise this on every release without making the real seed rollback impossible.

### Windows byte identity

The Windows matrix and fresh-clone canary set Git EOL behavior explicitly so checkout conversion
cannot mutate managed bytes before hashing. Consumer documentation records the required EOL setting.
Containment checks normalize Windows path case, and atomic replacement is implemented/tested without
assuming POSIX rename-over-existing behavior.

## Phase 1: Verify, Freeze, Classify, and Derive Overlays

### Overview

Establish a trustworthy rollback point and a complete two-channel source inventory before package
code or package publication begins. Create the private repository shell only after name/auth/access
preflight, then store provenance and overlay artifacts there—not in public Lumina.

### Changes Required

#### 1. Mirror integrity and rollback freeze

**Repository**: `Piotr-Miller/10x-toolkit`

**Files**: `sync.mjs`, new mirror verification tests (byte comparator seeded from
`scripts/lib/public-skills-parity.ts:53` and the manifest parsing in
`scripts/local/lib/skills-sync-checker.ts:110` — see Phase 2 §3 porting seed), rollback tag/release
note

**Intent**: Replace count-only status with deterministic path-and-byte comparison, record the known
manifest discrepancy's disposition, and confirm content parity before tagging.

**Contract**: `status` returns non-zero on a missing, extra, or byte-different owned path and supports
machine-readable output. The known workspace↔mirror manifest discrepancy is **pointer-only** (verified
2026-09-03): `lessonId` m5l4 vs m5l5, `lastApplied`, and `lessons.m5l4.appliedAt` differ because
`10x get m5l4` was re-run on 2026-09-02 after the 2026-09-01 `sync --all` snapshot; the 28-lesson
set, every `catalogContentHash`, and all 106 `files` hash leaves are identical. The comparison
therefore treats last-applied metadata (`lessonId`, `lastApplied`, `lessons.*.appliedAt`) as
non-content and excludes it; it compares the lesson set, catalog hashes, and the `files` hash map.
The freeze record names the exact commit, workspace/mirror manifest hashes, the pointer-only
disposition, and the verification results. Only then create the immutable rollback tag; never tag
an unexplained false-green state.

#### 2. Package and authentication preflight

**Repositories**: GitHub settings and new private `Piotr-Miller/ai-toolkit`

**Files**: initial private-repository metadata and `docs/bootstrap-auth.md`

**Intent**: Ensure the package name and the only required workstation credential exist before they
can block implementation midway.

**Contract**: Verify `@piotr-miller/ai-toolkit` availability, create the repository private with no
collaborators/connected consumer repositories, and prove a classic PAT with `read:packages` works
through user-level npm configuration. Project-level npm configuration, if later added, contains only
the scope-to-registry mapping and never a token.

#### 3. Per-path managed and recovery inventories

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `inventory/managed.json`, `inventory/recovery.json`, `inventory/provenance.json`,
`inventory/deny-policy.json`

**Intent**: Give every path exactly one channel, origin, target, and publication decision;
default every unclassified path to excluded.

**Contract**: Every path is classified into exactly one of four channels: `managed`, `recovery`,
`consumer-owned`, or `excluded`. Managed inventory contains the five registry-sourced skills
only (`code-review`, `documentation`, `learning`, `skill-optimizer`, `typescript-magician`) — no
repo-owned skills, no course-delivered skills, and no support files. `10x-impl-review-ci` is
**`consumer-owned`, decided 2026-09-04**: the CLI manifest attributes it to lesson m5l3, so
distributing it would open a repackaging channel for course content whose licence is unresolved,
and its public presence in Lumina is a deliberate exception that public contributors already rely
on. Keeping it is the smaller change. Recovery inventory contains every
remaining approved course artifact, prompt, config template, 10x manifest, and local checker file.
`consumer-owned` paths are never distributed by either channel: the repo-authored skill trees
`gauntlet-loop` and `run-local-stack` in both `.claude/skills/` and `.agents/skills/` with their
test `tests/gauntlet-loop-skill.test.ts`; the course-delivered `10x-impl-review-ci` in both trees; `.codex/**` (Lumina-owned public Codex config — an MCP
entry, lint/test hooks, a generated `environment.toml` — with no course-privacy claim); and the
gauntlet helpers `scripts/gauntlet-stage.ts` + `scripts/lib/gauntlet-staging.ts` (whose only lint,
type, and test coverage is Lumina's root graph via `tests/gauntlet-staging.test.ts`). All stay
git-tracked in Lumina. A distributed inventory may claim a git-tracked Lumina path only if Phase 8 §2 untracks it;
Phase 4 §5 asserts the two sets are equal. The inventories explicitly exclude secrets,
personal/machine state, and regenerable state. Registry
skills may carry `license_status: unresolved` for v1, with original source/author/fetch metadata where
discoverable; attribution/frontmatter bytes must not be stripped.

#### 4. Official-base and overlay derivation

**Repositories**: maintainer workstation and `Piotr-Miller/ai-toolkit`

**Files**: `upstream/`, `overlays/`, `content/standalone/`, `inventory/upstream-snapshot.json`,
`scripts/derive-overlays.*`, derivation tests

**Intent**: Perform the one-time extraction that turns today's mixed workspace files into official
10x bases, reviewed local deltas, and standalone owned files.

**Contract**: Official input comes only from an authenticated `10x sync --all`, which pulls the
LATEST unlocked content — so a plain two-way diff cannot tell a local extension from an upstream
advance. Derivation therefore runs a three-way partition first, using the recorded base fingerprint
in `.claude/.10x-cli-manifest.json` (`manifestVersion: 3`, per-file raw-byte sha256 of what `10x get`
delivered):

| workspace vs manifest | fresh official vs manifest | class                 | action                                |
| --------------------- | -------------------------- | --------------------- | ------------------------------------- |
| same                  | same                       | untouched             | no overlay                            |
| same                  | differs                    | pure upstream advance | take latest, no overlay               |
| differs               | same                       | pure local delta      | `overlay = diff(official, workspace)` |
| differs               | differs                    | ambiguous             | hard gate — see below                 |

Only the `pure local delta` class yields an overlay; record its expected base hash. The `ambiguous`
class is a hard gate: it must be empty, or each member is explicitly resolved (re-fetch the old base
bytes, or reviewed hunk-by-hunk) and the resolution recorded in `inventory/upstream-snapshot.json`.
Today it is provably empty (nothing upstream has advanced past the manifest), so every derived
overlay is a local delta by construction. Coverage caveat: the manifest hashes skills and prompts;
the five config templates are declared but unhashed and fall to manual review. A file absent from
the manifest classifies as standalone or excluded; it never silently makes the whole workspace file
an overlay. The package repository commit, not the workstation, becomes the authoritative source.
Record the upstream manifest hash for the complete snapshot.

#### 5. Seed-transition delta preregistration

**Repository**: `Piotr-Miller/ai-toolkit`

**File**: `docs/releases/seed-transition-delta.md`

**Intent**: Prevent the first upgrade/rollback proof from degenerating into a version-only exercise.

**Contract**: Pre-register one logical recovery-checker advance for `1.0.0`: update the retained
`scripts/local/` checker bundle to validate that toolkit and 10x manifests never claim the same target.
This duplicates the CLI's Phase 2 §3 preflight by design — the CLI validates before writing, the
checker validates the installed result; two observation points across a cutover. The managed
provenance stamp (Phase 3 §3) necessarily changes too, because its version line moves from
`1.0.0-rc.1` to `1.0.0`; record its expected rc.1/stable bytes as a mechanical consequence of the
version, not as a second logical change. Together they guarantee the seed pair applies and reverts
bytes in **both** channels. The record names intended source files, affected installed paths, the
failure this catches, and the expected rc.1-versus-stable byte delta per channel. No unrelated
payload change may enter the seed pair.

### Success Criteria

#### Automated Verification

- Mirror verification excludes last-applied metadata, confirms lesson-set / catalog-hash / `files`
  parity, and reports clean with the pointer-only disposition recorded.
- Managed, recovery, excluded, and unclassified inventories account for every candidate source and
  contain no duplicate target ownership.
- The three-way partition reports an empty (or explicitly resolved) `ambiguous` class, and official
  bases plus committed overlays and standalone sources reconstruct the current approved trees
  byte-for-byte, including extension sentinels and Claude/Codex adaptations.
- Package-name lookup and authenticated owner read succeed without any credential inside either
  repository.

#### Manual Verification

- The maintainer approves the discrepancy disposition, payload/provenance inventories, overlay set,
  seed delta, and verified mirror tag before Phase 2.

**Implementation Note**: The mirror tag is a human gate. Do not push a tag or course-bearing private
repository content without explicit confirmation at this phase boundary.

---

## Phase 2: Build the Manifest-Safe Toolkit CLI

### Overview

Implement the package's ownership model and command surface in isolation, with negative behavior
pinned by synthetic temporary-repository fixtures before any real payload can be published.

### Changes Required

#### 1. Package skeleton and command surface

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`,
`vitest.config.ts`, `src/cli.ts`, `src/commands/{setup,sync,restore,status,uninstall}.ts`

**Intent**: Create a Node 24 TypeScript package with an explicit `ai-toolkit` binary and no mutating
lifecycle scripts.

**Contract**: Commands are:

- `setup` — managed sync plus recovery restore;
- `setup --check` — repository marker, registry auth/reachability, package availability, installed
  version, and latest-version diagnostics without mutation;
- `sync` — managed channel only;
- `restore` — recovery channel only;
- `status` — local integrity plus actionable registry/auth/version diagnostics;
- `uninstall` — managed-only by default; `--include-recovery` requests full dismantling.

`setup`, `sync`, `restore`, and `uninstall` support `--dry-run`; commands expose stable JSON output
where automation needs it. V1 has no implicit `--force` path: conflicts are preserved and reported.

#### 2. Published and consumer manifests

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `src/lib/manifests.ts`, `src/schemas/*.ts`, fixture manifests

**Intent**: Separate immutable incoming payload identity from installed consumer state.

**Contract**: Published `payload-manifest.json` records package version, upstream snapshot hash,
channel, source, target, final raw-byte hash, owner, optional overlay base hash, sentinels, and manifest
schema version. Consumer `.ai-toolkit/manifest.json` records the last installed version/hash for every
target and retains recovery records after default uninstall. Unsupported newer schema versions cause
a zero-write preserve-and-report result.

#### 3. Reconciliation and filesystem safety

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `src/lib/{reconcile,paths,hashes,atomic-write,ownership}.ts`

**Intent**: Implement one pure, injected-root reconciliation engine shared by every command — ported
from Lumina's existing, tested primitives, not written greenfield.

**Porting seed** (verified 2026-09-03; copy source into the toolkit's `src/lib/`, which is porting
code, not adding a payload target, so F1's git-tracked rule does not apply):

- `ownership`/`reconcile` ← `scripts/local/lib/skills-sync-checker.ts` (536-line engine; `FileClass`
  `:25`, `parseManifest` `:110`, `listTreeFiles` `:169`, `isAcceptedLocalHash` `:182`) plus its
  389-line test. The engine is config-parameterized and its seven course-specific tokens are all
  comments/message prose; leave `skills-sync-config.ts` (the course-quoting data) behind and supply a
  toolkit config. It already handles the `manifestVersion: 3` declared-but-unhashed case (`:365`)
  that Phase 1 §4's partition depends on.
- `atomic-write` ← `scripts/lib/atomic-file-writes.ts` (`writeFileAtomically` `:27` — `wx` temp
  sibling, `renameSync`, `finally` cleanup; `writeFilePairAtomically` `:44` — rollback on second
  failure, `AggregateError` when the rollback itself fails, which the manifest + payload pair needs).
  **Windows hardening required before it carries bulk installs**: `renameSync` over an existing
  destination throws `EPERM`/`EBUSY` when the target is momentarily locked (antivirus, open editor
  handles — routine on a workstation writing into `.claude/skills/`). Add bounded retry on
  `EBUSY`/`EPERM` and a negative test; Phase 5 §2's Windows canary is the standing gate.
- `paths` ← `scripts/lib/gauntlet-staging.ts:93` `resolveRoundDir` (symlink-resolving containment).
- payload parity tests (Phase 3 §5) ← `scripts/lib/public-skills-parity.ts:53`
  `checkPublicSkillsParity`. This is a **fork, not a move**: per F3 Lumina keeps its own narrowed copy
  for the two repo-owned skills, while the toolkit's copy checks payload parity — two consumers with
  diverging purposes, neither orphaned.

**Contract**: The engine handles absent, byte-identical/unmanaged adoption, safe managed update,
locally modified conflict, stale unchanged removal, and stale modified preservation. Every target is
resolved beneath the repository root; absolute paths, traversal, symlinked parents/targets, duplicate
claims, and overlap with the 10x manifest fail before writes. Git tracking in the consumer
repository is checked per write, not per path: byte-identical adoption of a tracked target is
allowed but reported as `tracked — pending untrack` (so Phase 7 can run against the still-tracked
skill trees before Phase 8 §2 untracks them, and Phase 8's completion is observable in `status`);
any write that would change a tracked file's bytes is a hard preflight rejection with zero writes.
Edge cases: a consumer root that is not a Git repository has nothing tracked, so the check is a
no-op and `status` reports `no repository`; a Git repository with no `git` on PATH fails closed for
byte-changing writes and reports `tracking unknown — git not found`, since the hazard exists but
cannot be ruled out. Writes use a temporary sibling and an OS-correct atomic replace strategy, with
failure cleanup.

#### 4. Channel-specific uninstall and status behavior

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `src/commands/{status,uninstall}.ts`, `src/lib/output.ts`

**Intent**: Make recovery custody visible and prevent ordinary toolkit removal from destroying a
course workspace.

**Contract**: Default uninstall removes only byte-identical managed files, preserves all modified
files, retains recovery files plus their minimal hash/version record, and reports the
`--include-recovery` path. Full uninstall applies the same byte-identity rule to recovery, removes the
restored 10x manifest only if unchanged, and removes `.ai-toolkit/` state only when no preserved record
is needed. Exit codes and JSON distinguish clean, drift/conflict, and environment/auth failure.

#### 5. Unit and command contract tests

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `tests/unit/**`, `tests/fixtures/**`

**Intent**: Make destructive and cross-version edge cases unit-level gates rather than discoveries in
the release matrix.

**Contract**: Cover traversal, absolute paths, Windows case normalization, symlink rejection,
duplicate/overlapping ownership, atomic-write failure cleanup, dry-run zero mutation, local-edit
preservation, stale-file cases, default/full uninstall, base-hash mismatch, malformed manifests,
unsupported future schemas, old-code-readable newer package state, idempotence, and actionable auth
diagnostics.

### Success Criteria

#### Automated Verification

- Package lint, formatting, typecheck, build, and unit suites pass on Node 24.
- Synthetic negative tests prove traversal, symlink, overlap, conflict, and future-schema cases make
  zero filesystem writes.
- Command integration tests prove `setup`, `sync`, `restore`, `status`, and both uninstall modes obey
  their channel boundaries.
- Dry-run and JSON-output tests are deterministic and repeated setup is byte-for-byte idempotent.

#### Manual Verification

- The maintainer reviews command help and representative conflict/auth diagnostics and confirms they
  identify the consequence and the recovery action without exposing tokens or absolute local paths.

---

## Phase 3: Build Deterministic Managed and Recovery Payloads

### Overview

Turn the approved Phase 1 sources into reviewable Claude/Codex payload trees and prove that the exact
package contents match the two-channel contract.

### Changes Required

#### 1. Managed payload generation

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `content/managed/**`, `payload/{claude,codex}/managed/**`, `scripts/build-payload.*`

**Intent**: Package the five registry-sourced skills as managed content.

**Contract**: The managed payload carries no `consumer-owned` path (Phase 1 §3): `gauntlet-loop`,
`run-local-stack`, and their helpers are not packaged. Pre-adapted Claude and Codex outputs are
generated at build time and committed/reviewed;
runtime global replacement is forbidden. Files without declared adaptation remain byte-identical.
Adaptation may not remove frontmatter, attribution, or provenance. The package owns installed managed
targets after adoption, but local modifications still produce preserve-and-report conflicts.

#### 2. Recovery payload generation

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `upstream/**`, `overlays/**`, `content/standalone/**`,
`payload/{claude,codex}/recovery/**`

**Intent**: Reconstruct the full approved course environment without trusting a workspace snapshot.

**Contract**: Build recovery from official raw bytes, base-hash-gated overlays, and directly versioned
standalone files. Include the 10x CLI manifest, course skills not claimed by managed, prompts,
config templates, and `scripts/local/`. `.codex/**` is `consumer-owned` and is not part of recovery.
Exclude every deny-class and `consumer-owned` path. Recovery has an exact expected-contents manifest; recursive
directory capture is not an input.

#### 3. Deny policy and provenance reporting

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `scripts/{check-payload,check-tarball}.*`, `docs/provenance.md`, package `README.md`,
managed provenance stamp `content/standalone/managed-provenance.md` → installed `.ai-toolkit/managed-provenance.md`

**Intent**: Keep owner-only packaging honest without implying authorship or weakening the
access-widening boundary.

**Contract**: Structural denies reject credential paths/content, `.env*`, `.dev.vars`, personal
settings/permissions, caches/logs/session state, and unapproved generated metadata. Absolute paths in
configuration require an inventory justification; prose matches are review flags. The package README
contains a vendored-skills provenance/license-status table and states that unresolved licenses and all
course recovery content must be resolved/removed before access widens. The same table is also
installed as a **managed provenance stamp** — one package-owned managed target,
`.ai-toolkit/managed-provenance.md`, listing the package version, the installed managed skills, each
skill's source, and its license status. It has no official 10x base (standalone content, so Phase 1
§4 never treats it as an overlay), is listed in `inventory/managed.json`, is gitignored in Lumina as
package state (Phase 8 §1), and reconciles like any managed file — a hand edit produces
preserve-and-report. Because its version line differs between every release pair, the managed
channel performs a real update-in-place and revert on every upgrade and rollback, not only in the
seed pair; it is the consumer-side artifact the access-widening precondition is checked against.

#### 4. Tarball allowlist and exact-byte manifest

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `package.json`, `payload-manifest.json`, tarball tests

**Intent**: Make the packed artifact—not the source checkout—the publication boundary.

**Contract**: npm `files` includes only compiled CLI/runtime files, the two payload trees, manifest,
and README/license/provenance material. CI builds twice to prove deterministic output, verifies every
manifest hash against final packed bytes, and rejects missing, extra, or forbidden tarball entries.

#### 5. Migrate payload-bound contracts

**Repositories**: `Piotr-Miller/ai-toolkit` and, later, `Piotr-Miller/lumina-clean-ai`

**Files**: toolkit copies of the public parity tests, scoped to the five managed skills

**Intent**: Put source/payload correctness gates next to the new source of truth before Lumina's
vendored copies are removed in Phase 8.

**Contract**: Toolkit tests cover skill frontmatter/name agreement, declared Claude/Codex adaptation
differences, and exact payload bytes for the five managed skills. Gauntlet skill contracts
(`tests/gauntlet-loop-skill.test.ts`) and staging helper behavior (`tests/gauntlet-staging.test.ts`)
are not migrated — both are `consumer-owned` and stay in Lumina's root graph, as does
`10x-impl-review-ci`, whose parity stays under Lumina's own `npm run check:skills`. Lumina's other
existing tests remain in place until stable cutover.

### Success Criteria

#### Automated Verification

- Two clean payload builds produce identical trees, manifests, and tarball hashes.
- Managed and recovery expected-content sets are complete, mutually exclusive, and non-overlapping
  with the upstream 10x ownership manifest.
- Structural deny and whole-tarball secret scans return zero findings, while seeded negative fixtures
  are rejected.
- Exact-byte, frontmatter, attribution, sentinel, and Claude/Codex adaptation tests pass.
- `npm pack --dry-run` and packed-file-list tests contain only allowlisted paths.

#### Manual Verification

- The maintainer approves the exact tarball inventory, provenance table, unresolved-license markings,
  recovery scope, and access-widening warning before release automation is enabled.

---

## Phase 4: Secure and Exercise the Release Pipeline

### Overview

Build CI and publication controls around the exact artifact, including the owner-only access gate and
standing Linux/Windows behavioral matrix, before the first registry write.

### Changes Required

#### 1. Validation workflow

**Repository**: `Piotr-Miller/ai-toolkit`

**File**: `.github/workflows/ci.yml`

**Intent**: Validate package code, deterministic payloads, tarball contents, and filesystem behavior
on both active host families.

**Contract**: Node 24 matrix on `ubuntu-latest` and `windows-latest` runs install, format/lint,
typecheck, unit tests, payload regeneration with clean-diff assertion, pack/scan, and packed-artifact
integration tests. The behavioral matrix covers install/setup/status/upgrade/rollback/uninstall,
idempotence, local edits, stale files, traversal/symlinks, base mismatch, exact-byte parity, clean Git
status, and synthetic future-schema handling. Windows pins EOL behavior explicitly.

#### 2. CI-only publication and dist-tag promotion

**Repository**: `Piotr-Miller/ai-toolkit`

**File**: `.github/workflows/publish.yml`

**Intent**: Ensure every release passes the security and byte-fidelity gate and no write-capable PAT
exists on a workstation.

**Contract**: A protected manual/tag release builds and validates one tarball, checks tag/version
agreement, publishes that exact artifact with job-level `contents: read` and `packages: write`, and
uses the repository `GITHUB_TOKEN`. Initial publication uses the `rc` dist-tag. Promotion changes only
the dist-tag after registry-byte validation; it never rebuilds or republishes the version.

#### 3. Owner-only access gate

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `security/access-policy.json`, access-check script/tests, publish-workflow gate

**Intent**: Make recovery-byte publication conditional on the promised access boundary.

**Contract**: The gate proves the repository/package is private, owner-only, and grants no connected
consumer-repository Actions access. If GitHub's API cannot prove the state, publication fails closed.
The policy also requires license resolution for the five registry-sourced skills and removal of all
course recovery bytes before any access expansion.

#### 4. Scheduled access watchdog and remediation runbook

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: `.github/workflows/access-watchdog.yml`, `docs/access-remediation.md`

**Intent**: Detect settings changes that occur outside the release workflow.

**Contract**: Run every six hours and on demand, compare live settings to the committed policy, fail
visibly, and open/update one actionable private issue on drift. The runbook says to revoke widened
access immediately or publish a recovery-free package/channel before re-granting it. No workflow
automatically deletes packages or changes visibility.

#### 5. Lumina isolation assertion

**Repositories**: both repositories

**Files**: toolkit canary tests and Lumina dependency/workflow assertions

**Intent**: Prevent a private authoring dependency from entering Lumina's application supply chain.

**Contract**: Tests assert Lumina's root package/lockfile and public workflows contain no private
package install, registry token, or package-read permission. A second cross-repository assertion
proves the set of git-tracked Lumina paths claimed by any distributed inventory (managed or
recovery) equals the set Phase 8 §2 untracks — the package cannot claim a tracked path Lumina keeps,
and Lumina cannot untrack a path the package does not deliver. All registry tests run from the
private toolkit repository.

### Success Criteria

#### Automated Verification

- The complete packed-artifact matrix passes on Ubuntu and Windows, including every negative safety
  case and explicit Windows EOL configuration.
- Publication uses only the package repository's scoped `GITHUB_TOKEN`, and a failing access check
  prevents registry writes.
- Watchdog fixtures detect visibility, collaborator, connected-repository, and license/recovery-policy
  drift and produce one stable alarm path.
- Lumina's dependency graph and public workflows remain free of the private package and credentials.
- The tracked paths claimed by the distributed inventories equal Phase 8 §2's untrack set.

#### Manual Verification

- The maintainer approves the first-publish workflow, owner-only policy, six-hour residual-risk
  window, and remediation runbook before authorizing `1.0.0-rc.1` publication.

---

## Phase 5: Publish and Canary `1.0.0-rc.1`

### Overview

Publish the first full owner-only artifact under `rc`, then exercise the real registry bytes on clean
Linux and Windows Lumina clones. Nothing is promoted to `latest` in this phase.

### Changes Required

#### 1. Immutable release candidate

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: package version/tag, release notes, immutable artifact evidence

**Intent**: Establish the permanent rollback anchor with the full managed and recovery scope.

**Contract**: Publish `1.0.0-rc.1` exactly once under the `rc` dist-tag after the Phase 4 access gate.
Record its tarball digest, payload manifest digest, upstream 10x manifest hash, workflow run, and
owner-only access evidence. Repository policy forbids deleting this version while the migration uses
it as a rollback anchor.

#### 2. Real-registry cross-platform canary

**Repository**: `Piotr-Miller/ai-toolkit` CI with temporary fresh Lumina clones

**File**: registry-canary workflow/scripts and evidence report

**Intent**: Prove the target experience against bytes fetched from GitHub Packages, not a source
checkout or local tarball.

**Contract**: On Ubuntu and Windows, configure non-secret scope mapping plus ephemeral owner-read auth,
clone Lumina, set Windows EOL policy, and run the exact pinned rc command. Exercise setup/check,
managed sync, recovery restore, status, idempotent rerun, both uninstall modes in disposable copies,
and all Phase C negative cases. Confirm existing public/full skill checks and Git cleanliness at the
appropriate pre-cutover state.

### Success Criteria

#### Automated Verification

- Registry `1.0.0-rc.1` bytes match the validated tarball and payload-manifest digests exactly.
- The full real-registry matrix passes on Ubuntu and Windows.
- One fresh Lumina clone per OS reaches a complete two-tool environment through the exact pinned setup
  command and remains clean except for expected ignored/local state.
- The rc evidence record contains artifact, upstream, access-policy, platform-run, and expected-content
  hashes and declares the version retained.

#### Manual Verification

- The maintainer explicitly authorizes the first publish and accepts the rc canary evidence before
  Phase 6 creates the stable delta.

---

## Phase 6: Apply the Seed Delta and Promote `1.0.0`

### Overview

Create the pre-registered single logical payload delta, publish stable bytes under `rc`, re-run the
registry gate, and promote those identical bytes to `latest` only after human approval.

### Changes Required

#### 1. One auditable recovery-checker advance

**Repositories**: `Piotr-Miller/ai-toolkit` sources and derived recovery payload

**Files**: only the paths preregistered by `docs/releases/seed-transition-delta.md`

**Intent**: Give upgrade and rollback a substantive transition in both channels: the retained local
checker (recovery) learns to reject toolkit/10x manifest ownership overlap, and the managed
provenance stamp (managed) moves to `1.0.0`.

**Contract**: The checker advance is the sole logical payload change between rc.1 and stable, plus
the managed provenance stamp it necessarily updates. Regenerate through the normal standalone/overlay
path, never by editing `payload/` directly. Release notes and manifest record the source provenance,
before/after hashes for both channels, affected targets, and the **observed checker output captured
verbatim at release time** — Phase 8 §4 removes the checker one release later, so the proof must not
depend on the checker still existing when someone audits it. Any additional payload change postpones
stable until the seed-pair scope is reviewed again.

#### 2. Stable registry gate and promotion

**Repository**: `Piotr-Miller/ai-toolkit`

**Files**: version/tag `1.0.0`, stable evidence report, dist-tag promotion record

**Intent**: Test the immutable stable version from the registry before making it the default.

**Contract**: Publish `1.0.0` initially under `rc`, run the complete Ubuntu/Windows registry matrix,
then require human approval to move `latest` to that already-tested version. Exact version commands,
not moving tags, are used in evidence. The manifest schema remains supported by rc.1 so real rollback
can proceed; synthetic future-schema fixtures remain the guard for unsupported schema versions.

### Success Criteria

#### Automated Verification

- The release diff contains exactly the preregistered logical payload advance, the managed
  provenance stamp it necessarily updates, and necessary package version/release metadata, with all
  affected byte hashes enumerated per channel.
- Registry `1.0.0` passes the full Ubuntu/Windows matrix while still under `rc`.
- The promoted `latest` version resolves to the exact digest already validated under `rc`.
- Release notes state what changed, its provenance, the failure it catches, and the rc.1/stable hashes.

#### Manual Verification

- The maintainer explicitly approves moving `latest` to `1.0.0` after reviewing the stable registry
  evidence.

---

## Phase 7: Prove Live Adoption, Upgrade, Rollback, and Re-upgrade

### Overview

Exercise the transition on the real maintained workspace, including the pre-manifest adoption case and
both managed and recovery local modifications. This evidence gates mirror retirement.

### Changes Required

#### 1. Live-workspace adoption dry-run

**Repository**: live `Piotr-Miller/lumina-clean-ai` workspace

**Files**: no writes during dry-run; generated review report outside tracked public paths

**Intent**: Classify existing targets before the package claims them.

**Contract**: Run pinned rc.1 `setup --dry-run` with no toolkit manifest. Byte-identical targets are
reported as adoptable; drifted or ambiguous targets are preserved and listed with channel, hashes,
and next action. The report must show zero unintended overwrite/delete operations. A human approves
the report before real setup.

#### 2. Exact-version transition cycle

**Repository**: live workspace, with recoverable temporary test edits

**Files**: `.ai-toolkit/manifest.json` plus installed managed/recovery paths

**Intent**: Prove the exact transition semantics on the environment the mirror previously restored.

**Contract**: Execute:

1. install/setup `1.0.0-rc.1`, verify status and both legacy checks;
2. introduce one controlled local modification in a managed file and one recovery extension file;
3. upgrade with `1.0.0`, verify the checker delta (recovery) and the provenance stamp (managed) both
   applied in place where safe and both modifications survived;
4. roll back with `1.0.0-rc.1`, verify both deltas reverted where safe and modified files remained;
5. restore rc.1 recovery over stable-written state, verifying preserve-and-report;
6. re-upgrade with `1.0.0`, restore temporary test files deliberately, and verify idempotence/cleanliness.

Every command uses an immutable exact version. Back up and hash controlled test targets before editing;
the phase ends with the intended source bytes restored, never with test markers left behind.

#### 3. Cross-version and evidence record

**Repositories**: `Piotr-Miller/ai-toolkit` and Lumina change record

**Files**: private transition evidence plus public non-sensitive summary

**Intent**: Make the mirror-retirement claim auditable without publishing course paths or bytes.

**Contract**: Record command versions, manifest schema/version, package and payload digests, the exact
delta per channel with before/after hashes, per-step outcomes, preserved-conflict results, legacy
checker results captured verbatim (the checker is removed in Phase 8 §4; the record must stand
without it), and cleanup proof. A
separate disposable fixture proves rc.1 encountering an unsupported future schema performs zero
writes and reports preservation.

### Success Criteria

#### Automated Verification

- Live adoption dry-run classifies every existing target and proposes no blind overwrite or deletion.
- After approved adoption, status and both legacy skill checkers pass at rc.1 and stable boundaries.
- The exact `rc.1 -> stable -> rc.1 -> stable` cycle applies and reverts the recorded real delta in
  both channels while preserving controlled managed/recovery modifications.
- Unsupported future-schema and newer-package-state checks preserve files and produce deterministic
  conflict/status output.
- Final hashes and Git status prove all temporary test edits were removed and no tracked application
  files changed unexpectedly.

#### Manual Verification

- The maintainer reviews and approves the live-workspace adoption dry-run before setup writes.
- The maintainer accepts the completed transition evidence as sufficient to make the mirror cold.

---

## Phase 8: Cut Over Lumina and Make the Mirror Cold

### Overview

Make the stable package the sole active source, update every live instruction/status pointer, remove
the superseded public-vendored distribution surface after its tests have moved, and retain the mirror
read-only rather than deleting it.

### Changes Required

#### 1. Lumina consumer configuration and ignore boundary

**Repository**: `Piotr-Miller/lumina-clean-ai`

**Files**: `.ai-toolkit/config.json`, `.gitignore`, package-state ignore rules

**Intent**: Record the package/profile/tools/exact stable version without introducing a private npm
dependency or tracked installation state.

**Contract**: Commit only non-secret configuration (`@piotr-miller/ai-toolkit@1.0.0`, Lumina profile,
Claude+Codex targets). Ignore consumer manifest/state and installed package-owned artifacts. That
`.gitignore` entry is what places them outside Lumina's lint and format gates — ESLint derives its
ignores from `.gitignore` (`eslint.config.js` `includeIgnoreFile`) and Prettier ≥ 3 ignores
`.gitignore`d paths by default (measured on 3.9.6: a gitignored misformatted file reports clean) — so
no `.prettierignore` edit is needed and none should be made (`AGENTS.md` keeps that file narrow).
The one gate that does not follow `.gitignore` is `tsconfig.json` (`include: ["**/*"]`), irrelevant
here because `.ai-toolkit/` holds only JSON and Markdown. No token, registry auth, absolute personal
path, or private-package dependency enters tracked application files.

#### 2. Remove superseded public-vendored ownership

**Repositories**: Lumina and `Piotr-Miller/ai-toolkit`

**Files**: the five managed skill trees (both `.claude/skills/` and `.agents/skills/` copies),
`.gitignore` re-include list, `PUBLIC_SKILLS` in `scripts/check-skills-sync.ts`

**Intent**: Ensure the package—not Git history plus package—becomes the active owner while keeping
Lumina's credential-free CI green.

**Contract**: Confirm every payload-bound test has landed and passed in the private package, then
untrack the five managed skill trees from Lumina. The untrack set is exactly the git-tracked paths the
distributed inventories claim (Phase 4 §5). `consumer-owned` paths stay tracked: the `gauntlet-loop`,
`run-local-stack`, and `10x-impl-review-ci` trees, `tests/gauntlet-loop-skill.test.ts`, `.codex/**`,
`scripts/gauntlet-stage.ts`, `scripts/lib/gauntlet-staging.ts`, and `tests/gauntlet-staging.test.ts`.
Because those three skills still live in both consumer trees, the parity gate is **narrowed, not
removed**: `npm run check:skills`, `scripts/check-skills-sync.ts`, and
`scripts/lib/public-skills-parity.ts` (+ tests) stay, with `PUBLIC_SKILLS` and the `.gitignore`
re-include list shrunk from eight entries to three. The allowlist rule in `AGENTS.md` ("three places
state one set") keeps holding for the two. Keep application/runtime tests that do not depend on
private payloads. Fresh public-clone CI must install no private package and
must pass without those authoring artifacts; authenticated maintainers restore them only via setup.

#### 3. Rewrite the operational documentation

**Repositories**: Lumina and toolkit

**Files**: Lumina `AGENTS.md`, `context/foundation/agent-env-setup.md`, package `README.md`

**Intent**: Leave one active setup/recovery procedure and enumerate every drift-prone pointer in the
same commit.

**Contract**: Document clone + Node 24 + user-level npm auth -> exact pinned setup; command/channel
semantics; setup/check diagnostics; Windows Git EOL requirement; owner-only access policy; course and
license access-widening preconditions; watchdog/remediation; official-sync-plus-overlays refresh; and
the mirror's cold status. Replace old `10x-toolkit restore`, manual copy/adapt, and count-status claims.
`CLAUDE.md` remains the pointer to `AGENTS.md` unless an actual appended block is discovered.

Two items in this rewrite need a path edit, and the third is now decided:

- **`packages/code-reviewer` citations.** `src/prompts.ts:147` names
  `.claude/skills/10x-impl-review-ci/references/impl-review-instructions.md`, and `prompts.ts:176`,
  `prompts.test.ts:262`, `:300` cite it by line (`:35-56`, `:87`, `:95`). `prompts.ts` is a
  hand-maintained transcription — `.github/workflows/review.yml` and `.github/actions/ai-review/`
  never read the skill tree, so public CI does not break — but after cutover the source lives in a
  private repo, versions independently, and is absent from a fresh public clone; line-number
  citations across that boundary rot silently. **The cross-repository half of this no longer
  applies** — `10x-impl-review-ci` is `consumer-owned`, so the cited file stays in the public tree
  next to its citation. The line numbers should still become headings: they rot on any edit to the
  skill, which is what `prompts.test.ts` pins them against.
- **`AGENTS.md:110` "powers the public CI reviewer".** Loose phrasing for the transcription above;
  rewrite it to say the reviewer's prompt is transcribed from the skill and the skill is not read at
  runtime.
- **`10x-impl-review-ci` disposition — decided 2026-09-04: `consumer-owned`.** The plan review's F3
  read it as one of six managed skills, but the CLI manifest attributes it to lesson m5l3, so the
  managed channel would have become a repackaging path for course content with an unresolved licence.
  It stays public and git-tracked in both trees, keeps its `.gitignore` re-include and its
  `PUBLIC_SKILLS` entry, and stays reachable to public contributors. `AGENTS.md` still needs the
  accuracy fix in the bullet above, but its "single permitted public exception" framing survives
  intact. Phase 1 §3 and Phase 8 §2 are updated to match.

#### 4. Retain the local checker for one release window

**Repositories**: installed recovery payload and issue tracking

**Files**: `scripts/local/**`, follow-up issue/status record

**Intent**: Avoid deleting the old high-signal verifier at the same moment the new CLI becomes primary,
while giving it an explicit retirement condition.

**Contract**: Keep the full local checker through the first package release after `1.0.0`. Open/record
a follow-up that removes it only after that later release passes the CLI's equivalent positive and
negative tests on both platforms. Because Phase 2 §3 ported the checker's engine into the toolkit,
that removal deletes a copy, not the only implementation — a move, not a loss. The checker is no
longer a distribution source and does not prevent this change from completing.

#### 5. Retire the active mirror workflow

**Repository**: `Piotr-Miller/10x-toolkit`

**Files**: repository settings/README retirement notice; no deletion

**Intent**: Make the package the sole active recovery path while preserving the verified rollback
artifact.

**Contract**: After Phase 7 human approval, archive or otherwise make the mirror read-only, point its
README to `@piotr-miller/ai-toolkit@1.0.0`, preserve the verified tag, and forbid new snapshots/restores
as the normal procedure. Repository deletion is out of scope.

#### 6. Status and issue synchronization

**Repository**: Lumina

**Files**: `context/changes/github-packages-skill-distribution/change.md`,
`context/foundation/github-issues.md`, issue #209, and the enumerated pointer checklist below

**Intent**: Prevent the new canonical setup record from leaving stale instructions elsewhere.

**Contract**: The sweep updates **live instructions**; it never rewrites **historical records**. A
grep cannot tell one from the other, so the worklist is this checklist (verified 2026-09-03), and the
grep is only the completeness backstop:

- `context/foundation/agent-env-setup.md` — 17 mirror-specific hits; the restore runbook itself.
- `AGENTS.md` — the allowlist bullet (`:110`: mirror restore, `sync.mjs snapshot`, "eight
  tracked", "three places state one set", "powers the public CI reviewer") and `:112` (restore via
  mirror). Counts become two; the three-place rule keeps holding for the two.
- `.gitignore` — comment block `:49`, `:59` and the re-include lines `:62-69` / `:71-78`
  (8 → 2 per tree: `gauntlet-loop`, `run-local-stack`).
- `scripts/check-skills-sync.ts` — `PUBLIC_SKILLS` narrowed to two (3 hits); file stays (F3).
- `packages/code-reviewer/src/prompts.ts:147, :176`, `prompts.test.ts:262, :300`,
  `schemas.ts:325` — pinned per §3 above.
- `context/foundation/github-issues.md` — **append** a row to the post-creation
  `## Status updates` section; do not edit the `#209` creation entry at `:162`.
- `context/team/*` — **no edits**. `mom-test-validation.md:19, 69` record an incident and an
  interview question; they are evidence of what happened, not instructions.
  `opportunity-map.md` has no hits. Same rule as `context/archive/`.

Backstop grep after the checklist: `10x-toolkit`, `sync.mjs`, `mirror`, `check:skills`,
`PUBLIC_SKILLS`, `agent-env-setup`, `manual re-sync`, `snapshot`, `restore` — any hit outside the
checklist, `context/archive/`, and `context/team/` is a checklist bug, not a worklist item to act on
silently. Closing/commenting on issue #209 and changing repository settings remain explicit
human/external actions.

### Success Criteria

#### Automated Verification

- Lumina contains pinned non-secret toolkit configuration but no private package dependency,
  credential, package-read CI permission, or tracked consumer state.
- All payload-bound tests pass in the toolkit package, and Lumina's full public CI passes from a fresh
  clone without private registry access after vendored artifacts are removed.
- Authenticated `ai-toolkit setup`, `status`, legacy full checker, and Git-cleanliness checks pass on
  the live workspace after cutover.
- Every §6 checklist item is done and the backstop grep finds no live instruction outside it that
  still presents the mirror/manual copy workflow as active; `context/archive/` and `context/team/`
  remain untouched.
- The follow-up/expiry condition for removing the local checker is recorded and tied to one later
  successful cross-platform package release.
- The mirror is read-only/cold with its verified tag intact and has not been deleted.

#### Manual Verification

- The maintainer approves the final Lumina adoption record, stable documentation, and mirror
  retirement before the change is marked implemented or archived.

---

## Testing Strategy

### Unit Tests

- Manifest parsing, version/schema compatibility, duplicate ownership, and expected-content checks.
- Every reconciliation state for managed and recovery channels.
- Path traversal, absolute path, symlink parent/target, Windows case normalization, and atomic-write
  failure cleanup.
- Local-edit and stale-file preservation, conservative uninstall, unsupported future schemas, and
  dry-run zero-mutation behavior.
- Auth/version diagnostics with network calls injected; no live registry dependency in unit tests.
- Payload generation, overlay base hashes, sentinels, provenance preservation, deny patterns, and
  tarball exact-file allowlisting.

### Integration Tests

- Compiled CLI against temporary repositories for clean setup, pre-existing byte-identical adoption,
  drift conflict, idempotence, upgrade, rollback, restore, and both uninstall modes.
- Exact packed tarball on Ubuntu and Windows before publication.
- Exact registry artifact on Ubuntu and Windows after publication, including one fresh Lumina clone per
  platform.
- Access-policy fixtures and a safe API-level watchdog dry-run.
- Legacy checker parity during the migration window.

### Manual Testing Steps

1. Approve the reconciled and verified mirror freeze/tag.
2. Review the exact managed/recovery inventories, overlays, deny policy, and packed file list.
3. Authorize `1.0.0-rc.1` publication after the owner-only access gate passes.
4. Approve stable `latest` promotion after registry-byte tests pass.
5. Review the live-workspace `setup --dry-run` adoption report before writes.
6. Observe the exact-version transition cycle and verify modified files remain intact.
7. Approve making the mirror cold after the evidence record is complete.

## Performance Considerations

Skill trees are small, so correctness dominates throughput. Hash files in a streaming manner and avoid
loading tarballs or arbitrary binary files wholly into memory, but do not add caching that can make
status stale. Registry freshness checks should use bounded timeouts and report local integrity even
when the network is unavailable. A six-hour access-watchdog cadence is sufficient for the accepted
owner-only risk; release-time checks remain synchronous and fail closed.

## Migration Notes

- The plan is cross-repository. Each phase should use one Conventional Commit per repository, not one
  commit pretending to atomically span repositories.
- Course-bearing writes, GitHub repository/package creation, package publication, dist-tag promotion,
  package/repository access changes, mirror archiving, and issue closure are external actions with
  explicit human gates.
- Existing workspace adoption starts with rc.1 dry-run and human review. Never synthesize an installed
  manifest and then assume the files were package-owned.
- Keep `1.0.0-rc.1` permanently available as the rollback anchor. Do not reuse or overwrite versions.
- If Phase 7 fails, keep the mirror active, leave Lumina's old documented path intact, and fix forward
  in a new rc version. Do not promote or retire based on partial evidence.
- If the access watchdog cannot prove owner-only state, stop publication/cutover; do not weaken the
  policy to accommodate an API limitation.

## References

- Related research: `context/changes/github-packages-skill-distribution/research.md`
- Change identity: `context/changes/github-packages-skill-distribution/change.md`
- Current setup procedure: `context/foundation/agent-env-setup.md`
- Current public boundary: `.gitignore:46-84`
- Current public checker: `scripts/check-skills-sync.ts:26-68`
- Gauntlet payload contract: `tests/gauntlet-loop-skill.test.ts:29-243`
- Existing private mirror: `/home/piotrmiller/Source/10x-toolkit/sync.mjs`
- Prior setup plan: `context/archive/2026-08-24-agent-env-setup-runbook/plan.md`
- Planning priors: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Verify, Freeze, Classify, and Derive Overlays

#### Automated

- [x] 1.1 Mirror verification confirms content parity with the pointer-only discrepancy recorded — Piotr-Miller/10x-toolkit@75240cb
- [ ] 1.2 Two-channel inventories account for every candidate path with exclusive ownership
- [ ] 1.3 Three-way partition has no unresolved ambiguous files; bases plus overlays reconstruct trees byte-for-byte
- [x] 1.4 Package name and authenticated owner read preflight pass without repository credentials — 190e153

#### Manual

- [ ] 1.5 Maintainer approves discrepancy disposition, inventories, overlays, seed delta, and mirror tag

### Phase 2: Build the Manifest-Safe Toolkit CLI

#### Automated

- [ ] 2.1 Package lint, format, typecheck, build, and unit suites pass on Node 24
- [ ] 2.2 Negative safety fixtures prove rejected states perform zero writes
- [ ] 2.3 Command tests enforce managed, recovery, status, and uninstall channel boundaries
- [ ] 2.4 Dry-run, JSON output, and repeated setup are deterministic and idempotent

#### Manual

- [ ] 2.5 Maintainer accepts command help and representative safe diagnostics

### Phase 3: Build Deterministic Managed and Recovery Payloads

#### Automated

- [ ] 3.1 Two clean payload builds produce identical trees, manifests, and tarball hashes
- [ ] 3.2 Managed and recovery content sets are complete, exclusive, and ownership-safe
- [ ] 3.3 Deny and secret scans reject seeded faults and find none in the real tarball
- [ ] 3.4 Exact-byte, attribution, sentinel, and per-tool adaptation tests pass
- [ ] 3.5 Packed artifact contains only explicitly allowlisted paths

#### Manual

- [ ] 3.6 Maintainer approves tarball inventory, provenance, recovery scope, and access warning

### Phase 4: Secure and Exercise the Release Pipeline

#### Automated

- [ ] 4.1 Packed-artifact matrix passes on Ubuntu and Windows including negative cases
- [ ] 4.2 Windows EOL, path-case, and atomic replacement contracts pass
- [ ] 4.3 Publication is CI-only and fails closed when owner-only access cannot be proved
- [ ] 4.4 Scheduled watchdog fixtures detect every access-policy drift class
- [ ] 4.5 Lumina remains free of private dependencies, credentials, and package-read CI permissions
- [ ] 4.6 Tracked paths claimed by distributed inventories equal Phase 8 §2's untrack set

#### Manual

- [ ] 4.7 Maintainer approves first-publish controls and the access remediation runbook

### Phase 5: Publish and Canary `1.0.0-rc.1`

#### Automated

- [ ] 5.1 Registry rc.1 bytes match the validated immutable artifact digests
- [ ] 5.2 Full real-registry matrix passes on Ubuntu and Windows
- [ ] 5.3 Fresh Lumina setup succeeds on both platforms with expected clean local state
- [ ] 5.4 Rc evidence records artifact, upstream, access, platform, and retention proofs

#### Manual

- [ ] 5.5 Maintainer authorizes first publication and accepts the rc canary evidence

### Phase 6: Apply the Seed Delta and Promote `1.0.0`

#### Automated

- [ ] 6.1 Release diff contains exactly the preregistered checker advance plus the managed provenance stamp
- [ ] 6.2 Registry stable bytes pass the complete Ubuntu and Windows matrix under rc
- [ ] 6.3 Latest promotion targets the already-tested immutable stable digest
- [ ] 6.4 Release evidence records delta provenance, behavior, and before-after hashes

#### Manual

- [ ] 6.5 Maintainer approves moving latest to 1.0.0

### Phase 7: Prove Live Adoption, Upgrade, Rollback, and Re-upgrade

#### Automated

- [ ] 7.1 Live adoption dry-run classifies every target without blind mutation
- [ ] 7.2 Rc.1 and stable boundaries pass status and both legacy checks after adoption
- [ ] 7.3 Exact rc-stable-rc-stable cycle applies and reverts the real delta in both channels safely
- [ ] 7.4 Managed and recovery local modifications survive every transition and restore
- [ ] 7.5 Unsupported future-schema handling preserves files and produces deterministic output
- [ ] 7.6 Cleanup hashes and Git status prove no temporary test edits remain

#### Manual

- [ ] 7.7 Maintainer approves the live-workspace adoption diff before setup writes
- [ ] 7.8 Maintainer accepts transition evidence as sufficient for mirror retirement

### Phase 8: Cut Over Lumina and Make the Mirror Cold

#### Automated

- [ ] 8.1 Lumina records pinned non-secret configuration without private build or CI coupling
- [ ] 8.2 Payload-bound tests move to toolkit and fresh public Lumina CI passes without registry auth
- [ ] 8.3 Live setup, status, retained checker, and Git-cleanliness checks pass after cutover
- [ ] 8.4 §6 pointer checklist complete and backstop grep finds no live mirror or manual-copy instructions
- [ ] 8.5 Local-checker removal follow-up is tied to one later successful package release
- [ ] 8.6 Mirror is cold and read-only with verified rollback tag intact

#### Manual

- [ ] 8.7 Maintainer approves final adoption, documentation, and mirror retirement
