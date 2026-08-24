# Make the starved-review class observable, and stop `format` from touching archives

**Status:** ready
**Opened:** 2026-08-24

Closes the two items left "open but unowned" after PR #179 — both are about a
silent failure becoming a loud one.

## 1. Off-diff finding detection

PR #179 fixed the _demonstrated_ case by excluding `**/ground-truth/*` from the
reviewed diff. It did not close the **class**: `orderDiffForCap` splits files
with `PROSE_PATH_PATTERN = /\.(?:md|mdx)"?$/i`, a binary test in which "not
prose" means "source". Any future generated non-`.md` artifact can sort to the
front of the cap window and crowd out the real source exactly the same way.

Re-engineering the classifier was rejected — again. There is no evidence about
which extensions matter beyond the two incidents already handled by exclusion
(`results/*.json` in PR #143, `ground-truth/*` in #179), and inventing a third
"generated data" tier from zero data is how you ship a heuristic nobody can
justify later.

**So make it observable instead.** The thing that finally exposed #175–#177 was
reading the _finding paths_: #177 reported seven findings against
`packages/fixturepkg/src/*` and `context/fixture/notes-*.md`, paths that exist
only inside the fixture payload and in no version of this repository. That took
seconds once looked at — and three paid reviews went by before anyone looked.

`offDiffFindingPaths(diffPaths, findings)` computes the paths a review's
findings name that appear **nowhere in the reviewed diff**. It lands in
`review.json` as `offDiffFindingPaths` and renders as a warning directly under
the findings list. On the next occurrence of this class, whatever causes it,
the first PR says so instead of the fourth.

Three decisions inside it, each deliberate:

- **Compared against the FULL diff, not the capped one.** An over-cap file is
  invisible to the finder but is still genuinely part of the PR; flagging it
  would bury the real signal (a path in _no_ version of the diff) under noise
  that is expected whenever truncation happens.
- **Reports, never drops.** A path can also be off-diff because the model
  lightly mangled a real one. Silently discarding those trades a visible
  reliability signal for an invisible loss of real findings.
- **Rendered with the findings, not in the footnote list.** Same reasoning the
  existing truncation caveat records: a reader scanning a red verdict never
  reaches a footnote. #177 wore an `ai-cr:failed` label earned entirely by
  planted content — this caveat has to sit where that reader is looking.

Git-quoted diff paths are unquoted before comparison, or a quoted path would
never match the plain path a model reports and every finding would look
off-diff.

## 2. `npm run format` no longer rewrites archives

Running it reformatted **150+ files repo-wide**, including `context/archive/`,
and rewrote CRLF→LF in documents committed months ago. I hit this while
implementing the previous change and reverted it by hand.

Archived changes are immutable, and several **pin sha256 hashes of their own
ground truth** in `verification.md`. A prettier pass that lands after a hash is
taken is precisely the freeze violation now guarded by `assertGroundTruthFrozen`
(PR #180) — the one that cost a paid measurement arm. Nothing prevented a
repeat; a comment in a change doc is not a control.

`.prettierignore` already carried this exact rationale for `.claude/` and
`.agents/` ("byte fidelity … required, never format"). `context/archive/` is
the same case and now sits beside them.

## Verification

- [x] `packages/code-reviewer` — typecheck, lint, **608 tests** (7 new)
- [x] detector tests anchored on the real incident: the #177 path shape, dedup +
      deterministic order, git-quoted path matching, and an explicit pin that it
      reports rather than drops
- [x] render tests: warning names every off-diff path and appears only when
      non-empty (the pre-existing "clean comment has no ⚠️" test still passes)
- [x] `npm run format` now touches **0** files under `context/archive/` (was
      ~130); the remaining repo-wide churn is pre-existing and was reverted, not
      committed

---

**Archived 2026-08-24.** Shipped in PR #184.
