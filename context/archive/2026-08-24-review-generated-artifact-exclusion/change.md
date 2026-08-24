# Exclude generated ground-truth artifacts from the reviewed diff

**Status:** ready
**Opened:** 2026-08-24
**Origin:** the review-reliability question deliberately split out of `r5-note-revert` (PR #178) — "two of the three qualifying runs returned zero findings on 400 KB+ diffs".

## What the zero-findings observation actually was

Not "the reviewer goes blind on large diffs". The reviews were spent on
**synthetic fixture content instead of the PR's own source**, in all three
qualifying PRs.

Every campaign PR commits a generated `ground-truth/fixture*.diff` — a
synthetic unified diff, hundreds of KB, containing planted code under invented
paths (`packages/fixturepkg/src/*`, `context/fixture/notes-*.md`). Because
`orderDiffForCap` splits files with `PROSE_PATH_PATTERN = /\.(?:md|mdx)"?$/i`,
a `.diff` file is "not prose", so it is classified as **source** and sorted to
the **front** of the cap window — ahead of the real source the ordering exists
to protect.

| PR   | run           | reviewed diff | `cutFile`                             | real source  | findings       |
| ---- | ------------- | ------------- | ------------------------------------- | ------------ | -------------- |
| #175 | `32722423900` | 400 KB+       | `ground-truth/fixture.diff`           | all over-cap | 0 → passed     |
| #176 | `32727518229` | 438,635 B     | `ground-truth/fixture-irregular.diff` | all over-cap | 0 → passed     |
| #177 | `32733607820` | 223,656 B     | `ground-truth/fixture-irregular.diff` | all over-cap | 7 → **failed** |

The proof is in #177's findings: all seven land on `packages/fixturepkg/src/*`
and `context/fixture/notes-*.md` — paths that exist **only inside the fixture
file's payload**, never in the repository. The reviewer read the fixture's
contents as if they were the change. `fabrication-probe.mjs`,
`build-fabrication-fixture.mjs` and `fabrication-grade.mjs` — the actual code
under review — were over-cap in all three.

So #177's `failed` verdict and its `ai-cr:failed` label described planted
synthetic content, not the pull request. #175/#176's "0 findings, passed" was
the finder correctly finding nothing wrong in content it should never have
been shown. Three paid reviews, no coverage of the real diff.

## This exact class already happened once

`review.yml`'s own comment records it for PR #143: `results/baseline-n20.json`
was 711,641 bytes, 85% of the post-exclusion diff, "that window closed before
reaching any source file and the implementation review reported present files
as MISSING at CRITICAL". The remedy then was an exclusion
(`**/results/*.json`). Ground-truth fixtures are the same category — generated,
machine-written, enormous, never read line by line — and were simply not in
the list, because they did not exist when it was written.

## Change

One pathspec added to `EXCLUDES` in `.github/workflows/review.yml`:

```
:(exclude,glob)**/ground-truth/*
```

Everything under a `ground-truth/` directory is pinned campaign evidence by
construction — generated payload plus its frozen hashes — never reviewable
source. The `getFileContext` allowlist derives from this same diff, so the
exclusion narrows the tool's reach consistently, as the existing comment notes.

Measured against the two affected merges:

| PR               | before    | after    | truncates?                |
| ---------------- | --------- | -------- | ------------------------- |
| #176 (`c8bbdf8`) | 438,635 B | 32,444 B | no — under the 100 KB cap |
| #177 (`7b09fe0`) | 223,656 B | 20,751 B | no — under the 100 KB cap |

Both would have been reviewed **whole**, with all six real files visible, and
neither would have truncated at all.

## Deliberately NOT changed

`PROSE_PATH_PATTERN` stays a binary `.md`/`.mdx` test. Its limitation is real —
"not prose" is not the same as "source", so any future generated non-`.md`
artifact can crowd the window the same way — but the demonstrated failures are
all ground-truth fixtures, and inventing a third "generated data" tier from
zero evidence about which extensions matter would be speculative. The sharp
edge is recorded in the code comment instead, where the next person to hit it
will be standing.

## Verification

- [x] `git diff` with the new pathspec over `c8bbdf8` and `7b09fe0` reproduces the table above (438,635 → 32,444 B; 223,656 → 20,751 B; six real files visible in the first 100 KB in both)
- [x] a PR that is _only_ ground-truth files filters to an **exactly empty** diff (202,905 → 0 B over `7b09fe0`), so it hits the existing `SKIP_REVIEW` guard and skips visibly rather than failing the step red
- [x] the workflow still parses (`js-yaml` load → job `ai-review`); the multi-line bash array keeps the quoting the existing comment warns about
- [x] app gates: `npm run typecheck`, `npm run lint`, `npm run test:unit` — 28 files / 345 tests
- [x] package gates: `packages/code-reviewer` lint + typecheck + 601 tests

`npm run test` (as opposed to `test:unit`) also runs `tests/jobs.rls.test.ts`,
which needs a live local Supabase and fails without one — pre-existing and
environmental, covered by CI's `integration` job, not by this change.

---

**Archived 2026-08-24.** Shipped in PR #179 (commit recorded at merge).
