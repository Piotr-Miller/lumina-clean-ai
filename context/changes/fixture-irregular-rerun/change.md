---
change_id: fixture-irregular-rerun
title: "Re-run the irregular fixture on a fixed generator (deconfound + re-freeze)"
status: preparing
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

## Status

Pre-registration frozen, inputs sha256-pinned (prettier-stable), manipulation
check and placement gate verified by `--dry` with no paid call.
