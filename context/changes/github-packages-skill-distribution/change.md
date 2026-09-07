---
change_id: github-packages-skill-distribution
title: Dystrybucja skilli przez GitHub Packages i jawny CLI sync
status: impl_reviewed
created: 2026-09-02
updated: 2026-09-07
archived_at: null
---

## Notes

Przyjąć GitHub Packages z jawnym CLI sync i jednocześnie bezpiecznie wycofać
zastąpione elementy dotychczasowej dystrybucji skilli.

GitHub issue: [#209](https://github.com/Piotr-Miller/lumina-clean-ai/issues/209)

## Where this stands — 2026-09-07

Phases 1–6 are built, verified and recorded. Phase 7 is open **at its human
gate**, and nothing in the live workspace moves until that gate is signed.

### Published

The seed pair is `1.0.0-rc.3` ↔ `1.0.0`, both under the `rc` dist-tag, canaried
16/16 on Ubuntu and Windows, digests recomputed from the downloaded registry
tarball. `latest` does not exist: promoting it before Phase 7 exercises a
rollback would make the default version one nothing has ever rolled back from.
`rc.1` (inert) and `rc.2` (incomplete recovery channel) stay published as
immutable history — never anchors.

### Open gates

| Item                                        | State                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 7.7 maintainer approves the adoption report | **open** — no real `setup` has run; `.ai-toolkit/` does not exist                        |
| 7.2 both legacy checks pass                 | **conditioned** — the local checker's one documented finding needs maintainer acceptance |
| 6.3 / 6.5 promote `latest`                  | held until Phase 7 produces evidence                                                     |

### To resume

1. Re-apply the checker preparation: set `scripts/local/lib/skills-sync-checker.ts`
   and `scripts/local/skills-sync-checker.test.ts` to rc.3's bytes
   (`1a05a9e959dd`, `c917849e371b`), verifying hashes; today they hold the `1.0.0`
   bytes, which would leave the cycle no recovery delta to prove.
2. Confirm with `setup --dry-run`: expect 230 adopt + 1 install, zero preserve.
3. Only then the real `setup` at rc.3, which first creates `.ai-toolkit/manifest.json`.

The four `upstream-advance` skill files (`10x-plan`, `10x-plan-review`, both
trees) already carry the official bytes approved 2026-09-04 and stay that way;
that migration is independent of Phase 7's gate. It is also the cause of the
legacy checker's standing finding — see Phase 7's overview in `plan.md`.
