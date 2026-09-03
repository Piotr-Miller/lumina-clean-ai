# GitHub Packages Skill Distribution — Plan Brief

> Full plan: `context/changes/github-packages-skill-distribution/plan.md`  
> Research: `context/changes/github-packages-skill-distribution/research.md`

## What & Why

Replace Lumina's manual dual-tree sync and mixed private mirror with an explicit, version-pinned
`@piotr-miller/ai-toolkit` CLI. It becomes the sole active managed/recovery source while preserving
local edits, course privacy, deterministic provenance, and rollback.

## Starting Point

Eight skills are public and git-tracked; the remaining course environment comes from a private mirror
and manual adaptations. That mirror currently reports a false green despite a manifest mismatch, and
restore can overwrite bytes without ownership history.

## Desired End State

Given Node 24, a Lumina clone, and user-level GitHub Packages auth, one exact-version command safely
installs both channels for Claude and Codex. Status, upgrade, rollback, and uninstall preserve local
changes; public CI stays credential-free; the mirror becomes a cold read-only rollback artifact.

## Key Decisions Made

| Decision          | Choice                                                          | Why                                                                    | Source   |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Distribution      | Private `@piotr-miller/ai-toolkit` with explicit CLI            | Versioned bytes without lifecycle mutation                             | Research |
| Channels          | Managed eight + full recovery scope in one package              | One fresh-machine setup while preserving distinct ownership semantics  | Plan     |
| Package access    | Owner-only while recovery exists                                | Course content must not reach new readers                              | Plan     |
| Managed licensing | Non-blocking provenance in v1; hard gate before access widens   | The six skills are already public; private packaging adds no audience  | Plan     |
| Refresh source    | Official `10x sync --all` + committed base-hash overlays        | Replaces trust in workstation snapshots with reproducible derivation   | Plan     |
| Authentication    | Preconfigured user-level npm auth is required                   | The CLI cannot authenticate before npm downloads it                    | Plan     |
| Uninstall         | Managed-only by default; recovery requires `--include-recovery` | Ordinary toolkit cleanup must not erase course data                    | Plan     |
| Personal state    | Structurally excluded and secret-scanned                        | Immutable caches make accidental credential publication hard to recall | Plan     |
| Platforms         | Ubuntu + Windows standing gate; macOS deferred                  | These are the active hosts and cover both filesystem behavior families | Plan     |
| Seed versions     | `1.0.0-rc.1` then `1.0.0` with one real checker delta           | Upgrade/rollback must apply actual byte changes                        | Plan     |
| Mirror end state  | Cold/read-only, not deleted                                     | Keeps verified disaster rollback without remaining an active source    | Plan     |

## Scope

**In scope:** private package/CLI, manifests and dual-tool payloads; provenance and overlay derivation;
owner-only publication/watchdog; Linux/Windows registry gates; rc/stable transition proof; Lumina
cutover and documentation cleanup.

**Out of scope:** Lumina dependency/CI coupling; auth bootstrap; postinstall, symlinks, or workspace
capture; collaborator access while recovery exists; macOS; mirror deletion; immediate local-checker
removal; and the separate public-repository license audit.

## Architecture / Approach

Interactive 10x acquisition happens on a workstation. Official bytes, reviewed hash-gated overlays,
and standalone owned files live in the private toolkit repo; CI derives/scans per-tool payloads.
Consumer commands adopt identical files and preserve conflicts against a local hash manifest.

## Phases at a Glance

| Phase              | What it delivers                                      | Key risk                                      |
| ------------------ | ----------------------------------------------------- | --------------------------------------------- |
| 1. Freeze/classify | Verified mirror tag, provenance, overlays, seed delta | Freezing a false-green state                  |
| 2. CLI             | Safe setup/sync/restore/status/uninstall              | Destructive conflict handling                 |
| 3. Payloads        | Deterministic managed + recovery tarball              | Course/personal bytes crossing boundaries     |
| 4. Pipeline        | Cross-platform gates and access watchdog              | Publishing before policy is provable          |
| 5. Rc canary       | Real `1.0.0-rc.1` registry evidence                   | Tarball tests differing from registry reality |
| 6. Stable          | One auditable delta and `latest` promotion            | Vacuous transition proof                      |
| 7. Transitions     | Live adopt/upgrade/rollback/re-upgrade evidence       | Overwriting pre-existing local edits          |
| 8. Cutover         | Package-only active path; mirror cold                 | Stale docs or premature verifier removal      |

**Prerequisites:** Node 24, owner-level `read:packages` PAT, available package name, and approval at the
four external mutation gates. **Estimated effort:** 8 phases across 3 repositories, 2 real releases,
and 1 supervised live-workspace transition cycle.

## Open Risks & Assumptions

- Publication fails closed if GitHub's API cannot prove owner-only access.
- Access expansion requires stripping recovery and resolving the six managed-skill licenses first.
- The access watchdog detects manual drift after the fact; accepted exposure is one six-hour interval.

## Success Criteria (Summary)

- Exact registry artifacts restore fresh Linux and Windows Lumina clones and preserve conflicts.
- The real rc/stable/rc/stable cycle applies one documented payload delta and leaves local edits safe.
- Lumina's public build/CI remains credential-free, the package is the only active distribution path,
  and the verified mirror is cold rather than deleted.
