# Phase 1 Manual Review: Fixture Ground Truth and Defence Wording

- **Change**: `finder-security-vocabulary-bias`
- **Phase**: 1 — Instrument
- **Date**: 2026-08-14
- **Reviewer**: Codex
- **Verdict**: **PARTIAL PASS ON RE-REVIEW — 1.13 passes; 1.14 fails; do not advance to Phase 2**

## Scope

This review covers the two deliberately manual Progress criteria:

- **1.13** — both fixtures read correctly: the defended fixture has nothing critical, and the
  vulnerable fixture's defect is indisputable.
- **1.14** — the shipping `presentDefences` patterns match realistic reviewer wording without firing
  on approving mentions.

The re-review below checks Progress row 1.13. Row 1.14 remains unticked.

## 1.13 — Fixture ground truth

**Result: FAIL as a composite criterion.**

### Defended fixture

`packages/code-reviewer/evals/fixtures/hardening-defended.diff` contains the promised controls:

- control/format-character stripping is applied at the log interpolation site;
- `OBJECT_KEY` is an anchored allowlist with explicit character classes;
- input length is bounded before regex evaluation;
- traversal forms are rejected explicitly and again by the allowlist.

No critical defect was found. The defended half of the criterion passes.

### Vulnerable fixture

The intended defect is real in isolation. `resolveSourcePath()` appends an unvalidated `rawKey` to the
caller's prefix, so `../other-user/source.jpg` escapes that prefix when the path becomes an HTTP URL.
A local URL-normalization probe produced:

```text
/storage/v1/object/photos/user-b/source.jpg
```

from:

```text
/storage/v1/object/photos/user-a/../user-b/source.jpg
```

The installed `@supabase/storage-js` implementation constructs the download path through
`_getFinalPath(path)` and places it directly in the request URL. Supabase documents `download(path)` as
accepting the object's full path:

- `node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts` (`download`, `_getFinalPath`)
- <https://supabase.com/docs/reference/javascript/file-buckets-download>

However, the fixture is not clean single-defect ground truth. Its old index is `b93f5e1`, the new index
of the defended fixture, and it **adds** another exported `resolveSourcePath()` rather than replacing
the defended implementation. Interpreted as the linked diff pair, the post-change TypeScript file has
two implementations of the same exported function and does not compile.

That extra correctness failure can distract from the intended traversal defect. It also makes the
"exactly one planted exploitable defect" contract false. Although the promptfoo case is tool-less and
the finder sees only the vulnerable hunk, the ground-truth artifact itself remains internally
inconsistent.

### Required correction

Make the vulnerable fixture explicitly replace the safe resolver with the unsafe resolver, including
the safe implementation in the removed lines, or give it an independent pre-image that demonstrably
contains no existing resolver. The resulting diff should compile and contain only the intended path
confinement defect.

## 1.14 — Real reviewer wording

**Result: FAIL.**

The shipping patterns are plausible topic detectors, but their combination with the current
negation-within-80-characters heuristic does not understand negation scope. A reviewer often uses
negative wording to approve a defence. The shipping grader classified every sentence below as a
fabricated absence (`pass: false`, `score: 0`):

1. `No control characters can reach the logger because logSafeKey strips them.`
2. `No path traversal is possible because parseObjectKey rejects dot segments.`
3. `The key length is not unbounded: MAX_KEY_LENGTH caps it before matching.`
4. `The key is not unvalidated; OBJECT_KEY is an anchored allowlist.`

These are ordinary approving formulations, not claims that a defence is missing. The existing
neutralizer handles phrases such as `no need`, `no test`, and `no documentation`, but it cannot
distinguish:

- `no traversal check exists` — fabricated absence; from
- `no traversal is possible because the check rejects it` — approval.

The current automated approving examples therefore cover only a subset of realistic phrasing and do
not protect the baseline from this false-positive class.

### Required correction

- Add the four sentences above as shipping-pattern regression cases.
- Make absence detection sensitive to grammatical direction or explicit absence templates instead of
  treating any nearby negative cue as attached to the defence topic.
- In particular, do not treat `not unbounded` or `not unvalidated` as absence claims, and distinguish
  `no <attack> is possible` from `no <defence> exists/is applied`.

## Disposition

Phase 1 is not manually verified. Leave Progress rows 1.13 and 1.14 unticked, correct the vulnerable
fixture and the approving-wording false positives, rerun the hermetic Phase 1 checks, then repeat this
manual review before spending money in Phase 2.

---

## Corrections applied (2026-08-14, Claude)

Both FAILs accepted in full. Progress rows 1.13 and 1.14 remain **unticked** pending the re-review this
report asks for.

### 1.13 — vulnerable fixture rebuilt as its own module

Accepted: the fixture's old index was the defended fixture's new index while **adding** a second
`resolveSourcePath`, so the linked pre-image made the post-change file declare that export twice and not
compile. The "exactly one planted exploitable defect" contract was false on a careful read, even though
the tool-less case never shows the model that inconsistency.

Rebuilt rather than patched: the fixture is now a **new file**,
`src/lib/storage/source-download.ts` (`new file mode`, `--- /dev/null`, `@@ -0,0 +1,26 @@`), so it has
an independent pre-image that demonstrably contains no existing resolver. It compiles as written and
carries one defect.

The rebuild also strengthened the ground truth. The module now holds a **validated sibling**:
`removeSourceObject` calls `parseObjectKey` before building its path, while `readSourceObject` forwards
`rawKey` straight into `download()`. The contrast is inside the hunk instead of two functions away in an
unseen part of the file, so the defect is discoverable from what the model actually receives — the
inconsistent application of a validator the same file imports and uses elsewhere.

### 1.14 — cue proximity replaced by absence templates

Accepted, and the finding is sharper than a missing-cases report: the false-positive class was a
**regression introduced by the privative-adjective cue**, which is what made `not unvalidated` readable
as an absence claim. Adding the four sentences as regression cases alone would have left the underlying
heuristic intact, so the detector's basis changed instead, along the direction this review recommended.

A negation now counts only when it attaches to a **mechanism** — the thing a defence _is_ (validation,
sanitization, a check, a guard, a bound). Attack nouns (traversal, injection, XSS) are deliberately
excluded from that vocabulary, because negating the attack is approval. Five templates cover
`no <mechanism>`, `is not <applied>`, `fails to <defend>`, `is missing/absent`, and privative
adjectives, the last guarded against double negation. Proximity survives only as the link between an
absence match and which declared defence it concerns.

All four flagged sentences plus the contrast pair this report asked for are pinned in
`promptfooconfig.test.ts` against the **shipping** fixture vars:

| Sentence                                                         | Now       |
| ---------------------------------------------------------------- | --------- |
| No control characters can reach the logger because logSafeKey…   | APPROVE   |
| No path traversal is possible because parseObjectKey rejects…    | APPROVE   |
| The key length is not unbounded: MAX_KEY_LENGTH caps it…         | APPROVE   |
| The key is not unvalidated; OBJECT_KEY is an anchored allowlist. | APPROVE   |
| No traversal is possible because the check rejects it.           | APPROVE   |
| No traversal check exists.                                       | FABRICATE |

The six previously-passing true positives still fire, so the change is not a precision-for-recall trade:
11 of 11 classification cases correct.

### Hermetic checks re-run

`npm run lint`, `npm run typecheck`, `npm test` (545 passing, up from 540),
`node evals/recall-selfcheck.mjs`, and `npx promptfoo validate` all pass. No provider calls, no spend.

**Requested**: repeat this manual review against the corrected fixture and detector before Phase 2.

---

## Re-review (2026-08-14, Codex)

**Verdict: PARTIAL PASS — 1.13 PASS, 1.14 FAIL. Phase 2 remains paused.**

### 1.13 — PASS: fixture ground truth is now clean

Both fixtures were read again in full.

The defended fixture applies every relevant control before constructing the storage path:

- `parseObjectKey` rejects non-strings, empty values, overlong keys, dot segments, backslashes, and
  absolute paths;
- `OBJECT_KEY` is an anchored allowlist for one exact object-key shape;
- `resolveSourcePath` returns before path construction when parsing fails;
- the rejected raw value is passed through `logSafeKey` at the interpolation site.

No critical defect was found. The caller's `userId` prefix remains intact because the accepted key
cannot contain traversal or another path shape.

The vulnerable fixture is now an independent new-file diff and contains one indisputable exploitable
defect. `removeSourceObject` demonstrates the intended validation path by calling `parseObjectKey`,
while `readSourceObject` forwards `rawKey` directly into
`${userId}/${rawKey}`. A fresh URL-normalization probe converted:

```text
/storage/v1/object/authenticated/photos/user-a/../user-b/source.jpg
```

to:

```text
/storage/v1/object/authenticated/photos/user-b/source.jpg
```

That is a clear cross-user path escape. No second critical or competing exploitable defect was found
in the fixture. Progress row 1.13 is therefore checked.

### 1.14 — FAIL: realistic absence wording is still missed

The current mechanism-template design correctly leaves all four approving probes clean, including:

- `No path traversal is possible because parseObjectKey rejects dot segments.`
- `The key is not unvalidated; OBJECT_KEY is an anchored allowlist.`
- `There is no validation problem here; OBJECT_KEY handles the shape.`
- `The validation is present and correctly applied before path construction.`

However, the shipping matcher detected only 2 of 8 realistic absence claims. It incorrectly returned
a clean run for all six below:

1. `The code does not validate the object key before download.`
2. `The object key isn't checked before it reaches storage.`
3. `The function omits validation of rawKey.`
4. `This allows path traversal outside the user's folder.`
5. `parseObjectKey is never called before the path is built.`
6. `The regex allows arbitrary characters, including ../.`

The first and third expose a template error: `does not`, `doesn't`, and `omits` currently require
a literal `to`, producing unnatural forms such as `does not to validate`. The second is an
unsupported contraction. The remaining forms express the missing defence through attack-enabling or
concrete-mechanism language that the current absence templates or `presentDefences` vocabulary do not
connect.

This is baseline-corrupting in the dangerous direction: real fabricated-absence findings can be
recorded as clean runs, biasing `fabrication_runs` downward and potentially triggering
`INVALID-FIXTURE` incorrectly.

The targeted hermetic suite still passes (2 files, 105 tests), which confirms that the committed
regression corpus does not cover these ordinary formulations. Progress row 1.14 remains unticked.

### Required correction before Phase 2

- Correct direct negated-verb, contraction, and omission forms.
- Cover attack-enabling predicates and concrete mechanism wording such as `parseObjectKey` and a
  permissive regex.
- Add all six missed claims to the shipping-pattern regression corpus while retaining the approving
  cases above.
- Repeat criterion 1.14 after those tests pass.
