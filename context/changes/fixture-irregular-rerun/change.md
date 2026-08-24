---
change_id: fixture-irregular-rerun
title: "Re-run the irregular fixture on a fixed generator (deconfound + re-freeze)"
status: implemented
created: 2026-08-24
updated: 2026-08-24
---

## Notes

The registered follow-up from `fixture-ordered-and-irregular`, plus a freeze
violation found while setting it up.

**Deconfound.** The archived irregular arm read 2/20 with a REAL compile error
in its fixture (16 duplicate `const batchDefaults` in one file), so it could not
separate "irregular naming removed the invented-path mode" from "the model had
genuine bugs to report instead of inventing". The generator is fixed (const
emitted once per file); placement is otherwise IDENTICAL, so this is a
controlled comparison.

**Freeze violation (new finding).** That arm pinned its ground truth at
`f423d87f` but the grader read `b6bddc46` — the pre-commit prettier hook
reformatted the scripted-generated markdown AFTER the hash was taken. Under the
pre-registration''s own rule the archived 2/20 is formally INVALID. The base
fixture and ordered arms were checked and are clean (pinned = grader-read).
Mitigation here: prettier runs BEFORE hashing, and the hash is verified stable
across a second pass.

## Outcome (2026-08-24)

**H-naming SURVIVES — 1/20 (band <= 5).** Removing the real compile error did
NOT restore fabrication; it fell further (2 -> 1). H-bugs is rejected: the
archived arm''s low rate was not the model having true defects to report, so its
substantive conclusion stands, now on a run whose freeze held (grader-read ==
pinned).

Also NOT REPRESENTATIVE by the widest margin of any arm (|1 - 17|). Across four
arms the fixture reads 11 -> 7 -> 2 -> 1, always away from the real diff''s
17/20: **a synthetic fixture barely fabricates once its own naming artifact is
removed.**

Hand-read 12/12 agree (0%). Spend $2.12 of an $8 stop. Manipulation check
needed a strict re-run: a loose regex returned 34 false positives (style
"duplication" complaints) and would have wrongly invalidated a sound run; the
strict check returned 0, and the artifact was verified directly (1 const per
file, down from 16).

Full record: `verification.md` (Results), `decision.md`, `reviews/hand-read.md`.
