---
change_id: github-packages-skill-distribution
title: Dystrybucja skilli przez GitHub Packages i jawny CLI sync
status: impl_reviewed
created: 2026-09-02
updated: 2026-09-08
archived_at: null
---

## Notes

Przyjąć GitHub Packages z jawnym CLI sync i jednocześnie bezpiecznie wycofać
zastąpione elementy dotychczasowej dystrybucji skilli.

GitHub issue: [#209](https://github.com/Piotr-Miller/lumina-clean-ai/issues/209)

## Where this stands — 2026-09-08

**The cutover is done.** Phases 1–8 are built and verified; all 48 success
criteria are ticked. The package — not this repository's git history — is the
active owner of the five managed skills, and `@piotr-miller/ai-toolkit@1.0.0` is
the one live recovery path.

The CLI said so itself: before the cutover `status` warned that _"54 installed
file(s) are still tracked by this repository. The cutover is complete when this
reaches zero."_ After it, that warning is gone and `status` reports 231 targets
unchanged, exit 0.

### What was proven, not assumed

Phase 7 ran the whole transition on the **real maintained workspace**, because
that is the environment the mirror used to restore. The delta had to be created
before it could be proven: the workspace already held `1.0.0`'s bytes of both
recovery checker files, so an adoption would have left the cycle nothing to
apply and nothing to revert. Both were backed up and set to rc.3's bytes first.

|               |                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------- |
| cycle         | `rc.3 → 1.0.0 → rc.3 → 1.0.0`, every command pinned to an exact version                  |
| delta         | three targets in **both** channels, applied and reverted by hash                         |
| preservation  | two controlled local edits, one per channel, survived every step                         |
| isolation     | `restore` touched 176 recovery targets and no managed file                               |
| future schema | forged `schemaVersion 999` → exit 2, 233-file census byte-identical: zero writes         |
| cleanup       | 208-file skill census identical to the pre-phase baseline; `grep phase7-test-marker` → 0 |

Full record, with paths and bytes, in the private package:
`Piotr-Miller/ai-toolkit docs/releases/live-transition-2026-09-08.md`.

### What the cutover changed here

- **54 paths untracked** — the five vendored non-course skills across both
  trees. The files did not move; ownership did.
- **The allowlist is three, and so is the rule about it.** It used to say "three
  places state one set". The mirror is cold, so its `sync.mjs` copy is frozen
  history and cannot be kept in step; the rule now names the **two** live places
  and says the third is frozen. Saying "three" when one no longer moves is how an
  allowlist quietly stops being enforced.
- **`.ai-toolkit/config.json` is tracked**, the rest of the directory ignored —
  which is also what keeps it outside ESLint and Prettier, so no
  `.prettierignore` entry was added.
- **`agent-env-setup.md` was rewritten, not patched** — §2.2 is credential +
  pinned setup, §3.5 is the overlay derivation rather than `sync.mjs snapshot`,
  and §4 now states the exit codes, because `preserve` exits `1` and reads like
  a failure until you know it is the tool refusing to overwrite your edit.
- **A real gap closed on the way.** `scripts/local/skills-sync-checker.test.ts`
  ships in the recovery payload and ran in **no** suite — Lumina's vitest
  collects only `tests/**`. It now runs in the toolkit against the _shipped_
  bytes (ai-toolkit#2, 152→184 tests), verified by mutation rather than by the
  count going up: inverting the drift comparison at `skills-sync-checker.ts:429`
  turns two behavioural tests red.

### Complete — 48 of 48

`latest` was promoted to `1.0.0` on 2026-09-08 through the `Publish` workflow's
`promote-latest` job, which re-verified the registry bytes before moving the
label. Checked independently afterwards rather than taken on the run's word:
`npm pack @piotr-miller/ai-toolkit@latest` yields
`edd3c6110187f94db2486ad90ffba7d50f6de4446bad33e3ecf22c43401543f7`, byte-identical
to the `1.0.0` tarball canaried under `rc`. The package-access attestation was
recorded as **2026-09-06** — the date of the last actual settings-page check,
which is what the field asks for.

The mirror is cold: `Piotr-Miller/10x-toolkit` carries a retirement notice above
everything else — a stale runbook that still runs is worse than one that errors —
and is archived read-only, with `freeze/2026-09-04-pre-ai-toolkit` verified intact
on the remote _after_ archiving. It was not deleted: a rollback artifact you have
deleted is not a rollback artifact.

### One defect found, recorded, not fixed here

`status` rendered an empty version when the `latest` dist-tag did not exist, and
emitted an unrunnable suggestion (`--package=@piotr-miller/ai-toolkit@ --`),
while still labelling the row `ok`.

Promoting `latest` made the symptom disappear — `status` now reads `1.0.0, up to
date` — and that is precisely the trap. The cause is that a **missing** tag is
formatted as though it were present; any future unresolvable tag reproduces it.
So it is filed as [ai-toolkit#3](https://github.com/Piotr-Miller/ai-toolkit/issues/3),
worded so the promotion does not close it, rather than left as a paragraph in an
evidence record.

### Follow-ups, outside this change

- [#213](https://github.com/Piotr-Miller/lumina-clean-ai/issues/213) — retire the
  retained local checker, gated on a **condition** rather than a date: one release
  after `1.0.0` passing the CLI's equivalent positive **and** negative checks on
  both hosts. A checker that reports no drift because it looked at nothing passes
  every positive test.
- [ai-toolkit#3](https://github.com/Piotr-Miller/ai-toolkit/issues/3) — `status`
  must not format a missing dist-tag as an empty present one, and must not emit a
  command that cannot be run.
